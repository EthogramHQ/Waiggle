// Les ruches (R10) : des groupes de proches. Une ruche, ses membres, ses invitations en attente, et
// les traces gardées pour l'Activité (retiré, animation confiée, ruche supprimée). Le reste se
// calcule à la lecture : « a rejoint » depuis l'entrée d'un membre, une invitation depuis la sienne.
// Les règles (longueurs, limites, qui peut quoi) sont vérifiées par l'API avec @ruche/contracts.
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { moderationDecision } from './moderation'
import { project } from './projects'

// Les douze icônes permises (HIVE_ICONS de @ruche/contracts, que la base ne lit pas : un test de
// l'API compare les deux listes), écrites dans la contrainte comme une liste SQL.
const ICONS_SQL = sql.raw(
  "'house-line', 'heart', 'users-three', 'baby', 'coffee', 'book-open', 'game-controller', 'music-notes', 'rocket-launch', 'leaf', 'camera', 'code'",
)

export const hive = pgTable(
  'hive',
  {
    id: uuid('id').primaryKey(),
    // Le nom, 1 à 40 caractères après `trim` (vérifié par l'API). Vide seulement quand la
    // modération l'a retiré : l'appli écrit alors « Ruche sans nom ». L'ancien nom est gardé dans la
    // décision (`previous_value`), jamais ici.
    name: text('name').notNull(),
    // La décision qui a retiré le nom ; null : le nom est celui choisi. Un nouveau nom la remet à
    // null. 'set null' : la purge des décisions ne bloque pas sur une ruche.
    nameRemovalId: uuid('name_removal_id').references(() => moderationDecision.id, {
      onDelete: 'set null',
    }),
    // Qui a écrit le nom actuel (le créateur, ou l'animateur qui l'a changé) : la décision de
    // retrait vise ce membre (relecture du plan, juridique C4). null si son compte est supprimé.
    nameSetBy: text('name_set_by').references(() => user.id, { onDelete: 'set null' }),
    icon: text('icon').notNull(),
    // L'animateur : null seulement le temps que l'animation passe au membre le plus ancien, quand
    // son compte est supprimé (l'API la passe dans la même transaction, `beforeDelete`).
    animatorId: text('animator_id').references(() => user.id, { onDelete: 'set null' }),
    // Qui peut inviter : 'members' (tous, par défaut) ou 'animator' (seulement l'animateur).
    invitePolicy: text('invite_policy').notNull().default('members'),
    // Le projet épinglé, qui il l'a épinglé et quand ; tout à null : pas d'épingle. Un projet
    // supprimé retire l'épingle ('set null') ; un projet devenu invisible pour la ruche n'est plus
    // rendu, sans effacer la colonne (l'épingle disparaît d'elle-même, à la lecture).
    pinnedProjectId: uuid('pinned_project_id').references((): AnyPgColumn => project.id, {
      onDelete: 'set null',
    }),
    pinnedBy: text('pinned_by').references(() => user.id, { onDelete: 'set null' }),
    pinnedAt: timestamp('pinned_at'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    // Écrites par l'API (horloge que les tests remplacent), comme les autres dates.
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    // Les ruches qu'un membre a créées (la limite de 10).
    index('hive_created_by_idx').on(t.createdBy),
    check('hive_icon_check', sql`${t.icon} in (${ICONS_SQL})`),
    check('hive_invite_policy_check', sql`${t.invitePolicy} in ('members', 'animator')`),
  ],
)

/**
 * Les membres d'une ruche. `invited_by` : qui l'a invité (« Max a rejoint Famille » ne va qu'à lui) ;
 * null pour le créateur, ou si l'inviteur a supprimé son compte. `seen_at` : sa dernière visite de
 * la page de la ruche ou de sa pastille dans le Fil ; les nouveautés se comptent depuis.
 */
export const hiveMember = pgTable(
  'hive_member',
  {
    hiveId: uuid('hive_id')
      .notNull()
      .references(() => hive.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at').notNull(),
    seenAt: timestamp('seen_at'),
  },
  (t) => [
    primaryKey({ columns: [t.hiveId, t.userId] }),
    // Les ruches d'un membre ; « a rejoint » pour un inviteur, des plus récents aux plus anciens.
    index('hive_member_user_idx').on(t.userId),
    index('hive_member_invited_by_idx').on(t.invitedBy, t.joinedAt),
  ],
)

/**
 * Les invitations en attente. Accepter efface la ligne (le membre entre dans `hive_member`).
 * Refuser la garde avec `refused_at` (choix de Louis du 14/11/2026, Q1) : l'invité ne la voit plus,
 * mais la ruche la compte dans ses 50 places et la montre « Invitation envoyée » jusqu'à ses 30
 * jours ; ni nouvelle invitation ni nouvel e-mail avant. Au-delà de 30 jours, elle ne vaut plus
 * (filtrée à la lecture), puis la purge de nuit l'efface.
 */
export const hiveInvitation = pgTable(
  'hive_invitation',
  {
    id: uuid('id').primaryKey(),
    hiveId: uuid('hive_id')
      .notNull()
      .references(() => hive.id, { onDelete: 'cascade' }),
    inviteeId: text('invitee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inviterId: text('inviter_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
    refusedAt: timestamp('refused_at'),
  },
  (t) => [
    // Une seule invitation par ruche et par invité : une invitation expirée mais pas encore purgée
    // est remplacée par la nouvelle (l'API la met à jour).
    uniqueIndex('hive_invitation_hive_invitee_idx').on(t.hiveId, t.inviteeId),
    index('hive_invitation_invitee_idx').on(t.inviteeId, t.createdAt),
    // Les 20 invitations par jour d'un membre.
    index('hive_invitation_inviter_idx').on(t.inviterId, t.createdAt),
  ],
)

/**
 * Les traces gardées pour l'Activité, une par geste : retiré de la ruche (`removed`), animation
 * confiée (`animator`), ruche supprimée (`deleted`). `hive_name` est une copie : la ruche peut
 * disparaître ; la modération la vide quand elle retire ce nom. Effacées après 90 jours.
 */
export const hiveNotice = pgTable(
  'hive_notice',
  {
    id: uuid('id').primaryKey(),
    recipientId: text('recipient_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    hiveId: uuid('hive_id').references(() => hive.id, { onDelete: 'set null' }),
    hiveName: text('hive_name').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // nullsFirst : l'ordre exact de « order by … desc », sinon PostgreSQL n'utilise pas l'index.
    index('hive_notice_recipient_idx').on(t.recipientId, t.createdAt.desc().nullsFirst()),
    // Les copies du nom d'une ruche, à vider quand la modération le retire.
    index('hive_notice_hive_idx').on(t.hiveId),
    check('hive_notice_kind_check', sql`${t.kind} in ('removed', 'animator', 'deleted')`),
  ],
)
