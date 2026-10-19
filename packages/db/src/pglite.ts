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

// Le « modèle » des tests : une base migrée une seule fois, puis copiée pour chaque test.
// Fabriquer une base neuve coûte 1 à 2 secondes (PostgreSQL prépare ses fichiers), la charger
// depuis une copie en mémoire 0,3 seconde. On garde la promesse plutôt que le résultat : deux
// tests qui démarrent en même temps attendent le même modèle au lieu d'en fabriquer deux.
let template: Promise<Blob | File> | undefined

const migratedTemplate = async () => {
  const client = new PGlite()
  await migrate(drizzle(client, { schema }), { migrationsFolder: defaultMigrationsFolder })
  // dumpDataDir : une archive de tous les fichiers de la base ; 'none' = sans compression, plus
  // rapide à relire.
  const dump = await client.dumpDataDir('none')
  await client.close()
  return dump
}

/**
 * Une base de test en mémoire, neuve et déjà migrée : une copie du modèle, fabriqué au premier
 * appel du processus. Chaque test a la sienne, aussi isolée qu'avec createPgliteDb().
 */
export const createTestPgliteDb = async (): Promise<DatabaseHandle> => {
  template ??= migratedTemplate()
  const client = new PGlite({ loadDataDir: await template })
  const db = drizzle(client, { schema })
  return { db, close: () => client.close() }
}
