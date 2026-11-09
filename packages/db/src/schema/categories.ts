// Les catégories des projets (R6a les écrivait en dur dans le contrat ; R6b les met en base pour
// qu'un administrateur puisse en créer). La migration 0016 sème les seize de départ ; l'API lit
// cette table (liste, nombres de projets) et vérifie qu'un code existe avant de l'écrire sur un projet.
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const category = pgTable(
  'category',
  {
    // Le code, tiré du nom à la création (« jardinage ») : minuscules, chiffres et tirets, vérifié
    // par le contrat (`CategoryCode`). C'est la clé primaire : `project.primary_category` le cite.
    code: text('code').primaryKey(),
    // Le nom dans chaque langue (30 caractères au plus, règle du contrat). `unique` : deux
    // catégories ne portent pas le même nom exact ; l'API vérifie en plus le nom replié (sans
    // accents ni majuscules), que la base ne sait pas comparer toute seule.
    nameFr: text('name_fr').notNull().unique(),
    nameEn: text('name_en').notNull().unique(),
    // L'icône : une valeur de `CATEGORY_ICON_CHOICES` (contrat), vérifiée par Zod avant l'écriture.
    icon: text('icon').notNull(),
    // L'ordre de la feuille de choix ; « other » est toujours la dernière.
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
    // L'administrateur qui l'a créée ; null pour les seize de départ ou si son compte disparaît.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  // Un index sur l'ordre : la liste de la feuille se lit « order by position » sans tri.
  (t) => [index('category_position_idx').on(t.position)],
)
