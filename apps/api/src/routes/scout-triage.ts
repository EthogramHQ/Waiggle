// La page de tri des Éclaireuses (R20, docs/scenarios/refonte.md, « La page de tri » ; plan R20,
// choix 9), pour l'administrateur actif seul :
// - GET    /v1/moderation/scouts                 le mois, les places, les missions, les Éclaireuses ;
// - POST   /v1/moderation/scouts/program         « Lancer le mois » → 204 (409 s'il l'est déjà) ;
// - PUT    /v1/moderation/scouts/missions        les missions de la semaine (0 à 3) → 204 ;
// - GET    /v1/moderation/scouts/reports         les retours, filtrés, 30 par page ;
// - PATCH  /v1/moderation/scouts/reports/{id}    le statut et les notes d'un retour → 200, le retour ;
// - DELETE /v1/moderation/scouts/{memberId}      « Retirer », avec un motif → 204.
// Les autres écritures ne rendent rien : l'appli relit la page (les réponses de ces routes sont
// libres, plan R20, « Tests qui doivent échouer », TA2) ; PATCH rend le retour changé.
//
// Pour tout autre visiteur (anonyme, membre, Éclaireuse, administrateur révoqué ou suspendu), ces
// adresses répondent exactement comme une adresse qui n'existe pas, avant même de lire le corps
// (relecture de sécurité A2). Les écritures comptent dans leur propre quota (`scoutAdmin`, 300 par
// jour), jamais dans celui des décisions de modération ; les lectures ne comptent pas.
import { createRoute, z } from '@hono/zod-openapi'
import {
  type ErrorCode,
  SCOUT_ADMIN_DAILY,
  ScoutMissionsInput,
  ScoutRemoval,
  ScoutReportAdmin,
  ScoutReportPage,
  ScoutReportPatch,
  ScoutReportsQuery,
  ScoutTriage,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { readCursor } from '../cursor'
import { languageOfMember } from '../email/language'
import { errorBody, languageOf } from '../errors'
import { type Live, toAdmins, toOwnDevices } from '../live/emit'
import { connectedScoutsOf } from '../live/recipients'
import type { FileStorage } from '../media/storage'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import {
  launchProgram,
  loadAdminReport,
  loadReportPage,
  loadTriage,
  patchReport,
  removeScout,
  saveMissions,
} from '../scouts/triage'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const ROOT = '/v1/moderation/scouts'

const notFoundResponse = errorResponse(
  'Not an active administrator, or no such item: as an unknown route.',
)
const noContent = { 204: { description: 'Done; the page reads itself again.' } }

const triageRoute = createRoute({
  method: 'get',
  path: ROOT,
  summary: 'The top of the scouts triage page',
  responses: {
    200: {
      description: 'The month, the places, the missions of the week and every scout.',
      content: { 'application/json': { schema: ScoutTriage } },
    },
    404: notFoundResponse,
  },
})

const programRoute = createRoute({
  method: 'post',
  path: `${ROOT}/program`,
  summary: 'Launch the month of the scouts',
  description: 'Until midnight in Paris after the 30th day, the launch day counting for one.',
  responses: {
    ...noContent,
    404: notFoundResponse,
    409: errorResponse('Already launched (scout_program_started).'),
    429: errorResponse('Too many writes today.'),
  },
})

const missionsRoute = createRoute({
  method: 'put',
  path: `${ROOT}/missions`,
  summary: 'Write the missions of the current week',
  description:
    'In order; a mission cited by its id is kept, a mission left out is deleted (its reports keep their text). The first missions of a week tell each active scout.',
  request: {
    body: { required: true, content: { 'application/json': { schema: ScoutMissionsInput } } },
  },
  responses: {
    ...noContent,
    400: errorResponse('More than 3 missions, a text missing, twice the same, or another week.'),
    404: notFoundResponse,
    429: errorResponse('Too many writes today.'),
  },
})

const reportsRoute = createRoute({
  method: 'get',
  path: `${ROOT}/reports`,
  summary: 'The reports, newest first',
  request: { query: ScoutReportsQuery },
  responses: {
    200: {
      description: 'A page of 30 reports at most, and the cursor of the next one.',
      content: { 'application/json': { schema: ScoutReportPage } },
    },
    400: errorResponse('An unknown filter value, or a malformed cursor.'),
    404: notFoundResponse,
  },
})

const patchRoute = createRoute({
  method: 'patch',
  path: `${ROOT}/reports/{id}`,
  summary: 'Change the status or the notes of a report',
  description:
    'Fixed pays the scout 50 pollen and 10 honey and tells her, once; a fixed report never changes status again.',
  request: {
    params: z.object({ id: z.string() }),
    body: { required: true, content: { 'application/json': { schema: ScoutReportPatch } } },
  },
  responses: {
    200: {
      description: 'The report changed, as the list shows it.',
      content: { 'application/json': { schema: ScoutReportAdmin } },
    },
    400: errorResponse('Nothing to change, the status sent, or a note for the scout before fixed.'),
    404: notFoundResponse,
    409: errorResponse('The report is fixed (scout_report_fixed).'),
    429: errorResponse('Too many writes today.'),
  },
})

const removeRoute = createRoute({
  method: 'delete',
  path: `${ROOT}/{memberId}`,
  summary: 'Remove a scout, with a reason',
  description:
    'Her place frees up, her reports stay; she is told why in her activity, even with her harvest notices off.',
  request: {
    params: z.object({ memberId: z.string() }),
    body: { required: true, content: { 'application/json': { schema: ScoutRemoval } } },
  },
  responses: {
    ...noContent,
    400: errorResponse('No reason.'),
    404: notFoundResponse,
    409: errorResponse('Already removed (scout_removed).'),
    429: errorResponse('Too many writes today.'),
  },
})

/** 300 écritures par jour : bien plus qu'un tri à la main, assez peu pour freiner un script. */
const writeRule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: SCOUT_ADMIN_DAILY }

