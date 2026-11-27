// Routes de l'entrée chez les Éclaireuses (R20, docs/scenarios/refonte.md, « Devenir Éclaireuse »,
// « Les missions de la semaine ») : « J'ai un code » dans les réglages (POST /v1/me/scout),
// « Afficher la Goutte » (PATCH /v1/me/scout) et les missions de la semaine
// (GET /v1/me/scout/missions). Les retours ont leur fichier (scout-reports.ts), la page de tri de
// l'administrateur aussi (scout-triage.ts).
//
// L'ordre des vérifications, le même partout : la session, puis le quota (chaque demande compte,
// même mal formée : il est posé avant le validateur), puis le corps, puis l'état d'Éclaireuse. Un
// compte suspendu ne devient pas Éclaireuse et ne change pas le réglage : la garde de la
// suspension refuse ces écritures avant même ces routes (suspension/guard.ts).
import { createRoute } from '@hono/zod-openapi'
import {
  JoinScouts,
  Me,
  SCOUT_CODE_HOURLY,
  ScoutMissions,
  ScoutSettings,
  weekOf,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { isRightInviteCode } from '../auth/invite-code'
import { requireUser } from '../auth/session'
import { languageOfMember } from '../email/language'
import { errorBody, languageOf } from '../errors'
import { type Live, toAdmins, toOwnDevices } from '../live/emit'
import { loadMe } from '../profile/me'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { activeScout, joinScouts } from '../scouts/join'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const SCOUT_PATH = '/v1/me/scout'
const MISSIONS_PATH = '/v1/me/scout/missions'

const HOUR = 60 * 60 * 1000
// Les règles anti-abus. Le code : 10 essais par heure (deviner un code de 16 caractères est
// impossible à ce rythme) ; le réglage de la Goutte : 120 par heure, comme les réglages du jeu ; les
// missions : 600 lectures par heure, comme « Ma récolte » (l'appli les relit à chaque ouverture).
const codeRule: RateRule = { windowMs: HOUR, max: SCOUT_CODE_HOURLY }
const settingsRule: RateRule = { windowMs: HOUR, max: 120 }
const readRule: RateRule = { windowMs: HOUR, max: 600 }

const meResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: Me } },
})

const joinRoute = createRoute({
  method: 'post',
  path: SCOUT_PATH,
  summary: 'Become a scout with the scout code',
  description:
    'For a signed-up member. The 30 places count the scouts not removed whose address is verified, or who joined less than 24 hours ago; a removed scout frees her place but never comes back.',
  request: {
    body: { required: true, content: { 'application/json': { schema: JoinScouts } } },
  },
  responses: {
    200: meResponse('The profile, with the scout state.'),
    400: errorResponse('A wrong code (the message of a wrong invite code), or a malformed body.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Suspended account.'),
    409: errorResponse('The 30 places are taken, the month is over, already a scout, or removed.'),
    429: errorResponse('Too many codes typed.'),
  },
})

const settingsRoute = createRoute({
  method: 'patch',
  path: SCOUT_PATH,
  summary: 'Show or hide the drop',
  request: {
    body: { required: true, content: { 'application/json': { schema: ScoutSettings } } },
  },
  responses: {
    200: meResponse('The profile, with the setting changed.'),
    400: errorResponse('Not a yes or no, or another field.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not a scout (never, or removed), or suspended account.'),
    429: errorResponse('Too many changes.'),
  },
})

const missionsRoute = createRoute({
  method: 'get',
  path: MISSIONS_PATH,
  summary: 'The missions of the week',
  description:
    'In the language of the member, French when not translated; `done` once she has sent a report that answers it.',
  responses: {
    200: {
      description: 'The missions of the week, in their order.',
      content: { 'application/json': { schema: ScoutMissions } },
    },
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not an active scout (never, removed, or the month is over).'),
    429: errorResponse('Too many reads.'),
  },
})

type Deps = {
  db: Database
  limiter: RateLimiter
  publicApiUrl: string
  /** Le code des Éclaireuses (SCOUT_INVITE_CODE) ; null : aucun code ne marche. */
  scoutCode: string | null
  /** R21 : la base et le bus du temps réel, pour les signaux de chaque geste (live/emit.ts). */
  live: Live
}

