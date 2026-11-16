// Tests de la brique des comptes d'exemples (R12b, accounts/example.ts) : l'expression SQL lit bien
// le compte de la ligne, même dans un `select` sur une seule table, où Drizzle écrit les colonnes
// sans le nom de leur table ; et le drapeau n'ajoute le champ que pour un compte d'exemples.
import { schema } from '@ruche/db'
import { createTestPgliteDb } from '@ruche/db/pglite'
import { asc } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { isExampleAccountSql, withExampleFlag } from './example'

const closers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

const NOW = new Date('2026-06-14T08:00:00.000Z')
const account = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.com`,
  emailVerified: true,
  createdAt: NOW,
  updatedAt: NOW,
})

describe('isExampleAccountSql', () => {
  it('flags only the marked account, in a select on a single table', async () => {
    const { db, close } = await createTestPgliteDb()
    closers.push(close)
    await db.insert(schema.user).values([account('bot'), account('lea')])
    await db.insert(schema.exampleAccount).values({ userId: 'bot', markedAt: NOW })

    // Une seule table, sans jointure : le cas où une colonne mal écrite (« "id" » ou « "user_id" »
    // sans table) rendrait la condition constante.
    const rows = await db
      .select({ id: schema.user.id, example: isExampleAccountSql(schema.user.id) })
      .from(schema.user)
      .orderBy(asc(schema.user.id))
    expect(rows).toEqual([
      { id: 'bot', example: true },
      { id: 'lea', example: false },
    ])

    // La même chose depuis une table dont la colonne porte le même nom (`user_id`) que celle
    // d'example_account.
    await db.insert(schema.profile).values([{ userId: 'bot' }, { userId: 'lea' }])
    const profiles = await db
      .select({
        id: schema.profile.userId,
        example: isExampleAccountSql(schema.profile.userId),
      })
      .from(schema.profile)
      .orderBy(asc(schema.profile.userId))
    expect(profiles).toEqual([
      { id: 'bot', example: true },
      { id: 'lea', example: false },
    ])
  })
})

describe('withExampleFlag', () => {
  it('adds `example: true` for an example account only, and never `false`', () => {
    const author = { id: 'a', name: 'Léa' }
    expect(withExampleFlag(author, true)).toEqual({ id: 'a', name: 'Léa', example: true })
    for (const flag of [false, null, undefined]) {
      expect(withExampleFlag(author, flag)).not.toHaveProperty('example')
    }
  })
})
