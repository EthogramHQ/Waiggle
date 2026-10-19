// Effacer les commentaires d'un membre qui supprime son compte (tranche 5), juste avant que son
// compte disparaisse (auth/auth.ts, beforeDelete). Ses réactions, elles, partent seules avec son
// compte (onDelete: 'cascade' sur member_id), et les commentaires de ses projets avec ses projets.
import { type Database, schema } from '@ruche/db'
import { and, eq, exists, inArray, isNotNull, isNull, ne, not, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

const c = schema.projectComment

/**
 * Trois écritures, dans une transaction (toutes, ou aucune) :
 *
 * 1. Ses racines auxquelles un autre a répondu deviennent « Commentaire supprimé », comme s'il les
 *    supprimait une à une : texte, auteur et dates de modification et de masquage effacés. En SQL :
 *      update project_comment set body = '', author_id = null, edited_at = null, hidden_at = null,
 *        deleted_at = $maintenant
 *      where author_id = $membre and root_id is null and exists (select 1 from project_comment
 *        reply where reply.root_id = project_comment.id
 *        and (reply.author_id <> $membre or reply.author_id is null))
 *    Les réponses qu'il s'est faites à lui-même ne comptent pas : elles partent à l'étape 2.
 *
 * 2. Tout le reste de ce qu'il a écrit est effacé : ses réponses, et ses racines sans réponse d'un
 *    autre (leurs réponses à lui partent avec elles, par la cascade de root_id). En SQL :
 *      delete from project_comment where author_id = $membre returning root_id
 *
 * 3. Un « Commentaire supprimé » dont il écrivait la dernière réponse ne montre plus rien : il est
 *    effacé à son tour (comme quand on supprime une réponse, routes/comments.ts).
 *
 * L'index project_comment_author_idx trouve ses commentaires ; l'index
 * project_comment_root_created_idx, les réponses de chaque racine.
 */
export const eraseCommentsOf = (db: Database, memberId: string) =>
  db.transaction(async (tx) => {
    const reply = alias(c, 'reply')
    const repliesOf = (from: (typeof c)['id'], byOthers: boolean) =>
      tx
        .select({ id: reply.id })
        .from(reply)
        .where(
          and(
            eq(reply.rootId, from),
            byOthers ? or(ne(reply.authorId, memberId), isNull(reply.authorId)) : undefined,
          ),
        )

    await tx
      .update(c)
      .set({ body: '', authorId: null, editedAt: null, hiddenAt: null, deletedAt: new Date() })
      .where(and(eq(c.authorId, memberId), isNull(c.rootId), exists(repliesOf(c.id, true))))

    const erased = await tx
      .delete(c)
      .where(eq(c.authorId, memberId))
      .returning({ rootId: c.rootId })

    // Les racines des réponses effacées, sans doublon (new Set) ni null (celles des racines).
    const roots = [...new Set(erased.flatMap(({ rootId }) => (rootId ? [rootId] : [])))]
    if (roots.length > 0) {
      await tx
        .delete(c)
        .where(
          and(inArray(c.id, roots), isNotNull(c.deletedAt), not(exists(repliesOf(c.id, false)))),
        )
    }
  })
