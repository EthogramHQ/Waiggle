// Les Éclaireuses (R20, docs/scenarios/refonte.md, « R20 — Les Éclaireuses ») : 30 membres qui,
// pendant un mois, envoient leurs retours sur l'appli (un défaut, un endroit confus, une idée, un
// coup de cœur) et répondent aux missions de la semaine. Cinq tables : les Éclaireuses, le mois (une
// seule ligne), les missions, les retours, et les missions faites.
//
// Toutes les dates sont écrites par l'API (new Date()), jamais par la base (pas de DEFAULT now()).
// Les listes fermées (sortes, gravités, statuts…) sont celles du contrat (@ruche/contracts,
// scouts.ts), que la base ne lit pas : les contraintes ci-dessous les redisent en SQL. Les longueurs
// sont comptées par `char_length`, en caractères (un emoji compte pour un), comme l'API et le
// contrat (`[...texte].length`), et non en unités UTF-16.
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

/**
 * Une Éclaireuse : une ligne par membre entré, par le code à l'inscription (`signup`) ou dans ses
 * réglages (`settings`). Pas de colonne sur `user` : cette table appartient à Better Auth. Une
 * Éclaireuse retirée par l'administrateur garde sa ligne (`removed_at`, et le motif qu'on lui a
 * dit) : elle relit « Mes retours », et elle ne peut pas revenir. Sa place, elle, se libère. La ligne
 * suit le compte (`on delete cascade`).
 *
 * Pas d'index de plus que la clé primaire : la table a au plus 30 lignes actives, plus les
 * retirées. Le compte des places (« non retirées ») la lit en entier, ce qui coûte moins qu'un index.
 */
export const scout = pgTable(
  'scout',
  {
    memberId: text('member_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at').notNull(),
    via: text('via').notNull(),
    // Retirée par l'administrateur (un abus) ; null : pas retirée.
    removedAt: timestamp('removed_at'),
    // Le motif du retrait, écrit par l'administrateur et dit à l'Éclaireuse (relecture juridique
    // J1) ; il entre dans son export.
    removalReason: text('removal_reason'),
    // « Afficher la Goutte » (PATCH /v1/me/scout).
    showDrop: boolean('show_drop').notNull().default(true),
  },
  (t) => [
    check('scout_via_check', sql`${t.via} in ('signup', 'settings')`),
    // Un motif seulement pour une Éclaireuse retirée, de 1 à 500 caractères.
    check(
      'scout_removal_check',
      sql`${t.removalReason} is null or (${t.removedAt} is not null and char_length(${t.removalReason}) between 1 and 500)`,
    ),
  ],
)

/**
 * Le mois des Éclaireuses : une seule ligne (`id = 1`, la contrainte refuse toute autre), écrite le
 * jour où l'administrateur le lance. Pas de ligne : pas encore lancé (les Éclaireuses entrent déjà,
 * et ont la Goutte). `ends_at` : minuit de Paris après le 30e jour (`programEndOf` du contrat) ;
 * passé cette heure, le code ne marche plus et les retours s'arrêtent.
 */
