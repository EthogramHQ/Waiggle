// PGlite : un vrai PostgreSQL compilé pour tourner dans Node, sans serveur à installer.
// On s'en sert pour les tests (base en mémoire, neuve à chaque test) et pour le développement
// local (base enregistrée dans un dossier). Jamais en production.
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { type DatabaseHandle, defaultMigrationsFolder } from './index'
import * as schema from './schema'

/**
 * Ouvre une base PGlite et applique les migrations.
 * Sans dossier : base en mémoire, effacée à la fermeture (idéal pour les tests).
 * Avec un dossier : les données y sont conservées d'un lancement à l'autre.
 */
export const createPgliteDb = async (dataDir?: string): Promise<DatabaseHandle> => {
  const client = new PGlite(dataDir)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: defaultMigrationsFolder })
  return { db, close: () => client.close() }
}
