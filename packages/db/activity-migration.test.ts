// Test de la reprise de la dernière visite par la migration 0024 (R11, choix 6 de la session). Un
// compte existant ne doit pas recevoir pour dernière visite l'heure de la migration : il prend la
// plus récente des dates déjà connues (ses sessions, sa lecture du fil, sinon sa création), pour
// qu'un compte abandonné depuis longtemps ne gagne pas 3 ans de plus avant sa suppression.
//
// Même méthode que `hives-email-migration.test.ts` (R10) : une base vide, les migrations jusqu'à
// 0023 (la dernière déployée avant R11), des membres posés en SQL brut, puis 0024, et on lit le
// résultat. Les dates sont relues en texte (`::text`) : `db.execute` ne rend pas des `Date`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Database, defaultMigrationsFolder } from './src/index'
import { createTestPgliteDb } from './src/pglite'

/** La dernière migration déployée avant R11 : l'état de départ de 0024. */
const DEPLOYED = '0023_hives_r10'
const R11 = '0024_compliance_r11'

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

/** Une session de Better Auth, réduite à ce que la base exige ; seule `updated_at` compte ici. */
const addSession = (id: string, userId: string, updatedAt: string) =>
  db.execute(sql`
    insert into session (id, expires_at, token, created_at, updated_at, user_id)
    values (${id}, '2027-01-01 00:00:00', ${`token-${id}`}, '2024-01-01 00:00:00', ${updatedAt}::timestamp, ${userId})
  `)

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // createTestPgliteDb rend une base déjà migrée : on la vide, pour repartir d'avant R11.
  await db.execute(sql.raw('drop schema public cascade'))
  await db.execute(sql.raw('create schema public'))
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
  )
  const cut = journal.entries.findIndex((entry) => entry.tag === DEPLOYED) + 1
  expect(journal.entries[cut]?.tag).toBe(R11)
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  await apply(migrations.slice(0, cut))

  // Sam : deux sessions, la plus récente après sa lecture du fil → la session gagne.
  // Inès : aucune session (toutes expirées et effacées), une lecture du fil → le fil gagne.
  // Max : ni session ni fil → la création du compte.
  // Léa : une vieille session et une lecture du fil plus récente → le fil gagne.
  const members = [
    ['sam', '2024-01-01 08:00:00'],
    ['ines', '2024-02-02 08:00:00'],
    ['max', '2023-05-05 08:00:00'],
    ['lea', '2024-03-03 08:00:00'],
  ] as const
  for (const [id, createdAt] of members) {
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.com`}, true, ${createdAt}::timestamp, ${createdAt}::timestamp)`,
    )
  }
  await addSession('sam-1', 'sam', '2025-01-01 10:00:00')
  await addSession('sam-2', 'sam', '2026-05-01 10:00:00')
  await addSession('lea-1', 'lea', '2025-01-01 10:00:00')
  await db.execute(sql`
    insert into feed_state (member_id, read_at) values
      ('sam', '2026-02-01 10:00:00'),
      ('ines', '2025-06-01 10:00:00'),
      ('lea', '2026-09-09 10:00:00')
  `)
  // Un réglage d'e-mail d'avant R11 : « Découvertes » doit y prendre son défaut.
  await db.execute(sql`insert into email_preference (user_id, weekly_recap) values ('sam', true)`)

  await apply(migrations.slice(cut, cut + 1))
})

afterAll(async () => {
  await close()
})

const activityOf = async (id: string) =>
  (
    await rowsOf<{ last_active_at: string; inactive_notice_at: string | null }>(
      sql`select last_active_at::text, inactive_notice_at::text from "user" where id = ${id}`,
    )
  )[0]

describe('the last activity carried over by migration 0024', () => {
  it('takes the most recent session when it is the latest known date', async () => {
    expect((await activityOf('sam'))?.last_active_at).toBe('2026-05-01 10:00:00')
  })

  it('takes the last reading of the feed when it is more recent than any session', async () => {
    expect((await activityOf('ines'))?.last_active_at).toBe('2025-06-01 10:00:00')
    expect((await activityOf('lea'))?.last_active_at).toBe('2026-09-09 10:00:00')
  })

  it('falls back on the creation of the account, never on the time of the migration', async () => {
    expect((await activityOf('max'))?.last_active_at).toBe('2023-05-05 08:00:00')
  })

  it('leaves the inactivity notice empty for every account', async () => {
    for (const id of ['sam', 'ines', 'max', 'lea']) {
      expect((await activityOf(id))?.inactive_notice_at).toBeNull()
    }
  })

  it('gives « Discoveries: in the recap » to the settings written before R11, and refuses « now »', async () => {
    const [row] = await rowsOf<{ discoveries: string }>(
      sql`select discoveries from email_preference where user_id = 'sam'`,
    )
    expect(row?.discoveries).toBe('digest')
    await expect(
      db.execute(sql`update email_preference set discoveries = 'now' where user_id = 'sam'`),
    ).rejects.toThrow()
  })

  it('refuses an acceptance of the rules without the age declared', async () => {
    await expect(
      db.execute(
        sql`insert into rules_acceptance (user_id, version, age_declared) values ('max', '2026-11-16', false)`,
      ),
    ).rejects.toThrow()
  })
})