export const scoutProgram = pgTable(
  'scout_program',
  {
    id: integer('id').primaryKey(),
    startedAt: timestamp('started_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
  },
  (t) => [
    check('scout_program_single_check', sql`${t.id} = 1`),
    check('scout_program_dates_check', sql`${t.endsAt} > ${t.startedAt}`),
  ],
)

/**
 * Une mission de la semaine, écrite par l'administrateur : au plus trois par semaine (`position` 1 à
 * 3), en français, et en anglais s'il l'a traduite (sinon l'anglais lit le français). Effacée 8 jours
 * après sa semaine par la purge de nuit ; les retours qui y répondaient gardent leur texte.
 */
export const scoutMission = pgTable(
  'scout_mission',
  {
    // Tiré au hasard par l'API (randomUUID).
    id: uuid('id').primaryKey(),
    // Le lundi de la semaine, à Paris (`weekOf` du contrat) ; `mode: 'string'` : « 2026-11-30 ».
    week: date('week', { mode: 'string' }).notNull(),
    position: integer('position').notNull(),
    textFr: text('text_fr').notNull(),
    textEn: text('text_en'),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Une seule mission par place et par semaine. Cet index sert aussi les missions d'une semaine
    // (« where week = … order by position ») et la purge (« where week < … ») : sa première colonne.
    uniqueIndex('scout_mission_week_position_idx').on(t.week, t.position),
    check('scout_mission_position_check', sql`${t.position} between 1 and 3`),
    check('scout_mission_text_fr_check', sql`char_length(${t.textFr}) between 1 and 200`),
    check(
      'scout_mission_text_en_check',
      sql`${t.textEn} is null or char_length(${t.textEn}) between 1 and 200`,
    ),
  ],
)

/**
 * Un retour d'Éclaireuse. La gravité est obligatoire pour un défaut (`bug`) et un endroit confus
 * (`confusing`), absente pour une idée et un coup de cœur. Le contexte (l'écran, l'appareil, la
 * largeur, la version, la langue, le thème) n'existe que si elle l'a joint : tout à null sinon. Le
 * texte s'affiche toujours en texte brut. Il n'est vu que de son autrice et de l'administrateur.
 */
export const scoutReport = pgTable(
  'scout_report',
  {
    id: uuid('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    severity: text('severity'),
    text: text('text').notNull(),
    // La mission à laquelle il répond ; 'set null' : une mission effacée laisse le retour.
    missionId: uuid('mission_id').references(() => scoutMission.id, { onDelete: 'set null' }),
    // Le contexte joint : l'adresse de l'écran sans ses paramètres (coupée par l'API à « ? » ou
    // « # »), la plateforme, la largeur en points, la version de l'appli (le commit), la langue et
    // le thème de l'appli. Jamais lu dans les en-têtes de la demande (relecture juridique J5).
    screen: text('screen'),
    platform: text('platform'),
    width: integer('width'),
    appVersion: text('app_version'),
    language: text('language'),
    scheme: text('scheme'),
    // La capture jointe, réencodée (`scouts/<uuid>.webp`) ; null : sans capture.
    mediaKey: text('media_key'),
    // Où en est le retour : envoyé, lu, prévu, corrigé (définitif), mis de côté.
    status: text('status').notNull().default('sent'),
    // Le mot de l'administrateur à l'Éclaireuse quand c'est corrigé (elle le lit) ; sa note privée
    // (elle ne la lit pas dans l'appli, mais elle figure dans son export, relecture juridique J2).
    fixedNote: text('fixed_note'),
    adminNote: text('admin_note'),
    fixedAt: timestamp('fixed_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    // « Mes retours » : les siens, les plus récents d'abord ; aussi le compte de ses retours dans la
    // page de tri, et le quota du jour.
    index('scout_report_member_idx').on(t.memberId, t.createdAt.desc()),
    // La page de tri filtrée par statut, les plus récents d'abord.
    index('scout_report_status_idx').on(t.status, t.createdAt.desc()),
    // La page de tri sans filtre, page par page (curseur date puis identifiant) : PostgreSQL lit
    // l'index dans l'ordre et s'arrête à la page, sans trier toute la table.
    index('scout_report_created_idx').on(t.createdAt.desc(), t.id.desc()),
    // Une mission effacée remet `mission_id` à null dans ses retours (`set null`) : sans cet index,
    // PostgreSQL lirait toute la table. Partiel : seuls les retours liés à une mission y entrent.
    index('scout_report_mission_idx').on(t.missionId).where(sql`${t.missionId} is not null`),
    check('scout_report_kind_check', sql`${t.kind} in ('bug', 'confusing', 'idea', 'love')`),
    check(
      'scout_report_severity_check',
      sql`(${t.kind} in ('bug', 'confusing') and ${t.severity} in ('minor', 'annoying', 'blocking'))
        or (${t.kind} in ('idea', 'love') and ${t.severity} is null)`,
    ),
    check('scout_report_text_check', sql`char_length(${t.text}) between 1 and 2000`),
    check('scout_report_screen_check', sql`${t.screen} is null or char_length(${t.screen}) <= 200`),
    check(
      'scout_report_platform_check',
      sql`${t.platform} is null or ${t.platform} in ('web', 'ios', 'android')`,
    ),
    check('scout_report_width_check', sql`${t.width} is null or ${t.width} between 0 and 10000`),
    check(
      'scout_report_app_version_check',
      sql`${t.appVersion} is null or char_length(${t.appVersion}) <= 64`,
    ),
    check(
      'scout_report_language_check',
      sql`${t.language} is null or ${t.language} in ('fr', 'en')`,
    ),
    check('scout_report_scheme_check', sql`${t.scheme} is null or ${t.scheme} in ('day', 'night')`),
    check(
      'scout_report_status_check',
      sql`${t.status} in ('sent', 'read', 'planned', 'fixed', 'parked')`,
    ),
    check(
      'scout_report_fixed_note_check',
      sql`${t.fixedNote} is null or char_length(${t.fixedNote}) <= 300`,
    ),
    check(
      'scout_report_admin_note_check',
      sql`${t.adminNote} is null or char_length(${t.adminNote}) <= 2000`,
    ),
  ],
)

/**
 * Une mission faite par une Éclaireuse : son premier retour qui y répond. Elle part avec le retour
 * (supprimer le retour rend la mission à faire) et avec la mission ; le pollen de la mission, lui,
 * reste payé une fois (la clé de la chose est la mission, `pollen_entry_once_idx`).
 */
export const scoutMissionDone = pgTable(
  'scout_mission_done',
  {
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    missionId: uuid('mission_id')
      .notNull()
      .references(() => scoutMission.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => scoutReport.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Une seule fois par Éclaireuse et par mission. La clé sert aussi « ses missions faites »
    // (« where member_id = … »), sa première colonne.
    primaryKey({ columns: [t.memberId, t.missionId] }),
    // Les deux effacements en cascade (une mission, un retour) retrouvent leurs lignes par ces
    // index, sans lire toute la table.
    index('scout_mission_done_mission_idx').on(t.missionId),
    index('scout_mission_done_report_idx').on(t.reportId),
  ],
)
