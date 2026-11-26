// Routes du jeu (R19, « La gamification ») : « Ma récolte » (GET /v1/me/harvest), les réglages du jeu
// et le choix du défi de la semaine (PATCH /v1/me/game), la décoration du rayon
// (PUT /v1/me/game/decoration) et l'offre de miel au projet d'un autre membre
// (POST /v1/projects/{id}/honey). Les classements ont leur propre fichier.
//
// L'ordre des vérifications, le même partout : la session, puis le quota (chaque demande compte,
// même mal formée : il est posé avant le validateur, relecture de sécurité S4), puis le corps ou
// l'identifiant, puis la ressource. Un compte suspendu lit sa récolte et change ses réglages
// (`ALLOWED_WRITES`, suspension/guard.ts) ; la garde lui refuse l'offre et la décoration avant
// même cette route.
import { createRoute, z } from '@hono/zod-openapi'
import {
  DecorationChoice,
  ErrorResponse,
  GameSettingsUpdate,
  Harvest,
  HoneyShortError,
  ProjectId,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { loadHarvest, updateGameSettings } from '../game/harvest'
import { decorate, type HoneyShort, offerHoney } from '../game/honey'
import { type Live, projectChanged, toOwnDevices } from '../live/emit'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const HOUR = 60 * 60 * 1000
// Les règles anti-abus (plan R19, « Tests commités » : quotas `memberCounterKeys`). Lire sa récolte
// est une lecture calculée (une dizaine de requêtes) : 600 par heure, comme les lectures des ruches.
// Changer ses réglages : 120 par heure ; décorer : 60 ; offrir du miel : 10 par heure, tous projets
// ensemble (au plus 10 avis « Léa t'a offert du miel » par heure, et 50 miel).
const harvestRule: RateRule = { windowMs: HOUR, max: 600 }
const settingsRule: RateRule = { windowMs: HOUR, max: 120 }
const decorationRule: RateRule = { windowMs: HOUR, max: 60 }
const honeyGiftRule: RateRule = { windowMs: HOUR, max: 10 }

const done = { description: 'Done (no content).' }
/** Le 409 d'un débit refusé : `honey_short` porte le prix et le solde, `honey_already` non. */
const honeyRefused = (description: string) => ({
  description,
  content: { 'application/json': { schema: z.union([HoneyShortError, ErrorResponse]) } },
})

const harvestRoute = createRoute({
  method: 'get',
  path: '/v1/me/harvest',
  summary: 'My harvest',
  description:
    'Level, pollen of the week, title, foraged weeks, honey, challenges of the week, seals, decoration and game settings of the signed-in member. Reading it draws the challenges of the week.',
  responses: {
    200: { description: 'The harvest.', content: { 'application/json': { schema: Harvest } } },
    401: errorResponse('Not signed in.'),
    404: errorResponse('An example account has no harvest.'),
    429: errorResponse('Too many reads.'),
  },
})

const settingsRoute = createRoute({
  method: 'patch',
  path: '/v1/me/game',
  summary: 'Change my game settings, or choose my challenge of the week',
  description: 'Allowed to a suspended member: leaving the rankings must stay possible.',
  request: {
    body: { required: true, content: { 'application/json': { schema: GameSettingsUpdate } } },
  },
  responses: {
    204: done,
    400: errorResponse('Invalid settings: empty, unknown field or value.'),
    401: errorResponse('Not signed in.'),
    422: errorResponse(
      'A level seen above the level reached, a family not obtained yet, or a challenge not offered (or a second choice this week).',
    ),
    429: errorResponse('Too many changes.'),
  },
})

const decorationRoute = createRoute({
  method: 'put',
  path: '/v1/me/game/decoration',
  summary: 'Decorate my comb',
  description:
    'Pays with honey what is not bought yet; a decoration bought once is free afterwards.',
  request: {
    body: { required: true, content: { 'application/json': { schema: DecorationChoice } } },
  },
  responses: {
    204: done,
    400: errorResponse('Not a tint and a pattern of the list.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Suspended account.'),
    409: honeyRefused('Not enough honey (with the price and the balance); nothing is spent.'),
    429: errorResponse('Too many changes.'),
  },
})

const honeyRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/honey',
  summary: 'Offer honey to the project of another member',
  description: 'Spends 5 honey, once per project; the author is told, and gets no honey in return.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('Suspended account.'),
    404: errorResponse(
      'No such project, or one that cannot receive honey from this member (private, removed, blocked, own, example).',
    ),
    409: honeyRefused('Honey already offered to this project, or not enough honey.'),
    429: errorResponse('Too many gifts.'),
  },
})

