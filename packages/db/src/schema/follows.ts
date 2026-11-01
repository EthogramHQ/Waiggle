// Les abonnements (tranche 4) : qui suit quel membre, et qui suit quel projet. Une ligne par
// abonnement ; le nombre d'abonnés se compte, il n'est rangé nulle part.
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { project } from './projects'

/** « follower_id suit le membre member_id ». */
export const memberFollow = pgTable(
  'member_follow',
  {
    // Les deux en onDelete: 'cascade' : supprimer un compte efface à la fois ses abonnements et
    // ses abonnés, et les nombres d'abonnés baissent d'autant, sans rien à faire de plus.
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    // Une clé primaire « composée » : le couple (abonné, membre suivi) est unique. Suivre deux fois
    // la même personne est donc impossible, la base elle-même y veille. Comme tout index, elle sert
    // aussi aux recherches qui commencent par sa première colonne : « qui suit ce membre ? » non,
    // mais « que suit ce membre ? » (le fil, l'export) oui.
    primaryKey({ columns: [t.followerId, t.memberId] }),
    // L'autre sens, « combien de membres suivent celui-ci ? » (sa page), a son propre index.
    index('member_follow_member_idx').on(t.memberId),
    // Une contrainte « check » : une règle que la base vérifie à chaque écriture. L'API refuse
    // déjà qu'on se suive soi-même ; la base le refuse aussi, au cas où le code changerait un jour.
    check('member_follow_not_self', sql`${t.followerId} <> ${t.memberId}`),
  ],
)

/** « follower_id suit le projet project_id ». */
export const projectFollow = pgTable(
  'project_follow',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Un projet supprimé emporte ses abonnements. Un projet devenu privé les garde : ils ne
    // montrent plus rien, et reprennent s'il redevient public.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.projectId] }),
    // Pour compter les abonnés d'un projet (sa page, et la liste des projets de l'export).
    index('project_follow_project_idx').on(t.projectId),
  ],
)

/**
 * « member_id ne veut plus qu'on lui propose dismissed_id » (tranche R4, « Proches à suivre » :
 * le « × » d'une suggestion). L'écarté n'en sait jamais rien : la ligne n'apparaît que dans
 * l'export de celui qui écarte.
 */
export const suggestionDismissal = pgTable(
  'member_suggestion_dismissal',
  {
    // Les deux en onDelete: 'cascade' : un compte supprimé emporte ses écarts et ceux qui le
    // visaient (relecture de sécurité sec-A6).
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dismissedId: text('dismissed_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Le moment du « × », écrit par l'API (horloge que les tests remplacent), pour l'export.
    at: timestamp('at').notNull(),
  },
  (t) => [
    // Écarter deux fois le même membre est impossible ; la clé sert aussi « qui ai-je écarté ? »
    // (les suggestions d'un membre, son export), qui commence par member_id.
    primaryKey({ columns: [t.memberId, t.dismissedId] }),
    // L'autre sens, « qui m'a écarté ? », sert à la suppression d'un compte : sans lui, la cascade
    // lirait toute la table pour trouver les lignes qui le visent.
    index('member_suggestion_dismissal_dismissed_idx').on(t.dismissedId),
  ],
)
