// Routes de la modération (tranche 7a), réservées aux administrateurs :
// - GET /v1/moderation/reports : la file des signalements en attente, regroupés par cible ;
// - GET /v1/moderation/removed : les contenus retirés, pour pouvoir les rétablir ;
// - POST /v1/moderation/decisions : retirer, classer sans suite, ou rétablir ; depuis la tranche
//   7c, suspendre un compte ou lever sa suspension ;
// - GET /v1/moderation/decisions : l'historique des décisions (tranche 7c).
// Pour tout autre visiteur (anonyme, membre, administrateur révoqué), ces adresses répondent
// exactement comme une adresse qui n'existe pas (règle 9 de la relecture du plan) : rien ne dit
// qu'une modération existe, ni qui en a le rôle.
import { createRoute } from '@hono/zod-openapi'
import {
  DecisionHistoryPage,
  DecisionHistoryQuery,
  ModerationDecision,
  ModerationDecisionInput,
  ModerationQuery,
  ModerationQueuePage,
  RemovedPage,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import type { Auth } from '../auth/auth'
import { readCursor } from '../cursor'
import type { Mailer } from '../email/mailer'
import { errorBody, languageOf } from '../errors'
import { confirmPassword, countDecision } from '../moderation/guard'
import { sendSuspensionEmail } from '../moderation/suspend'
import type { RateLimiter } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import { decide } from '../reports/decide'
import { loadDecisionHistory } from '../reports/history'
import { loadQueuePage, loadRemovedPage, voidReportsOfGoneTargets } from '../reports/queue'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const notFoundResponse = errorResponse('Not an administrator: the same answer as an unknown route.')

const queueRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/reports',
  summary: 'The queue of pending reports, grouped by target, oldest first',
  description: 'Never says who reported.',
  request: { query: ModerationQuery },
  responses: {
    200: {
      description: 'A page of the queue.',
      content: { 'application/json': { schema: ModerationQueuePage } },
    },
    400: errorResponse('Invalid cursor.'),
    404: notFoundResponse,
  },
})

const removedRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/removed',
  summary: 'The contents removed by the moderation, newest first',
  request: { query: ModerationQuery },
  responses: {
    200: {
      description: 'A page of removed contents.',
      content: { 'application/json': { schema: RemovedPage } },
    },
    400: errorResponse('Invalid cursor.'),
    404: notFoundResponse,
  },
})

const decisionRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/decisions',
  summary: 'Remove a content, dismiss its reports, restore it, suspend an account or lift it',
  description:
    'A decision closes every open report of its target. A profile only accepts « dismiss ». ' +
    'An administrator never decides on his own content or profile. At most 50 decisions a day; ' +
    'the password is asked again beyond 10 removals in an hour, beyond 3 suspensions in a day, ' +
    'and for a suspension without end.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ModerationDecisionInput } },
    },
  },
  responses: {
    201: {
      description: 'The decision is recorded.',
      content: { 'application/json': { schema: ModerationDecision } },
    },
    400: errorResponse('Invalid decision (an explanation is required to remove).'),
    403: errorResponse('The password is required, or wrong.'),
    404: errorResponse('Not an administrator, or no such target.'),
    409: errorResponse('Already decided in the meantime.'),
    422: errorResponse('His own content or profile, or another action than dismiss on a profile.'),
    429: errorResponse('Too many decisions today, or too many wrong passwords.'),
  },
})

const historyRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/decisions',
  summary: 'The history of the moderation decisions, newest first',
  description:
    'Optionally only those about one member (her contents and her account). Never says who reported.',
  request: { query: DecisionHistoryQuery },
  responses: {
    200: {
      description: 'A page of the history.',
      content: { 'application/json': { schema: DecisionHistoryPage } },
    },
    400: errorResponse('Invalid cursor or member.'),
    404: notFoundResponse,
  },
})

type Deps = {
  db: Database
  limiter: RateLimiter
  /** Better Auth : sa façon de vérifier un mot de passe, quand la modération le redemande. */
  auth: Pick<Auth, '$context'>
  /** L'e-mail au membre suspendu (tranche 7c), envoyé après la décision. */
  mailer: Mailer
}

