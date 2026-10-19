// Les réactions aux projets (tranche 5) : une ligne par réaction posée, « tel membre a réagi
// « Bravo » à tel projet ». Les nombres par type se comptent, ils ne sont rangés nulle part ; et
// la liste de qui a réagi n'est lue que pour l'export de ses propres données.
import { sql } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { project } from './projects'

export const projectReaction = pgTable(
  'project_reaction',
  {
    // onDelete: 'cascade' des deux côtés : un projet supprimé emporte ses réactions, et un compte
    // supprimé emporte celles qu'il a posées (les nombres baissent d'autant, sans rien à faire de
    // plus). Un projet devenu privé les garde : elles reviennent s'il redevient public.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Le type, en anglais (amazing, inspiring, useful, funny, bravo) : la liste vient de
    // @ruche/contracts (REACTION_KINDS), la contrainte ci-dessous la redit pour la base.
    kind: text('kind').notNull(),
    // Pas de valeur par défaut : c'est l'API qui écrit la date, avec l'horloge de JavaScript
    // (comme pour les notes), pour que les tests puissent la remplacer.
    createdAt: timestamp('created_at').notNull(),
  },
  (t) => [
    // La clé primaire (projet, membre, type) : une seule réaction de chaque type par membre et par
    // projet, c'est la base qui y veille. Elle range les lignes par projet d'abord : c'est elle
    // qui sert à compter les réactions d'un projet (« where project_id = … group by kind ») et à
    // retrouver celles du membre qui regarde.
    primaryKey({ columns: [t.projectId, t.memberId, t.kind] }),
    // L'autre sens, « toutes les réactions de ce membre » : pour l'export de ses données, et pour
    // que la suppression de son compte les retrouve sans lire toute la table.
    index('project_reaction_member_idx').on(t.memberId),
    // L'API refuse déjà un type inconnu (404) ; la base le refuse aussi, au cas où le code
    // changerait un jour. « in (…) » : la valeur doit être l'une de celles de la liste.
    check(
      'project_reaction_kind',
      sql`${t.kind} in ('amazing', 'inspiring', 'useful', 'funny', 'bravo')`,
    ),
  ],
)
