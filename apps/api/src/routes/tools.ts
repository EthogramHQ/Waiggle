// La liste des outils (tranche R3, GET /v1/tools) : les outils des projets publics que le membre
// peut voir, chacun avec son nombre de projets, du plus utilisé au moins utilisé, 500 au plus.
// Explorer en tire « Outils populaires » et « Tous les outils ». Réservée aux membres connectés.
import { createRoute } from '@hono/zod-openapi'
import { ToolList } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { loadToolList } from '../tools/load'
import { createRouter, errorResponse } from './router'

// 600 lectures par heure et par membre : la liste se calcule à chaque appel (tous les projets
// publics dépliés et regroupés), une lecture coûteuse comptée comme telle (securite.md).
const toolsHourRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }

const toolsRoute = createRoute({
  method: 'get',
  path: '/v1/tools',
  summary: 'List the tools of public projects',
  description:
    'The tools of the public projects the viewer may see, with their number of projects, most ' +
    'used first, then by label; 500 at most. The label is the one typed on the newest project.',
  responses: {
    200: {
      description: 'The tools.',
      content: { 'application/json': { schema: ToolList } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many readings (see Retry-After).'),
  },
})

type Deps = { db: Database; limiter: RateLimiter }

export const toolRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()
  app.use('/v1/tools', requireUser)

  app.openapi(toolsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const decision = await limiter.hit(memberCounterKeys(user.id).toolsHour, toolsHourRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    return c.json(ToolList.parse({ tools: await loadToolList(db, user.id) }), 200)
  })

  return app
}
