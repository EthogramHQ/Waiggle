// Test de la reprise des réglages d'e-mail par la migration 0021 (R8). Scénario :
// docs/scenarios/refonte.md, « L'écran Notifications des réglages » : « Un e-mail quand on me
// mentionne ou me répond » activé devient « Réponses et mentions : Tout de suite », coupé devient
// « Dans le récap » ; le récap reste activé ou coupé. Et la date du dernier e-mail de mentions
// devient celle du dernier e-mail « tout de suite », pour que l'intervalle d'une heure continue.
//
// On rejoue la production : une base vide, les migrations jusqu'à 0020 (la dernière déployée avant
// R8), des réglages de 6c posés en SQL brut, puis 0021, et on lit ce qu'elle en a fait.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Database, defaultMigrationsFolder } from './src/index'
import { createTestPgliteDb } from './src/pglite'

/** La dernière migration déployée avant R8 : l'état de départ de 0021. */
const DEPLOYED = '0020_tester_media_description'
const R8 = '0021_notifications_r8'

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

// Les quatre membres de la production avant R8 : l'option des mentions activée (avec un e-mail
// déjà parti), activée sans envoi, coupée (récap coupé aussi), et un membre sans ligne de réglages.
const MENTION_SENT_AT = '2026-11-10 08:15:30.123'

beforeAll(async () => {
  ;({ db, close } = await createTestPgliteDb())
  // createTestPgliteDb rend une base déjà migrée : on la vide, pour repartir d'avant R8.
  await db.execute(sql.raw('drop schema public cascade'))
  await db.execute(sql.raw('create schema public'))
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(join(defaultMigrationsFolder, 'meta', '_journal.json'), 'utf8'),
  )
  const cut = journal.entries.findIndex((entry) => entry.tag === DEPLOYED) + 1
  expect(journal.entries[cut]?.tag).toBe(R8)
  const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
  await apply(migrations.slice(0, cut))

  for (const id of ['lea', 'max', 'ines', 'sam']) {
    await db.execute(
      sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.com`}, true, now(), now())`,
    )
  }
  await db.execute(sql`
    insert into email_preference (user_id, weekly_recap, mention_emails, mention_sent_at) values
      ('lea', true, true, ${MENTION_SENT_AT}::timestamp),
      ('max', true, true, null),
      ('ines', false, false, null)
  `)

  await apply(migrations.slice(cut, cut + 1))
})

afterAll(async () => {
  await close()
})

type Row = {
  user_id: string
  weekly_recap: boolean
  mention_emails: boolean
  email_reactions: string
  email_comments: string
  email_replies: string
  email_follows: string
  email_updates: string
  email_testers: string
  mention_sent_at: string | null
  instant_sent_at: string | null
}

const rowOf = async (id: string) =>
  (
    await rowsOf<Row>(sql`
      select user_id, weekly_recap, mention_emails, email_reactions, email_comments, email_replies,
        email_follows, email_updates, email_testers,
        to_char(mention_sent_at, 'YYYY-MM-DD HH24:MI:SS.MS') as mention_sent_at,
        to_char(instant_sent_at, 'YYYY-MM-DD HH24:MI:SS.MS') as instant_sent_at
      from email_preference where user_id = ${id}
    `)
  )[0]

/** Chaque type « Dans le récap », sauf ceux donnés. */
const digestAll = {
  email_reactions: 'digest',
  email_comments: 'digest',
  email_replies: 'digest',
  email_follows: 'digest',
  email_updates: 'digest',
  email_testers: 'digest',
}

describe('the e-mail settings carried over by migration 0021', () => {
  it('turns the mention switch on into « replies: now », and keeps the date of the last e-mail', async () => {
    expect(await rowOf('lea')).toEqual({
      user_id: 'lea',
      weekly_recap: true,
      mention_emails: true,
      ...digestAll,
      email_replies: 'now',
      mention_sent_at: MENTION_SENT_AT,
      instant_sent_at: MENTION_SENT_AT,
    })
    expect(await rowOf('max')).toMatchObject({
      email_replies: 'now',
      mention_sent_at: null,
      instant_sent_at: null,
    })
  })

  it('leaves every type in the recap for a switch that was off, and keeps the recap as it was', async () => {
    expect(await rowOf('ines')).toEqual({
      user_id: 'ines',
      weekly_recap: false,
      mention_emails: false,
      ...digestAll,
      mention_sent_at: null,
      instant_sent_at: null,
    })
  })

  it('creates no row for a member who never changed anything', async () => {
    expect(await rowOf('sam')).toBeUndefined()
    expect(await rowsOf(sql`select user_id from email_preference order by user_id`)).toEqual([
      { user_id: 'ines' },
      { user_id: 'lea' },
      { user_id: 'max' },
    ])
  })
})