/** R21 : `live`, la base et le bus du temps réel, pour les signaux de chaque geste (live/emit.ts). */
type Deps = { db: Database; limiter: RateLimiter; live: Live }

export const gameRoutes = ({ db, limiter, live }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use('/v1/me/harvest', requireUser)
  app.use('/v1/me/game', requireUser)
  app.use('/v1/me/game/*', requireUser)
  app.use('/v1/projects/:id/honey', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  /** Le 409 `honey_short` : la forme de toutes les erreurs, plus le prix et le solde. */
  const honeyShort = (c: Context<AppEnv>, refusal: HoneyShort) => {
    const body = errorBody(languageOf(c), 'honey_short')
    return c.json(
      { error: { ...body.error, needed: refusal.needed, balance: refusal.balance } },
      409,
    )
  }

  // Un « middleware » (une fonction qui passe avant la route, et peut répondre à sa place) qui
  // compte la demande dans le compteur du membre et répond 429 au-delà de la règle. Posé avant la
  // vérification de la demande (que Hono place juste avant la route) : une demande mal formée, un
  // identifiant inconnu comptent aussi (on ne sonde pas sans limite).
  const quota =
    (counter: 'harvest' | 'gameSettings' | 'decoration' | 'honeyGift', rule: RateRule) =>
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
  app.on('GET', '/v1/me/harvest', quota('harvest', harvestRule))
  app.on('PATCH', '/v1/me/game', quota('gameSettings', settingsRule))
  app.on('PUT', '/v1/me/game/decoration', quota('decoration', decorationRule))
  app.on('POST', '/v1/projects/:id/honey', quota('honeyGift', honeyGiftRule))

  app.openapi(harvestRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const harvest = await loadHarvest(db, user.id, new Date())
    if (!harvest) return notFound(c)
    // Passée par le schéma du contrat : un champ de trop ne sort jamais.
    return c.json(Harvest.parse(harvest), 200)
  })

  app.openapi(settingsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const refused = await updateGameSettings(db, user.id, c.req.valid('json'), new Date())
    if (refused) return c.json(errorBody(languageOf(c), refused), 422)
    // R21 : ses autres appareils relisent « Ma récolte » (`pollen`) et l'Activité, dont les avis du
    // jeu se cachent ou reviennent avec le réglage.
    toOwnDevices(live, [user.id], 'pollen')
    toOwnDevices(live, [user.id], 'notifications')
    return c.body(null, 204)
  })

  app.openapi(decorationRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const refused = await decorate(db, user.id, c.req.valid('json'), new Date())
    if (refused) return honeyShort(c, refused)
    // R21 : le rayon et le solde de miel, sur ses autres appareils.
    toOwnDevices(live, [user.id], 'pollen')
    return c.body(null, 204)
  })

  app.openapi(honeyRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    // Un identifiant mal formé : « introuvable », sans interroger la base (la colonne est un uuid).
    if (!ProjectId.safeParse(id).success) return notFound(c)
    const outcome = await offerHoney(db, user.id, id, new Date())
    switch (outcome.kind) {
      case 'done':
        // R21 : l'avis du miel offert, au `me` de l'auteur du projet seul (s'il n'a pas coupé « Ma
        // récolte », l'avis existe ; sinon un recomptage pour rien). `projectChanged` garde l'avis
        // pour qui voit le projet, sans blocage avec le donneur (gameSources, notifications/load.ts).
        // Les autres appareils du donneur : son solde de miel (« Ma récolte »).
        await projectChanged(live, { projectId: id, actorId: user.id, notify: [outcome.authorId] })
        toOwnDevices(live, [user.id], 'pollen')
        return c.body(null, 204)
      case 'not_found':
        return notFound(c)
      case 'honey_already':
        return c.json(errorBody(languageOf(c), 'honey_already'), 409)
      case 'honey_short':
        return honeyShort(c, outcome)
    }
  })

  return app
}