export const scoutRoutes = ({ db, limiter, publicApiUrl, scoutCode, live }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps). Les chemins exacts :
  // les retours (/v1/me/scout/reports) posent leur propre garde, dans leur fichier.
  app.use(SCOUT_PATH, requireUser)
  app.use(MISSIONS_PATH, requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const scoutOnly = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'scout_only'), 403)

  // Un « middleware » (une fonction qui passe avant la route, et peut répondre à sa place) qui
  // compte la demande et répond 429 au-delà de la règle. Posé avant le validateur (que Hono place
  // juste avant la route) : un corps vide, un code qui n'est pas du texte comptent aussi.
  const quota =
    (counter: 'scoutCode' | 'scoutSettings' | 'scoutRead', rule: RateRule) =>
    async (c: Context<AppEnv>, next: () => Promise<void>) => {
      const user = c.get('user')
      if (!user) return unauthorized(c)
      const decision = await limiter.hit(memberCounterKeys(user.id)[counter], rule)
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
      await next()
    }
  app.on('POST', SCOUT_PATH, quota('scoutCode', codeRule))
  app.on('PATCH', SCOUT_PATH, quota('scoutSettings', settingsRule))
  app.on('GET', MISSIONS_PATH, quota('scoutRead', readRule))

  app.openapi(joinRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { code } = c.req.valid('json')
    // Un code faux, le code commun compris, reçoit exactement le refus d'un code d'invitation faux
    // (choix 3 du plan) : la réponse ne dit pas qu'un code des Éclaireuses existe.
    if (scoutCode === null || !isRightInviteCode(code, scoutCode)) {
      const language = languageOf(c)
      return c.json(
        {
          error: {
            code: 'scout_code_invalid' as const,
            message: fill(resources[language].translation.auth.errors.inviteInvalid),
          },
        },
        400,
      )
    }
    const outcome = await joinScouts(db, user.id, 'settings', new Date())
    if (outcome !== 'joined') return c.json(errorBody(languageOf(c), outcome), 409)
    // R21 : une Éclaireuse de plus dans la page de tri (les places, la liste) ; ses autres
    // appareils : la Goutte et ses missions.
    toAdmins(live, 'scouts')
    toOwnDevices(live, [user.id], 'scouts')
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  app.openapi(settingsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { showDrop } = c.req.valid('json')
    // Une requête : la ligne de l'Éclaireuse par sa clé primaire, si elle n'est pas retirée
    // (« returning » dit si une ligne a changé). Jamais Éclaireuse, ou retirée : 403. Le mois fini,
    // le réglage se change encore (la Goutte ne se montre plus de toute façon).
    const changed = await db
      .update(schema.scout)
      .set({ showDrop })
      .where(and(eq(schema.scout.memberId, user.id), isNull(schema.scout.removedAt)))
      .returning({ memberId: schema.scout.memberId })
    if (changed.length === 0) return scoutOnly(c)
    // R21 : « Afficher la Goutte » change aussi sur ses autres appareils.
    toOwnDevices(live, [user.id], 'scouts')
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  app.openapi(missionsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const now = new Date()
    if ((await activeScout(db, user.id, now)).kind !== 'active') return scoutOnly(c)
    const week = weekOf(now)
    // Les missions de la semaine dans leur ordre, chacune avec « faite par elle » : une requête.
    // L'index unique (week, position) de `scout_mission` les trouve et les rend dans l'ordre ; la
    // jointure lit `scout_mission_done` par sa clé primaire (member_id, mission_id).
    const rows = await db
      .select({
        id: schema.scoutMission.id,
        textFr: schema.scoutMission.textFr,
        textEn: schema.scoutMission.textEn,
        done: sql<boolean>`${schema.scoutMissionDone.memberId} is not null`,
      })
      .from(schema.scoutMission)
      .leftJoin(
        schema.scoutMissionDone,
        and(
          eq(schema.scoutMissionDone.missionId, schema.scoutMission.id),
          eq(schema.scoutMissionDone.memberId, user.id),
        ),
      )
      .where(eq(schema.scoutMission.week, week))
      .orderBy(schema.scoutMission.position)
    // Le texte dans la langue de son compte (pas celle de la demande), le français à défaut.
    const english = languageOfMember(user) === 'en'
    const body = ScoutMissions.parse({
      week,
      missions: rows.map((row) => ({
        id: row.id,
        text: english && row.textEn !== null ? row.textEn : row.textFr,
        done: row.done,
      })),
    })
    return c.json(body, 200)
  })

  return app
}
