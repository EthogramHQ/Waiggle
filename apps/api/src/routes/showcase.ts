// Les routes de la vitrine de l'accueil (tranche R12, plan choix 10) :
// - GET    /v1/showcase                 « À la une » pour un membre (règles de blocage d'Explorer) ;
// - GET    /v1/moderation/showcase      l'onglet « Vitrine de l'accueil » (administrateurs) ;
// - PUT    /v1/moderation/showcase      ranger la vitrine entière (administrateurs) → 204 ;
// - DELETE /v1/projects/{id}/showcase   « Retirer de l'accueil », par l'auteur → 204.
// La vitrine d'un visiteur (GET /v1/public/showcase) est dans routes/public.ts ; les deux lisent
// `loadShowcase` (public/load.ts), si bien qu'un membre et un visiteur reçoivent la même carte.
import { createRoute, z } from '@hono/zod-openapi'
import { ModerationShowcase, ShowcaseOrder, ShowcasePage } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { countDecision } from '../moderation/guard'
import { loadShowcase } from '../public/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import { leaveShowcase, loadModerationShowcase, setShowcase } from '../showcase/store'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const HOUR = 60 * 60 * 1000
// Le même compteur et la même règle que les autres gestes sur ses projets (routes/projects.ts).
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const SHOWCASE_PATH = '/v1/moderation/showcase'

const notFoundResponse = errorResponse('Not an administrator: the same answer as an unknown route.')

const memberShowcaseRoute = createRoute({
  method: 'get',
  path: '/v1/showcase',
  summary: 'The showcase of the home page, for a member (« À la une »)',
  responses: {
    200: {
      description: 'The showcase, without the projects of a member blocked either way.',
      content: { 'application/json': { schema: ShowcasePage } },
    },
    401: errorResponse('Not signed in.'),
  },
})

const moderationShowcaseRoute = createRoute({
  method: 'get',
  path: SHOWCASE_PATH,
  summary: 'The showcase and its candidates, for the moderation',
  responses: {
    200: {
      description: 'The showcase in its order, then the public projects not on it.',
      content: { 'application/json': { schema: ModerationShowcase } },
    },
    404: notFoundResponse,
  },
})

const setShowcaseRoute = createRoute({
  method: 'put',
  path: SHOWCASE_PATH,
  summary: 'Replace the whole showcase, in its order',
  request: {
    body: { required: true, content: { 'application/json': { schema: ShowcaseOrder } } },
  },
  responses: {
    204: { description: 'The showcase is saved.' },
    400: errorResponse('Invalid list: five projects or more, or one twice.'),
    404: errorResponse('Not an administrator, or a project not public: as an unknown one.'),
    409: errorResponse('Its author took this project off the showcase (author_declined).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const leaveShowcaseRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/showcase',
  summary: 'Take my project off the showcase, and keep it off',
  // Un texte, vérifié par la règle du projet : un identifiant mal formé reçoit le 404 d'un inconnu.
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: 'Off the showcase; a new showcase choice will be refused.' },
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not my project.'),
    404: errorResponse('No such project.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const showcaseRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)

  app.use('/v1/showcase', requireUser)
  app.use('/v1/projects/:id/showcase', requireUser)

  // La garde de la modération, AVANT le validateur que Hono place devant chaque route : anonyme,
  // membre, administrateur révoqué ou suspendu reçoivent le même 404 qu'une adresse inconnue, mot
  // pour mot, même avec un corps invalide (comme routes/moderation-catalogue.ts, décision 13 de
  // R6b). Puis le quota des décisions (50 par jour, partagé) : chaque rangement compte, même mal
  // formé ; la lecture de l'onglet, non.
  app.use(SHOWCASE_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user || !(await isActiveAdmin(db, user.id))) return notFound(c)
    if (c.req.method === 'PUT') {
      const quota = await countDecision(limiter, user.id)
      if (!quota.allowed) {
        c.header('Retry-After', String(quota.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
    }
    await next()
  })

  app.openapi(memberShowcaseRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const items = await loadShowcase(db, { viewerId: user.id, publicApiUrl })
    return c.json(ShowcasePage.parse({ items }), 200)
  })

  app.openapi(moderationShowcaseRoute, async (c) => {
    if (!c.get('user')) return notFound(c)
    return c.json(ModerationShowcase.parse(await loadModerationShowcase(db, publicApiUrl)), 200)
  })

  app.openapi(setShowcaseRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const { projectIds } = c.req.valid('json')
    const outcome = await setShowcase(db, user.id, projectIds, new Date())
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'author_declined') {
      return c.json(errorBody(languageOf(c), 'author_declined'), 409)
    }
    return c.body(null, 204)
  })

  app.openapi(leaveShowcaseRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    const outcome = await leaveShowcase(db, c.req.valid('param').id, user.id, new Date())
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return c.json(errorBody(languageOf(c), 'forbidden'), 403)
    return c.body(null, 204)
  })

  return app
}