export const moderationRoutes = ({ db, limiter, auth, mailer }: Deps) => {
  const app = createRouter()

  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)

  // La garde, AVANT tout le reste : avant la session obligatoire et avant la lecture du corps (le
  // validateur de chaque route passe après ce middleware). Le rôle est relu en base à chaque
  // requête : un rôle révoqué cesse aussitôt, sans attendre la fin de la session. Anonyme, membre
  // ou révoqué : le même 404 que app.notFound (app.ts), mot pour mot.
  app.use('/v1/moderation/*', async (c, next) => {
    const user = c.get('user')
    if (!user || !(await isActiveAdmin(db, user.id))) return notFound(c)
    await next()
  })

  app.openapi(queueRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return c.json(errorBody(languageOf(c), 'validation'), 400)
    // Les signalements d'une cible disparue entre-temps sont d'abord classés « sans objet » : elle
    // ne s'affiche plus (règle 29).
    await voidReportsOfGoneTargets(db, new Date())
    return c.json(ModerationQueuePage.parse(await loadQueuePage(db, user.id, cursor)), 200)
  })

  app.openapi(removedRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return c.json(errorBody(languageOf(c), 'validation'), 400)
    return c.json(RemovedPage.parse(await loadRemovedPage(db, user.id, cursor)), 200)
  })

  const rateLimited = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // Le quota des décisions (tranche 7c) : 50 par administrateur et par jour. Ce garde, enregistré
  // après celui des administrateurs et avant la route, passe avant le validateur que Hono place
  // juste devant elle (comme routes/reports.ts) : chaque demande compte, même mal formée. Après la
  // garde des administrateurs (S5) : un membre reçoit toujours le même 404, jamais un 429.
  app.on('POST', '/v1/moderation/decisions', async (c, next) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const quota = await countDecision(limiter, user.id)
    if (!quota.allowed) return rateLimited(c, quota.retryAfterSeconds)
    await next()
  })

  app.openapi(decisionRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const input = c.req.valid('json')
    // Le mot de passe retapé, s'il y en a un, se vérifie avant la décision : la vérification est
    // lente, et un échec doit rester compté même si rien n'est décidé (S12). Faux : rien n'est
    // écrit. Il n'est ni gardé ni journalisé.
    const password = 'password' in input ? input.password : undefined
    if (password !== undefined) {
      const hashing = (await auth.$context).password
      const check = await confirmPassword(db, limiter, hashing, user.id, password)
      if (!check.ok) {
        if (check.error === 'rate_limited') return rateLimited(c, check.retryAfterSeconds)
        return c.json(errorBody(languageOf(c), 'wrong_password'), 403)
      }
    }
    // L'heure de JavaScript : la date de la décision est aussi celle du retrait (removed_at).
    const now = new Date()
    const result = await decide(db, user.id, input, now, {
      passwordConfirmed: password !== undefined,
    })
    if (result.ok) {
      // Une suspension prévient le membre par e-mail, une fois la décision validée (tranche 7c) ;
      // un échec d'envoi est journalisé sans défaire la décision (moderation/suspend.ts).
      if (input.action === 'suspend') {
        await sendSuspensionEmail({ db, mailer, limiter }, input.memberId, now)
      }
      return c.json(ModerationDecision.parse(result.decision), 201)
    }
    switch (result.error) {
      case 'not_found':
        return notFound(c)
      case 'own_content':
        return c.json(errorBody(languageOf(c), 'own_content'), 422)
      case 'cannot_suspend_admin':
        return c.json(errorBody(languageOf(c), 'cannot_suspend_admin'), 422)
      case 'profile':
      case 'validation':
        // Une décision bien formée, mais qu'un profil n'accepte pas, ou une suspension qui cite un
        // signalement qui ne vise pas ce membre (J2).
        return c.json(errorBody(languageOf(c), 'validation'), 422)
      case 'already_decided':
        return c.json(errorBody(languageOf(c), 'already_decided'), 409)
      case 'password_required':
        return c.json(errorBody(languageOf(c), 'password_required'), 403)
    }
  })

  // L'historique (tranche 7c). La garde des administrateurs passe avant le validateur : pour un
  // non-administrateur, un `member` ou un curseur invalide reçoit le même 404 qu'une adresse
  // inconnue (S16) ; pour un administrateur, 400.
  app.openapi(historyRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    const query = c.req.valid('query')
    const cursor = readCursor(query.cursor)
    if (cursor === 'invalid') return c.json(errorBody(languageOf(c), 'validation'), 400)
    const page = await loadDecisionHistory(db, cursor, query.member ?? null)
    return c.json(DecisionHistoryPage.parse(page), 200)
  })

  return app
}
