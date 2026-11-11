// Les fils de retours du coin des testeurs (R7b) : chaque testeur a avec l'auteur du projet un fil
// privé, où il envoie des retours (« Ça a marché ? », un texte, une capture) et où ils s'écrivent des
// réponses. Ce fichier a toutes les routes des fils :
// - GET /v1/projects/{id}/threads : la liste des fils de l'auteur (« À traiter » / « Réglés ») ;
// - GET et POST /v1/projects/{id}/threads/{testerId}/messages : lire un fil, y écrire ;
// - POST /v1/projects/{id}/threads/{testerId}/read : marquer le fil lu ;
// - DELETE /v1/projects/{id}/messages/{messageId} : supprimer son message ;
// - POST et DELETE /v1/projects/{id}/messages/{messageId}/settled : « Marquer comme réglé » et
//   « Remettre à traiter » (l'auteur) ;
// - GET /v1/projects/{id}/feedback/open : les retours à traiter, pour la feuille de mise à jour.
// Qui entre dans le coin se décide dans testers/access.ts (`cornerAccess`) ; la lecture des fils est
// dans testers/threads.ts. Un fil n'est lu que par l'auteur et par son testeur : tout autre membre
// reçoit « introuvable », la même réponse qu'un projet inconnu.
import { createRoute, z } from '@hono/zod-openapi'
import {
  MESSAGE_TEXT_MAX,
  NewTesterMessage,
  OpenFeedbackList,
  TESTER_MESSAGES_PER_DAY,
  TESTER_SETTLES_PER_HOUR,
  TesterMessage,
  TesterMessagePage,
  TesterPageQuery,
  TesterThreadPage,
  TesterThreadsQuery,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, type SQL } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { lockPair } from '../blocks/write'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { type CornerAccess, cornerAccess, isMissingMember } from '../testers/access'
import {
  loadMessagePage,
  loadOpenFeedback,
  loadThreadPage,
  readThreadsCursor,
  toTesterMessage,
} from '../testers/threads'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (relecture de sécurité du plan de R7b, B1 et A8), toutes comptées « chaque
// demande compte », même refusée ou mal formée, AVANT d'examiner la demande :
// - 30 messages par membre et par 24 heures, tous projets ensemble ;
// - 120 « réglé » ou « à traiter » par membre et par heure (un seul compteur pour les deux gestes) ;
// - supprimer un message compte comme une modification du projet (60 par heure, comme les appels).
const HOUR = 60 * 60 * 1000
const messageRule: RateRule = { windowMs: 24 * HOUR, max: TESTER_MESSAGES_PER_DAY }
const settleRule: RateRule = { windowMs: HOUR, max: TESTER_SETTLES_PER_HOUR }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const projectParams = z.object({ id: z.string() })
const threadParams = z.object({ id: z.string(), testerId: z.string() })
const messageParams = z.object({ id: z.string(), messageId: z.string() })

const listThreadsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/threads',
  summary: 'The threads of the testers of my project',
  description:
    'The author reads one thread per tester who wrote, the most recent first, filtered « to ' +
    'handle » (`open`, the default) or « settled », with the number of threads of each filter. ' +
    'Removed messages of the testers are ignored. A closed corner stays readable. No quota: ' +
    'served by `tester_message_thread_created_idx`.',
  request: { params: projectParams, query: TesterThreadsQuery },
  responses: {
    200: {
      description: 'A page of threads.',
      content: { 'application/json': { schema: TesterThreadPage } },
    },
    400: errorResponse('Invalid filter or cursor.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A tester: the list is the author’s.'),
    404: errorResponse('No such corner for this member.'),
  },
})

const readMessagesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/threads/{testerId}/messages',
  summary: 'Read a thread',
  description:
    'The author, or this tester (current or former, a former one reads only). Thirty messages per ' +
    'page, the most recent first. A removed message is shown to its sender only, with the reason. ' +
    'A read date is never part of the answer.',
  request: { params: threadParams, query: TesterPageQuery },
  responses: {
    200: {
      description: 'A page of messages.',
      content: { 'application/json': { schema: TesterMessagePage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such thread for this member.'),
  },
})

const postMessageRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/threads/{testerId}/messages',
  summary: 'Write in a thread',
  description:
    `A tester sends feedback (an outcome, a device, a text up to ${MESSAGE_TEXT_MAX} characters and ` +
    'a capture uploaded before with `kind=capture`) or a reply, in his own thread; the author only ' +
    'replies, to a current tester who wrote. Thirty messages a day per member.',
  request: {
    params: threadParams,
    body: { required: true, content: { 'application/json': { schema: NewTesterMessage } } },
  },
  responses: {
    201: {
      description: 'The new message.',
      content: { 'application/json': { schema: TesterMessage } },
    },
    400: errorResponse(
      'Invalid data, or a capture that is not a pending capture (`invalid_photo`).',
    ),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The author sending feedback, or a suspended account.'),
    404: errorResponse('No such thread for this member.'),
    409: errorResponse(
      'The thread is read-only (`thread_closed`), or the corner is closed (`corner_closed`).',
    ),
    413: errorResponse('Body too large.'),
    429: errorResponse('Too many messages.'),
  },
})

const readThreadRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/threads/{testerId}/read',
  summary: 'Mark a thread as read',
  description:
    'The author or this tester: writes only the reader’s own read date, which the other one never ' +
    'sees. Allowed during a suspension. No quota: one row, by its primary key.',
  request: { params: threadParams },
  responses: {
    204: { description: 'Marked.' },
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such thread for this member.'),
  },
})

const deleteMessageRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/messages/{messageId}',
  summary: 'Delete one of my messages',
  description:
    'Only the sender, whatever the state of the corner (removed or private project, suspended ' +
    'author), as long as the project exists. The capture goes with it, file included.',
  request: { params: messageParams },
  responses: {
    204: { description: 'Deleted, capture included.' },
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such message of mine in this project.'),
    429: errorResponse('Too many changes.'),
  },
})

const settleRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/messages/{messageId}/settled',
  summary: 'Mark a feedback as settled',
  description:
    'The author, corner open. Idempotent: a feedback already settled keeps its first date. Only a ' +
    'feedback that is not removed. 120 settle or unsettle requests an hour.',
  request: { params: messageParams },
  responses: {
    204: { description: 'Settled.' },
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such feedback in this project for this member (a tester gets this answer too).',
    ),
    409: errorResponse('The corner is closed (`corner_closed`).'),
    429: errorResponse('Too many requests.'),
  },
})

const unsettleRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/messages/{messageId}/settled',
  summary: 'Put a feedback back to « to handle »',
  description:
    'The author, corner open. Idempotent. Erases the settling date and the update that settled it.',
  request: { params: messageParams },
  responses: {
    204: { description: 'Put back.' },
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such feedback in this project for this member (a tester gets this answer too).',
    ),
    409: errorResponse('The corner is closed (`corner_closed`).'),
    429: errorResponse('Too many requests.'),
  },
})

const openFeedbackRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/feedback/open',
  summary: 'The feedback still to handle',
  description:
    'The author, corner open: at most 50 feedback not settled nor removed, the most recent first, ' +
    'for the « settled feedback » part of the update sheet.',
  request: { params: projectParams },
  responses: {
    200: {
      description: 'The open feedback.',
      content: { 'application/json': { schema: OpenFeedbackList } },
    },
    401: errorResponse('Not signed in.'),
    403: errorResponse('A tester.'),
    404: errorResponse('No such corner for this member.'),
    409: errorResponse('The corner is closed (`corner_closed`).'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

/** Levée dans la transaction d'un message pour l'annuler : la capture citée n'est pas rattachable. */
class InvalidCapture extends Error {}

/**
 * Qui lit ou écrit dans ce fil, d'après l'accès au coin :
 * - `author` : l'auteur, coin ouvert ; `author_closed` : l'auteur, coin fermé (il lit seulement) ;
 * - `tester` : ce testeur, dans son propre fil ; `former` : cet ancien testeur, en lecture seule ;
 * - `none` : tout le reste (le fil d'un autre testeur compris) : « introuvable ».
 */
type ThreadActor = 'author' | 'author_closed' | 'tester' | 'former' | 'none'

const actorOf = (access: CornerAccess, viewerId: string, testerId: string): ThreadActor => {
  if (access === 'author' || access === 'author_closed') return access
  if (access === 'not_found' || testerId !== viewerId) return 'none'
  return access === 'tester' ? 'tester' : 'former'
}

export const testerThreadRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/threads', requireUser)
  app.use('/v1/projects/:id/threads/*', requireUser)
  app.use('/v1/projects/:id/messages/*', requireUser)
  app.use('/v1/projects/:id/feedback/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const cornerClosed = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'corner_closed'), 409)
  const threadClosed = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'thread_closed'), 409)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }
  const invalidCursor = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)

  // Les gardes de quota des écritures : le quota passe AVANT le corps (le validateur de Hono se place
  // juste avant la route ; ces gardes, enregistrés plus tôt pour la même adresse et la même méthode,
  // passent avant lui). Ainsi chaque demande compte, même mal écrite, et un autre membre reçoit
  // « introuvable » sans apprendre si son texte était bon (même technique que routes/tester-calls.ts).
  app.on('POST', '/v1/projects/:id/threads/:testerId/messages', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).testerMessage, messageRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    // Le droit, avant de lire le corps : l'écriture refait ces vérifications sous verrou.
    const access = await cornerAccess(db, c.req.param('id'), user.id)
    const actor = actorOf(access, user.id, c.req.param('testerId'))
    if (actor === 'none') return notFound(c)
    if (actor === 'author_closed') return cornerClosed(c)
    if (actor === 'former') return threadClosed(c)
    await next()
  })
  for (const method of ['POST', 'DELETE'] as const) {
    app.on(method, '/v1/projects/:id/messages/:messageId/settled', async (c, next) => {
      const user = c.get('user')
      if (!user) return unauthorized(c)
      const decision = await limiter.hit(memberCounterKeys(user.id).testerSettle, settleRule)
      if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
      await next()
    })
  }
  app.on('DELETE', '/v1/projects/:id/messages/:messageId', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  // ─── La liste des fils ──────────────────────────────────────────────────────────────────────────

  app.openapi(listThreadsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    const access = await cornerAccess(db, id, user.id)
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    // Un testeur sait que le coin existe, mais la liste des fils est le geste de l'auteur.
    if (access === 'tester') return forbidden(c)

    const query = c.req.valid('query')
    const cursor = readThreadsCursor(query.cursor)
    if (cursor === 'invalid') return invalidCursor(c)
    const page = await loadThreadPage(db, {
      projectId: id,
      authorId: user.id,
      state: query.state,
      cursor,
      publicApiUrl,
    })
    return c.json(page, 200)
  })

  // ─── Lire un fil ────────────────────────────────────────────────────────────────────────────────

  app.openapi(readMessagesRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, testerId } = c.req.valid('param')
    const actor = actorOf(await cornerAccess(db, id, user.id), user.id, testerId)
    if (actor === 'none') return notFound(c)
    const isAuthor = actor === 'author' || actor === 'author_closed'
    // L'auteur ne lit que les fils qui existent : sinon, « introuvable » (clé primaire de tester_thread).
    if (isAuthor && !(await threadExists(db, id, testerId))) return notFound(c)

    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid' || (cursor !== null && cursor.at >= '2100')) return invalidCursor(c)
    const page = await loadMessagePage(db, {
      projectId: id,
      testerId,
      viewerId: user.id,
      viewerIsAuthor: isAuthor,
      cursor,
      publicApiUrl,
    })
    return c.json(page, 200)
  })

  // ─── Écrire dans un fil ─────────────────────────────────────────────────────────────────────────

  app.openapi(postMessageRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande et vérifié le droit ; tout est relu sous verrou.
    const { id, testerId } = c.req.valid('param')
    const body = c.req.valid('json')
    const row = {
      id: crypto.randomUUID(),
      projectId: id,
      testerId,
      senderId: user.id,
      kind: body.kind,
      outcome: body.kind === 'feedback' ? body.outcome : null,
      device: body.kind === 'feedback' ? body.device : null,
      text: body.text,
      // La date vient de l'horloge de JavaScript, jamais de la base (charte).
      createdAt: new Date(),
      settledAt: null,
      settledUpdateId: null,
      removedAt: null,
      removalId: null,
    }

    // Une transaction (tout réussit, ou rien). Trois verrous, dans cet ordre :
    // 1. celui de la paire (auteur, testeur), que bloquer prend aussi : un blocage en cours finit
    //    avant la relecture, un blocage qui arrive ensuite attend la fin de l'écriture ;
    // 2. celui du projet en lecture partagée (`for share`) : retirer un testeur, qui prend la ligne
    //    en `for update`, attend la fin de l'écriture, et deux écritures de messages ne se gênent pas.
    //    Même ordre que l'inscription (routes/testers.ts), pour ne jamais s'attendre l'un l'autre ;
    // 3. enfin, tout l'accès est relu : l'état a pu changer depuis le garde.
    let outcome:
      | { kind: 'refused'; reply: 'not_found' | 'closed' | 'thread_closed' | 'forbidden' }
      | { kind: 'ok'; capture: typeof schema.testerMedia.$inferSelect | undefined }
    try {
      outcome = await db.transaction(async (tx) => {
        const [known] = await tx
          .select({ authorId: schema.project.authorId })
          .from(schema.project)
          .where(eq(schema.project.id, id))
        if (!known) return { kind: 'refused' as const, reply: 'not_found' as const }
        const isAuthor = known.authorId === user.id
        await lockPair(tx, user.id, isAuthor ? testerId : known.authorId)
        await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, id))
          .for('share')
        const actor = actorOf(await cornerAccess(tx, id, user.id), user.id, testerId)

        if (actor === 'none') return { kind: 'refused' as const, reply: 'not_found' as const }
        if (actor === 'author_closed') return { kind: 'refused' as const, reply: 'closed' as const }
        if (actor === 'former') return { kind: 'refused' as const, reply: 'thread_closed' as const }
        if (actor === 'author') {
          // L'auteur ne fait que répondre (un retour est le geste d'un testeur).
          if (body.kind === 'feedback')
            return { kind: 'refused' as const, reply: 'forbidden' as const }
          // … à un testeur actuel (ni parti, ni retiré, ni bloqué) qui a écrit : sinon le fil est
          // fermé (relecture de sécurité A14 : l'auteur n'écrit pas à qui ne lui a rien dit).
          const spoken =
            (await cornerAccess(tx, id, testerId)) === 'tester' &&
            (await testerWrote(tx, id, testerId))
          if (!spoken) return { kind: 'refused' as const, reply: 'thread_closed' as const }
        } else {
          // Le testeur : son fil est créé au premier message (la clé primaire écarte un doublon).
          await tx
            .insert(schema.testerThread)
            .values({ projectId: id, testerId: user.id, createdAt: row.createdAt })
            .onConflictDoNothing()
        }
        await tx.insert(schema.testerMessage).values(row)
        if (body.kind !== 'feedback' || body.captureId === null) {
          return { kind: 'ok' as const, capture: undefined }
        }

        // Le rattachement de la capture : UNE écriture conditionnelle, comme la photo d'un appel
        // (routes/tester-calls.ts). « De ce projet, de ce membre, une capture, pas encore
        // rattachée » est dans l'UPDATE lui-même : deux messages qui citent la même capture ne la
        // déplacent pas. Aucune ligne écrite : capture inconnue, d'ailleurs, d'un autre ou déjà prise
        // (la même réponse pour tous ces cas), et le message entier est annulé.
        const media = schema.testerMedia
        const [attached] = await tx
          .update(media)
          .set({ messageId: row.id })
          .where(
            and(
              eq(media.id, body.captureId),
              eq(media.projectId, id),
              eq(media.ownerId, user.id),
              eq(media.kind, 'capture'),
              isNull(media.callId),
              isNull(media.messageId),
            ),
          )
          .returning()
        if (!attached) throw new InvalidCapture()
        return { kind: 'ok' as const, capture: attached }
      })
    } catch (error) {
      if (error instanceof InvalidCapture) {
        return c.json(errorBody(languageOf(c), 'invalid_photo'), 400)
      }
      // 23503 : un compte (le testeur) a été supprimé pendant l'écriture : le fil est fermé.
      if (isMissingMember(error)) return threadClosed(c)
      throw error
    }

    if (outcome.kind === 'refused') {
      if (outcome.reply === 'not_found') return notFound(c)
      if (outcome.reply === 'closed') return cornerClosed(c)
      if (outcome.reply === 'forbidden') return forbidden(c)
      return threadClosed(c)
    }
    return c.json(
      toTesterMessage(row, {
        viewerId: user.id,
        viewerIsAuthor: row.senderId !== row.testerId,
        capture: outcome.capture,
        updates: new Map(),
        removals: new Map(),
        publicApiUrl,
      }),
      201,
    )
  })

  // ─── Marquer lu ─────────────────────────────────────────────────────────────────────────────────

  app.openapi(readThreadRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, testerId } = c.req.valid('param')
    const actor = actorOf(await cornerAccess(db, id, user.id), user.id, testerId)
    if (actor === 'none') return notFound(c)
    const isAuthor = actor === 'author' || actor === 'author_closed'
    // On n'écrit que SA date de lecture, et seulement si le fil existe (clé primaire). Un testeur
    // qui n'a pas encore écrit n'a rien à marquer : 204 sans rien écrire. L'autre partie ne lit
    // jamais cette date (aucune réponse ne la porte).
    const t = schema.testerThread
    await db
      .update(t)
      .set(isAuthor ? { authorReadAt: new Date() } : { testerReadAt: new Date() })
      .where(and(eq(t.projectId, id), eq(t.testerId, testerId)))
    return c.body(null, 204)
  })

  // ─── Supprimer son message ──────────────────────────────────────────────────────────────────────

  app.openapi(deleteMessageRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le quota a déjà été compté par le garde ci-dessus.
    const { id, messageId } = c.req.valid('param')
    // Un identifiant mal formé ferait échouer la requête SQL (ce n'est pas un uuid) : 404 sans base.
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(messageId).success)
      return notFound(c)

    // Pas de cornerAccess : on supprime toujours ce qu'on a écrit, coin fermé ou non (décision de
    // Louis du 11/11/2026). « De ce projet » et « écrit par ce membre » sont dans les conditions : le
    // message d'un autre, ou d'un autre projet cité sous celui-ci, est introuvable.
    const k = schema.testerMessage
    const mine = and(eq(k.id, messageId), eq(k.projectId, id), eq(k.senderId, user.id))
    // Les fichiers à effacer, lus AVANT : la ligne de la capture part en cascade avec le message.
    const files = await db
      .select({ storageKey: schema.testerMedia.storageKey })
      .from(schema.testerMedia)
      .innerJoin(k, eq(k.id, schema.testerMedia.messageId))
      .where(mine)
    const deleted = await db.delete(k).where(mine).returning({ id: k.id })
    if (deleted.length === 0) return notFound(c)
    for (const file of files) await storage.delete(file.storageKey)
    return c.body(null, 204)
  })

  // ─── Régler, remettre à traiter ─────────────────────────────────────────────────────────────────

  /**
   * Le droit commun de « réglé » et « à traiter » : l'auteur, coin ouvert. Une réponse d'erreur, ou
   * null si c'est permis. Le quota a déjà été compté par le garde.
   */
  const settleDenied = async (
    c: Context<AppEnv>,
    projectId: string,
    viewerId: string,
    testerReply: 'forbidden' | 'not_found',
  ) => {
    const access = await cornerAccess(db, projectId, viewerId)
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    if (access === 'tester') return testerReply === 'forbidden' ? forbidden(c) : notFound(c)
    if (access === 'author_closed') return cornerClosed(c)
    return null
  }

  /**
   * Écrit le règlement (ou son effacement) d'un retour, sous le verrou du projet : la fermeture du
   * coin (projet passé en privé, auteur suspendu) est relue ici, après le verrou. `change` dit quoi
   * écrire et quelles lignes viser ; `returning` rend celles réellement touchées.
   */
  const writeSettled = async (
    projectId: string,
    viewerId: string,
    messageId: string,
    change: { set: Partial<typeof schema.testerMessage.$inferInsert>; where: SQL | undefined },
  ): Promise<'closed' | 'unknown' | 'done'> =>
    db.transaction(async (tx) => {
      await tx
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(eq(schema.project.id, projectId))
        .for('share')
      if ((await cornerAccess(tx, projectId, viewerId)) !== 'author') return 'closed' as const
      const k = schema.testerMessage
      const written = await tx
        .update(k)
        .set(change.set)
        .where(
          and(
            eq(k.id, messageId),
            eq(k.projectId, projectId),
            eq(k.kind, 'feedback'),
            isNull(k.removedAt),
            change.where,
          ),
        )
        .returning({ id: k.id })
      if (written.length > 0) return 'done' as const
      // Aucune ligne écrite : soit le retour est déjà réglé (rejouer garde la première date : 204),
      // soit il n'existe pas, ou n'est pas un retour de ce projet (404).
      const [exists] = await tx
        .select({ id: k.id })
        .from(k)
        .where(
          and(
            eq(k.id, messageId),
            eq(k.projectId, projectId),
            eq(k.kind, 'feedback'),
            isNull(k.removedAt),
          ),
        )
      return exists ? ('done' as const) : ('unknown' as const)
    })

  app.openapi(settleRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, messageId } = c.req.valid('param')
    // Un testeur reçoit « introuvable » : un autre testeur du même projet n'apprend rien du geste.
    const denied = await settleDenied(c, id, user.id, 'not_found')
    if (denied) return denied
    if (!z.uuid().safeParse(messageId).success) return notFound(c)
    // `settled_at is null` : un retour déjà réglé n'est pas réécrit, il garde sa première date.
    const outcome = await writeSettled(id, user.id, messageId, {
      set: { settledAt: new Date(), settledUpdateId: null },
      where: isNull(schema.testerMessage.settledAt),
    })
    if (outcome === 'closed') return cornerClosed(c)
    if (outcome === 'unknown') return notFound(c)
    return c.body(null, 204)
  })

  app.openapi(unsettleRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, messageId } = c.req.valid('param')
    const denied = await settleDenied(c, id, user.id, 'not_found')
    if (denied) return denied
    if (!z.uuid().safeParse(messageId).success) return notFound(c)
    const outcome = await writeSettled(id, user.id, messageId, {
      set: { settledAt: null, settledUpdateId: null },
      where: undefined,
    })
    if (outcome === 'closed') return cornerClosed(c)
    if (outcome === 'unknown') return notFound(c)
    return c.body(null, 204)
  })

  // ─── Les retours à traiter ──────────────────────────────────────────────────────────────────────

  app.openapi(openFeedbackRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    const denied = await settleDenied(c, id, user.id, 'forbidden')
    if (denied) return denied
    return c.json(await loadOpenFeedback(db, id, user.id), 200)
  })

  return app
}

/** Ce fil existe-t-il ? La clé primaire (project_id, tester_id) de tester_thread. */
const threadExists = async (db: Pick<Database, 'select'>, projectId: string, testerId: string) => {
  const t = schema.testerThread
  const [thread] = await db
    .select({ testerId: t.testerId })
    .from(t)
    .where(and(eq(t.projectId, projectId), eq(t.testerId, testerId)))
  return thread !== undefined
}

/**
 * Ce testeur a-t-il écrit, dans son fil, un message qui n'est pas retiré ? Seul son silence ferme
 * la réponse de l'auteur. L'index tester_message_thread_created_idx (project_id, tester_id, …).
 */
const testerWrote = async (db: Pick<Database, 'select'>, projectId: string, testerId: string) => {
  const k = schema.testerMessage
  const [written] = await db
    .select({ id: k.id })
    .from(k)
    .where(
      and(
        eq(k.projectId, projectId),
        eq(k.testerId, testerId),
        eq(k.senderId, testerId),
        isNull(k.removedAt),
      ),
    )
    .limit(1)
  return written !== undefined
}
