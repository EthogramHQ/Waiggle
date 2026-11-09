// La page d'un outil (GET /v1/tags/{slug}, tranche R6b) : un outil du catalogue avec ses projets,
// ses catégories et ses filtres (statut, catégorie). Réservée aux membres connectés. Un « Autre »
// (un nom tapé par un membre, sans page) et une adresse inconnue répondent le même 404.
import { createRoute, z } from '@hono/zod-openapi'
import { TagParam, ToolPage, ToolPageQuery, ToolSlug } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { requireUser } from '../auth/session'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import type { RateLimiter } from '../rate-limit'
import { loadToolPage } from '../tools/load'
import { chargeToolsRead } from '../tools/read-quota'
import { createRouter, errorResponse } from './router'

const readToolRoute = createRoute({
  method: 'get',
  path: '/v1/tags/{slug}',
  summary: 'Read the page of a tool',
  description:
    'The page of a tool of the catalogue. An old address leads to the tool: `tool.slug` is the ' +
    'official one. An « other » tool or an unknown address answers the same 404.',
  request: { params: z.object({ slug: TagParam }), query: ToolPageQuery },
  responses: {
    200: {
      description: 'The tool and the projects the viewer may see, newest first, 50 per page.',
      content: { 'application/json': { schema: ToolPage } },
    },
    400: errorResponse('Invalid filter or cursor.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such tool.'),
    429: errorResponse('Too many readings (see Retry-After).'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const tagRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/tags/*', requireUser)

  // Le quota, dans un « middleware » posé avant la route : Hono vérifie les paramètres juste avant
  // la route, donc après ce compteur. Chaque demande compte, même mal formée (charte : session,
  // puis quota, puis identifiant).
  app.use('/v1/tags/*', async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const wait = await chargeToolsRead(limiter, user.id)
    if (wait !== null) {
      c.header('Retry-After', String(wait))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  app.openapi(readToolRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const query = c.req.valid('query')
    const cursor = readCursor(query.cursor)
    if (cursor === 'invalid') return c.json(errorBody(languageOf(c), 'validation'), 400)

    // Une adresse mal formée (point, espace, majuscule…) ne peut être celle d'aucun outil : 404
    // sans lire la base, avec le même corps que l'inconnu et que l'« Autre ».
    const slug = ToolSlug.safeParse(c.req.valid('param').slug)
    const page = slug.success
      ? await loadToolPage(
          db,
          viewer.id,
          slug.data,
          query,
          cursor,
          languageOf(c) === 'en' ? 'en' : 'fr',
          publicApiUrl,
        )
      : null
    if (!page) return c.json(errorBody(languageOf(c), 'not_found'), 404)
    return c.json(ToolPage.parse(page), 200)
  })

  return app
}
