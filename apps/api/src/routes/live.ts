// Les routes du temps réel (R21, docs/scenarios/refonte.md, « R21 — Le temps réel » ; ADR 0008) :
// - GET /v1/live : le flux d'un appareil, en `text/event-stream` (SSE, « Server-Sent Events » : une
//   réponse HTTP qui ne se termine pas, où le serveur écrit un message chaque fois qu'il a quelque
//   chose à dire). Son premier message, `hello`, donne l'identifiant de la connexion ; ensuite des
//   signaux sans contenu (`{ topic, kind }`), et toutes les `LIVE_PING_MS` un battement `: ping` ;
// - PUT /v1/live/{connectionId}/topics : les sujets des écrans ouverts de cet appareil.
// Réservé aux membres connectés. Un compte suspendu garde son flux et déclare ses pages : il lit,
// comme par les autres GET (plan, choix 7, tranché par la session).
import { createRoute, z } from '@hono/zod-openapi'
import {
  LIVE_OPENS_PER_MINUTE,
  LIVE_TOPICS_PER_MINUTE,
  LiveHello,
  LiveTopicsBody,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { allowedTopics } from '../live/access'
import type { LiveHub } from '../live/hub'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const MINUTE = 60 * 1000
// Les règles chiffrées du contrat (packages/contracts/src/live.ts) : 30 ouvertures de flux et 60
// déclarations par membre et par minute.
const openRule: RateRule = { windowMs: MINUTE, max: LIVE_OPENS_PER_MINUTE }
const topicsRule: RateRule = { windowMs: MINUTE, max: LIVE_TOPICS_PER_MINUTE }

const TOPICS_PATH = '/v1/live/:connectionId/topics'

const streamRoute = createRoute({
  method: 'get',
  path: '/v1/live',
  summary: 'Open the live stream of this device (Server-Sent Events)',
  description:
    'A response that does not end. First message: `event: hello`, `data: LiveHello`. Then ' +
    '`event: signal`, `data: LiveEvent` (a topic and a kind, never any content), a `: ping` ' +
    'comment every LIVE_PING_MS, and `event: replaced` before the server closes the oldest ' +
    'stream of a member who opened one more than LIVE_MAX_STREAMS.',
  responses: {
    200: {
      description: 'The stream.',
      // Le schéma du premier message : les suivants sont décrits plus haut.
      content: { 'text/event-stream': { schema: LiveHello } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('More than LIVE_OPENS_PER_MINUTE openings within a minute.'),
    503: errorResponse('The server is stopping: try again in a moment.'),
  },
})

const topicsRoute = createRoute({
  method: 'put',
  path: '/v1/live/{connectionId}/topics',
  summary: 'Declare the topics of the open pages of this device',
  description:
    'The list replaces the previous one. A topic the member may not read is ignored without a ' +
    'word: the answer is the same 204.',
  request: {
    params: z.object({ connectionId: z.string() }),
    body: { content: { 'application/json': { schema: LiveTopicsBody } }, required: true },
  },
  responses: {
    204: { description: 'Done (no content).' },
    400: errorResponse('Malformed body, a topic that comes with the stream, or too many topics.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such open connection of this member (the same answer for all).'),
    429: errorResponse('More than LIVE_TOPICS_PER_MINUTE declarations within a minute.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; hub: LiveHub }

export const liveRoutes = ({ db, limiter, hub }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/live', requireUser)
  app.use('/v1/live/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  app.openapi(streamRoute, async (c) => {
    const user = c.get('user')
    const session = c.get('session')
    if (!user || !session) return unauthorized(c)
    // Le quota d'abord, avant d'ouvrir quoi que ce soit : un refus est une réponse JSON
    // ordinaire, jamais un flux (l'appli passe alors à la relecture toutes les minutes).
    const decision = await limiter.hit(memberCounterKeys(user.id).live, openRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    // L'arrêt du serveur a commencé : aucun flux neuf, sinon `server.close` l'attendrait.
    if (hub.stopping) return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    // `moderation` et `scouts` viennent d'office au seul administrateur en fonction (ni révoqué, ni
    // suspendu, reports/admin.ts) ; la revérification les retire si le rôle part (B2).
    const admin = await isActiveAdmin(db, user.id)

    // `streamSSE` (hono/streaming) répond tout de suite avec les en-têtes d'un flux SSE, puis appelle
    // la fonction avec de quoi y écrire : la réponse dure tant que la fonction n'a pas fini. Elle
    // attend donc la fin de la connexion (`closed`), décidée par le bus : flux coupé par l'appli
    // (`onAbort`), sixième flux, session finie, arrêt du serveur. Aucune transaction ni connexion à
    // la base n'est gardée pendant ce temps (relecture de sécurité A1).
    return streamSSE(c, async (stream) => {
      const { connectionId, closed } = hub.open({
        userId: user.id,
        sessionId: session.id,
        admin,
        sink: stream,
      })
      stream.onAbort(() => hub.forget(connectionId))
      await closed
    })
  })

  // La déclaration, dans l'ordre de la relecture de sécurité (B3) : la session (plus haut), le
  // quota, puis la connexion, AVANT le validateur du corps, que Hono place juste avant la route :
  // ce garde, enregistré plus tôt pour la même adresse et la même méthode, passe avant lui (comme
  // dans routes/comments.ts). Ainsi une demande mal formée compte aussi, et une connexion inconnue,
  // mal écrite, fermée ou d'un autre membre reçoit exactement le même 404, quel que soit le corps.
  app.on('PUT', TOPICS_PATH, async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).liveTopics, topicsRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    if (hub.ownerOf(c.req.param('connectionId')) !== user.id) return notFound(c)
    await next()
  })

  app.openapi(topicsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { connectionId } = c.req.valid('param')
    const { topics } = c.req.valid('json')
    // Une seule déclaration à la fois par connexion (A1) : la suivante attend celle-ci. Seuls les
    // sujets nouveaux se vérifient ; ceux déjà gardés le restent (la revérification d'une
    // visibilité les retire, B4). Un sujet refusé est ignoré sans le dire : la même réponse 204.
    await hub.exclusive(connectionId, async () => {
      if (hub.ownerOf(connectionId) !== user.id) return
      const kept = hub.declaredOf(connectionId)
      const fresh = topics.filter((topic) => !kept.has(topic))
      const allowed = await allowedTopics(db, user.id, fresh)
      hub.declare(
        connectionId,
        topics.filter((topic) => kept.has(topic) || allowed.has(topic)),
      )
    })
    return c.body(null, 204)
  })

  return app
}
