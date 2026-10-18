// Vérifie que les migrations s'appliquent sur une base vide et créent les tables attendues.
// PGlite est un vrai PostgreSQL qui tourne en mémoire, dans le processus de test :
// pas besoin d'installer ni de lancer un serveur de base de données.
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createPgliteDb } from './pglite'
import { user } from './schema'

describe('migrations', () => {
  it('create the authentication tables on an empty database', async () => {
    const { db, close } = await createPgliteDb()

    // `sql` permet d'écrire une requête SQL brute, ici pour lister les tables existantes.
    // Le résultat brut n'est pas typé : on précise sa forme nous-mêmes.
    const result = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    )) as unknown as { rows: { table_name: string }[] }
    const tables = result.rows.map((row) => row.table_name)

    expect(tables).toEqual(
      expect.arrayContaining(['user', 'session', 'account', 'verification', 'rate_limit']),
    )
    await close()
  })

  it('gives every new member French as the default language', async () => {
    const { db, close } = await createPgliteDb()

    // Requêtes écrites avec Drizzle : insert(table).values(...) puis select().from(table).
    await db.insert(user).values({ id: 'u1', name: 'Léa', email: 'lea@example.com' })
    const [created] = await db.select({ language: user.language }).from(user)

    expect(created?.language).toBe('fr')
    await close()
  })
})
