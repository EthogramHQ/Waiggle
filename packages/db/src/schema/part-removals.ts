// Les retraits d'une partie d'un contenu (R9, 7d) : la modération retire seule la 2e photo d'un
// projet, sa description ou la bio d'un profil, et le reste du contenu reste affiché. Une ligne par
// partie retirée **en cours** : rétablie, remplacée ou supprimée par son auteur, la ligne s'efface ;
// la décision, elle, reste dans `moderation_decision` (l'historique). Fichier à part : la table cite
// les projets, les mises à jour, le coin et les photos, qui citent eux-mêmes `moderation_decision` ;
// la mettre dans moderation.ts ferait une boucle d'imports.
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './auth'
import { moderationDecision } from './moderation'
import { project, projectMedia } from './projects'
import { testerCall, testerMedia, testerMessage } from './tester-corner'
import { projectUpdate } from './updates'

/**
 * La valeur retirée, sortie de sa colonne (relecture de sécurité P1 : plus sûr que de la cacher à
 * chaque lecture) : un texte (description, lien de la démo, bio, description d'une photo), une liste
 * (outils, outils favoris, prompts), ou la clé de stockage d'une photo de profil (« withheld/… »),
 * que seul l'auteur relit. Null pour une photo de galerie, de mise à jour ou du coin : sa ligne
 * reste, marquée par son `removal_id`.
 */
export type HiddenPartValue = { text: string } | { items: string[] } | { storageKey: string }

// L'uuid « zéro », pour comparer des photos absentes dans un index (null n'est égal à rien).
const NO_MEDIA = sql`'00000000-0000-0000-0000-000000000000'::uuid`

export const contentPartRemoval = pgTable(
  'content_part_removal',
  {
    id: uuid('id').primaryKey(),
    // La décision « remove » qui l'a posée. onDelete: 'restrict' (relecture de sécurité P2) : la
    // purge d'un an ne peut pas effacer une décision tant qu'une de ses parties reste retirée.
    removalId: uuid('removal_id')
      .notNull()
      .references(() => moderationDecision.id, { onDelete: 'restrict' }),
    // L'auteur du contenu (le membre lui-même pour son profil) : ses retraits se lisent par lui, et
    // partent avec son compte (cascade).
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // La sorte de contenu, comme `target_kind` d'un signalement : 'project' | 'update' | 'member' |
    // 'call' | 'message' (un commentaire se retire en entier).
    objectKind: text('object_kind').notNull(),
    // Le contenu lui-même, une seule de ces colonnes selon la sorte (aucune pour un profil) : la
    // ligne suit son contenu, et s'efface avec lui (cascade ; relecture juridique P1).
    projectId: uuid('project_id').references(() => project.id, { onDelete: 'cascade' }),
    updateId: uuid('update_id').references(() => projectUpdate.id, { onDelete: 'cascade' }),
    callId: uuid('call_id').references(() => testerCall.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => testerMessage.id, { onDelete: 'cascade' }),
    // La partie, nommée comme `ReportPartField` dans @ruche/contracts.
    field: text('field').notNull(),
    // La photo visée par une couverture, une photo ou la description d'une photo : une photo du
    // projet ou d'une mise à jour (`project_media`), ou une image du coin (`tester_media`).
    // Supprimer la photo efface la ligne (cascade) : « Supprimer » fait disparaître la mention.
    projectMediaId: uuid('project_media_id').references(() => projectMedia.id, {
      onDelete: 'cascade',
    }),
    testerMediaId: uuid('tester_media_id').references(() => testerMedia.id, {
      onDelete: 'cascade',
    }),
    hiddenValue: jsonb('hidden_value').$type<HiddenPartValue>(),
    // Écrite par l'API (new Date()), jamais par la base.
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // Une photo n'est retirée qu'une fois, qu'elle ait été signalée comme couverture ou comme photo
    // (relecture de sécurité P6).
    uniqueIndex('content_part_removal_project_media_idx')
      .on(t.projectMediaId)
      .where(sql`${t.field} in ('cover', 'photo')`),
    uniqueIndex('content_part_removal_tester_media_idx')
      .on(t.testerMediaId)
      .where(sql`${t.field} = 'photo'`),
    // Toute autre partie : une seule ligne par contenu, champ et photo. `coalesce` rend la première
    // valeur non nulle : l'identifiant du contenu (ou du membre pour un profil), et l'uuid zéro
    // quand aucune photo n'est visée.
    uniqueIndex('content_part_removal_part_idx')
      .on(
        t.objectKind,
        sql`coalesce(${t.projectId}::text, ${t.updateId}::text, ${t.callId}::text, ${t.messageId}::text, ${t.authorId})`,
        t.field,
        sql`coalesce(${t.projectMediaId}, ${t.testerMediaId}, ${NO_MEDIA})`,
      )
      .where(sql`${t.field} not in ('cover', 'photo')`),
    // Les parties retirées d'un auteur (sa page, son export, la fiche de la modération).
    index('content_part_removal_author_idx').on(t.authorId),
    // La purge des décisions vérifie qu'aucune partie retirée ne les cite.
    index('content_part_removal_removal_idx').on(t.removalId),
    check(
      'content_part_removal_object_check',
      sql`(${t.objectKind} = 'project' and ${t.projectId} is not null and ${t.updateId} is null and ${t.callId} is null and ${t.messageId} is null)
        or (${t.objectKind} = 'update' and ${t.updateId} is not null and ${t.projectId} is null and ${t.callId} is null and ${t.messageId} is null)
        or (${t.objectKind} = 'call' and ${t.callId} is not null and ${t.projectId} is null and ${t.updateId} is null and ${t.messageId} is null)
        or (${t.objectKind} = 'message' and ${t.messageId} is not null and ${t.projectId} is null and ${t.updateId} is null and ${t.callId} is null)
        or (${t.objectKind} = 'member' and ${t.projectId} is null and ${t.updateId} is null and ${t.callId} is null and ${t.messageId} is null)`,
    ),
    check(
      'content_part_removal_field_check',
      sql`${t.field} in ('description', 'tools', 'demoUrl', 'cover', 'photo', 'photoDescription', 'prompt', 'name', 'handle', 'bio', 'favoriteTools', 'avatar')`,
    ),
    // Une photo est visée si et seulement si la partie en est une, et jamais deux à la fois.
    check(
      'content_part_removal_media_check',
      sql`(${t.field} in ('cover', 'photo', 'photoDescription')) = (num_nonnulls(${t.projectMediaId}, ${t.testerMediaId}) = 1)
        and num_nonnulls(${t.projectMediaId}, ${t.testerMediaId}) <= 1`,
    ),
  ],
)
