// Le coin des testeurs d'un projet (R7b) : les appels de l'auteur, les fils privés entre l'auteur et
// chaque testeur (retours et réponses), les images jointes, et les membres que l'auteur a retirés.
// Toutes les dates sont écrites par l'API (new Date()), jamais par la base (pas de DEFAULT now()).
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { moderationDecision } from './moderation'
import { project } from './projects'
import { projectUpdate } from './updates'

/**
 * Les membres retirés par l'auteur : ils ne peuvent plus s'inscrire comme testeurs du projet.
 * La clé primaire garantit une seule ligne par membre et par projet.
 */
export const projectTesterRemoval = pgTable(
  'project_tester_removal',
  {
    // Supprimer le projet, ou le compte du membre, efface la ligne.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // Un texte, comme user.id (Better Auth).
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.memberId] })],
)

/** Un appel à tester : un texte que l'auteur publie dans le coin (avec, au plus, quelques photos). */
export const testerCall = pgTable(
  'tester_call',
  {
    // Tiré au hasard par le serveur : il apparaît dans les adresses.
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at').notNull(),
    // Retiré par la modération : plus visible que de son auteur. Null : pas retiré.
    removedAt: timestamp('removed_at'),
    // La décision de retrait ; 'set null' : la purge d'une décision ne bloque pas.
    removalId: uuid('removal_id').references(() => moderationDecision.id, { onDelete: 'set null' }),
  },
  (t) => [
    // Les appels d'un projet du plus récent au plus ancien, puis par identifiant : PostgreSQL lit
    // l'index depuis le début (ou le curseur) et s'arrête à la page, sans trier. nullsFirst : l'ordre
    // exact de « order by … desc » (sinon la migration pose NULLS LAST, que le tri n'utilise pas).
    index('tester_call_project_created_idx').on(
      t.projectId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
)

/**
 * Un fil : la conversation privée entre l'auteur d'un projet et un testeur. Créé au premier
 * message ; il survit au départ du testeur (l'auteur garde l'historique, en lecture seule).
 */
export const testerThread = pgTable(
  'tester_thread',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    testerId: text('tester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    // Jusqu'où chacun a lu : un message plus récent que cette date est « non lu » pour lui.
    // Null : n'a rien lu encore.
    authorReadAt: timestamp('author_read_at'),
    testerReadAt: timestamp('tester_read_at'),
  },
  (t) => [
    // Un seul fil par testeur et par projet. Elle sert aussi à lister les fils d'un projet.
    primaryKey({ columns: [t.projectId, t.testerId] }),
    // Les fils d'un testeur (sa liste, l'effacement de son compte).
    index('tester_thread_tester_idx').on(t.testerId),
  ],
)

/** Un message d'un fil : un retour du testeur (avec son issue) ou une réponse (du texte seul). */
export const testerMessage = pgTable(
  'tester_message',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id').notNull(),
    testerId: text('tester_id').notNull(),
    // Qui a écrit : l'auteur du projet ou le testeur.
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 'feedback' (un retour) ou 'reply' (une réponse).
    kind: text('kind').notNull(),
    // 'yes' | 'partly' | 'no' : obligatoire pour un retour, null pour une réponse.
    outcome: text('outcome'),
    // 'phone' | 'computer' | 'tablet' : l'appareil du test, facultatif.
    device: text('device'),
    // Facultatif pour un retour (« Ça a marché ? » suffit), requis par l'API pour une réponse.
    text: text('text'),
    createdAt: timestamp('created_at').notNull(),
    // Un retour réglé : la date, et la mise à jour qui l'a réglé (null : réglé à la main).
    settledAt: timestamp('settled_at'),
    settledUpdateId: uuid('settled_update_id').references(() => projectUpdate.id, {
      onDelete: 'set null',
    }),
    removedAt: timestamp('removed_at'),
    removalId: uuid('removal_id').references(() => moderationDecision.id, { onDelete: 'set null' }),
  },
  (t) => [
    // Le message appartient à un fil : supprimer le fil (donc le projet ou le testeur) l'emporte.
    foreignKey({
      columns: [t.projectId, t.testerId],
      foreignColumns: [testerThread.projectId, testerThread.testerId],
      name: 'tester_message_thread_fk',
    }).onDelete('cascade'),
    // Les messages d'un fil du plus récent au plus ancien (page, curseur, dernier message).
    index('tester_message_thread_created_idx').on(
      t.projectId,
      t.testerId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // Index partiel : seulement les retours encore ouverts (ni réglés, ni retirés). Il sert à les
    // compter par projet (le badge « à traiter ») et reste petit.
    index('tester_message_open_feedback_idx')
      .on(t.projectId)
      .where(sql`${t.kind} = 'feedback' and ${t.settledAt} is null and ${t.removedAt} is null`),
    // Les valeurs fermées : la base refuse ce que le contrat n'admet pas.
    check('tester_message_kind_check', sql`${t.kind} in ('feedback', 'reply')`),
    check(
      'tester_message_outcome_check',
      sql`(${t.kind} = 'feedback' and ${t.outcome} in ('yes', 'partly', 'no')) or (${t.kind} = 'reply' and ${t.outcome} is null)`,
    ),
    check(
      'tester_message_device_check',
      sql`${t.device} is null or ${t.device} in ('phone', 'computer', 'tablet')`,
    ),
  ],
)

/**
 * Une image du coin : la photo d'un appel ou la capture d'un retour. Le fichier est dans le
 * stockage (clé « testers/<uuid>.webp ») ; ici, sa clé et ce qu'on en sait. « En attente » tant
 * qu'elle n'est rattachée ni à un appel ni à un message : la purge de nuit l'efface après 24 h.
 */
export const testerMedia = pgTable(
  'tester_media',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // Qui a envoyé l'image (l'auteur pour un appel, le testeur pour une capture).
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 'call' (photo d'appel) ou 'capture' (capture d'un retour).
    kind: text('kind').notNull(),
    // Le rattachement : l'un des deux, ou aucun (en attente). Supprimer l'appel ou le message
    // efface ses lignes (l'API efface les fichiers avant, comme pour project_media).
    callId: uuid('call_id').references(() => testerCall.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => testerMessage.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull().unique(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    thumbhash: text('thumbhash').notNull(),
    // La description lue à voix haute d'une photo d'appel (écrite par l'auteur quand il lance
    // l'appel, relecture juridique J8) ; null pour une capture et pour une photo sans description.
    description: text('description'),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Les images d'un appel, et celles d'un message (les lire avec eux, les compter).
    index('tester_media_call_idx').on(t.callId),
    index('tester_media_message_idx').on(t.messageId),
    // Les plafonds de stockage (100 photos d'appel par projet, 100 captures par fil) comptent les
    // images d'un projet, d'un membre et d'une sorte, rattachées ou en attente : sans cet index, la
    // table entière serait lue à chaque envoi.
    index('tester_media_project_owner_idx').on(t.projectId, t.ownerId, t.kind),
    // Index partiel : seulement les images en attente. Il sert au plafond par membre et par projet
    // et à la purge de nuit, et reste minuscule.
    index('tester_media_pending_idx')
      .on(t.projectId, t.ownerId)
      .where(sql`${t.callId} is null and ${t.messageId} is null`),
    check('tester_media_kind_check', sql`${t.kind} in ('call', 'capture')`),
    // Jamais les deux rattachements à la fois.
    check('tester_media_one_target_check', sql`${t.callId} is null or ${t.messageId} is null`),
  ],
)
