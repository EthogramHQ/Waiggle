// La liste des outils (GET /v1/tools) et celle des catégories (GET /v1/categories), tranche R6b :
// tout le catalogue avec ses nombres de projets et les « Autre » en attente ; les catégories avec
// leur nombre. Réservées aux membres connectés, sur le même quota horaire (`toolsHour`).
import { createRoute } from '@hono/zod-openapi'
import { CategoryList, ToolList } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { requireUser } from '../auth/session'
import { loadCategories } from '../categories/load'
import { errorBody, languageOf } from '../errors'
import type { RateLimiter } from '../rate-limit'
import { loadToolList } from '../tools/load'
import { chargeToolsRead } from '../tools/read-quota'
import { createRouter, errorResponse } from './router'

const toolsRoute = createRoute({
  method: 'get',
  path: '/v1/tools',
  summary: 'List the tools of the catalogue',
  description:
    'The whole catalogue (500 tools at most), most used first, then by name, each with its aliases ' +
    'and its number of projects the viewer may see; and the « other » tools cited by at least one ' +
    'project the viewer may see (50 at most, by name).',
  responses: {
    200: { description: 'The tools.', content: { 'application/json': { schema: ToolList } } },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many readings (see Retry-After).'),
  },
})

const categoriesRoute = createRoute({
  method: 'get',
  path: '/v1/categories',
  summary: 'List the categories of projects',
  description:
    'Every category, in the order of the publishing sheet, named in the language of the viewer ' +
    '(Accept-Language), each with its number of projects the viewer may see.',
  responses: {
    200: {
      description: 'The categories.',
      content: { 'application/json': { schema: CategoryList } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many readings (see Retry-After).'),
  },
})

type Deps = { db: Database; limiter: RateLimiter }

export const toolRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()
  app.use('/v1/tools', requireUser)
  app.use('/v1/categories', requireUser)

  app.openapi(toolsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const wait = await chargeToolsRead(limiter, user.id)
    if (wait !== null) {
      c.header('Retry-After', String(wait))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    return c.json(ToolList.parse(await loadToolList(db, user.id)), 200)
  })

  app.openapi(categoriesRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const wait = await chargeToolsRead(limiter, user.id)
    if (wait !== null) {
      c.header('Retry-After', String(wait))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    const categories = await loadCategories(db, user.id, languageOf(c))
    return c.json(CategoryList.parse({ categories }), 200)
  })

  return app
}
