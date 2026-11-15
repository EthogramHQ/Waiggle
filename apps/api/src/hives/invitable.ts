// La recherche de la feuille « Inviter » d'une ruche (R10) : GET /v1/hives/{id}/invitable?q=. Elle
// trouve les membres par leur nom (sans tenir compte des accents ni des majuscules) ou leur pseudo
// actuel, comme la recherche par mots (search/load.ts, dont elle reprend le repli et la règle des
// 3 caractères), et dit pour chacun s'il est déjà membre, déjà invité, ou à inviter.
//
// La règle (relecture du plan, point 3, et juridique B1) : sous 3 caractères, seulement les membres
// que l'on suit et ceux de ses ruches ; dès 3, tout le réseau. Jamais un membre bloqué dans un sens
// ou dans l'autre, ni le lecteur lui-même, ni un compte jamais vérifié. Les membres suspendus ne sont
// pas filtrés (on peut inviter un proche suspendu ; il acceptera quand il voudra).
import { INVITABLE_MAX, INVITABLE_NETWORK_FROM, type InvitableMember } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { notBlockedWith } from '../blocks/visibility'
import { avatarUrlOf } from '../profile/me'
import { contains, foldSql } from '../search/fold'
import { invitationValidSince } from './load'

const u = schema.user
const h = schema.memberHandle
const hm = schema.hiveMember
const hi = schema.hiveInvitation

/** Une colonne de la table intermédiaire de la requête (« folded_name »), par son nom. */
const col = (name: string): SQL => sql`${sql.identifier(name)}`

/** Une ligne rendue par la requête brute : `execute` ne type rien, Zod vérifie chaque champ. */
const InvitableRow = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  avatar_key: z.string().nullable(),
  is_member: z.boolean(),
  is_invited: z.boolean(),
})

/**
 * Les membres que ce lecteur peut inviter dans cette ruche (la route a vérifié qu'il en est membre),
 * 20 au plus. `words` vient de `searchWords` (contrat) : repliés, sans doublon, 1 à 5. En SQL :
 *   with candidate as materialized (
 *     select "user".id, "user".name, member_handle.handle, profile.avatar_key,
 *            <replié>("user".name) as folded_name,
 *            exists (<membre de cette ruche>) as is_member,
 *            exists (<invitation de moins de 30 jours, refusée comprise>) as is_invited
 *     from "user"
 *     inner join member_handle on member_handle.user_id = "user".id and released_at is null
 *     left join profile on profile.user_id = "user".id
 *     where email_verified and id <> moi and <aucun blocage, dans un sens ou l'autre>
 *       [and (<je le suis> or <il est dans l'une de mes ruches>)]   -- sous 3 caractères
 *   )
 *   select … from candidate where <chaque mot dans folded_name ou handle>
 *   order by starts_with(folded_name, $premierMot) desc, folded_name collate "C", id limit 20
 *
 * `materialized` : la table intermédiaire est calculée une fois, et le repli du nom (coûteux, voir
 * fold.ts) n'est fait qu'une fois par membre, quel que soit le nombre de mots. Les index :
 * - le pseudo actuel, par l'index partiel member_handle_current_idx (released_at is null) ;
 * - « je le suis » : la clé primaire (follower_id, member_id) de member_follow ;
 * - « dans l'une de mes ruches » : mes ruches par hive_member_user_idx (user_id), puis sa ligne dans
 *   chacune par la clé primaire (hive_id, user_id) de hive_member ;
 * - « membre de cette ruche » : la clé primaire de hive_member ;
 * - « invité » : l'index unique hive_invitation_hive_invitee_idx (hive_id, invitee_id).
 * Toutes les valeurs (identifiants, mots, date) entrent par des paramètres liés.
 */
export const loadInvitable = async (
  db: Pick<Database, 'execute'>,
  viewerId: string,
  hiveId: string,
  words: string[],
  now: Date,
  publicApiUrl: string,
): Promise<InvitableMember[]> => {
  // Compter le mot le plus long, et non le texte entier : « ab cd » n'ouvre pas tout le réseau.
  const short = words.every((word) => word.length < INVITABLE_NETWORK_FROM)
  const followed = sql`exists (select 1 from ${schema.memberFollow} where ${schema.memberFollow.followerId} = ${viewerId} and ${schema.memberFollow.memberId} = ${u.id})`
  // Les colonnes des sous-requêtes sur hive_member sont écrites en toutes lettres (sql.raw : du
  // texte fixe), avec un alias par table : sinon Drizzle écrirait « user_id » sans table, et la
  // condition se comparerait à elle-même (charte de l'API, 6b).
  const coMember = sql`exists (select 1 from ${hm} as mine
    inner join ${hm} as theirs on ${sql.raw('theirs.hive_id')} = ${sql.raw('mine.hive_id')}
    where ${sql.raw('mine.user_id')} = ${viewerId} and ${sql.raw('theirs.user_id')} = ${u.id})`
  const isMember = sql`exists (select 1 from ${hm} where ${sql.raw('hive_member.hive_id')} = ${hiveId} and ${sql.raw('hive_member.user_id')} = ${u.id})`
  // La date passe par la colonne (sql.param) : convertie comme Drizzle l'écrit, toujours en UTC.
  const since = sql`${sql.param(invitationValidSince(now), hi.createdAt)}::timestamp`
  const isInvited = sql`exists (select 1 from ${hi} where ${sql.raw('hive_invitation.hive_id')} = ${hiveId} and ${sql.raw('hive_invitation.invitee_id')} = ${u.id} and ${sql.raw('hive_invitation.created_at')} > ${since})`
  const name = col('folded_name')
  const result = await db.execute(sql`
    with candidate as materialized (
      select ${u.id} as id, ${u.name} as name, ${h.handle} as handle,
        ${schema.profile.avatarKey} as avatar_key, ${foldSql(u.name)} as folded_name,
        ${isMember} as is_member, ${isInvited} as is_invited
      from ${u}
      inner join ${h} on ${h.userId} = ${u.id} and ${h.releasedAt} is null
      left join ${schema.profile} on ${schema.profile.userId} = ${u.id}
      where ${u.emailVerified} = true and ${u.id} <> ${viewerId}
        and ${notBlockedWith(viewerId, u.id)}
        ${short ? sql`and (${followed} or ${coMember})` : sql``}
    )
    select id, name, handle, avatar_key, is_member, is_invited from candidate
    where ${and(...words.map((word) => or(contains(name, word), contains(col('handle'), word))))}
    order by starts_with(${name}, ${words[0] ?? ''}) desc, ${name} collate "C", id
    limit ${INVITABLE_MAX}`)
  const { rows } = z.object({ rows: z.array(InvitableRow) }).parse(result)
  return rows.map((row) => ({
    face: { id: row.id, name: row.name, avatarUrl: avatarUrlOf(publicApiUrl, row.avatar_key) },
    handle: row.handle,
    state: row.is_member ? 'member' : row.is_invited ? 'invited' : 'none',
  }))
}
