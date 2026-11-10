// Les mises à jour d'un projet (R7a) : ce qui remplace les notes du Journal. Une mise à jour porte
// des lignes classées par famille (nouveau, corrigé, amélioré), un titre et une version facultatifs,
// et peut montrer un « avant / après » ; ses photos sont des lignes de project_media (slot 'update').
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { moderationDecision } from './moderation'
import { project } from './projects'

export const projectUpdate = pgTable(
  'project_update',
  {
    // Tiré au hasard par le serveur : il apparaît dans l'adresse de la suppression.
    id: uuid('id').primaryKey(),
    // onDelete: 'cascade' : supprimer le projet (ou le compte de son auteur) efface ses mises à jour.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    title: text('title'), // null : pas de titre
    version: text('version'), // null : pas de version (« v1.2 » tel que tapé)
    // Les lignes : un tableau [{ family, text }], validé par Zod avant l'écriture. `jsonb` : du JSON
    // rangé par PostgreSQL, relu avec méfiance par l'API (elle le re-valide à la lecture).
    lines: jsonb('lines').$type<{ family: string; text: string }[]>().notNull(),
    // Vrai : les deux premières photos sont « Avant » (position 0) et « Après » (position 1).
    beforeAfter: boolean('before_after').default(false).notNull(),
    // Pas de valeur par défaut : c'est l'API qui écrit la date, avec l'horloge de JavaScript (la
    // même que pour tous les fils, et que les tests peuvent remplacer).
    createdAt: timestamp('created_at').notNull(),
    // Retirée par la modération : plus visible que de son auteur, avec l'explication. Null : pas
    // retirée. Indépendant de la visibilité du projet.
    removedAt: timestamp('removed_at'),
    // La décision de retrait ; 'set null' : l'API ne purge pas une décision tant que son contenu
    // reste retiré.
    removalId: uuid('removal_id').references(() => moderationDecision.id, { onDelete: 'set null' }),
  },
  (t) => [
    // Les mises à jour d'un projet de la plus récente à la plus ancienne, puis par identifiant :
    // PostgreSQL lit l'index depuis le début (ou depuis le curseur) et s'arrête à la 21e, sans
    // trier. nullsFirst : l'ordre exact de « order by … desc » (voir project_public_published_idx).
    index('project_update_project_created_idx').on(
      t.projectId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
)
