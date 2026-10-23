// Routes des commentaires d'un projet (tranche 5) :
// - GET et POST /v1/projects/{id}/comments : lire la page de commentaires, commenter ou répondre ;
// - PATCH et DELETE /v1/projects/{id}/comments/{commentId} : modifier ou supprimer le sien ;
// - PUT et DELETE /v1/projects/{id}/comments/{commentId}/hide : masquer ou démasquer, pour
//   l'auteur du projet.
// Réservé aux membres connectés, sur un projet qu'ils voient (public, ou le leur, même privé). Ce
// que chacun voit d'un commentaire masqué ou supprimé est décidé dans comments/load.ts.
import { createRoute, z } from '@hono/zod-openapi'
import {
  Comment,
  CommentId,
  CommentPage,
  CommentReply,
  CommentsQuery,
  EditedComment,
  NewComment,
  ProjectId,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, exists, isNotNull, isNull, not } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import {
  authorsOf,
  type CommentRow,
  loadCommentPage,
  presentComment,
  sees,
  type Viewer,
  viewerOf,
} from '../comments/load'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { mentionsOf, resolveMentions, saveMentions } from '../mentions/write'
import { visibleTo } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (docs/scenarios/phase-1.md, tranche 5) : 60 commentaires par heure et par
// membre, publier et modifier ensemble, tous les projets ensemble. Supprimer, masquer et démasquer
// comptent comme des modifications du projet (60 par heure, le même compteur que dans
// routes/projects.ts et routes/notes.ts).
const HOUR = 60 * 60 * 1000
const commentRule: RateRule = { windowMs: HOUR, max: 60 }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const projectParams = z.object({ id: z.string() })
const commentParams = z.object({ id: z.string(), commentId: z.string() })
const done = { description: 'Done (no content).' }
const notFoundProject = 'No such project, or a private project of another member.'
const notFoundComment =
  'No such project or comment (or deleted), or a private project of another member.'

const listRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/comments',
  summary: 'Read the comments of a project',
  description:
    'Twenty threads per page, newest first, each with its replies oldest first (50 at most).',
  request: { params: projectParams, query: CommentsQuery },
  responses: {
    200: {
      description: 'A page of comments.',
      content: { 'application/json': { schema: CommentPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse(notFoundProject),
  },
})

const postRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/comments',
  summary: 'Comment a project, or reply to a comment',
  description:
    'Plain text, 1 to 1 000 characters, trimmed, shown as typed. `replyTo`: the comment that ' +
    'opens the thread (a reply to a reply goes to the same thread, through its root).',
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: NewComment } } },
  },
  responses: {
    201: { description: 'The new comment.', content: { 'application/json': { schema: Comment } } },
    400: errorResponse('Invalid text or reference.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such project, or a private project of another member; or the comment answered is ' +
        'unknown, a reply, deleted, hidden from the member, or removed by the moderation.',
    ),
    409: errorResponse('My own project, removed by the moderation (`removed`).'),
    429: errorResponse('Too many comments.'),
  },
})

const editRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}/comments/{commentId}',
  summary: 'Edit my comment',
  request: {
    params: commentParams,
    body: { required: true, content: { 'application/json': { schema: EditedComment } } },
  },
  responses: {
    200: {
      description: 'The comment, edited.',
      content: { 'application/json': { schema: CommentReply } },
    },
    400: errorResponse('Invalid text.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The comment of another member.'),
    404: errorResponse(notFoundComment),
    409: errorResponse('My comment, or my project, removed by the moderation (`removed`).'),
    429: errorResponse('Too many comments.'),
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/comments/{commentId}',
  summary: 'Delete my comment',
  description:
    'A comment with replies becomes « deleted comment » (text and author erased); the replies stay.',
  request: { params: commentParams },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('The comment of another member.'),
    404: errorResponse(notFoundComment),
    429: errorResponse('Too many changes.'),
  },
})

const hideRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{id}/comments/{commentId}/hide',
  summary: 'Hide a comment of my project',
  description:
    'Still shown to its author and to the author of the project, marked hidden. Hiding twice ' +
    'changes nothing.',
  request: { params: commentParams },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not the author of the project, or a comment of my own.'),
    404: errorResponse(notFoundComment),
    429: errorResponse('Too many changes.'),
  },
})

const unhideRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/comments/{commentId}/hide',
  summary: 'Show a hidden comment of my project again',
  request: { params: commentParams },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('Not the author of the project, or a comment of my own.'),
    404: errorResponse(notFoundComment),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