/** Un uuid : la forme des identifiants de retour (sinon, le même 404 qu'un retour inconnu). */
const Uuid = z.uuid()

export type ScoutTriageDeps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
  /** R21 : la base et le bus du temps réel, pour les signaux de chaque geste (live/emit.ts). */
  live: Live
}

export const scoutTriageRoutes = ({ db, limiter, publicApiUrl, live }: ScoutTriageDeps) => {
  const app = createRouter()

  // Le statut est un paramètre de type (`S`) : chaque appel garde son statut exact, que le typage
  // des routes compare à celles qu'elles déclarent.
  const fail = <S extends 400 | 404 | 409>(c: Context<AppEnv>, code: ErrorCode, status: S) =>
    c.json(errorBody(languageOf(c), code), status)
  const notFound = (c: Context<AppEnv>) => fail(c, 'not_found', 404)

  // La garde, AVANT tout le reste (avant le validateur que Hono place devant chaque route) : le
  // rôle est relu en base à chaque requête (isActiveAdmin : non révoqué, non suspendu). Sinon, le
  // même 404 que app.notFound (app.ts), mot pour mot. Chez Hono, le motif « …/scouts/* » couvre
  // aussi « …/scouts » lui-même : une seule garde pour la page et tout ce qui est dessous.
  const guard = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const user = c.get('user')
    if (!user || !(await isActiveAdmin(db, user.id))) return notFound(c)
    // Le quota, après la garde (un membre ne voit jamais un 429) et avant la validation : chaque
    // écriture compte, même mal formée. Les lectures ne comptent pas.
    if (c.req.method !== 'GET') {
      const decision = await limiter.hit(memberCounterKeys(user.id).scoutAdmin, writeRule)
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
    }
    await next()
  }
  app.use(`${ROOT}/*`, guard)

  /** Le texte des missions dans la langue du compte de l'administrateur, le français à défaut. */
  const englishFor = (c: Context<AppEnv>) => {
    const user = c.get('user')
    return user ? languageOfMember(user) === 'en' : false
  }

  app.openapi(triageRoute, async (c) => c.json(await loadTriage(db, new Date(), publicApiUrl), 200))

  app.openapi(programRoute, async (c) => {
    if (!(await launchProgram(db, new Date()))) return fail(c, 'scout_program_started', 409)
    // R21 : la page de tri des autres administrateurs (le mois et ses places).
    toAdmins(live, 'scouts')
    return c.body(null, 204)
  })

  app.openapi(missionsRoute, async (c) => {
    const outcome = await saveMissions(db, c.req.valid('json'), new Date())
    // Un `id` qui n'est pas une mission de la semaine : une demande mal formée, comme un `id` cité
    // deux fois (refusé par le contrat).
    if (outcome === 'unknown_mission') return fail(c, 'validation', 400)
    // R21 : les missions de la semaine changent pour chaque Éclaireuse active (la pastille de la
    // Goutte), et l'avis « N missions cette semaine » a pu leur être écrit : `scouts` et
    // `notifications` sur leur `me`. Elles seules (`connectedScoutsOf`), sans filtre : ce sont
    // leurs missions, et l'avis est signé par l'équipe. Puis la page de tri des administrateurs.
    const scouts = await connectedScoutsOf(live)
    toOwnDevices(live, scouts, 'scouts')
    toOwnDevices(live, scouts, 'notifications')
    toAdmins(live, 'scouts')
    return c.body(null, 204)
  })

  app.openapi(reportsRoute, async (c) => {
    const { cursor, ...filters } = c.req.valid('query')
    const decoded = readCursor(cursor)
    if (decoded === 'invalid') return fail(c, 'validation', 400)
    return c.json(await loadReportPage(db, filters, decoded, englishFor(c), publicApiUrl), 200)
  })

  app.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid('param')
    // Un identifiant mal formé n'atteint jamais la base (la colonne est un uuid : PostgreSQL
    // refuserait la comparaison par une erreur) : le même 404 qu'un retour inconnu.
    if (!Uuid.safeParse(id).success) return notFound(c)
    const outcome = await patchReport(db, id, c.req.valid('json'), new Date())
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'scout_report_fixed') return fail(c, 'scout_report_fixed', 409)
    // Une note pour l'Éclaireuse avant « Corrigé » : refusée comme si elle venait avec un autre
    // statut (le contrat refuse déjà ce cas-là).
    if (outcome === 'not_fixed') return fail(c, 'validation', 400)
    // R21 : la page de tri des administrateurs ; et, au `me` de l'Éclaireuse seule, « Mes retours »
    // (son statut), puis, si sa danse vient d'être entendue, son Activité (« Ta danse a été
    // entendue ») et sa récolte (pollen et miel). Pas de filtre de blocage : l'avis est signé par
    // l'équipe, comme celui du catalogue (catalogue/admin.ts).
    toAdmins(live, 'scouts')
    toOwnDevices(live, [outcome.memberId], 'scouts')
    if (outcome.heard) {
      toOwnDevices(live, [outcome.memberId], 'notifications')
      toOwnDevices(live, [outcome.memberId], 'pollen')
    }
    // Le retour changé, relu hors de la transaction, tel que la liste le montre.
    const report = await loadAdminReport(db, id, englishFor(c), publicApiUrl)
    if (!report) return notFound(c)
    return c.json(report, 200)
  })

  app.openapi(removeRoute, async (c) => {
    const { memberId } = c.req.valid('param')
    const outcome = await removeScout(db, memberId, c.req.valid('json').reason, new Date())
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'scout_removed') return fail(c, 'scout_removed', 409)
    // R21 : l'Éclaireuse retirée perd la Goutte et reçoit l'avis qui dit pourquoi ; la page de tri
    // des administrateurs perd une Éclaireuse.
    toOwnDevices(live, [memberId], 'scouts')
    toOwnDevices(live, [memberId], 'notifications')
    toAdmins(live, 'scouts')
    return c.body(null, 204)
  })

  return app
}
