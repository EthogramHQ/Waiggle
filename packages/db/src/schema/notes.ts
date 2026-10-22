// Les notes d'un projet (tranche 4b) : de courtes nouvelles publiées par son auteur (« v2 : mode
// hors ligne »). Elles forment le journal du projet et arrivent dans le fil de ses abonnés.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { moderationDecision } from './moderation'
import { project } from './projects'

export const projectNote = pgTable(
  'project_note',
  {
    // Tiré au hasard par le serveur, comme celui d'un projet : il apparaît dans l'adresse de la
    // suppression (/v1/projects/{id}/notes/{noteId}).
    id: uuid('id').primaryKey(),
    // onDelete: 'cascade' : supprimer le projet efface ses notes. Et comme le projet disparaît
    // lui-même avec le compte de son auteur, supprimer un compte efface aussi toutes ses notes.
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    // Le texte tel que tapé (bords retirés) : du texte brut, que l'appli affiche sans l'interpréter.
    body: text('body').notNull(),
    // Pas de valeur par défaut (ni now(), ni defaultNow()) : c'est l'API qui écrit la date, avec
    // l'horloge de JavaScript. Une seule horloge pour tout ce qui date les fils (voir published_at
    // du projet) : les dates se comparent entre elles, et les tests peuvent la remplacer.
    createdAt: timestamp('created_at').notNull(),
    // Retiré par la modération (tranche 6d) : la note n'est plus visible que de son auteur, avec
    // l'explication de la décision. Null : pas retiré. Rétablir remet null. Indépendant de la
    // visibilité choisie par l'auteur : il ne peut pas « dé-retirer » en changeant un réglage.
    removedAt: timestamp('removed_at'),
    // La décision de retrait, pour retrouver son fondement et son explication. onDelete:
    // 'set null' : l'API ne purge pas une décision tant que son contenu reste retiré.
    removalId: uuid('removal_id').references(() => moderationDecision.id, { onDelete: 'set null' }),
  },
  (t) => [
    // L'index du journal et du fil : pour un projet, ses notes de la plus récente à la plus
    // ancienne, puis par identifiant (pour départager deux notes du même instant). PostgreSQL y
    // trouve directement les 20 dernières notes d'un projet, ou les 21 qui suivent un curseur,
    // sans trier. nullsFirst : l'ordre exact de « order by … desc » (voir l'index du fil dans
    // projects.ts) ; sans lui, l'index ne serait pas rangé dans l'ordre que demandent les requêtes.
    index('project_note_project_created_idx').on(
      t.projectId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
)