const c = schema.projectComment

export const commentRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/comments', requireUser)
  app.use('/v1/projects/:id/comments/*', requireUser)

  const unauthorized = (ctx: Context<AppEnv>) =>
    ctx.json(errorBody(languageOf(ctx), 'unauthorized'), 401)
  const forbidden = (ctx: Context<AppEnv>) => ctx.json(errorBody(languageOf(ctx), 'forbidden'), 403)
  const notFound = (ctx: Context<AppEnv>) => ctx.json(errorBody(languageOf(ctx), 'not_found'), 404)
  const invalid = (ctx: Context<AppEnv>) => ctx.json(errorBody(languageOf(ctx), 'validation'), 400)
  const tooMany = (ctx: Context<AppEnv>, retryAfterSeconds: number) => {
    ctx.header('Retry-After', String(retryAfterSeconds))
    return ctx.json(errorBody(languageOf(ctx), 'rate_limited'), 429)
  }

  /**
   * Le projet, s'il est visible par ce membre (public, ou le sien) : seulement son auteur, lu par
   * la clé primaire. null : identifiant mal formé, projet inconnu ou privé d'un autre, la même
   * réponse pour les trois, pour ne rien révéler.
   */
  const projectOf = async (projectId: string, userId: string) => {
    // Un identifiant mal formé ne peut désigner aucun projet (et ferait échouer la requête SQL).
    if (!ProjectId.safeParse(projectId).success) return null
    const [project] = await db
      .select({
        authorId: schema.project.authorId,
        visibility: schema.project.visibility,
        removedAt: schema.project.removedAt,
      })
      .from(schema.project)
      .where(and(eq(schema.project.id, projectId), visibleTo(userId)))
    // Le projet, et qui le regarde (voir Viewer, comments/load.ts).
    return project ? { ...project, viewer: viewerOf(userId, project) } : null
  }

  /**
   * Un commentaire de ce projet, s'il existe, n'est pas supprimé et si ce membre le voit (`sees`,
   * comments/load.ts). Lu par la clé primaire. null dans tous les autres cas, la même réponse
   * « introuvable » pour tous : un commentaire d'un autre projet, même du même auteur, n'est pas
   * trouvé à cette adresse ; un commentaire masqué qu'on ne voit pas non plus (sinon un « refusé »
   * dirait qu'il existe un commentaire à cet identifiant).
   */
  const commentOf = async (projectId: string, commentId: string, viewer: Viewer) => {
    if (!CommentId.safeParse(commentId).success) return null
    const [comment] = await db
      .select({
        authorId: c.authorId,
        rootId: c.rootId,
        hiddenAt: c.hiddenAt,
        removedAt: c.removedAt,
      })
      .from(c)
      .where(and(eq(c.id, commentId), eq(c.projectId, projectId), isNull(c.deletedAt)))
    return comment && sees(comment, viewer) ? comment : null
  }

  /**
   * 409 « removed » (tranche 7a, règles 4 et 30 de la relecture du plan) : un contenu retiré par la
   * modération ne se modifie plus, et on n'ajoute rien à un projet retiré, tant qu'il n'est pas
   * rétabli. Seul son auteur peut recevoir cette réponse : pour tout autre, le contenu retiré est
   * déjà introuvable (404), et la réponse ne révèle donc rien.
   */
  const removed = (ctx: Context<AppEnv>) => ctx.json(errorBody(languageOf(ctx), 'removed'), 409)

  /**
   * L'état du projet relu DANS la transaction qui écrit, sous verrou. Les gardes ont lu le projet
   * avant elle : la modération a pu le retirer entre-temps (ou son auteur le rendre privé, ou le
   * supprimer). « FOR SHARE » verrouille la ligne contre toute écriture (le retrait attend la fin de
   * la transaction) sans gêner les autres lecteurs : deux membres qui commentent en même temps ne
   * s'attendent pas. PostgreSQL travaille en READ COMMITTED : une lecture verrouillée qui a dû
   * attendre une écriture en cours rend la version la plus récente de la ligne, déjà validée.
   * 'gone' : le projet n'est plus visible de ce membre (404, comme la garde le dirait maintenant) ;
   * 'removed' : son propre projet, retiré (409) ; 'open' : on peut écrire.
   */
  const lockedProjectState = async (
    tx: Pick<Database, 'select'>,
    projectId: string,
    userId: string,
  ) => {
    const [project] = await tx
      .select({ removedAt: schema.project.removedAt })
      .from(schema.project)
      .where(and(eq(schema.project.id, projectId), visibleTo(userId)))
      .for('share')
    // visibleTo cache un projet retiré à tout autre que son auteur : s'il est encore trouvé et
    // retiré, c'est donc le sien.
    if (!project) return 'gone' as const
    return project.removedAt === null ? ('open' as const) : ('removed' as const)
  }

  /** Compte la demande dans un quota du membre ; renvoie le délai d'attente s'il est dépassé. */
  const overLimit = async (key: string, rule: RateRule) => {
    const decision = await limiter.hit(key, rule)
    return decision.allowed ? null : decision.retryAfterSeconds
  }

  app.openapi(listRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const cursor = readCursor(ctx.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(ctx)
    const { id } = ctx.req.valid('param')
    const project = await projectOf(id, user.id)
    if (!project) return notFound(ctx)
    const page = await loadCommentPage(db, id, project.viewer, cursor, publicApiUrl)
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return ctx.json(CommentPage.parse(page), 200)
  })

  // Publier et modifier : le quota et les droits sont vérifiés AVANT de lire le texte. Le corps
  // déclaré dans la route est vérifié par un middleware que Hono place juste avant elle : ces
  // gardes-ci, enregistrés plus tôt pour la même adresse et la même méthode, passent avant lui
  // (comme dans routes/notes.ts). Ainsi chaque demande compte dans le quota, même mal écrite, et
  // un autre membre reçoit « refusé » ou « introuvable » sans jamais apprendre si son texte aurait
  // été accepté.
  app.on('POST', '/v1/projects/:id/comments', async (ctx, next) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const wait = await overLimit(memberCounterKeys(user.id).comment, commentRule)
    if (wait !== null) return tooMany(ctx, wait)
    const project = await projectOf(ctx.req.param('id'), user.id)
    if (!project) return notFound(ctx)
    // Un projet retiré n'est visible que de son auteur : lui seul peut arriver ici, et il n'y
    // ajoute rien tant que le projet est retiré (règle 30).
    if (project.removedAt !== null) return removed(ctx)
    await next()
  })

  app.on('PATCH', '/v1/projects/:id/comments/:commentId', async (ctx, next) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const wait = await overLimit(memberCounterKeys(user.id).comment, commentRule)
    if (wait !== null) return tooMany(ctx, wait)
    const projectId = ctx.req.param('id')
    const project = await projectOf(projectId, user.id)
    if (!project) return notFound(ctx)
    const comment = await commentOf(projectId, ctx.req.param('commentId'), project.viewer)
    if (!comment) return notFound(ctx)
    // Seul son auteur modifie un commentaire, pas même l'auteur du projet (qui peut le masquer).
    if (comment.authorId !== user.id) return forbidden(ctx)
    // Son commentaire retiré, ou son commentaire sur son propre projet retiré : il le lit, il peut
    // le supprimer, mais pas le modifier (règle 4).
    if (comment.removedAt !== null || project.removedAt !== null) return removed(ctx)
    await next()
  })

  app.openapi(postRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const { id } = ctx.req.valid('param')
    // Le texte, vérifié par NewComment (et débarrassé des espaces de ses bords).
    const { body, replyTo } = ctx.req.valid('json')
    // Le garde ci-dessus a compté la demande et vérifié le projet ; on relit son auteur et sa
    // visibilité (une petite requête), pour savoir quels commentaires ce membre voit.
    const project = await projectOf(id, user.id)
    if (!project) return notFound(ctx)
    const { viewer } = project

    // L'identifiant est tiré par le serveur ; la date vient de l'horloge de JavaScript.
    const row: CommentRow & { projectId: string; rootId: string | null } = {
      id: crypto.randomUUID(),
      projectId: id,
      rootId: replyTo ?? null,
      authorId: user.id,
      body,
      createdAt: new Date(),
      editedAt: null,
      hiddenAt: null,
      deletedAt: null,
      removedAt: null,
      removalId: null,
    }

    // Une « transaction » : plusieurs opérations qui réussissent toutes, ou aucune. Pour une
    // réponse, on vérifie la racine puis on écrit, sans que la racine change entre les deux :
    // « for share » la verrouille contre une suppression jusqu'à la fin de la transaction (la
    // suppression, elle, la verrouille « for update » : l'une attend l'autre).
    const written = await db.transaction(async (tx) => {
      // D'abord le projet, relu sous verrou (règle 30 : rien ne s'ajoute à un projet retiré).
      const state = await lockedProjectState(tx, id, user.id)
      if (state !== 'open') return state
      if (replyTo !== undefined) {
        const [root] = await tx
          .select({
            authorId: c.authorId,
            rootId: c.rootId,
            hiddenAt: c.hiddenAt,
            removedAt: c.removedAt,
          })
          .from(c)
          .where(and(eq(c.id, replyTo), eq(c.projectId, id), isNull(c.deletedAt)))
          .for('share')
        // Introuvable : un commentaire inconnu, d'un autre projet, supprimé, une réponse (l'appli
        // répond dans le même fil, à sa racine), un commentaire que ce membre ne voit pas
        // (masqué, ou laissé par un autre sur un projet devenu privé), ou retiré par la modération,
        // même pour son auteur qui le lit encore (règle 4 : on ne répond plus à un contenu retiré).
        if (!root || root.rootId !== null || root.removedAt !== null || !sees(root, viewer)) {
          return 'gone' as const
        }
      }
      await tx.insert(c).values(row)
      // Les membres que mentionne le texte (« @ines_morel »), rangés dans la même transaction :
      // un commentaire n'existe jamais sans ses mentions, ni l'inverse. Datées comme lui.
      const mentions = await resolveMentions(tx, body, user.id)
      if (mentions.length > 0) await saveMentions(tx, row.id, mentions, row.createdAt)
      return mentions
    })
    if (written === 'gone') return notFound(ctx)
    if (written === 'removed') return removed(ctx)

    const authors = await authorsOf(db, [user.id], publicApiUrl)
    const shown = presentComment(row, viewer, authors, false, written)
    if (!shown) return notFound(ctx)
    return ctx.json(Comment.parse({ ...shown, replies: [] }), 201)
  })

  app.openapi(editRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const { id, commentId } = ctx.req.valid('param')
    const { body } = ctx.req.valid('json')
    // Le garde a vérifié que c'est son commentaire ; la condition est redite ici (auteur, projet,
    // non supprimé), au cas où il aurait été supprimé entre-temps. « returning » renvoie la ligne
    // modifiée : aucune, et il n'y a plus rien à modifier. Un commentaire masqué reste masqué.
    // Le texte et ses mentions changent dans la même transaction : les mentions ajoutées sont
    // datées de la modification, celles qui ont disparu sont effacées, les autres gardent leur date
    // (saveMentions, mentions/write.ts).
    const editedAt = new Date()
    const edited = await db.transaction(async (tx) => {
      // Le projet relu sous verrou : retiré depuis la garde, son commentaire dessus ne se modifie
      // plus (règle 4) ; devenu invisible pour ce membre, il est introuvable.
      const state = await lockedProjectState(tx, id, user.id)
      if (state !== 'open') return state
      const [row] = await tx
        .update(c)
        .set({ body, editedAt })
        .where(
          and(
            eq(c.id, commentId),
            eq(c.projectId, id),
            eq(c.authorId, user.id),
            isNull(c.deletedAt),
            // Redit ici, comme l'auteur : un commentaire retiré entre le garde et l'écriture
            // n'est pas modifié (aucune ligne rendue, donc « introuvable »).
            isNull(c.removedAt),
          ),
        )
        .returning({
          id: c.id,
          authorId: c.authorId,
          body: c.body,
          createdAt: c.createdAt,
          editedAt: c.editedAt,
          hiddenAt: c.hiddenAt,
          deletedAt: c.deletedAt,
          removedAt: c.removedAt,
          removalId: c.removalId,
        })
      if (!row) return 'gone' as const
      // Les mentions déjà gardées d'abord : un pseudo encore écrit garde le membre qu'il désignait
      // à l'écriture, même si ce pseudo a changé de main depuis (mentions/write.ts).
      const kept = await mentionsOf(tx, row.id)
      const mentions = await resolveMentions(tx, body, user.id, kept)
      await saveMentions(tx, row.id, mentions, editedAt)
      return { row, mentions }
    })
    if (edited === 'gone') return notFound(ctx)
    if (edited === 'removed') return removed(ctx)
    const { row, mentions } = edited
    const authors = await authorsOf(db, [user.id], publicApiUrl)
    // Son auteur voit toujours son commentaire, masqué ou non, sur un projet public ou privé :
    // savoir s'il est aussi l'auteur du projet, ou si le projet est privé, ne change rien ici.
    const shown = presentComment(
      row,
      { id: user.id, isProjectAuthor: false, projectIsPrivate: false },
      authors,
      false,
      mentions,
    )
    if (!shown) return notFound(ctx)
    return ctx.json(CommentReply.parse(shown), 200)
  })

  app.openapi(deleteRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const wait = await overLimit(memberCounterKeys(user.id).projectChange, changeRule)
    if (wait !== null) return tooMany(ctx, wait)
    const { id, commentId } = ctx.req.valid('param')
    const project = await projectOf(id, user.id)
    if (!project) return notFound(ctx)
    const comment = await commentOf(id, commentId, project.viewer)
    if (!comment) return notFound(ctx)
    // Seul son auteur supprime un commentaire ; l'auteur du projet, lui, peut le masquer.
    if (comment.authorId !== user.id) return forbidden(ctx)

    const reply = alias(c, 'reply')
    const hasReplies = (rootId: string) =>
      exists(db.select({ id: reply.id }).from(reply).where(eq(reply.rootId, rootId)))
    await db.transaction(async (tx) => {
      // On verrouille d'abord la racine du fil (« for update ») : une réponse publiée ou supprimée
      // en même temps attend la fin de cette transaction, et chacune voit l'état laissé par l'autre.
      const rootId = comment.rootId ?? commentId
      await tx.select({ id: c.id }).from(c).where(eq(c.id, rootId)).for('update')

      if (comment.rootId === null) {
        // Une racine avec des réponses devient « Commentaire supprimé » : texte, auteur et dates de
        // modification et de masquage effacés pour de bon ; les réponses gardent leur fil. Sans
        // réponse, elle est effacée (« not exists » : aucune ligne ne pointe vers elle).
        const [kept] = await tx
          .update(c)
          .set({ body: '', authorId: null, editedAt: null, hiddenAt: null, deletedAt: new Date() })
          .where(and(eq(c.id, commentId), hasReplies(commentId)))
          .returning({ id: c.id })
        if (!kept) await tx.delete(c).where(eq(c.id, commentId))
        // Gardée comme emplacement, elle perd aussi ses mentions : elles partent avec le texte.
        else
          await tx
            .delete(schema.commentMention)
            .where(eq(schema.commentMention.commentId, commentId))
        return
      }
      // Une réponse est effacée. Si c'était la dernière d'un « Commentaire supprimé », celui-ci ne
      // montre plus rien : il est effacé à son tour.
      await tx.delete(c).where(eq(c.id, commentId))
      await tx
        .delete(c)
        .where(
          and(eq(c.id, comment.rootId), isNotNull(c.deletedAt), not(hasReplies(comment.rootId))),
        )
    })
    return ctx.body(null, 204)
  })

  /**
   * Masquer et démasquer : les mêmes vérifications. Le quota d'abord, puis le projet, puis le
   * commentaire (introuvable s'il est masqué et que ce membre ne le voit pas, comme un inconnu) ;
   * seul l'auteur du projet le peut, et pas sur son propre commentaire (il le supprime plutôt).
   * Renvoie null si tout va bien, sinon la réponse de refus.
   */
  const checkHide = async (ctx: Context<AppEnv>, userId: string, id: string, commentId: string) => {
    const wait = await overLimit(memberCounterKeys(userId).projectChange, changeRule)
    if (wait !== null) return tooMany(ctx, wait)
    const project = await projectOf(id, userId)
    if (!project) return notFound(ctx)
    const comment = await commentOf(id, commentId, project.viewer)
    if (!comment) return notFound(ctx)
    if (project.authorId !== userId || comment.authorId === userId) return forbidden(ctx)
    return null
  }

  app.openapi(hideRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const { id, commentId } = ctx.req.valid('param')
    const refusal = await checkHide(ctx, user.id, id, commentId)
    if (refusal) return refusal
    // « hidden_at is null » : masquer un commentaire déjà masqué ne change rien (ni sa date).
    await db
      .update(c)
      .set({ hiddenAt: new Date() })
      .where(and(eq(c.id, commentId), isNull(c.hiddenAt)))
    return ctx.body(null, 204)
  })

  app.openapi(unhideRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const { id, commentId } = ctx.req.valid('param')
    const refusal = await checkHide(ctx, user.id, id, commentId)
    if (refusal) return refusal
    await db.update(c).set({ hiddenAt: null }).where(eq(c.id, commentId))
    return ctx.body(null, 204)
  })

  return app
}
