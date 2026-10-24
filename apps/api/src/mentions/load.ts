// Lire les mentions de commentaires (tranche 6b) : pour chaque commentaire d'une page, les membres
// qu'il mentionne, avec le pseudo écrit (contrat `Mention`) ; et, pour l'export des données, les
// identifiants des membres mentionnés. Une requête pour tous les commentaires demandés, quel que
// soit leur nombre.
import { findMentions, type Mention } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { inArray } from 'drizzle-orm'
import type { Blocks } from '../blocks/visibility'

type Reader = Pick<Database, 'select'>

const cm = schema.commentMention

/** Un commentaire dont on cherche les mentions : son identifiant et son texte actuel. */
type MentionSource = { id: string; body: string }

/**
 * Les lignes de comment_mention de ces commentaires :
 *   select comment_id, member_id, handle from comment_mention where comment_id in (…)
 * La clé primaire (comment_id, member_id) commence par comment_id : elle trouve les mentions de
 * chaque commentaire. Un compte supprimé n'y a plus de ligne (effacement en cascade) : son pseudo
 * redevient du texte simple.
 */
const mentionRows = (db: Reader, commentIds: string[]) =>
  db
    .select({ commentId: cm.commentId, memberId: cm.memberId, handle: cm.handle })
    .from(cm)
    .where(inArray(cm.commentId, commentIds))

/**
 * Les mentions de ces commentaires, dans l'ordre du texte. Le pseudo vient de comment_mention, où il
 * est gardé tel qu'il a été écrit : si le membre en change, ou si un autre le reprend plus tard, le
 * lien mène toujours au membre désigné au moment de l'écriture. L'ordre, lui, se lit dans le texte
 * (la base ne garde pas l'ordre des lignes) : la première apparition de chaque pseudo.
 *
 * À n'appeler qu'avec les commentaires que le lecteur lit vraiment (pas une place vide de
 * commentaire masqué ou supprimé) : ce qu'on ne lit pas n'a pas de mentions.
 *
 * `blocks` (tranche 7b) : les blocages du lecteur (`blocksOf`). Un membre bloqué avec lui, dans un
 * sens ou dans l'autre, n'a pas de lien : son pseudo reste du texte, et son identifiant ne sort
 * pas. Le filtre se fait ici, en mémoire, sur les blocages déjà lus : aucune requête de plus.
 */
export const mentionsOf = async (
  db: Reader,
  comments: MentionSource[],
  blocks: Blocks,
): Promise<Map<string, Mention[]>> => {
  const result = new Map<string, Mention[]>()
  if (comments.length === 0) return result
  const rows = await mentionRows(
    db,
    comments.map((comment) => comment.id),
  )
  for (const row of rows) {
    if (blocks.byMe.has(row.memberId) || blocks.ofMe.has(row.memberId)) continue
    const list = result.get(row.commentId) ?? []
    list.push({ handle: row.handle, memberId: row.memberId })
    result.set(row.commentId, list)
  }
  for (const comment of comments) {
    const list = result.get(comment.id)
    if (!list) continue
    // Le rang de chaque pseudo dans le texte, avec le même découpage qu'à l'écriture
    // (findMentions : minuscules, sans doublon, dans l'ordre d'apparition).
    const order = findMentions(comment.body)
    const at = (handle: string) => {
      const index = order.indexOf(handle)
      return index === -1 ? order.length : index
    }
    list.sort((a, b) => at(a.handle) - at(b.handle))
  }
  return result
}

/**
 * Pour l'export des données : les identifiants des membres mentionnés dans chacun de ces
 * commentaires (Map vide pour un commentaire sans mention). Même requête, même index.
 */
export const mentionsOfComments = async (
  db: Reader,
  commentIds: string[],
): Promise<Map<string, string[]>> => {
  const result = new Map<string, string[]>()
  if (commentIds.length === 0) return result
  for (const row of await mentionRows(db, commentIds)) {
    const list = result.get(row.commentId) ?? []
    list.push(row.memberId)
    result.set(row.commentId, list)
  }
  return result
}
