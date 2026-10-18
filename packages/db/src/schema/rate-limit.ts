// Compteurs anti-abus de nos propres routes (/v1/…). Better Auth a sa table à lui pour /api/auth.
// Une ligne par « clé » (par exemple "avatar:<id du membre>") : combien de requêtes depuis le
// début de la fenêtre de temps en cours.
import { bigint, integer, pgTable, text } from 'drizzle-orm/pg-core'

export const apiRateLimit = pgTable('api_rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  // Début de la fenêtre, en millisecondes depuis 1970 (le format de Date.now()).
  windowStart: bigint('window_start', { mode: 'number' }).notNull(),
})
