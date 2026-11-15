// L'écran « Accepter » des règles (tranche R11) : POST /v1/me/rules, pour un membre inscrit avant
// la version en vigueur. Il note l'accord (rules/accept.ts) et rend le profil `Me`, dont
// `rulesAccepted` vaut alors vrai : l'appli referme l'écran sans relire. Le membre n'accepte jamais
// que pour lui : la route ne prend aucun identifiant, seul le membre connecté compte.
//
// C'est une des sorties de la garde de l'accord (rules/guard.ts) et de celle de la suspension
// (suspension/guard.ts, S-B1) : un membre suspendu peut accepter, sans que cela lui rende l'écriture.
import { createRoute } from '@hono/zod-openapi'
import { AcceptRules, Me } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { loadMe } from '../profile/me'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { acceptCurrentRules } from '../rules/accept'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const RULES_PATH = '/v1/me/rules'

const acceptRoute = createRoute({
  method: 'post',
  path: RULES_PATH,
  summary: 'Accept the current rules',
  description:
    'The version must be the current one, and both boxes the boolean true. Accepting the same ' +
    'version again keeps the date of the first acceptance.',
  // Le corps doit respecter AcceptRules (z.literal : la version du serveur, `true` pour chaque
  // case) ; sinon le routeur répond 400 `validation` avant la route. Les clés de plus (un
  // `userId`) sont ignorées : la route ne lit que le membre connecté.
  request: {
    body: { required: true, content: { 'application/json': { schema: AcceptRules } } },
  },
  responses: {
    200: {
      description: 'The profile, with the rules accepted.',
      content: { 'application/json': { schema: Me } },
    },
    400: errorResponse('Another version, or a box that is not the boolean true.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many requests.'),
  },
})

// 30 par heure : l'appli n'envoie qu'une demande par écran « Accepter » ; le plafond arrête une
// boucle sans gêner un membre qui réessaie après une coupure de réseau.
const acceptRule: RateRule = { windowMs: 60 * 60 * 1000, max: 30 }

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const rulesRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use(RULES_PATH, requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)

  // Le quota passe avant le validateur (que Hono place juste avant la route) : chaque demande
  // compte, même mal écrite.
  app.on('POST', RULES_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).rulesAccept, acceptRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  app.openapi(acceptRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Arrivée ici, la demande a passé AcceptRules : le corps ne sert qu'à prouver l'accord, il n'est
    // pas relu. La version écrite est celle du serveur (que le schéma oblige déjà le corps à
    // répéter), l'heure celle de l'API, à la milliseconde.
    await acceptCurrentRules(db, user.id, new Date())
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  return app
}
