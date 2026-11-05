// Les membres proposés pendant qu'on tape « @in… » dans un commentaire (tranche 6b,
// GET /v1/members/mentionable), trouvés par leur pseudo ou, depuis R5b, par un mot de leur nom :
// les proches d'abord, puis le pseudo trouvé avant le nom trouvé, puis par ordre alphabétique du
// pseudo, 5 au plus. Qui a le droit de chercher sur ce projet est vérifié par la route.
import { MENTIONABLE_MAX, type Mentionable } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'
import { seesSql, type Viewer } from '../comments/load'
import { mediaUrl } from '../profile/me'
import { contains, foldSql } from '../search/fold'

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
 * Ce qui sépare deux mots d'un nom (décision D2 de R5b) : l'espace, le tiret, l'apostrophe. La
 * recherche ne contient jamais ces caractères (MentionableQuery : lettres, chiffres et « _ ») :
 * « ' » + début ne peut donc tomber qu'au vrai début d'un mot.
 */
const WORD_SEPARATORS = [' ', '-', "'"] as const

/**
 * Cherche les membres dont le pseudo ACTUEL commence par `prefix` (déjà replié par
 * MentionableQuery : minuscules sans accents, sans « @ », lettres, chiffres et « _ » seulement), ou
 * dont le nom replié commence par `prefix`, ou contient un mot qui commence par `prefix` (R5b),
 * pour `viewer` qui commente le projet `project`. Seulement des comptes vérifiés, jamais lui-même
 * (se mentionner ne prévient personne). Rien d'autre que le nom, le pseudo et la photo : ni
 * e-mail, ni langue, ni dates.
 *
 * En SQL (une seule requête ; <nom> est foldSql("user".name), search/fold.ts) :
 *   select "user".id, "user".name, member_handle.handle, profile.avatar_key,
 *     ("user".id = $auteurDuProjet
 *       or (select 1 from project_comment where project_id = $projet
 *             and author_id = "user".id and deleted_at is null and <il le lit> limit 1) is not null
 *       or (select 1 from member_follow where follower_id = $moi
 *             and member_id = "user".id limit 1) is not null) as close
 *   from member_handle
 *   inner join "user" on "user".id = member_handle.user_id
 *   left join profile on profile.user_id = "user".id
 *   where member_handle.released_at is null
 *     and (starts_with(member_handle.handle, $debut)
 *          or strpos(' ' || translate(<nom>, $'-''', $'   '), $' debut') > 0)
 *     and "user".email_verified and "user".id <> $moi
 *     and not (<l'un a bloqué l'autre>)        -- tranche 7b, blockedWith
 *   order by close desc, starts_with(member_handle.handle, $debut) desc,
 *     member_handle.handle collate "C" limit 5
 * Le nom n'a pas d'index : chaque pseudo actuel d'un compte est lu, et son nom replié à la volée
 * (relecture R5b, sec-A4 : coût mesuré au rapport du backend ; piste au-delà, une colonne repliée
 * écrite à l'enregistrement, avec un index). Le « or » commence par le pseudo : PostgreSQL lit
 * ses termes dans l'ordre et s'arrête, en pratique, au premier vrai (un pseudo trouvé ne replie
 * pas son nom ; la documentation ne le promet pas, le résultat n'en dépend pas).
 * Avec un début de moins de 3 caractères (OTHERS_FROM), la condition « close » s'ajoute au
 * « where » : seulement les proches.
 *
 * « Proches » : l'auteur du projet, ceux dont il lit un commentaire sur ce projet (la règle
 * `seesSql` de comments/load.ts : un commentaire masqué pour lui ne lui apprend rien), et ceux
 * qu'il suit. Chaque sous-requête rend une valeur ou rien (« (select 1 … limit 1) is not null »,
 * voir comments/load.ts) : elle est posée membre par membre, et seulement pour les quelques
 * membres trouvés par ce début. Les index : project_comment_author_idx (les commentaires
 * de ce membre) et la clé primaire (follower_id, member_id) de member_follow.
 *
 * starts_with plutôt que « like 'in%' » : dans un « like », « _ » veut dire « n'importe quel
 * caractère » ; « in_ » trouverait alors « ina ». starts_with compare le texte tel quel ; strpos
 * aussi (search/fold.ts, `contains`).
 * L'index : depuis R5b, le « or » avec le nom empêche de ne lire que les pseudos qui commencent par
 * ce début (avant, sous PGlite, un intervalle sur la clé primaire de member_handle). PostgreSQL lit
 * tous les pseudos actuels, une ligne par membre (l'index partiel member_handle_current_idx, ou la
 * table entière), ce qui reste rapide tant que le réseau compte quelques milliers de membres.
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
  // R5b : le pseudo trouvé passe avant le nom trouvé, dans le tri comme dans la recherche.
  const byHandle = sql`starts_with(${h.handle}, ${prefix})`
  // Le nom replié (sans accents ni majuscules, comme `prefix`), ses séparateurs de mots changés en
  // espaces, et une espace devant : « Jean-Pierre O'Brien » devient « ␣jean pierre o brien ».
  // Chaque mot, le premier compris, commence alors après une espace : un seul `strpos` de
  // « ␣pie » trouve le début du nom, ou d'un mot après une espace, un tiret ou une apostrophe.
  // Le nom n'est ainsi replié qu'une fois par membre : écrit en quatre conditions (le début, puis
  // un `strpos` par séparateur), il l'était quatre fois, et la recherche coûtait quatre fois plus
  // (mesuré pour la relecture sec-A4, sous PGlite, pour 30 000 membres aux noms de 40 caractères :
  // 1,2 s en quatre conditions, 0,4 s ainsi ; 20 ms pour 1 000 membres).
  // Le séparateur et la recherche sont des paramètres liés.
  const words = sql`' ' || translate(${foldSql(u.name)}, ${WORD_SEPARATORS.join('')}::text, ${' '.repeat(WORD_SEPARATORS.length)}::text)`
  const rows = await db
    .select({ id: u.id, name: u.name, handle: h.handle, avatarKey: schema.profile.avatarKey })
    .from(h)
    .innerJoin(u, eq(u.id, h.userId))
    .leftJoin(schema.profile, eq(schema.profile.userId, u.id))
    .where(
      and(
        isNull(h.releasedAt),
        // Un seul « or » (relecture de sécurité R5b, sec-A1) : le pseudo, ou le début d'un mot du
        // nom (décision D2 : « Jean-Pierre » trouvé par « pie », « O'Brien » par « bri » ;
        // l'apostrophe typographique est déjà devenue droite au repli). Toutes les autres
        // conditions de ce « and » valent pour les deux. « ␣pie » est un paramètre lié, construit
        // ici : jamais recopié dans le texte SQL, et jamais un « like », où « _ » serait un joker.
        or(byHandle, contains(words, ` ${prefix}`)),
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
    .orderBy(
      desc(sql`coalesce(${close}, false)`),
      desc(byHandle),
      asc(sql`${h.handle} collate "C"`),
    )
    .limit(MENTIONABLE_MAX)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
  }))
}
