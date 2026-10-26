// La modération (tranche 7a) : les administrateurs, les signalements des membres et les décisions
// prises. Qui peut lire quoi est décidé par l'API (apps/api/src/routes/moderation.ts) : la base
// garde les faits. Le retrait lui-même est noté sur le contenu (removed_at sur project,
// project_note et project_comment), pour que chaque lecture puisse l'exclure sans jointure.
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
    // 'remove' | 'restore' | 'dismiss', et depuis 7c 'suspend' | 'lift' (cible : le membre).
    action: text('action').notNull(),
    // Le fondement d'un retrait : 'illegal' (la loi) ou 'rules' (les règles de l'appli) ; null pour
    // rétablir ou classer.
    ground: text('ground'),
    // L'explication montrée à l'auteur du contenu ; obligatoire pour un retrait (l'API le vérifie).
    explanation: text('explanation'),
    // L'administrateur qui a décidé. onDelete: 'set null' : la décision reste si son compte part.
    adminId: text('admin_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
    // Tranche 7c. Le membre visé : l'auteur du contenu, ou le membre lui-même (profil, suspension,
    // levée). Écrit à chaque décision, pour l'historique filtré par membre et le rappel des
    // décisions passées sur une carte de la file. onDelete: 'set null' : la décision reste quand
    // son compte part, sans son nom.
    targetMemberId: text('target_member_id').references(() => user.id, { onDelete: 'set null' }),
    // La durée d'une suspension : '7d' | '30d' | 'indefinite' (SuspensionDuration) ; null sinon.
    // Gardée sur la décision elle-même (relecture de sécurité S20) : l'historique se lit sans la
    // ligne de la suspension, qui peut avoir été purgée.
    duration: text('duration'),
    // Vrai pour une suspension partie d'un signalement (relecture juridique J2) ; faux sinon.
    // « default false » remplit les décisions d'avant 7c, qui n'étaient pas des suspensions.
    afterReport: boolean('after_report').notNull().default(false),
    // La raison d'une levée : 'early' | 'error' (LiftCause) ; null sinon. Une suspension levée
    // pour erreur ne compte plus dans le rappel des décisions passées (J10).
    liftCause: text('lift_cause'),
  },
  (t) => [
    // L'historique d'une cible (la dernière décision, le rétablissement) et la purge.
    index('moderation_decision_target_idx').on(t.targetKind, t.targetId, t.createdAt),
    // L'onglet « Historique » : toutes les décisions, de la plus récente à la plus ancienne, et la
    // page suivante reprise au curseur (date, id). `.desc().nullsFirst()` : l'ordre exact de
    // « order by created_at desc, id desc », que PostgreSQL lit alors tel quel.
    index('moderation_decision_created_idx').on(
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // Le même historique filtré par membre (?member=), et le rappel d'une carte (ses retraits de
    // l'année). Il sert aussi la base quand le compte part (« set null » cherche ses décisions).
    index('moderation_decision_member_idx').on(
      t.targetMemberId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // Les garde-fous (apps/api/src/moderation/guard.ts) : les retraits d'un administrateur dans
    // l'heure, ses suspensions du jour. Et « set null » au départ de son compte.
    index('moderation_decision_admin_idx').on(t.adminId, t.createdAt),
  ],
)

/**
 * La suspension d'un compte (tranche 7c) : le membre passe en lecture seule, pour 7 jours, 30 jours
 * ou jusqu'à la levée. Une suspension est **active** si elle n'est pas levée (`lifted_at` null) et
 * que sa fin n'est pas passée (`ends_at` null, ou plus tard que maintenant). Aucune tâche planifiée
 * ne la clôt à sa fin : la fin se lit à chaque requête ; l'API ne note `lifted_at = ends_at` qu'au
 * moment d'en poser une nouvelle.
 */
export const accountSuspension = pgTable(
  'account_suspension',
  {
    id: uuid('id').primaryKey(),
    // Le membre suspendu. onDelete: 'set null' (relecture juridique J1) : partir n'efface pas la
    // preuve. La ligne reste un an après sa fin, sans le compte, comme les décisions.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    // La décision « suspend » qui l'a posée, et la décision « lift » qui l'a levée. 'set null' :
    // la purge d'une décision ne fait pas tomber la suspension (la purge les protège, J7).
    decisionId: uuid('decision_id').references(() => moderationDecision.id, {
      onDelete: 'set null',
    }),
    startsAt: timestamp('starts_at').notNull(),
    // La fin prévue, à la seconde : la pose plus 7 ou 30 jours ; null : sans fin.
    endsAt: timestamp('ends_at'),
    // La fin réelle : la levée, ou la fin prévue quand l'API clôt une suspension échue ; null tant
    // qu'elle n'est pas close. Une levée se reconnaît à lift_decision_id (J6).
    liftedAt: timestamp('lifted_at'),
    liftDecisionId: uuid('lift_decision_id').references(() => moderationDecision.id, {
      onDelete: 'set null',
    }),
    // Vrai si la suspension a suivi un signalement (J2), comme sur sa décision.
    afterReport: boolean('after_report').notNull().default(false),
  },
  (t) => [
    // Une seule suspension non close par membre : un index « unique partiel », qui ne range que
    // les lignes où lifted_at est null et y refuse un doublon. Deux suspensions posées en même
    // temps : la seconde échoue (erreur 23505), et l'API répond « déjà décidé ». Il sert aussi la
    // lecture « suspendu en ce moment ? ».
    uniqueIndex('account_suspension_open_idx').on(t.userId).where(sql`${t.liftedAt} is null`),
    // Toutes les suspensions d'un membre (le rappel de la file, l'export), et « set null » au départ.
    index('account_suspension_user_idx').on(t.userId, t.startsAt),
    // La purge des décisions vérifie qu'aucune suspension gardée ne les cite (J7).
    index('account_suspension_decision_idx').on(t.decisionId),
    index('account_suspension_lift_decision_idx').on(t.liftDecisionId),
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
    // La copie de la cible, lue en base au moment du signalement (jamais envoyée par l'appli) : un
    // tableau de champs, chacun nommé comme au registre des entrées (tranche 7b,
    // apps/api/src/moderation/inputs.ts). `jsonb` : du JSON rangé par PostgreSQL. Une image n'y est
    // gardée que par sa clé de stockage, jamais copiée. Les copies d'avant 7b sont un champ `text`.
    snapshot: jsonb('snapshot').$type<{ field: string; value: string }[]>().notNull(),
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
    // Un seul signalement ouvert par membre et par cible (le refaire répond « déjà signalé »). Index
    // partiel (tranche 7b) : une fois le précédent clos, la même personne peut signaler de nouveau
    // un contenu modifié depuis ; l'API compare les copies.
    uniqueIndex('content_report_reporter_target_idx')
      .on(t.reporterId, t.targetKind, t.targetId)
      .where(sql`${t.status} = 'open'`),
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
