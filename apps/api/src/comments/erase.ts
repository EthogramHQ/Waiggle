// Effacer les commentaires d'un membre qui supprime son compte (tranche 5), juste avant que son
// compte disparaisse (auth/auth.ts, beforeDelete), puis balayer juste après les commentaires restés
// sans auteur (afterDelete). Ses réactions, elles, partent seules avec son compte (onDelete:
// 'cascade' sur member_id), et les commentaires de ses projets avec ses projets.
import { type Database, schema } from '@ruche/db'
import {
  and,
  type Column,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  not,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

const c = schema.projectComment

// Les colonnes d'un commentaire qui disent à qui il est : celles de project_comment, ou d'un alias.
type Owned = (table: { authorId: Column; deletedAt: Column }) => SQL

/**
 * Efface les commentaires que `owned` désigne (ceux d'un membre, ou ceux restés sans auteur), en
 * quatre étapes, dans une transaction (toutes, ou aucune) :
 *
 * 0. Ses racines sont verrouillées (« for update ») : une réponse publiée en même temps attend la
 *    fin de la transaction (POST verrouille la racine « for share », et les deux verrous
 *    s'excluent). Sans ce verrou, une réponse d'un autre écrite entre les étapes 1 et 2, sous une
 *    racine qui n'avait pas encore de réponse, partirait avec elle sans que personne le sache. En
 *    SQL : select id from project_comment where <les siennes> and root_id is null for update.
 *
 * 1. Ses racines auxquelles un autre a répondu deviennent « Commentaire supprimé », comme s'il les
 *    supprimait une à une : texte, auteur et dates de modification et de masquage effacés. En SQL :
 *      update project_comment set body = '', author_id = null, edited_at = null, hidden_at = null,
 *        deleted_at = $maintenant
 *      where <les siennes> and root_id is null and exists (select 1 from project_comment reply
 *        where reply.root_id = project_comment.id and (<la réponse est à lui>) is not true)
 *    Les réponses qu'il s'est faites à lui-même ne comptent pas : elles partent à l'étape 2.
 *    « is not true » : une condition SQL peut valoir vrai, faux ou inconnu (null, quand l'auteur
 *    est null) ; on veut « tout sauf vrai ».
 *
 * 2. Tout le reste est effacé : ses réponses, et ses racines sans réponse d'un autre (leurs
 *    réponses à lui partent avec elles, par la cascade de root_id). En SQL :
 *      delete from project_comment where <les siennes> returning root_id
 *
 * 3. Un « Commentaire supprimé » dont il écrivait la dernière réponse ne montre plus rien : il est
 *    effacé à son tour (comme quand on supprime une réponse, routes/comments.ts).
 *
 * Les index : project_comment_author_idx trouve ses commentaires (author_id = $membre, ou
 * author_id is null : un index ordinaire range aussi les null) ; project_comment_root_created_idx,
 * les réponses de chaque racine.
 */
const eraseComments = (db: Database, owned: Owned) =>
  db.transaction(async (tx) => {
    const reply = alias(c, 'reply')
    const repliesOf = (from: (typeof c)['id'], byOthers: boolean) =>
      tx
        .select({ id: reply.id })
        .from(reply)
        .where(
          and(eq(reply.rootId, from), byOthers ? sql`(${owned(reply)}) is not true` : undefined),
        )

    await tx
      .select({ id: c.id })
      .from(c)
      .where(and(owned(c), isNull(c.rootId)))
      .for('update')

    const emptied = await tx
      .update(c)
      .set({ body: '', authorId: null, editedAt: null, hiddenAt: null, deletedAt: new Date() })
      .where(and(owned(c), isNull(c.rootId), exists(repliesOf(c.id, true))))
      .returning({ id: c.id })
    // Les mentions partent avec le texte (tranche 6b) : un « Commentaire supprimé » ne mentionne
    // plus personne. Les commentaires effacés à l'étape 2 emportent les leurs seuls (cascade).
    // La clé primaire de comment_mention (comment_id, …) les trouve.
    if (emptied.length > 0) {
      await tx.delete(schema.commentMention).where(
        inArray(
          schema.commentMention.commentId,
          emptied.map(({ id }) => id),
        ),
      )
    }

    const erased = await tx.delete(c).where(owned(c)).returning({ rootId: c.rootId })

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

/** Les commentaires d'un membre qui supprime son compte (beforeDelete). */
export const eraseCommentsOf = (db: Database, memberId: string) =>
  eraseComments(db, (t) => eq(t.authorId, memberId))

/**
 * Les commentaires restés sans auteur, sans être des « Commentaire supprimé » (afterDelete) : par
 * exemple un commentaire publié pendant la suppression d'un compte, entre beforeDelete et la
 * disparition du compte (la base met alors son author_id à null : onDelete 'set null'), ou un
 * compte effacé sans passer par l'API. Leur texte resterait dans la base sans que personne puisse
 * plus l'effacer : ils sont traités comme ceux d'un compte supprimé. Une racine sans auteur qui a
 * des réponses devient « Commentaire supprimé » ; le reste est effacé ; un emplacement qui n'a plus
 * de réponse, aussi.
 *
 * Les « Commentaire supprimé » n'ont pas d'auteur non plus : « deleted_at is null » les écarte. Une
 * réponse n'est jamais « supprimée » (elle est effacée) : pour elle, « sans auteur » suffit.
 *
 * Le coût : l'index project_comment_author_idx donne les lignes sans auteur, puis PostgreSQL écarte
 * une à une les « Commentaire supprimé » (EXPLAIN : « Rows Removed by Filter »). C'est une lecture
 * qui grandit avec leur nombre, faite seulement à chaque suppression de compte (rare). Si elle
 * devenait lente, un index partiel « where author_id is null and deleted_at is null » (presque
 * toujours vide) la rendrait immédiate.
 */
export const sweepOrphanComments = (db: Database) =>
  eraseComments(db, (t) => sql`${isNull(t.authorId)} and ${isNull(t.deletedAt)}`)
