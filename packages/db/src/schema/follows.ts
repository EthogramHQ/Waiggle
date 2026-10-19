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
