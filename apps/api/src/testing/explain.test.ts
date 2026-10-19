// Vérifie l'outil de mise au point explainQueries : il voit les requêtes faites dans une
// transaction (ce qu'un simple enveloppement de db.$client.query manquait), et rend la base intacte.
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './context'
import { explainQueries } from './explain'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

describe('explainQueries', () => {
  it('explains the queries of a transaction too, without replaying the writes', async () => {
    const explained = await explainQueries(ctx.db, async () => {
      await ctx.db.select().from(schema.user)
      await ctx.db.transaction(async (tx) => {
        await tx.insert(schema.user).values({ id: 'u1', name: 'Léa', email: 'lea@example.com' })
        await tx.select().from(schema.user).where(eq(schema.user.id, 'u1'))
      })
    })

    expect(explained.map(({ sql }) => sql.split(' ')[0])).toEqual(['select', 'insert', 'select'])
    // Une lecture est mesurée (EXPLAIN ANALYZE : « actual time ») ; une écriture ne l'est pas.
    expect(explained[0]?.plan).toMatch(/Scan on "?user"?.*actual time/)
    expect(explained[1]?.plan).toMatch(/^Insert on "?user"?/)
    expect(explained[1]?.plan).not.toMatch(/actual time/)
    expect(explained[2]?.params).toEqual(['u1'])
    // L'insertion n'a pas été rejouée : un seul membre.
    expect(await ctx.db.select({ id: schema.user.id }).from(schema.user)).toEqual([{ id: 'u1' }])
  })
})
