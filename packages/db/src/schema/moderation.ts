// La modération (tranche 6d) : les administrateurs, les signalements des membres et les décisions
// prises. Qui peut lire quoi est décidé par l'API (apps/api/src/routes/moderation.ts) : la base
// garde les faits. Le retrait lui-même est noté sur le contenu (removed_at sur project,
// project_note et project_comment), pour que chaque lecture puisse l'exclure sans jointure.
import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

/**
 * Les administrateurs. Une table à part plutôt qu'une colonne de `user` : la table `user` appartient
 * à Better Auth, dont certaines routes (/update-user…) écrivent dedans ; aucune ne connaît
 * celle-ci. Le rôle se donne et se retire par un script du dépôt (infra/grant-admin.sh), jamais par
 * une route de l'API.
 */
export const adminMember = pgTable('admin_member', {
  // La clé primaire est aussi la clé étrangère : un membre est administrateur une fois au plus.
  // onDelete: 'cascade' : la suppression du compte emporte son rôle.
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at').notNull(),
  // Révoqué : la ligne reste, pour garder l'historique des administrateurs plus longtemps que les
  // journaux du serveur, qui tournent vite. Null : administrateur en fonction.
  revokedAt: timestamp('revoked_at'),
  // Le dernier e-mail d'alerte « signalements en attente » envoyé à cet administrateur (au plus un
  // par heure) ; null : jamais.
  alertedAt: timestamp('alerted_at'),
})

/**
 * Une décision de modération sur une cible : retirer, rétablir, ou classer sans suite. Une décision
 * clôt tous les signalements ouverts de la cible. Les décisions forment la trace demandée par la
 * liste de conformité (n°6) : qui, quand, quoi, pourquoi.
 */
export const moderationDecision = pgTable(
  'moderation_decision',
  {
    id: uuid('id').primaryKey(),
    // 'project' | 'note' | 'comment' | 'member' (ReportTargetKind dans @ruche/contracts).
    targetKind: text('target_kind').notNull(),
    // L'identifiant de la cible : un uuid (projet, note, commentaire) ou l'id d'un membre (texte).
    targetId: text('target_id').notNull(),
    // 'remove' | 'restore' | 'dismiss'.
    action: text('action').notNull(),
    // Le fondement d'un retrait : 'illegal' (la loi) ou 'rules' (les règles de l'appli) ; null pour
    // rétablir ou classer.
    ground: text('ground'),
    // L'explication montrée à l'auteur du contenu ; obligatoire pour un retrait (l'API le vérifie).
    explanation: text('explanation'),
    // L'administrateur qui a décidé. onDelete: 'set null' : la décision reste si son compte part.
    adminId: text('admin_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // L'historique d'une cible (la dernière décision, le rétablissement) et la purge.
    index('moderation_decision_target_idx').on(t.targetKind, t.targetId, t.createdAt),
  ],
)

/**
 * Un signalement : un membre signale une cible, avec un motif. Le texte visé est copié
 * (`snapshot`) au moment du signalement, pour que son auteur ne puisse pas le changer avant la
 * décision. Le nom de la personne qui signale n'est jamais montré à l'auteur du contenu.
 */
export const contentReport = pgTable(
  'content_report',
  {
    id: uuid('id').primaryKey(),
    // La personne qui signale. onDelete: 'set null' : si elle supprime son compte, le signalement
    // reste, sans son nom.
    reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
    // 'project' | 'note' | 'comment' | 'member'.
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    // Le projet de la cible (projet, note, commentaire), pour le lien « Voir » ; null pour un profil.
    // Pas de clé étrangère : un signalement survit au projet supprimé, le temps d'être classé.
    projectId: uuid('project_id'),
    // L'auteur du contenu visé (ou le membre visé). onDelete: 'set null' : à la suppression de son
    // compte, l'API classe ses signalements encore ouverts (apps/api/src/auth/auth.ts, afterDelete).
    targetAuthorId: text('target_author_id').references(() => user.id, { onDelete: 'set null' }),
    // ReportReason dans @ruche/contracts.
    reason: text('reason').notNull(),
    // La précision libre de la personne qui signale (500 caractères au plus) ; null : aucune.
    details: text('details'),
    // Le texte visé, lu en base au moment du signalement (jamais envoyé par l'appli).
    snapshot: text('snapshot').notNull(),
    // 'open' | 'removed' | 'dismissed' | 'void' (sans objet : la cible a disparu).
    status: text('status').notNull(),
    createdAt: timestamp('created_at').notNull(),
    decidedAt: timestamp('decided_at'),
    // La décision qui l'a clos ; null tant qu'il est ouvert, ou s'il a été classé sans objet.
    decisionId: uuid('decision_id').references(() => moderationDecision.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    // Un seul signalement par membre et par cible (le refaire répond « déjà signalé »).
    uniqueIndex('content_report_reporter_target_idx').on(t.reporterId, t.targetKind, t.targetId),
    // La file : les signalements ouverts, du plus ancien au plus récent. Index partiel : les
    // signalements clos, bien plus nombreux avec le temps, n'y sont pas.
    index('content_report_open_idx').on(t.createdAt).where(sql`${t.status} = 'open'`),
    // Clore d'un coup les signalements d'une cible, et trouver ceux d'un auteur parti.
    index('content_report_target_idx').on(t.targetKind, t.targetId),
    index('content_report_target_author_idx').on(t.targetAuthorId),
    // L'export et la notification « signalement traité » : les signalements d'un membre.
    index('content_report_reporter_idx').on(t.reporterId),
  ],
)
