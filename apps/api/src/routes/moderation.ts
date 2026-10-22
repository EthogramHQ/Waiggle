// Routes de la modération (tranche 6d), réservées aux administrateurs :
// - GET /v1/moderation/reports : la file des signalements en attente, regroupés par cible ;
// - GET /v1/moderation/removed : les contenus retirés, pour pouvoir les rétablir ;
// - POST /v1/moderation/decisions : retirer, classer sans suite, ou rétablir.
// Pour tout autre visiteur (anonyme, membre, administrateur révoqué), ces adresses répondent
// exactement comme une adresse qui n'existe pas (règle 9 de la relecture du plan) : rien ne dit
// qu'une modération existe, ni qui en a le rôle.
import { createRoute } from '@hono/zod-openapi'
import {
  ModerationDecision,
  ModerationDecisionInput,
  ModerationQuery,
  ModerationQueuePage,
  RemovedPage,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { isActiveAdmin } from '../reports/admin'
import { decide } from '../reports/decide'
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
  summary: 'Remove a content, dismiss its reports, or restore it',
  description:
    'A decision closes every open report of its target. A profile only accepts « dismiss ». ' +
    'An administrator never decides on his own content or profile.',
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
    404: errorResponse('Not an administrator, or no such target.'),
    409: errorResponse('Already decided in the meantime.'),
    422: errorResponse('His own content or profile, or another action than dismiss on a profile.'),
  },
})

type Deps = { db: Database }

export const moderationRoutes = ({ db }: Deps) => {
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

  app.openapi(decisionRoute, async (c) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    // L'heure de JavaScript : la date de la décision est aussi celle du retrait (removed_at).
    const result = await decide(db, user.id, c.req.valid('json'), new Date())
    if (result.ok) return c.json(ModerationDecision.parse(result.decision), 201)
    switch (result.error) {
      case 'not_found':
        return notFound(c)
      case 'own_content':
        return c.json(errorBody(languageOf(c), 'own_content'), 422)
      case 'profile':
        // Une décision bien formée, mais qu'un profil n'accepte pas.
        return c.json(errorBody(languageOf(c), 'validation'), 422)
      case 'already_decided':
        return c.json(errorBody(languageOf(c), 'already_decided'), 409)
    }
  })

  return app
}
