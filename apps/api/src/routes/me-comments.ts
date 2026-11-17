// Les routes de « Mes commentaires » (R11), réservées aux membres connectés :
// - GET /v1/me/comments : les commentaires et réponses que le membre a écrits, sur tous les
//   projets, du plus récent au plus ancien, 30 par page ;
// - DELETE /v1/me/comments/{commentId} : en supprimer un, même sur un projet qu'il ne voit plus
//   (devenu privé, retiré, d'une ruche quittée, d'un membre bloqué) : il doit pouvoir effacer ce
//   qu'il a écrit. Le droit à l'effacement ne dépend pas de la visibilité du projet.
// Aucune de ces routes ne dit rien d'un contenu qui appartient à un autre : la liste ne lit que les
// commentaires dont il est l'auteur, et la suppression répond le même 404 pour un commentaire
// inconnu, mal formé, déjà supprimé ou écrit par un autre.
import { createRoute, z } from '@hono/zod-openapi'
import { CommentId, MyCommentsPage, MyCommentsQuery } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { commentChangeRule, deleteComment } from '../comments/delete'
import { myCommentsPage } from '../comments/load'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const listRoute = createRoute({
  method: 'get',
  path: '/v1/me/comments',
  summary: 'My comments',
  description:
    'The comments and replies I wrote, on every project, newest first, 30 per page. `project` is ' +
    'null once I no longer see the project. A comment I deleted is not listed.',
  request: { query: MyCommentsQuery },
  responses: {
    200: {
      description: 'A page of my comments.',
      content: { 'application/json': { schema: MyCommentsPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/me/comments/{commentId}',
  summary: 'Delete one of my comments',
  description:
    'Whatever the project has become. A comment with replies becomes « deleted comment » (text ' +
    'and author erased); the replies stay. Same quota as deleting from the project.',
  request: { params: z.object({ commentId: z.string() }) },
  responses: {
    204: { description: 'Done (no content).' },
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'Unknown or malformed identifier, deleted comment, or the comment of another member: the ' +
        'same answer for all.',
    ),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const meCommentRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/me/comments', requireUser)
  app.use('/v1/me/comments/*', requireUser)

  const unauthorized = (ctx: Context<AppEnv>) =>
    ctx.json(errorBody(languageOf(ctx), 'unauthorized'), 401)

  app.openapi(listRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    const cursor = readCursor(ctx.req.valid('query').cursor)
    // Un curseur illisible, ou daté hors des bornes de `CursorDate` (cursor.ts), est refusé (400).
    if (cursor === 'invalid') {
      return ctx.json(errorBody(languageOf(ctx), 'validation'), 400)
    }
    return ctx.json(
      MyCommentsPage.parse(await myCommentsPage(db, user.id, cursor, publicApiUrl)),
      200,
    )
  })

  app.openapi(deleteRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return unauthorized(ctx)
    // Le quota d'abord : chaque demande compte, même mal formée (même compteur que l'ancienne route).
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, commentChangeRule)
    if (!decision.allowed) {
      ctx.header('Retry-After', String(decision.retryAfterSeconds))
      return ctx.json(errorBody(languageOf(ctx), 'rate_limited'), 429)
    }
    const notFound = () => ctx.json(errorBody(languageOf(ctx), 'not_found'), 404)
    const { commentId } = ctx.req.valid('param')
    // Un identifiant mal formé ne peut désigner aucun commentaire (et ferait échouer la requête).
    if (!CommentId.safeParse(commentId).success) return notFound()
    // Son commentaire seulement, non supprimé : « author_id = $membre » est la seule règle. Celui
    // d'un autre, public ou privé, ou un inconnu, ne se distinguent pas : même 404. Lu par la clé
    // primaire. Une racine gardée en « Commentaire supprimé » n'a plus d'auteur : introuvable.
    const [comment] = await db
      .select({ rootId: schema.projectComment.rootId })
      .from(schema.projectComment)
      .where(
        and(
          eq(schema.projectComment.id, commentId),
          eq(schema.projectComment.authorId, user.id),
          isNull(schema.projectComment.deletedAt),
        ),
      )
    if (!comment) return notFound()
    await deleteComment(db, commentId, comment.rootId)
    return ctx.body(null, 204)
  })

  return app
}
