// Les retours des Éclaireuses (R20, docs/scenarios/refonte.md, « Le retour normé », « Mes retours ») :
// envoyer un retour en multipart (POST /v1/me/scout/reports), « Mes retours » (GET
// /v1/me/scout/reports) et en supprimer un (DELETE /v1/me/scout/reports/{id}). Le rangement en base
// et le pollen sont dans scouts/reports.ts ; servir les captures, dans routes/media.ts.
//
// L'envoi, dans cet ordre (plan, choix 6 ; relecture de sécurité A3) : la session, l'état
// d'Éclaireuse (403 `scout_only`, 409 `scout_closed` le mois fini), le quota (20 par 24 h, compté
// avant toute validation), la limite de taille du corps (5 Mo + 64 Ko : app.ts sort ce seul chemin
// de sa limite commune de 16 Ko), la partie `report` (du texte de 16 Ko au plus, du JSON, la forme
// stricte du contrat), puis la capture (ré-encodée sans métadonnées), puis la transaction. Ainsi,
// un membre qui n'est pas Éclaireuse ne fait jamais lire au serveur un gros envoi, et une partie
// `report` fausse ne fait jamais traiter d'image.
import { createRoute, z } from '@hono/zod-openapi'
import {
  MyScoutReports,
  SCOUT_MEDIA_MAX_BYTES,
  SCOUT_REPORT_DAILY,
  ScoutReport,
  ScoutReportId,
  ScoutReportInput,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireUser } from '../auth/session'
import { languageOfMember } from '../email/language'
import { errorBody, languageOf } from '../errors'
import { setPollen } from '../game/award'
import { type Live, toAdmins, toOwnDevices } from '../live/emit'
import type { FileStorage } from '../media/storage'
import { processVisual } from '../media/visual'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { activeScout } from '../scouts/join'
import {
  deleteMyScoutReport,
  listMyScoutReports,
  scoutMediaKey,
  sendScoutReport,
} from '../scouts/reports'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const REPORTS_PATH = '/v1/me/scout/reports'
const REPORT_PATH = '/v1/me/scout/reports/:id'

const HOUR = 60 * 60 * 1000
// Les règles anti-abus. L'envoi : 20 retours par 24 heures (SCOUT_REPORT_DAILY du contrat) ; « Mes
// retours » : 600 lectures par heure, le compteur des lectures des Éclaireuses (missions comprises) ;
// la suppression : 120 par heure, le compteur de ses réglages d'Éclaireuse.
const reportRule: RateRule = { windowMs: 24 * HOUR, max: SCOUT_REPORT_DAILY }
const readRule: RateRule = { windowMs: HOUR, max: 600 }
const deleteRule: RateRule = { windowMs: HOUR, max: 120 }

/** La partie `report` : 16 Ko au plus, la limite d'une requête ordinaire (relecture A3). */
const REPORT_PART_MAX_BYTES = 16 * 1024

const sendRoute = createRoute({
  method: 'post',
  path: REPORTS_PATH,
  summary: 'Send a scout report',
  description:
    'multipart/form-data with a "report" text part (the JSON of ScoutReportInput, 16 KB at most) ' +
    'and an optional "file" (JPEG, PNG or WebP, 5 MB at most), re-encoded to WebP without metadata. ' +
    `${SCOUT_REPORT_DAILY} reports per 24 hours, counted before any check of the body. The screen ` +
    'loses its query and fragment. Pays 25 pollen (4 reports a day) and 30 pollen once per mission.',
  responses: {
    201: {
      description: 'The stored report, as its author sees it.',
      content: { 'application/json': { schema: ScoutReport } },
    },
    400: errorResponse(
      'A report part that is missing, not text, not JSON or not a report (`validation`), or a mission that is not of this week (`scout_mission_invalid`).',
    ),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not a scout (never, or removed), or suspended account.'),
    409: errorResponse('The month of the scouts is over.'),
    413: errorResponse('Capture too large.'),
    415: errorResponse('Not a JPEG, PNG or WebP image.'),
    429: errorResponse('Too many reports.'),
    503: errorResponse('Too many images being processed; retry later.'),
  },
})

const listRoute = createRoute({
  method: 'get',
  path: REPORTS_PATH,
  summary: 'My scout reports',
  description:
    'Her own reports, the most recent first, 100 at most; also after the month and after a removal. Never the note of the administrator.',
  responses: {
    200: {
      description: 'Her reports.',
      content: { 'application/json': { schema: MyScoutReports } },
    },
    401: errorResponse('Not signed in.'),
    403: errorResponse('Never a scout.'),
    429: errorResponse('Too many reads.'),
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/me/scout/reports/{id}',
  summary: 'Delete one of my scout reports',
  description:
    'Its capture, its answered mission and its notice go with it; the pollen stays. The same 404 for the report of another member, an unknown id and a malformed id.',
  // L'id est lu comme du texte : un id mal formé reçoit le 404 d'un inconnu, pas un 400 qui
  // dirait autre chose (relecture A5).
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: 'Deleted.' },
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such report of hers.'),
    429: errorResponse('Too many deletions.'),
  },
})

export type ScoutReportDeps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
  /** R21 : la base et le bus du temps réel, pour les signaux de chaque geste (live/emit.ts). */
  live: Live
}

