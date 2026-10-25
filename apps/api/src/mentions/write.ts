// Écrire les mentions d'un commentaire (tranche 6b) : trouver les membres que désignent les
// « @pseudo » de son texte, et les ranger dans comment_mention, par identifiant. Appelé par POST et
// PATCH des commentaires (routes/comments.ts), dans la même transaction que le commentaire : le
// texte et ses mentions changent ensemble, ou pas du tout. Depuis la tranche 7b, une mention
// effacée du texte n'efface plus sa ligne : elle est « retirée » (withdrawn_at, saveMentions).
import { findMentions, MENTIONS_MAX, type Mention } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm'
import { blocksOf, noBlocks } from '../blocks/visibility'

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
 *
 * Les blocages (tranche 7b, règle 2b de la relecture du plan), lus par une requête de plus
 * (`blocksOf`, seulement si le texte contient un « @ ») :
 * - un pseudo qui désigne un membre que l'auteur a bloqué refuse tout le texte : la fonction rend
 *   'blocked_mention' (422), que ce pseudo soit nouveau ou déjà gardé, et rien n'est écrit ;
 * - un pseudo nouveau qui désigne un membre qui a bloqué l'auteur se traite comme un pseudo
 *   inconnu : pas de mention, pas d'erreur, rien ne trahit le blocage. Une mention déjà gardée
 *   (écrite avant le blocage) reste, elle : la règle 2 laisse le membre mentionné lire et signaler
 *   ce commentaire, et une modification ne doit pas pouvoir le lui cacher.
 */
export const resolveMentions = async (
  db: Database,
  body: string,
  authorId: string,
  kept: Mention[] = [],
): Promise<Mention[] | 'blocked_mention'> => {
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
  // Les blocages de l'auteur (règle 2b, voir plus haut) : un membre qu'il a bloqué, désigné par un
  // pseudo du texte (gardé ou nouveau), refuse le texte entier ; un membre qui l'a bloqué ne
  // devient pas une mention nouvelle.
  const designated = [...keptMembers, ...rows.map((row) => row.memberId)]
  const blocks = designated.length === 0 ? noBlocks : await blocksOf(db, authorId)
  if (designated.some((memberId) => blocks.byMe.has(memberId))) return 'blocked_mention'
  const resolvedOf = new Map(
    rows.filter((row) => !blocks.ofMe.has(row.memberId)).map((row) => [row.handle, row.memberId]),
  )
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
 * Les mentions encore écrites d'un commentaire (à sa modification), par la clé primaire
 * (comment_id, member_id), qui range les lignes par commentaire d'abord :
 *   select handle, member_id from comment_mention where comment_id = $1 and withdrawn_at is null
 * Une mention retirée (tranche 7b, voir saveMentions) n'est plus « gardée » : si l'auteur réécrit
 * ce pseudo, il est relu comme un pseudo nouveau, avec les règles des blocages d'aujourd'hui.
 */
export const mentionsOf = (db: Pick<Database, 'select'>, commentId: string) =>
  db
    .select({ handle: cm.handle, memberId: cm.memberId })
    .from(cm)
    .where(and(eq(cm.commentId, commentId), isNull(cm.withdrawnAt)))

/**
 * Range les mentions d'un commentaire qui vient d'être écrit ou modifié, à la date `at` :
 * - celles qui n'y sont plus sont retirées (tranche 7b) : leur ligne reste, datée par
 *   `withdrawn_at`. « Une fois mentionné, lisible tant que le commentaire existe » (décision du
 *   25/10/2026) : sans la ligne, un auteur qui a bloqué Inès pourrait lui cacher ce qu'il a écrit
 *   sur elle en effaçant « @inès » (règle 2 de la relecture du plan). Une mention retirée n'est plus
 *   qu'un droit de lecture : ni lien (mentions/load.ts), ni notification, ni e-mail
 *   (notifications/load.ts). Les lignes partent avec le commentaire (suppression, cascade) ;
 * - les nouvelles sont ajoutées, datées de `at` (la notification arrive maintenant) ;
 * - celles qui y étaient déjà gardent leur date : « on conflict … do update » ne change, quand la
 *   clé (comment_id, member_id) est déjà prise, que le pseudo (« excluded » : la ligne qu'on
 *   voulait insérer). Ainsi, corriger une faute de frappe ne fait pas revenir une notification
 *   déjà vue ; et si l'auteur remplace l'ancien pseudo d'Inès par son nouveau, la ligne d'Inès
 *   prend le pseudo désormais écrit (resolveMentions ne garde l'ancien que s'il est encore là) ;
 * - une mention retirée puis réécrite redevient une mention : `withdrawn_at` repasse à null, et
 *   elle prend la date `at`, comme une mention nouvelle (c'était le cas quand la ligne était
 *   effacée puis recréée). « case when » choisit, ligne par ligne, entre la date gardée
 *   (comment_mention.created_at) et la nouvelle (excluded.created_at).
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
    .update(cm)
    .set({ withdrawnAt: at })
    .where(
      and(
        eq(cm.commentId, commentId),
        isNull(cm.withdrawnAt),
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
      set: {
        handle: sql`excluded.handle`,
        createdAt: sql`case when ${sql.raw('comment_mention.withdrawn_at')} is null then ${sql.raw('comment_mention.created_at')} else excluded.created_at end`,
        withdrawnAt: null,
      },
    })
}
