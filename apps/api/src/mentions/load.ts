// Lire les mentions de commentaires (tranche 6b) : pour chaque commentaire d'une page, les membres
// qu'il mentionne, avec le pseudo tel qu'il est écrit dans le texte (contrat `Mention`). En une
// requête pour toute la page, quel que soit le nombre de commentaires.
import { findMentions, type Mention } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq, inArray } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>

const h = schema.memberHandle
const cm = schema.commentMention

/** Un commentaire dont on cherche les mentions : son identifiant et son texte actuel. */
type MentionSource = { id: string; body: string }

/** Les pseudos d'un membre mentionné : l'actuel, et ceux qu'il a quittés (encore réservés). */
type MemberHandles = { current: string | null; former: string[] }

/**
 * Retrouve, dans le texte, le pseudo écrit pour chacun des membres mentionnés.
 *
 * La base garde le membre (par identifiant), pas le pseudo écrit : on le retrouve ainsi, dans cet
 * ordre de confiance :
 * 1. le pseudo actuel du membre, s'il est écrit dans le texte ;
 * 2. sinon, un de ses anciens pseudos encore gardés (il en a changé depuis la mention) ;
 * 3. sinon (l'ancien pseudo n'est plus gardé, 30 jours après le changement), s'il ne reste qu'un
 *    membre et qu'un pseudo écrit sans membre, ils vont ensemble. Sinon on ne peut pas savoir
 *    lequel est lequel : la mention n'est pas donnée (le texte s'affiche sans lien), plutôt que de
 *    mettre un lien sur le mauvais pseudo.
 * Le résultat suit l'ordre du texte.
 */
export const matchMentions = (
  body: string,
  memberIds: string[],
  handlesOf: Map<string, MemberHandles>,
): Mention[] => {
  const written = findMentions(body)
  const taken = new Map<string, string>() // pseudo écrit → membre
  const left: string[] = []
  for (const memberId of memberIds) {
    const handles = handlesOf.get(memberId)
    const candidates = handles ? [handles.current, ...handles.former] : []
    const handle = candidates.find(
      (candidate) => candidate !== null && written.includes(candidate) && !taken.has(candidate),
    )
    if (handle) taken.set(handle, memberId)
    else left.push(memberId)
  }
  // La base ne garde pas l'ordre des mentions : deux membres restants et deux pseudos libres ne se
  // rapprochent pas sans risque. Un seul de chaque côté, en revanche, ne laisse aucun doute.
  const free = written.filter((handle) => !taken.has(handle))
  const [lastMember] = left
  const [lastHandle] = free
  if (left.length === 1 && free.length === 1 && lastMember && lastHandle) {
    taken.set(lastHandle, lastMember)
  }
  return written.flatMap((handle) => {
    const memberId = taken.get(handle)
    return memberId ? [{ handle, memberId }] : []
  })
}

/**
 * Les mentions de ces commentaires, en une requête :
 *   select comment_mention.comment_id, comment_mention.member_id, member_handle.handle,
 *          member_handle.released_at
 *   from comment_mention left join member_handle on member_handle.user_id = comment_mention.member_id
 *   where comment_mention.comment_id in (…)
 * La clé primaire de comment_mention (comment_id, member_id) commence par comment_id : elle trouve
 * les mentions de chaque commentaire. L'index member_handle_user_idx donne les pseudos de chaque
 * membre mentionné (l'actuel et les anciens encore gardés). Un compte supprimé n'a plus de ligne
 * dans comment_mention (effacement en cascade) : son pseudo redevient du texte simple.
 *
 * À n'appeler qu'avec les commentaires que le lecteur lit vraiment (pas une place vide de
 * commentaire masqué ou supprimé) : ce qu'on ne lit pas n'a pas de mentions.
 */
export const mentionsOf = async (
  db: Reader,
  comments: MentionSource[],
): Promise<Map<string, Mention[]>> => {
  const result = new Map<string, Mention[]>()
  if (comments.length === 0) return result
  const rows = await db
    .select({
      commentId: cm.commentId,
      memberId: cm.memberId,
      handle: h.handle,
      releasedAt: h.releasedAt,
    })
    .from(cm)
    .leftJoin(h, eq(h.userId, cm.memberId))
    .where(
      inArray(
        cm.commentId,
        comments.map((comment) => comment.id),
      ),
    )
  // Rangement en mémoire : les membres de chaque commentaire, et les pseudos de chaque membre.
  const membersOf = new Map<string, Set<string>>()
  const handlesOf = new Map<string, MemberHandles>()
  for (const row of rows) {
    const members = membersOf.get(row.commentId) ?? new Set<string>()
    members.add(row.memberId)
    membersOf.set(row.commentId, members)
    const handles = handlesOf.get(row.memberId) ?? { current: null, former: [] }
    if (row.handle !== null) {
      if (row.releasedAt === null) handles.current = row.handle
      else if (!handles.former.includes(row.handle)) handles.former.push(row.handle)
    }
    handlesOf.set(row.memberId, handles)
  }
  for (const comment of comments) {
    const members = membersOf.get(comment.id)
    if (members) result.set(comment.id, matchMentions(comment.body, [...members], handlesOf))
  }
  return result
}
