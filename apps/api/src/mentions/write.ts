// Écrire les mentions d'un commentaire (tranche 6b) : trouver les membres que désignent les
// « @pseudo » de son texte, et les ranger dans comment_mention, par identifiant. Appelé par POST et
// PATCH des commentaires (routes/comments.ts), dans la même transaction que le commentaire : le
// texte et ses mentions changent ensemble, ou pas du tout.
import { findMentions, MENTIONS_MAX, type Mention } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'

const h = schema.memberHandle
const cm = schema.commentMention

/**
 * Les membres mentionnés dans un texte, dans l'ordre du texte, 5 au plus (MENTIONS_MAX) : chaque
 * « @pseudo » bien formé (findMentions, du contrat, le même découpage que l'appli) qui est le
 * pseudo ACTUEL d'un compte vérifié, autre que l'auteur. Un ancien pseudo, même réservé à son
 * propriétaire, reste du texte : il ne désigne plus personne. Un pseudo qui ne désigne personne ne
 * prend pas de place parmi les 5.
 *
 * À la modification, `kept` donne les mentions déjà gardées (mentionsOf) : un pseudo encore écrit
 * garde son membre, sans être relu, et seuls les pseudos nouveaux du texte sont cherchés. Sans
 * cela, modifier un commentaire après qu'Inès a changé de pseudo effacerait sa mention, et si Zoé
 * avait repris l'ancien pseudo, la mention passerait à Zoé (relecture de sécurité, tranche 6b).
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
  kept: Mention[] = [],
): Promise<Mention[]> => {
  const handles = findMentions(body)
  if (handles.length === 0) return []
  // Les mentions déjà gardées (à la modification) dont le pseudo est encore dans le texte : elles
  // désignent toujours le même membre, quoi que soit devenu ce pseudo depuis (changé, ou repris
  // par un autre). Elles ne sont pas relues dans member_handle.
  const keptOf = new Map(
    kept.filter((mention) => handles.includes(mention.handle)).map((m) => [m.handle, m.memberId]),
  )
  const keptMembers = new Set(keptOf.values())
  const toResolve = handles.filter((handle) => !keptOf.has(handle))
  const rows =
    toResolve.length === 0
      ? []
      : await db
          .select({ handle: h.handle, memberId: h.userId })
          .from(h)
          .innerJoin(schema.user, eq(schema.user.id, h.userId))
          .where(
            and(
              inArray(h.handle, toResolve),
              isNull(h.releasedAt),
              eq(schema.user.emailVerified, true),
              // Se mentionner soi-même ne prévient personne : on ne le garde pas.
              ne(h.userId, authorId),
            ),
          )
  const resolvedOf = new Map(rows.map((row) => [row.handle, row.memberId]))
  // L'ordre du texte (findMentions le donne déjà, sans doublon), un membre une seule fois, puis
  // les 5 premiers trouvés. Un membre déjà mentionné par un pseudo encore écrit garde ce pseudo-là,
  // même si son pseudo actuel est écrit aussi : une seule ligne par membre et par commentaire.
  const named = new Set<string>()
  return handles
    .flatMap((handle) => {
      const keptId = keptOf.get(handle)
      const resolvedId = resolvedOf.get(handle)
      const memberId = keptId ?? (resolvedId && !keptMembers.has(resolvedId) ? resolvedId : null)
      if (!memberId || named.has(memberId)) return []
      named.add(memberId)
      return [{ handle, memberId }]
    })
    .slice(0, MENTIONS_MAX)
}

/**
 * Les mentions déjà gardées d'un commentaire (à sa modification), par la clé primaire
 * (comment_id, member_id), qui range les lignes par commentaire d'abord :
 *   select handle, member_id from comment_mention where comment_id = $1
 */
export const mentionsOf = (db: Pick<Database, 'select'>, commentId: string) =>
  db
    .select({ handle: cm.handle, memberId: cm.memberId })
    .from(cm)
    .where(eq(cm.commentId, commentId))

/**
 * Range les mentions d'un commentaire qui vient d'être écrit ou modifié, à la date `at` :
 * - celles qui n'y sont plus sont effacées (leur notification disparaît avec elles) ;
 * - les nouvelles sont ajoutées, datées de `at` (la notification arrive maintenant) ;
 * - celles qui y étaient déjà gardent leur date : « on conflict … do update » ne change, quand la
 *   clé (comment_id, member_id) est déjà prise, que le pseudo (« excluded » : la ligne qu'on
 *   voulait insérer). Ainsi, corriger une faute de frappe ne fait pas revenir une notification
 *   déjà vue ; et si l'auteur remplace l'ancien pseudo d'Inès par son nouveau, la ligne d'Inès
 *   prend le pseudo désormais écrit (resolveMentions ne garde l'ancien que s'il est encore là).
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
  if (mentions.length === 0) return
  // Le pseudo est gardé tel qu'il a été résolu (minuscules, sans « @ ») : c'est lui que l'appli
  // transforme en lien, même si le membre en change ensuite.
  await db
    .insert(cm)
    .values(
      mentions.map(({ memberId, handle }) => ({ commentId, memberId, handle, createdAt: at })),
    )
    .onConflictDoUpdate({
      target: [cm.commentId, cm.memberId],
      set: { handle: sql`excluded.handle` },
    })
}
