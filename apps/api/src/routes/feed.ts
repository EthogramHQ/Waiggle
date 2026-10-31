// Les deux fils de l'accueil (tranche 4a) : GET /v1/feed/following (« Abonnements ») et
// GET /v1/feed/discover (« Découvrir »). Réservés aux membres connectés ; ce qu'ils montrent est
// décidé dans feed/load.ts.
import { createRoute } from '@hono/zod-openapi'
import { DiscoverFeedPage, DiscoverQuery, FeedQuery, FollowingFeedPage } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { loadDiscoverFeed, loadFollowingFeed } from '../feed/load'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const followingRoute = createRoute({
  method: 'get',
  path: '/v1/feed/following',
  summary: 'Read the feed of the members I follow',
  // request.query : les paramètres d'adresse (?cursor=…), vérifiés par FeedQuery avant la route.
  request: { query: FeedQuery },
  responses: {
    200: {
      description:
        'The new public projects of the members followed, and the notes of the public projects ' +
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

type Deps = { db: Database; publicApiUrl: string }

export const feedRoutes = ({ db, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/feed/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const invalid = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)

  app.openapi(followingRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(c)
    const page = await loadFollowingFeed(db, viewer.id, cursor, publicApiUrl)
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(FollowingFeedPage.parse(page), 200)
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
      publicApiUrl,
    )
    return c.json(DiscoverFeedPage.parse(page), 200)
  })

  return app
}
