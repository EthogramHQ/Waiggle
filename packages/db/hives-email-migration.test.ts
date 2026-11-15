// Test de la reprise des réglages d'e-mail par la migration 0023 (R10, relecture juridique). Le
// type neuf « Ruches » vaut « Tout de suite » par défaut (scénario des ruches), mais un membre qui
// avait déjà baissé ses e-mails (Réglages, lien « Ne plus recevoir », « Tout couper ») ne doit pas
// en recevoir un de plus sans l'avoir choisi : son refus déjà exprimé est repris.
//
// Même méthode que `email-migration.test.ts` (R8) : une base vide, les migrations jusqu'à 0022 (la
// dernière déployée avant R10), des réglages posés en SQL brut, puis 0023, et on lit le résultat.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Database, defaultMigrationsFolder } from './src/index'
import { createTestPgliteDb } from './src/pglite'

/** La dernière migration déployée avant R10 : l'état de départ de 0023. */
const DEPLOYED = '0022_moderation_parts_r9'
const R10 = '0023_hives_r10'

let db: Database
let close: () => Promise<void>

/** Le résultat d'une requête SQL brute ; on précise nous-mêmes la forme des lignes. */
const rowsOf = async <T>(query: ReturnType<typeof sql>) =>
  ((await db.execute(query)) as unknown as { rows: T[] }).rows

/** Applique des migrations instruction par instruction, comme le fait Drizzle. */
const apply = async (migrations: { sql: string[] }[]) => {
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      if (statement.trim()) await db.execute(sql.raw(statement))
    }
  }
}

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // createTestPgliteDb rend une base déjà migrée : on la vide, pour repartir d'avant R10.
  await db.execute(sql.raw('drop schema public cascade'))
  await db.execute(sql.raw('create schema public'))
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
  )
  const cut = journal.entries.findIndex((entry) => entry.tag === DEPLOYED) + 1
  expect(journal.entries[cut]?.tag).toBe(R10)
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  await apply(migrations.slice(0, cut))

  for (const id of ['sam', 'ines', 'max', 'lea', 'noa']) {
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.com`}, true, now(), now())`,
    )
  }
  // Sam : ligne créée par la prise du récap, jamais touchée (updated_at nul).
  // Inès : tout coupé (« Tout couper », ou chaque type baissé à « Jamais »).
  // Max : un type « Dans le récap », aucun « Tout de suite » (lien « Ne plus recevoir »).
  // Léa : a choisi les réponses « Tout de suite » : elle garde « Ruches » tout de suite.
  // Noa : ses six types à « Jamais » mais le récap gardé : la règle regarde les six types.
  await db.execute(sql`
    insert into email_preference (user_id, weekly_recap, email_reactions, email_comments,
      email_replies, email_follows, email_updates, email_testers, updated_at) values
      ('sam', true, 'digest', 'digest', 'digest', 'digest', 'digest', 'digest', null),
      ('ines', false, 'never', 'never', 'never', 'never', 'never', 'never', now()),
      ('max', true, 'never', 'never', 'digest', 'never', 'never', 'never', now()),
      ('lea', true, 'digest', 'digest', 'now', 'digest', 'digest', 'digest', now()),
      ('noa', true, 'never', 'never', 'never', 'never', 'never', 'never', now())
  `)

  await apply(migrations.slice(cut, cut + 1))
})

afterAll(async () => {
  await close()
})

const hivesOf = async (id: string) =>
  (
    await rowsOf<{ email_hives: string }>(
      sql`select email_hives from email_preference where user_id = ${id}`,
    )
  )[0]?.email_hives

describe('the e-mail settings carried over by migration 0023', () => {
  it('gives « Hives: now » to a member who never touched the settings', async () => {
    expect(await hivesOf('sam')).toBe('now')
  })

  it('keeps a member who turned everything off at « never » for the hives too', async () => {
    expect(await hivesOf('ines')).toBe('never')
    expect(await hivesOf('noa')).toBe('never')
  })

  it('puts the hives in the recap for a member who lowered the e-mails without choosing « now »', async () => {
    expect(await hivesOf('max')).toBe('digest')
  })

  it('leaves « now » to a member who chose a type « now »', async () => {
    expect(await hivesOf('lea')).toBe('now')
  })
})
