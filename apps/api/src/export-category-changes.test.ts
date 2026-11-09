// L'export du compte et les rangements de catégorie (tranche R6b, jur-T4), sans passer par les routes
// d'administration : les lignes du journal sont posées en SQL. Il prouve que l'export ne lit que les
// projets du membre, dans l'ordre des dates, et ne nomme jamais l'administrateur.
import { randomUUID } from 'node:crypto'
import { AccountExport } from '@ruche/contracts'
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

/** Une date ISO lue comme une heure UTC (jamais une `Date` dans un SQL brut). */
const utc = (iso: string) => sql`${iso}::timestamptz at time zone 'UTC'`

describe('the category changes in the export of the account', () => {
  it("lists the changes made to the member's own projects only, oldest first, without the administrator", async () => {
    const lea = await ctx.verifiedMember({
      name: 'Léa',
      email: 'lea@example.com',
      password: 'lea-long-password',
    })
    const max = await ctx.verifiedMember({
      name: 'Max',
      email: 'max@example.com',
      password: 'max-long-password',
    })
    const mine = await act.publish(lea, 'Mon chat qui parle')
    const his = await act.publish(max, 'Pluie de Max')
    const adminId = (await act.me(max)).id
    const change = (projectId: string, from: string, to: string, at: string) =>
      ctx.db.execute(
        sql`insert into catalogue_change (id, action, admin_id, project_id, from_category, category_code, created_at)
            values (${randomUUID()}, 'project_recategorize', ${adminId}, ${projectId}, ${from}, ${to}, ${utc(at)})`,
      )
    await change(mine.id, 'animals', 'science', '2026-06-02T10:00:00.000Z')
    await change(mine.id, 'other', 'animals', '2026-06-01T10:00:00.000Z')
    await change(his.id, 'other', 'cooking', '2026-06-03T10:00:00.000Z')

    const res = await act.send('GET', '/v1/me/export', lea)
    expect(res.status).toBe(200)
    const raw = await res.text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(data.categoryChanges).toEqual([
      { projectId: mine.id, from: 'other', to: 'animals', at: '2026-06-01T10:00:00.000Z' },
      { projectId: mine.id, from: 'animals', to: 'science', at: '2026-06-02T10:00:00.000Z' },
    ])
    expect(raw).not.toContain(adminId)
    expect(raw).not.toContain(his.id)
  })
})
