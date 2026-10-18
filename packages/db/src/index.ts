// @ruche/db : accès à la base PostgreSQL avec Drizzle.
// Drizzle est un « ORM » léger : on écrit les requêtes en TypeScript (db.select().from(user)…),
// il les traduit en SQL et vérifie les types des colonnes au passage.
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'
import * as schema from './schema'

export { schema }

/** Une base Ruche, quel que soit le moteur derrière (vrai PostgreSQL ou PGlite). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

/** Une base ouverte, et la fonction pour la refermer proprement. */
export type DatabaseHandle = { db: Database; close: () => Promise<void> }

/** Dossier des migrations SQL générées par drizzle-kit (packages/db/migrations). */
export const defaultMigrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

/**
 * Se connecte à un vrai serveur PostgreSQL et applique les migrations qui manquent.
 * Une migration est un fichier SQL qui fait évoluer la structure de la base (ajouter une table…).
 * Drizzle note en base celles déjà appliquées : relancer ne refait rien.
 */
export const connectPostgres = async (
  url: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<DatabaseHandle> => {
  // Un « pool » garde quelques connexions ouvertes et les prête aux requêtes : plus rapide
  // que d'ouvrir une connexion à chaque fois.
  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })
  await migrate(db, { migrationsFolder })
  return { db, close: () => pool.end() }
}
