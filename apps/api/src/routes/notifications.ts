// Les notifications dans l'appli (tranche 6b) : la liste (GET /v1/notifications), le nombre de la
// cloche (GET /v1/notifications/unread) et « vu jusqu'à » (PUT /v1/notifications/seen). Réservées
// au membre connecté, qui ne lit jamais que les siennes : aucune route ne prend l'identifiant d'un
// autre. Le calcul est dans notifications/load.ts.
import { createRoute } from '@hono/zod-openapi'
import { NotificationPage, NotificationsQuery, SeenUpTo, UnreadCount } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { countUnread, loadNotificationPage, readNotificationCursor } from '../notifications/load'
import { markSeen, readSeenAt } from '../notifications/state'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const listRoute = createRoute({
  method: 'get',
  path: '/v1/notifications',
  summary: 'Read my notifications',
  request: { query: NotificationsQuery },
  responses: {
    200: {
      description:
        'My notifications of the last 90 days, newest first, 20 per page, with the time of the ' +
        'server (asOf) to send back to /v1/notifications/seen.',
      content: { 'application/json': { schema: NotificationPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many requests.'),
  },
})

const unreadRoute = createRoute({
  method: 'get',
  path: '/v1/notifications/unread',
  summary: 'Count my new notifications',
  responses: {
    200: {
      description: 'The number of new notifications, 10 at most (the app shows « 9+ »).',
      content: { 'application/json': { schema: UnreadCount } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many requests.'),
  },
})

const seenRoute = createRoute({
  method: 'put',
  path: '/v1/notifications/seen',
  summary: 'Mark my notifications as seen',
  description:
    'Everything up to upTo is seen. The date never goes back, and never beyond the time of the ' +
    'server.',
  request: { body: { required: true, content: { 'application/json': { schema: SeenUpTo } } } },
  responses: {
    204: { description: 'Done (no content).' },
    400: errorResponse('Not a date.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many requests.'),
  },
})

// Les quotas (relecture de sécurité de la tranche 6b) : chaque lecture recalcule 90 jours
// d'activité autour du membre (notifications/load.ts), ce qui coûte plus qu'une lecture ordinaire.
// - lire (la liste et le nombre de la cloche, un seul compteur) : 300 par minute. L'appli relit la
//   cloche de temps en temps et une page à chaque défilement : 300, c'est très large pour elle,
//   mais cela arrête une boucle qui chargerait la base ;
// - marquer vu : 60 par minute, une fois par ouverture de l'écran dans l'appli.
const readRule: RateRule = { windowMs: 60 * 1000, max: 300 }
const seenRule: RateRule = { windowMs: 60 * 1000, max: 60 }

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const notificationRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps de PUT).
  app.use('/v1/notifications', requireUser)
  app.use('/v1/notifications/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const invalid = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)

  // Un « middleware » (une fonction qui passe avant la route, et peut répondre à sa place) qui
  // compte la demande dans le compteur `counter` du membre, et répond 429 au-delà de la règle.
  // Il est posé AVANT la vérification de la demande (que Hono place juste avant la route) : chaque
  // demande compte, même mal écrite (un curseur faux, un corps qui n'est pas une date).
  const quota =
    (counter: 'notificationsRead' | 'notificationsSeen', rule: RateRule) =>
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
  app.on(
    'GET',
    ['/v1/notifications', '/v1/notifications/unread'],
    quota('notificationsRead', readRule),
  )
  app.on('PUT', '/v1/notifications/seen', quota('notificationsSeen', seenRule))

  app.openapi(listRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    // Le curseur vient du client : sa forme est vérifiée ici, et il n'entre dans la requête que
    // comme paramètre lié. Un curseur qui ne veut rien dire est refusé (400).
    const cursor = readNotificationCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(c)
    // L'heure de la lecture, prise une fois : elle borne les 90 jours, et l'appli la renvoie pour
    // marquer vu ce qui existait à ce moment-là, et rien de plus.
    const now = new Date()
    const seenAt = await readSeenAt(db, viewer.id)
    const page = await loadNotificationPage(db, viewer.id, seenAt, cursor, now, publicApiUrl)
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(NotificationPage.parse(page), 200)
  })

  app.openapi(unreadRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const seenAt = await readSeenAt(db, viewer.id)
    const count = await countUnread(db, viewer.id, seenAt, new Date())
    return c.json(UnreadCount.parse({ count }), 200)
  })

  app.openapi(seenRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const { upTo } = c.req.valid('json')
    await markSeen(db, viewer.id, new Date(upTo), new Date())
    // 204 : « c'est fait », sans corps.
    return c.body(null, 204)
  })

  return app
}
