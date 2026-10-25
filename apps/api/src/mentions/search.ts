// Les membres proposés pendant qu'on tape « @in… » dans un commentaire (tranche 6b,
// GET /v1/members/mentionable) : les proches d'abord, puis les autres, par ordre alphabétique du
// pseudo, 5 au plus. Qui a le droit de chercher sur ce projet est vérifié par la route.
import { MENTIONABLE_MAX, type Mentionable } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'
import { seesSql, type Viewer } from '../comments/load'
import { mediaUrl } from '../profile/me'

type Reader = Pick<Database, 'select'>

const h = schema.memberHandle
const u = schema.user
const c = schema.projectComment
const f = schema.memberFollow

/**
 * À partir de combien de caractères on propose aussi les membres qui ne sont pas des proches
 * (décision du 20/10/2026). Avec 2 caractères, 26 × 26 demandes suffiraient à parcourir presque
 * tout le réseau : on ne propose alors que les proches, qu'on connaît déjà.
 */
const OTHERS_FROM = 3

/**
 * Cherche les membres dont le pseudo ACTUEL commence par `prefix` (déjà en minuscules, sans « @ »,
 * vérifié par MentionableQuery : lettres, chiffres et « _ » seulement), pour `viewer` qui commente
 * le projet `project`. Seulement des comptes vérifiés, jamais lui-même (se mentionner ne prévient
 * personne). Rien d'autre que le nom, le pseudo et la photo : ni e-mail, ni langue, ni dates.
 *
 * En SQL (une seule requête) :
 *   select "user".id, "user".name, member_handle.handle, profile.avatar_key,
 *     ("user".id = $auteurDuProjet
 *       or (select 1 from project_comment where project_id = $projet
 *             and author_id = "user".id and deleted_at is null and <il le lit> limit 1) is not null
 *       or (select 1 from member_follow where follower_id = $moi
 *             and member_id = "user".id limit 1) is not null) as close
 *   from member_handle
 *   inner join "user" on "user".id = member_handle.user_id
 *   left join profile on profile.user_id = "user".id
 *   where member_handle.released_at is null and starts_with(member_handle.handle, $debut)
 *     and "user".email_verified and "user".id <> $moi
 *     and not (<l'un a bloqué l'autre>)        -- tranche 7b, blockedWith
 *   order by close desc, member_handle.handle collate "C" limit 5
 * Avec un début de moins de 3 caractères (OTHERS_FROM), la condition « close » s'ajoute au
 * « where » : seulement les proches.
 *
 * « Proches » : l'auteur du projet, ceux dont il lit un commentaire sur ce projet (la règle
 * `seesSql` de comments/load.ts : un commentaire masqué pour lui ne lui apprend rien), et ceux
 * qu'il suit. Chaque sous-requête rend une valeur ou rien (« (select 1 … limit 1) is not null »,
 * voir comments/load.ts) : elle est posée membre par membre, et seulement pour les quelques
 * pseudos qui commencent par ce début. Les index : project_comment_author_idx (les commentaires
 * de ce membre) et la clé primaire (follower_id, member_id) de member_follow.
 *
 * starts_with plutôt que « like 'in%' » : dans un « like », « _ » veut dire « n'importe quel
 * caractère » ; « in_ » trouverait alors « ina ». starts_with compare le texte tel quel.
 * L'index : dans les tests (PGlite, tri « C », octet par octet), PostgreSQL change starts_with en
 * intervalle (« handle >= 'in' and handle < 'io' ») sur la clé primaire de member_handle. Sur le
 * serveur (tri selon la langue, en_US), ce n'est pas permis : il lit tous les pseudos actuels par
 * l'index partiel member_handle_current_idx, une ligne par membre, ce qui reste rapide tant que le
 * réseau compte quelques milliers de membres. Au-delà : un index « text_pattern_ops » sur handle.
 * « collate "C" » dans le tri : « _ » a toujours la même place, quelle que soit la langue du
 * serveur.
 */
export const searchMentionable = async (
  db: Reader,
  prefix: string,
  viewer: Viewer,
  project: { id: string; authorId: string },
  publicApiUrl: string,
): Promise<Mentionable[]> => {
  const commented = db
    .select({ one: sql`1` })
    .from(c)
    .where(
      and(
        eq(c.projectId, project.id),
        eq(c.authorId, u.id),
        isNull(c.deletedAt),
        seesSql(c, viewer),
      ),
    )
    .limit(1)
  const followed = db
    .select({ one: sql`1` })
    .from(f)
    .where(and(eq(f.followerId, viewer.id), eq(f.memberId, u.id)))
    .limit(1)
  const close = or(
    eq(u.id, project.authorId),
    sql`${commented} is not null`,
    sql`${followed} is not null`,
  )
  const rows = await db
    .select({ id: u.id, name: u.name, handle: h.handle, avatarKey: schema.profile.avatarKey })
    .from(h)
    .innerJoin(u, eq(u.id, h.userId))
    .leftJoin(schema.profile, eq(schema.profile.userId, u.id))
    .where(
      and(
        isNull(h.releasedAt),
        sql`starts_with(${h.handle}, ${prefix})`,
        eq(u.emailVerified, true),
        ne(u.id, viewer.id),
        // Tranche 7b : jamais un membre bloqué avec lui, dans un sens ou dans l'autre (deux
        // « exists » par les index de member_block, posés seulement pour les pseudos qui
        // commencent par ce début).
        notBlockedWith(viewer.id, u.id),
        // Trop court pour chercher dans tout le réseau : les proches seulement.
        prefix.length < OTHERS_FROM ? close : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${close}, false)`), asc(sql`${h.handle} collate "C"`))
    .limit(MENTIONABLE_MAX)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
  }))
}
