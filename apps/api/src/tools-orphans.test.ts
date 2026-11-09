// Un « Autre » ne survit pas au compte qui le citait seul (tranche R6b, décision 5, sec-A5) : la
// suppression du compte efface ses lignes `project_tool` et `profile_tool` (cascade), puis l'API
// efface les « Autre » devenus orphelins. Un « Autre » encore cité par un autre membre reste.
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>

beforeEach(async () => {
  ctx = await createTestContext()
  act = activity(ctx)
})
afterEach(async () => {
  await ctx.close()
})

const otherNames = async () =>
  (
    (await ctx.db.execute(
      sql`select name from tool where status = 'other' order by name`,
    )) as unknown as {
      rows: { name: string }[]
    }
  ).rows.map((row) => row.name)

describe('the « other » tools of a deleted account', () => {
  it('deletes the ones only this account cited, and keeps the shared ones', async () => {
    const zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    const max = await ctx.verifiedMember({
      name: 'Max',
      email: 'max@example.com',
      password: 'max-long-password',
    })
    await act.publish(zoe, 'Tri des déchets', { tools: ['Zorblax seul', 'Zorblax partagé'] })
    await act.updateProfile(zoe, { favoriteTools: ['Zorblax favori'] })
    await act.publish(max, 'Pluie de Max', { tools: ['zorblax PARTAGÉ'] })
    expect(await otherNames()).toEqual(['Zorblax favori', 'Zorblax partagé', 'Zorblax seul'])

    await act.deleteAccount(zoe, 'zoe-long-password')

    expect(await otherNames()).toEqual(['Zorblax partagé'])
  })
})