export const scoutReportRoutes = ({
  db,
  storage,
  limiter,
  publicApiUrl,
  live,
}: ScoutReportDeps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use(REPORTS_PATH, requireUser)
  app.use(REPORT_PATH, requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const scoutOnly = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'scout_only'), 403)
  const invalid = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)

  /** Compte la demande ; rend la réponse 429 au-delà de la règle, ou null. */
  const overQuota = async (
    c: Context<AppEnv>,
    memberId: string,
    counter: 'scoutReport' | 'scoutRead' | 'scoutSettings',
    rule: RateRule,
  ) => {
    const decision = await limiter.hit(memberCounterKeys(memberId)[counter], rule)
    if (decision.allowed) return null
    c.header('Retry-After', String(decision.retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // L'envoi, avant même de lire le corps : l'état d'Éclaireuse (une retirée n'envoie plus : le même
  // 403 que pour qui ne l'a jamais été), puis le quota.
  app.on('POST', REPORTS_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const state = await activeScout(db, user.id, new Date())
    if (state.kind === 'none' || state.kind === 'removed') return scoutOnly(c)
    if (state.kind === 'closed') return c.json(errorBody(languageOf(c), 'scout_closed'), 409)
    const refused = await overQuota(c, user.id, 'scoutReport', reportRule)
    if (refused) return refused
    await next()
  })

  // Puis la limite de taille : la capture et l'enveloppe du formulaire (64 Ko, la partie `report`
  // comprise). Au-delà, 413, sans lire plus loin.
  app.on(
    'POST',
    REPORTS_PATH,
    bodyLimit({
      maxSize: SCOUT_MEDIA_MAX_BYTES + 64 * 1024,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    }),
  )

  app.on('GET', REPORTS_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    return (await overQuota(c, user.id, 'scoutRead', readRule)) ?? next()
  })
  app.on('DELETE', REPORT_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    return (await overQuota(c, user.id, 'scoutSettings', deleteRule)) ?? next()
  })

  app.openapi(sendRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)

    // Le formulaire : une erreur de lecture (multipart mal formé) est une demande invalide.
    let form: Record<string, string | File>
    try {
      form = await c.req.parseBody()
    } catch {
      return invalid(c)
    }
    // La partie `report` : du texte (pas un fichier), 16 Ko au plus, du JSON, la forme du contrat.
    // `JSON.parse` lève une exception sur un texte qui n'est pas du JSON : le `try` la rattrape.
    const raw = form.report
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > REPORT_PART_MAX_BYTES) {
      return invalid(c)
    }
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return invalid(c)
    }
    const parsed = ScoutReportInput.safeParse(json)
    if (!parsed.success) return invalid(c)

    // La capture, facultative : un fichier, 5 Mo au plus, puis ré-encodée (processVisual : WebP,
    // sans EXIF ni position GPS, le format vérifié sur les octets et non sur le type annoncé).
    const id = crypto.randomUUID()
    const file = form.file
    let mediaKey: string | null = null
    if (file !== undefined) {
      if (!(file instanceof File)) return invalid(c)
      if (file.size > SCOUT_MEDIA_MAX_BYTES) {
        return c.json(errorBody(languageOf(c), 'payload_too_large'), 413)
      }
      const result = await processVisual(new Uint8Array(await file.arrayBuffer()), 'gallery')
      if (!result.ok && result.reason === 'busy') {
        c.header('Retry-After', '10')
        return c.json(errorBody(languageOf(c), 'unavailable'), 503)
      }
      if (!result.ok) return c.json(errorBody(languageOf(c), 'unsupported_media_type'), 415)
      // Le nom du fichier : l'id du retour, tiré par le serveur (jamais le nom envoyé). Rangé avant
      // la transaction, et effacé si elle n'écrit pas le retour.
      mediaKey = scoutMediaKey(id)
      await storage.put(mediaKey, result.data)
    }

    // La langue du texte de la mission dans la réponse : celle de son compte, comme ses missions.
    const outcome = await sendScoutReport(db, {
      id,
      memberId: user.id,
      report: parsed.data,
      mediaKey,
      language: languageOfMember(user),
      publicApiUrl,
      now: new Date(),
    }).catch(async (error: unknown) => {
      if (mediaKey !== null) await storage.delete(mediaKey)
      throw error
    })
    if (outcome.kind === 'mission_invalid') {
      if (mediaKey !== null) await storage.delete(mediaKey)
      return c.json(errorBody(languageOf(c), 'scout_mission_invalid'), 400)
    }
    // R21 : un retour neuf paraît dans la page de tri (`scouts`, que seuls les administrateurs en
    // fonction écoutent) ; sur les autres appareils de l'Éclaireuse, « Mes retours », ses missions
    // faites et sa récolte (le pollen du retour).
    toAdmins(live, 'scouts')
    toOwnDevices(live, [user.id], 'scouts')
    toOwnDevices(live, [user.id], 'pollen')
    setPollen(c, outcome.pollen)
    return c.json(outcome.report, 201)
  })

  app.openapi(listRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Une ancienne Éclaireuse (mois fini) et une retirée relisent leurs retours : seule celle qui
    // ne l'a jamais été est refusée.
    if ((await activeScout(db, user.id, new Date())).kind === 'none') return scoutOnly(c)
    const reports = await listMyScoutReports(db, user.id, languageOfMember(user), publicApiUrl)
    return c.json(MyScoutReports.parse({ reports }), 200)
  })

  app.openapi(deleteRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const id = ScoutReportId.safeParse(c.req.valid('param').id)
    if (!id.success) return notFound(c)
    const deleted = await deleteMyScoutReport(db, user.id, id.data)
    if (deleted === false) return notFound(c)
    // La ligne effacée d'abord, puis son fichier : un fichier orphelin ne s'ouvre plus (la route des
    // médias relit la ligne), alors qu'une ligne sans fichier montrerait une image cassée.
    if (deleted.mediaKey !== null) await storage.delete(deleted.mediaKey)
    // R21 : le retour quitte la page de tri, et « Mes retours » de ses autres appareils.
    toAdmins(live, 'scouts')
    toOwnDevices(live, [user.id], 'scouts')
    return c.body(null, 204)
  })

  return app
}
