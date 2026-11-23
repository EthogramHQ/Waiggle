// La gamification (R19, docs/scenarios/refonte.md, « R19 — La gamification ») : le grand livre du
// pollen, les sceaux, le miel, les défis de la semaine (perso et de ruche), les réglages du jeu et
// les avis de l'Activité. Le niveau, le titre, les semaines butinées et les classements ne sont
// rangés nulle part : l'API les calcule à la lecture depuis le grand livre.
//
// Les règles chiffrées (montants, plafonds, listes de gestes, de défis, de sceaux, de décorations)
// vivent dans @ruche/contracts (game.ts), que la base ne lit pas : les contraintes ci-dessous
// redisent les listes fermées en SQL, et un test de l'API compare les deux (game.award.test.ts).
// Toutes les tables suivent le compte : un compte supprimé emporte son jeu (`on delete cascade`) ;
// seule la colonne `counterpart_id` du grand livre, l'autre membre d'un geste, est remise à nul.
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { hive } from './hives'
import { project } from './projects'

// Les listes fermées du contrat, écrites comme des listes SQL (`in (…)`). `sql.raw` : du texte de
// notre code, jamais une valeur venue d'un client.
const LEDGER_GESTURES_SQL = sql.raw(
  "'feedback', 'feedback_settled', 'tester', 'comment', 'publish', 'update', 'reaction', 'follow', 'receive_feedback', 'receive_tester', 'receive_comment', 'receive_reaction', 'hive_created', 'invitation_accepted', 'invitation_joined', 'profile_photo', 'profile_bio', 'profile_tool', 'challenge'",
)
const FAMILIES_SQL = sql.raw("'forager', 'builder', 'keeper', 'dancer'")
const POLLEN_SOURCE_KINDS_SQL = sql.raw(
  "'reaction', 'comment', 'tester', 'tester_message', 'project', 'update', 'member', 'hive', 'invitation', 'profile', 'personal_challenge'",
)
const HONEY_REASONS_SQL = sql.raw("'week', 'challenge', 'hive_challenge', 'gift', 'decoration'")
const PERSONAL_CHALLENGES_SQL = sql.raw("'feedback', 'update', 'test', 'comment_3', 'react_5'")
const HIVE_CHALLENGES_SQL = sql.raw(
  "'feedback_5', 'updates_3', 'tested_3', 'reactions_10', 'comments_5'",
)
const DECORATION_TINTS_SQL = sql.raw("'honey', 'amber', 'pollen'")
const DECORATION_PATTERNS_SQL = sql.raw("'smooth', 'waffle', 'striped', 'dotted'")
const GAME_NOTICE_KINDS_SQL = sql.raw("'intro', 'level', 'seal', 'hive_challenge', 'honey_gift'")

/**
 * Le grand livre du pollen : une ligne par geste payé (« Max a gagné 2 pollen en réagissant au
 * projet de Léa »), et une par réception (« Léa a reçu 1 pollen »). Le total d'un membre est la
 * somme de ses lignes non révoquées. Seul `apps/api/src/game/award.ts` y écrit (test statique) :
 * plafonds, verrou et comptes d'exemple ne peuvent pas être oubliés ailleurs.
 */
