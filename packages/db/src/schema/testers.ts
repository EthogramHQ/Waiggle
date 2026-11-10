// Les testeurs d'un projet (R7a) : « member_id teste le projet project_id ». Un testeur est prévenu
// de chaque mise à jour publiée après son inscription.
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { project } from './projects'

export const projectTester = pgTable(
  'project_tester',
  {
    // Un texte, comme user.id (Better Auth) ; supprimer le compte efface l'inscription.
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Supprimer le projet emporte ses testeurs.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // Écrit par l'API (new Date()) : la source des notifications le compare à la date des mises à jour.
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // La clé primaire garantit une inscription par membre et par projet.
    primaryKey({ columns: [t.memberId, t.projectId] }),
    // Pour compter et lister les testeurs d'un projet (la clé primaire commence par le membre).
    index('project_tester_project_idx').on(t.projectId),
  ],
)
