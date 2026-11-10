// Les deux fils de l'accueil (tranche 4a) : GET /v1/feed/following (« Abonnements ») et
// GET /v1/feed/discover (« Découvrir »). Réservés aux membres connectés ; ce qu'ils montrent est
// décidé dans feed/load.ts. Tranche R4 : PUT /v1/feed/read, « j'ai lu mon fil jusqu'ici », et la
// date retenue rendue sur chaque page du fil « Abonnements » (feed/state.ts).
import { createRoute } from '@hono/zod-openapi'
import {
  DiscoverFeedPage,
  DiscoverQuery,
  FeedQuery,
  FeedReadBody,
  FollowingFeedPage,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { loadDiscoverFeed, loadFollowingFeed } from '../feed/load'
import { markFeedRead, readFeedReadAt } from '../feed/state'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Marquer son fil lu (R4) : 600 fois par heure. L'appli l'envoie une fois par ouverture du fil ;
// le quota arrête une boucle qui écrirait sans fin dans la base.
const feedReadRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }

const followingRoute = createRoute({
  method: 'get',
  path: '/v1/feed/following',
  summary: 'Read the feed of the members I follow',
  // request.query : les paramètres d'adresse (?cursor=…), vérifiés par FeedQuery avant la route.
  request: { query: FeedQuery },
  responses: {
    200: {
      description:
        'The new public projects of the members followed, and the updates of the public projects ' +
        'followed, newest first.',
      content: { 'application/json': { schema: FollowingFeedPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
  },
})

const discoverRoute = createRoute({
  method: 'get',
  path: '/v1/feed/discover',
  summary: 'Read the feed of every public project',
  request: { query: DiscoverQuery },
  responses: {
    200: {
      description:
        'The public projects of every member, newest first, and which of their authors the ' +
        'viewer already follows.',
      content: { 'application/json': { schema: DiscoverFeedPage } },
    },
    400: errorResponse('Invalid cursor or filter.'),
    401: errorResponse('Not signed in.'),
  },
})

const readRoute = createRoute({
  method: 'put',
  path: '/v1/feed/read',
  summary: 'Mark my feed of the members I follow as read',
  description:
    'The feed is read up to upTo, the date of an item shown. The date never goes back; a date ' +
    'before 2026 or beyond the time of the server is not kept.',
  request: { body: { required: true, content: { 'application/json': { schema: FeedReadBody } } } },
  responses: {
    204: { description: 'Done (no content), even when the date was out of bounds.' },
    400: errorResponse('Not a date.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many requests.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const feedRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/feed/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const invalid = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)

  // Le quota de PUT /v1/feed/read, dans un « middleware » posé avant la route : Hono vérifie le
  // corps (FeedReadBody) juste avant la route, donc après ce compteur. Chaque demande compte, même
  // mal formée (relecture de sécurité sec-A3), comme pour « vu » des notifications.
  app.on('PUT', '/v1/feed/read', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).feedReadHour, feedReadRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  app.openapi(followingRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(c)
    // La page et la date de la dernière lecture, lues en même temps. La date est celle retenue
    // AVANT cette lecture : lire une page ne l'avance jamais (seul PUT /v1/feed/read le fait,
    // sec-A2), et elle est la même sur chaque page, les suivantes comprises.
    const [page, readAt] = await Promise.all([
      loadFollowingFeed(db, viewer.id, cursor, publicApiUrl),
      readFeedReadAt(db, viewer.id),
    ])
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(
      FollowingFeedPage.parse({ ...page, lastReadAt: readAt?.toISOString() ?? null }),
      200,
    )
  })

  app.openapi(readRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    // `upTo` est déjà une date ISO bien formée (FeedReadBody) ; feed/state.ts la borne, et une
    // date hors bornes ne garde rien mais répond quand même 204 : l'appli n'a rien à corriger.
    await markFeedRead(db, viewer.id, new Date(c.req.valid('json').upTo), new Date())
    // 204 : « c'est fait », sans corps.
    return c.body(null, 204)
  })

  app.openapi(discoverRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const query = c.req.valid('query')
    const cursor = readCursor(query.cursor)
    if (cursor === 'invalid') return invalid(c)
    const page = await loadDiscoverFeed(
      db,
      viewer.id,
      cursor,
      query.testers === 'true',
      query.category,
      publicApiUrl,
    )
    return c.json(DiscoverFeedPage.parse(page), 200)
  })

  return app
}