export const pollenEntry = pgTable(
  'pollen_entry',
  {
    // Écrit par l'API (randomUUID) ; il départage deux entrées de la même milliseconde.
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Le geste (`LedgerGesture` du contrat) et sa famille, recopiée à l'écriture : le pollen d'un
    // défi réussi (`challenge`) prend la famille du geste du défi, qu'on ne retrouverait pas sinon.
    gesture: text('gesture').notNull(),
    family: text('family').notNull(),
    amount: integer('amount').notNull(),
    // Ce qui a rapporté (une réaction, un commentaire, un projet…) et son identifiant (uuid d'un
    // contenu, ou identifiant d'un membre, d'où le texte). Sans clé étrangère : supprimer son
    // commentaire garde le pollen gagné (« défaire ne retire rien », scénario). La modération
    // retrouve par ces deux colonnes les entrées d'un contenu retiré.
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    // « La chose » payée une seule fois : `<projet>:<sorte>` pour une réaction, `<fil>:<jour>` pour
    // un retour… Écrite par la route du geste ; l'index unique ci-dessous fait le reste.
    sourceKey: text('source_key').notNull(),
    // L'autre membre du geste (l'auteur du projet pour qui agit, qui agit pour l'auteur) ; null si
    // le geste n'en a pas. 'set null' : un compte supprimé n'emporte pas le pollen des autres. La
    // purge de nuit le remet aussi à nul après la semaine suivante (relecture juridique J3).
    counterpartId: text('counterpart_id').references(() => user.id, { onDelete: 'set null' }),
    // Le projet où le geste a eu lieu (réaction, commentaire, retour, mise à jour, publication) :
    // un projet retiré par la modération révoque la publication et ce qu'il a fait recevoir à son
    // auteur. Sans clé étrangère, comme la source.
    projectId: uuid('project_id'),
    // Le jour et la semaine (son lundi) de Paris, écrits par l'API (`dayOf`, `weekOf` du contrat) :
    // les plafonds se comptent par jour, les classements et les semaines butinées par semaine.
    // `mode: 'string'` : Drizzle rend la date telle quelle, « 2026-11-23 », sans fuseau.
    day: date('day', { mode: 'string' }).notNull(),
    week: date('week', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at').notNull(),
    // La modération a retiré le contenu qui a rapporté : l'entrée ne compte plus, sans être
    // effacée (rétablir le contenu la rend). null : elle compte.
    revokedAt: timestamp('revoked_at'),
    // Vrai pour les entrées du rattrapage (migration 0030) : elles comptent dans le niveau, mais
    // pas dans les semaines butinées (les séries partent de zéro au lancement, relecture S5).
    backfill: boolean('backfill').notNull().default(false),
  },
  (t) => [
    // Le même geste sur la même chose ne paie qu'une fois, même défait puis refait : l'API écrit
    // par « insert … on conflict do nothing », et une ligne déjà là ne rapporte rien.
    uniqueIndex('pollen_entry_once_idx').on(t.memberId, t.gesture, t.sourceKey),
    // Les plafonds du jour : « les entrées de ce membre aujourd'hui » (quelques dizaines au plus).
    index('pollen_entry_member_day_idx').on(t.memberId, t.day),
    // « Ma récolte », les semaines butinées et les classements : « les entrées de ce membre cette
    // semaine » (ou depuis toujours, par le même index lu en entier pour ce membre).
    index('pollen_entry_member_week_idx').on(t.memberId, t.week),
    // La modération : « les entrées rapportées par ce contenu ».
    index('pollen_entry_source_idx').on(t.sourceKind, t.sourceId),
    // Un projet retiré : « les entrées nées sur ce projet ». Partiel (`where`) : seules les lignes
    // qui ont un projet entrent dans l'index, le profil, les suivis de membres et les ruches non.
    index('pollen_entry_project_idx').on(t.projectId).where(sql`${t.projectId} is not null`),
    // Un compte supprimé remet son identifiant à nul chez les autres (`set null`) : sans cet index,
    // PostgreSQL lirait toute la table à chaque suppression.
    index('pollen_entry_counterpart_idx')
      .on(t.counterpartId)
      .where(sql`${t.counterpartId} is not null`),
    // La purge de nuit (J3) : « les entrées des semaines passées qui ont encore un autre membre ».
    index('pollen_entry_counterpart_week_idx')
      .on(t.week)
      .where(sql`${t.counterpartId} is not null`),
    check('pollen_entry_gesture_check', sql`${t.gesture} in (${LEDGER_GESTURES_SQL})`),
    check('pollen_entry_family_check', sql`${t.family} in (${FAMILIES_SQL})`),
    check('pollen_entry_source_kind_check', sql`${t.sourceKind} in (${POLLEN_SOURCE_KINDS_SQL})`),
    check('pollen_entry_amount_check', sql`${t.amount} > 0`),
  ],
)

/**
 * Les sceaux gagnés : une ligne par sceau et par membre. Un sceau gagné reste, même si le contenu
 * qui l'a fait gagner est retiré ensuite (choix 8 du plan). Le code est celui du contrat (`SEALS`),
 * un palier (`first_project`) ou une catégorie (`cooking`) : une catégorie créée plus tard ajoute
 * un sceau possible, d'où l'absence de liste fermée ici.
 */
export const seal = pgTable(
  'seal',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    earnedAt: timestamp('earned_at').notNull(),
  },
  // La clé (membre, sceau) : chacun n'est gagné qu'une fois, et elle sert à lire les sceaux d'un
  // membre (« where member_id = … »), sa première colonne.
  (t) => [primaryKey({ columns: [t.memberId, t.code] })],
)

