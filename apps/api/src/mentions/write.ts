// Écrire les mentions d'un commentaire (tranche 6b) : trouver les membres que désignent les
// « @pseudo » de son texte, et les ranger dans comment_mention, par identifiant. Appelé par POST et
// PATCH des commentaires (routes/comments.ts), dans la même transaction que le commentaire : le
// texte et ses mentions changent ensemble, ou pas du tout.
import { findMentions, MENTIONS_MAX, type Mention } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm'

const h = schema.memberHandle
const cm = schema.commentMention

/**
 * Les membres mentionnés dans un texte, dans l'ordre du texte, 5 au plus (MENTIONS_MAX) : chaque
 * « @pseudo » bien formé (findMentions, du contrat, le même découpage que l'appli) qui est le
 * pseudo ACTUEL d'un compte vérifié, autre que l'auteur. Un ancien pseudo, même réservé à son
 * propriétaire, reste du texte : il ne désigne plus personne. Un pseudo qui ne désigne personne ne
 * prend pas de place parmi les 5.
 *
 * Une seule requête, quel que soit le nombre de pseudos :
 *   select member_handle.handle, member_handle.user_id from member_handle
 *   inner join "user" on "user".id = member_handle.user_id
 *   where member_handle.handle in (…) and member_handle.released_at is null
 *     and "user".email_verified and member_handle.user_id <> $auteur
 * La clé primaire de member_handle (le pseudo lui-même) trouve chaque pseudo ; celle de user, son
 * compte. Les pseudos viennent du texte du client, mais n'entrent dans la requête que comme
 * paramètres liés ($1, $2…), jamais recopiés dans le SQL.
 */
export const resolveMentions = async (
  db: Database,
  body: string,
  authorId: string,
): Promise<Mention[]> => {
  const handles = findMentions(body)
  if (handles.length === 0) return []
  const rows = await db
    .select({ handle: h.handle, memberId: h.userId })
    .from(h)
    .innerJoin(schema.user, eq(schema.user.id, h.userId))
    .where(
      and(
        inArray(h.handle, handles),
        isNull(h.releasedAt),
        eq(schema.user.emailVerified, true),
        // Se mentionner soi-même ne prévient personne : on ne le garde pas.
        ne(h.userId, authorId),
      ),
    )
  const memberOf = new Map(rows.map((row) => [row.handle, row.memberId]))
  // L'ordre du texte (findMentions le donne déjà, sans doublon), puis les 5 premiers trouvés.
  return handles
    .flatMap((handle) => {
      const memberId = memberOf.get(handle)
      return memberId ? [{ handle, memberId }] : []
    })
    .slice(0, MENTIONS_MAX)
}

/**
 * Range les mentions d'un commentaire qui vient d'être écrit ou modifié, à la date `at` :
 * - celles qui n'y sont plus sont effacées (leur notification disparaît avec elles) ;
 * - les nouvelles sont ajoutées, datées de `at` (la notification arrive maintenant) ;
 * - celles qui y étaient déjà gardent leur date : « on conflict do nothing » laisse la ligne
 *   existante telle quelle quand la clé (comment_id, member_id) est déjà prise. Ainsi, corriger
 *   une faute de frappe ne fait pas revenir une notification déjà vue.
 * La clé primaire (comment_id, member_id) sert aux deux requêtes : elle range les lignes par
 * commentaire d'abord.
 */
export const saveMentions = async (
  db: Database,
  commentId: string,
  mentions: Mention[],
  at: Date,
) => {
  const memberIds = mentions.map((mention) => mention.memberId)
  await db
    .delete(cm)
    .where(
      and(
        eq(cm.commentId, commentId),
        memberIds.length > 0 ? notInArray(cm.memberId, memberIds) : undefined,
      ),
    )
  if (memberIds.length === 0) return
  await db
    .insert(cm)
    .values(memberIds.map((memberId) => ({ commentId, memberId, createdAt: at })))
    .onConflictDoNothing()
}
