// La suppression d'un commentaire, écrite une seule fois : la route du projet (DELETE
// /v1/projects/{id}/comments/{commentId}) et celle de « Mes commentaires » (DELETE
// /v1/me/comments/{commentId}) y passent toutes les deux, pour qu'une seule liste d'étapes dise ce
// que devient un commentaire supprimé. Ce fichier ne décide pas qui a le droit de supprimer : les
// routes l'ont vérifié avant (l'auteur, et lui seul).
import type { Database } from '@ruche/db'
import { schema } from '@ruche/db'
import { and, eq, exists, isNotNull, not } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { RateRule } from '../rate-limit'

const c = schema.projectComment

/**
 * Supprimer, masquer et démasquer comptent comme des modifications du projet : 60 par heure et par
 * membre, un seul compteur (`memberCounterKeys(id).projectChange`) pour les deux routes de
 * suppression, celle du projet et celle de « Mes commentaires » (relecture de sécurité R11, S-C3).
 */
export const commentChangeRule: RateRule = { windowMs: 60 * 60 * 1000, max: 60 }

/**
 * Efface un commentaire. `rootId` : la racine de son fil, ou null si c'est lui la racine.
 * - Une racine qui a des réponses devient « Commentaire supprimé » : texte, auteur et dates de
 *   modification et de masquage sont effacés pour de bon, ses réponses gardent leur fil. Sans
 *   réponse, elle est effacée.
 * - Une réponse est effacée ; si c'était la dernière d'un « Commentaire supprimé », celui-ci ne
 *   montre plus rien : il est effacé à son tour.
 *
 * Une transaction regroupe ces écritures : elles réussissent toutes ou aucune ne s'applique.
 */
export const deleteComment = async (db: Database, commentId: string, rootId: string | null) => {
  // Un alias : la même table sous un autre nom, pour chercher « les réponses » d'une racine dans la
  // table des commentaires elle-même.
  const reply = alias(c, 'reply')
  const hasReplies = (id: string) =>
    exists(db.select({ id: reply.id }).from(reply).where(eq(reply.rootId, id)))
  await db.transaction(async (tx) => {
    // On verrouille d'abord la racine du fil (« for update ») : une réponse publiée ou supprimée
    // en même temps attend la fin de cette transaction, et chacune voit l'état laissé par l'autre.
    const lockedId = rootId ?? commentId
    await tx.select({ id: c.id }).from(c).where(eq(c.id, lockedId)).for('update')

    if (rootId === null) {
      // « hasReplies » : au moins une ligne pointe vers cette racine.
      const [kept] = await tx
        .update(c)
        .set({ body: '', authorId: null, editedAt: null, hiddenAt: null, deletedAt: new Date() })
        .where(and(eq(c.id, commentId), hasReplies(commentId)))
        .returning({ id: c.id })
      if (!kept) await tx.delete(c).where(eq(c.id, commentId))
      // Gardée comme emplacement, elle perd aussi ses mentions : elles partent avec le texte.
      else
        await tx.delete(schema.commentMention).where(eq(schema.commentMention.commentId, commentId))
      return
    }
    await tx.delete(c).where(eq(c.id, commentId))
    await tx.delete(c).where(and(eq(c.id, rootId), isNotNull(c.deletedAt), not(hasReplies(rootId))))
  })
}