/**
 * Le miel : les crédits (semaine butinée, défi perso, défi de ruche) et les débits (miel offert,
 * décoration achetée), montant signé. Le solde est la somme. `source_key` dit ce qui a bougé le
 * solde, une fois par membre : `week:<lundi>`, `challenge:<lundi>`, `hive:<ruche>:<lundi>`,
 * `gift:<projet>` (une seule offre par projet), `decoration:tint:amber`…
 */
export const honeyEntry = pgTable(
  'honey_entry',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    sourceKey: text('source_key').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Une seule fois par membre et par chose : « insert … on conflict do nothing » ne crédite pas
    // deux fois la même semaine, et une seconde offre au même projet se voit (409 honey_already).
    // Le solde (« where member_id = … ») lit aussi cet index, par sa première colonne.
    uniqueIndex('honey_entry_once_idx').on(t.memberId, t.sourceKey),
    check('honey_entry_reason_check', sql`${t.reason} in (${HONEY_REASONS_SQL})`),
    // Un crédit est positif, un débit négatif ; jamais zéro (une décoration gratuite n'écrit rien).
    check(
      'honey_entry_amount_check',
      sql`(${t.reason} in ('week', 'challenge', 'hive_challenge') and ${t.amount} > 0)
        or (${t.reason} in ('gift', 'decoration') and ${t.amount} < 0)`,
    ),
  ],
)

/**
 * Le défi perso d'une semaine : tiré à la première lecture de « Ma récolte » de la semaine
 * (déterministe : `challengeFor` du contrat), trois proposés, un choisi. `chosen` : le code choisi,
 * `none` (« Pas cette semaine », qui se défait en choisissant), ou null (pas encore choisi). Un
 * défi choisi ne change plus. Purgé après la semaine suivante ; son miel reste (relecture J2).
 */
export const personalChallenge = pgTable(
  'personal_challenge',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    week: date('week', { mode: 'string' }).notNull(),
    // Un tableau de texte PostgreSQL (`text[]`), dans l'ordre du tirage.
    offered: text('offered').array().notNull(),
    chosen: text('chosen'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Un défi par membre et par semaine ; la création à la lecture passe par « on conflict do
    // nothing » (deux lectures simultanées n'en tirent qu'un).
    primaryKey({ columns: [t.memberId, t.week] }),
    // La purge de nuit efface « les semaines passées » de tous les membres.
    index('personal_challenge_week_idx').on(t.week),
    // `cardinality` : le nombre d'éléments du tableau ; `<@` : « tous ses éléments sont dans ».
    check(
      'personal_challenge_offered_check',
      sql`cardinality(${t.offered}) = 3 and ${t.offered} <@ array[${PERSONAL_CHALLENGES_SQL}]::text[]`,
    ),
    check(
      'personal_challenge_chosen_check',
      sql`${t.chosen} is null or ${t.chosen} = 'none' or ${t.chosen} = any(${t.offered})`,
    ),
  ],
)

/**
 * Le défi de ruche d'une semaine, pour une ruche de 3 membres au moins : tiré à la première
 * lecture de la page de la ruche (`challengeFor(hive, week, HIVE_CHALLENGES)[0]`). La cible est
 * recopiée du contrat à la création : un défi en cours ne change pas si la liste change.
 */
export const hiveChallenge = pgTable(
  'hive_challenge',
  {
    hiveId: uuid('hive_id')
      .notNull()
      .references(() => hive.id, { onDelete: 'cascade' }),
    week: date('week', { mode: 'string' }).notNull(),
    code: text('code').notNull(),
    target: integer('target').notNull(),
    // Réussi : posé une fois, par « update … where completed_at is null returning » (relecture S1).
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.hiveId, t.week] }),
    index('hive_challenge_week_idx').on(t.week),
    check('hive_challenge_code_check', sql`${t.code} in (${HIVE_CHALLENGES_SQL})`),
    check('hive_challenge_target_check', sql`${t.target} > 0`),
  ],
)

