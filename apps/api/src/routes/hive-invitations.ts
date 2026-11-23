// Les invitations des ruches (R10) : la recherche de la feuille « Inviter » (GET
// /v1/hives/{id}/invitable), inviter (POST /v1/hives/{id}/invitations), rejoindre (POST
// /v1/hive-invitations/{id}/accept) et refuser (DELETE /v1/hive-invitations/{id}). Le reste des
// ruches est dans routes/hives.ts ; les écritures dans hives/invitations.ts, la recherche dans
// hives/invitable.ts.
//
// L'ordre des vérifications, le même partout (charte du pôle code) : la session, puis le quota
// (chaque demande compte, même mal formée), puis l'identifiant (mal formé → 404 sans lire la base),
// puis la ressource. Ce que chaque réponse peut dire :
// - une ruche dont on n'est pas membre : le 404 d'une ruche qui n'existe pas ;
// - un invité inconnu, jamais vérifié, ou bloqué dans un sens ou dans l'autre : le même 404, avant
//   tout 409 (« déjà membre » trahirait un membre qui nous a bloqués) ;
// - une invitation qui n'est pas à soi : le 404 d'une invitation inconnue, avant comme après ses 30
//   jours ; expirée, l'invité seul reçoit 410 `invitation_expired` ;
// - refuser est muet : 204 pour l'invité, même pour une invitation expirée ou déjà refusée.
//
// Un membre suspendu peut accepter (ALLOWED_WRITES de suspension/guard.ts) et refuser (la garde
// laisse passer tout DELETE) ; la garde refuse qu'il invite (403 `suspended`).
import { createRoute, z } from '@hono/zod-openapi'
import {
  HIVE_LIMITS,
  HiveInvitationId,
  HiveInvite,
  HiveSummary,
  InvitableMembers,
  InvitableQuery,
  searchWords,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { setPollen } from '../game/award'
import { pollenHeaders } from '../game/gesture'
import { loadInvitable } from '../hives/invitable'
import { acceptInvitation, inviteToHive, refuseInvitation } from '../hives/invitations'
import { hiveSummariesOf, membershipOf } from '../hives/load'
import { isForeignKeyViolation } from '../hives/write'
import { describeError } from '../log'
import {
  memberCounterKeys,
  type RateDecision,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'
import { hitSearchQuota, pgCodeOf, STATEMENT_TIMEOUT } from '../search/limits'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// 20 invitations par jour et par inviteur, toutes ruches ensemble (choix 1 du scénario).
const invitationRule: RateRule = { windowMs: DAY, max: HIVE_LIMITS.invitationsPerDay }
// Accepter et refuser comptent dans le compteur des écritures des ruches (relecture de sécurité du
// plan, point 7), avec la règle de routes/hives.ts : 120 par heure.
const writeRule: RateRule = { windowMs: HOUR, max: 120 }

const idParam = z.object({ id: z.string() })
const done = { description: 'Done (no content).' }
const noHive = errorResponse(
  'No such hive for this member: unknown, malformed, or a hive they are not (or no longer) in.',
)
const noInvitation = errorResponse(
  'No such invitation for this member: unknown, malformed, someone else’s, refused or accepted.',
)

const invitableRoute = createRoute({
  method: 'get',
  path: '/v1/hives/{id}/invitable',
  summary: 'Find members to invite into a hive',
  description:
    'By name (accents and capitals ignored) or current handle. Below 3 characters, only the ' +
    'members the viewer follows and those of their hives; from 3, the whole network. Never a ' +
    'member blocked either way, nor the viewer. Counted in the search quotas.',
  request: { params: idParam, query: InvitableQuery },
  responses: {
    200: {
      description: 'Twenty members at most, each with its state in the hive.',
      content: { 'application/json': { schema: InvitableMembers } },
    },
    400: errorResponse('Invalid query (too short, too long, or a repeated `q`).'),
    401: errorResponse('Not signed in.'),
    404: noHive,
    429: errorResponse('Too many searches (the same quotas as the search).'),
    503: errorResponse('The search took too long and was stopped.'),
  },
})

const inviteRoute = createRoute({
  method: 'post',
  path: '/v1/hives/{id}/invitations',
  summary: 'Invite a member into a hive',
  description:
    'Fifty places per hive, pending invitations included (refused ones too, until their 30 ' +
    'days). Twenty invitations per day per member.',
  request: {
    params: idParam,
    body: { required: true, content: { 'application/json': { schema: HiveInvite } } },
  },
  responses: {
    201: { description: 'Invited (no content).' },
    400: errorResponse('Invalid member.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The animator keeps invitations to themselves, or a suspended account.'),
    404: errorResponse('No such hive for this member, or no such member to invite.'),
    409: errorResponse('`already_hive_member`, `already_invited` or `hive_full`.'),
    429: errorResponse(
      'Twenty invitations sent in the last 24 hours (`hive_invitations_limited`).',
    ),
  },
})

const acceptRoute = createRoute({
  method: 'post',
  path: '/v1/hive-invitations/{id}/accept',
  summary: 'Accept an invitation: join the hive',
  request: { params: idParam },
  responses: {
    200: {
      description: 'The hive joined.',
      content: { 'application/json': { schema: HiveSummary } },
      // R19 : le pollen que l'invité vient de gagner (game/award.ts).
      headers: pollenHeaders,
    },
    401: errorResponse('Not signed in.'),
    404: noInvitation,
    409: errorResponse('`hives_joined_limit` (20 hives), or `hive_full`.'),
    410: errorResponse('The invitation is more than 30 days old (`invitation_expired`).'),
    429: errorResponse('Too many hive writes.'),
  },
})

const refuseRoute = createRoute({
  method: 'delete',
  path: '/v1/hive-invitations/{id}',
  summary: 'Refuse an invitation, telling no one',
  description: 'The hive keeps counting it, as sent, until its 30 days.',
  request: { params: idParam },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: noInvitation,
    429: errorResponse('Too many hive writes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const hiveInvitationRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use('/v1/hives/:id/invitable', requireUser)
  app.use('/v1/hives/:id/invitations', requireUser)
  app.use('/v1/hive-invitations/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  // Deux codes pour un même 429 (relecture du design de R10) : `hive_invitations_limited` pour les
  // 20 invitations du jour (l'appli dit « demain »), `rate_limited` pour les autres quotas, à
  // l'heure (« dans quelques minutes »).
  type QuotaCode = 'rate_limited' | 'hive_invitations_limited'
  const tooMany = (c: Context<AppEnv>, decision: RateDecision, code: QuotaCode) => {
    if (!decision.allowed) c.header('Retry-After', String(decision.retryAfterSeconds))
    return c.json(errorBody(languageOf(c), code), 429)
  }

  // Les quotas, posés AVANT la vérification de la demande (que Hono place juste avant la route) :
  // chaque demande compte, même mal écrite. Un « middleware » est une fonction qui passe avant la
  // route, et peut répondre à sa place.
  const quota =
    (hit: (userId: string) => Promise<RateDecision>, code: QuotaCode = 'rate_limited') =>
    async (c: Context<AppEnv>, next: () => Promise<void>) => {
      const user = c.get('user')
      if (!user) return unauthorized(c)
      const decision = await hit(user.id)
      if (!decision.allowed) return tooMany(c, decision, code)
      await next()
    }
  app.on(
    'GET',
    '/v1/hives/:id/invitable',
    quota((userId) => hitSearchQuota(limiter, userId)),
  )
  app.on(
    'POST',
    '/v1/hives/:id/invitations',
    quota(
      (userId) => limiter.hit(memberCounterKeys(userId).hiveInvitations, invitationRule),
      'hive_invitations_limited',
    ),
  )
  const writes = quota((userId) => limiter.hit(memberCounterKeys(userId).hiveWrite, writeRule))
  app.on('POST', '/v1/hive-invitations/:id/accept', writes)
  app.on('DELETE', '/v1/hive-invitations/:id', writes)

  app.openapi(invitableRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    // Le validateur ne lit que le premier `q` : deux `q` sont refusés, comme dans la recherche.
    if ((c.req.queries('q') ?? []).length !== 1) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    // Les mots repliés (sans accents, sans les mots d'une lettre) : « a b » n'en laisse aucun, et
    // ne trouve donc personne.
    const words = searchWords(c.req.valid('query').q)
    if (words.length === 0) return c.json(InvitableMembers.parse({ members: [] }), 200)
    try {
      // Comme la recherche (search/load.ts) : une transaction dont la requête est arrêtée après 2
      // secondes (`set local` ne vaut que jusqu'à la fin de la transaction).
      const members = await db.transaction(async (tx) => {
        await tx.execute(sql`set local statement_timeout = '2s'`)
        return loadInvitable(tx, viewer.id, membership.hiveId, words, new Date(), publicApiUrl)
      })
      // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
      return c.json(InvitableMembers.parse({ members }), 200)
    } catch (error) {
      if (pgCodeOf(error) !== STATEMENT_TIMEOUT) throw error
      // Trop long : 503, et dans le journal un résumé sans le texte cherché (le chemin seul).
      console.error(
        'Invite search stopped',
        describeError(error, { method: 'GET', path: c.req.path }),
      )
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
  })

  app.openapi(inviteRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    // « Seulement moi » : le geste de l'animateur seul (avant de regarder l'invité : un membre qui
    // n'a pas le droit d'inviter n'apprend rien de lui).
    if (membership.invitePolicy === 'animator' && membership.role !== 'animator') {
      return c.json(errorBody(languageOf(c), 'forbidden'), 403)
    }
    const { userId } = c.req.valid('json')
    let outcome: Awaited<ReturnType<typeof inviteToHive>>
    try {
      outcome = await inviteToHive(db, membership.hiveId, viewer.id, userId, new Date())
    } catch (error) {
      // La ruche, ou l'invité, a disparu pendant l'écriture (23503) : 404, jamais 500.
      if (!isForeignKeyViolation(error)) throw error
      return notFound(c)
    }
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return c.json(errorBody(languageOf(c), 'forbidden'), 403)
    if (outcome !== 'done') return c.json(errorBody(languageOf(c), outcome), 409)
    return c.body(null, 201)
  })

  app.openapi(acceptRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const { id } = c.req.valid('param')
    // Un identifiant qui n'est pas un uuid ferait échouer la requête : le même 404, sans la lire.
    if (!HiveInvitationId.safeParse(id).success) return notFound(c)
    const now = new Date()
    let outcome: Awaited<ReturnType<typeof acceptInvitation>>
    try {
      outcome = await acceptInvitation(db, id, viewer.id, now)
    } catch (error) {
      if (!isForeignKeyViolation(error)) throw error
      return notFound(c)
    }
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'invitation_expired') {
      return c.json(errorBody(languageOf(c), 'invitation_expired'), 410)
    }
    if (typeof outcome === 'string') return c.json(errorBody(languageOf(c), outcome), 409)
    // Relue après la transaction (sous PGlite, une lecture par `db` pendant elle attendrait).
    const [summary] = await hiveSummariesOf(db, viewer.id, [outcome.hiveId], publicApiUrl, now)
    // Parti juste après être entré (un autre appareil) : la ruche n'est plus la sienne.
    if (!summary) return notFound(c)
    // Après la transaction : le pollen est écrit, l'en-tête peut le dire (R19).
    setPollen(c, outcome.pollen)
    return c.json(HiveSummary.parse(summary), 200)
  })

  app.openapi(refuseRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const { id } = c.req.valid('param')
    if (!HiveInvitationId.safeParse(id).success) return notFound(c)
    if (!(await refuseInvitation(db, id, viewer.id, new Date()))) return notFound(c)
    return c.body(null, 204)
  })

  return app
}