/**
 * Les réglages du jeu d'un membre. Pas de ligne : les valeurs par défaut (titre au féminin, selon
 * ses gestes, dans les classements, « Ma récolte » allumée, jamais décoré, niveau 1 vu). La ligne
 * naît au premier réglage ou au premier achat.
 */
export const memberGame = pgTable(
  'member_game',
  {
    memberId: text('member_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    // `f` (Butineuse) ou `m` (Butineur).
    titleForm: text('title_form').notNull().default('f'),
    // La famille épinglée comme titre ; null : selon ses gestes des 28 derniers jours.
    pinnedFamily: text('pinned_family'),
    inRankings: boolean('in_rankings').notNull().default(true),
    harvestNotices: boolean('harvest_notices').notNull().default(true),
    // La décoration choisie (teinte et motif ensemble) ; les deux à null : jamais décoré.
    decorationTint: text('decoration_tint'),
    decorationPattern: text('decoration_pattern'),
    // Le dernier niveau dont la cire a coulé à l'écran (PATCH /v1/me/game `levelSeen`).
    levelSeen: integer('level_seen').notNull().default(1),
  },
  (t) => [
    check('member_game_title_form_check', sql`${t.titleForm} in ('f', 'm')`),
    check(
      'member_game_pinned_family_check',
      sql`${t.pinnedFamily} is null or ${t.pinnedFamily} in (${FAMILIES_SQL})`,
    ),
    check(
      'member_game_decoration_check',
      sql`(${t.decorationTint} is null and ${t.decorationPattern} is null)
        or (${t.decorationTint} in (${DECORATION_TINTS_SQL}) and ${t.decorationPattern} in (${DECORATION_PATTERNS_SQL}))`,
    ),
    check('member_game_level_seen_check', sql`${t.levelSeen} > 0`),
  ],
)

/**
 * Les avis du jeu dans l'Activité (choix 10 du plan) : l'introduction (écrite une fois par le
 * rattrapage, relecture J1), un niveau atteint, un sceau gagné, un défi de ruche réussi, du miel
 * reçu sur un projet. Les identifiants vivent dans des colonnes à clé étrangère, jamais dans du
 * JSON (relecture S3) : un compte, un projet ou une ruche supprimés emportent leurs avis. Jamais
 * d'e-mail ; purgés après 90 jours.
 */
export const gameNotice = pgTable(
  'game_notice',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // `level` : le niveau atteint.
    level: integer('level'),
    // `seal` : le code du sceau ; `hive_challenge` : le code du défi.
    code: text('code'),
    // `hive_challenge` : le miel crédité à ce membre (0 s'il n'y a pas participé).
    honey: integer('honey'),
    // `honey_gift` : qui a offert, et à quel projet. Le nom se lit à l'affichage, et un blocage
    // entre les deux le cache (relecture juridique B1).
    actorId: text('actor_id').references(() => user.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'cascade' }),
    // `hive_challenge` : la ruche ; son nom se lit à l'affichage (relecture J2).
    hiveId: uuid('hive_id').references(() => hive.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // L'Activité d'un membre : « ses avis, les plus récents d'abord ».
    index('game_notice_member_idx').on(t.memberId, t.createdAt.desc()),
    // Un compte supprimé emporte les avis où il offrait du miel : sans index, une lecture de toute
    // la table à chaque suppression.
    index('game_notice_actor_idx').on(t.actorId).where(sql`${t.actorId} is not null`),
    check('game_notice_kind_check', sql`${t.kind} in (${GAME_NOTICE_KINDS_SQL})`),
    // Ce que chaque sorte d'avis porte, et rien de plus.
    check(
      'game_notice_payload_check',
      sql`(${t.kind} = 'intro')
        or (${t.kind} = 'level' and ${t.level} is not null)
        or (${t.kind} = 'seal' and ${t.code} is not null)
        or (${t.kind} = 'hive_challenge' and ${t.hiveId} is not null and ${t.code} is not null and ${t.honey} is not null)
        or (${t.kind} = 'honey_gift' and ${t.actorId} is not null and ${t.projectId} is not null)`,
    ),
  ],
)
