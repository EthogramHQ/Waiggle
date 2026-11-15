// Le classement « sans objet » des signalements d'une ruche (R10) : tant que la ruche existe, son
// signalement reste ouvert ; supprimée, il passe à « void » comme celui d'un contenu disparu. Sans la
// branche `hive` de voidReportsOfGoneTargets, l'ancien repli (« cherche un membre de ce nom ») aurait
// classé tous les signalements de ruche sans objet dès la première lecture de la file.
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { voidReportsOfGoneTargets } from './reports/queue'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveRows } from './testing/hive-records'

let ctx: TestContext

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-14T08:00:00.000Z'))
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

describe('a report of a hive that is gone', () => {
  it('stays open while the hive exists, and becomes void once it is deleted', async () => {
    const act = activity(ctx)
    const ines = await ctx.verifiedMember({
      name: 'Inès',
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    const zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    const hiveId = await hiveRows(ctx).create({
      name: 'Famille Pivert',
      animatorId: (await act.me(ines)).id,
      members: [{ id: (await act.me(zoe)).id }],
    })
    const res = await act.send('POST', '/v1/reports', zoe, {
      target: { kind: 'hive', id: hiveId },
      reason: 'other',
    })
    expect(res.status).toBe(201)

    expect(await voidReportsOfGoneTargets(ctx.db, new Date())).toBe(0)
    await ctx.db.delete(schema.hive).where(eq(schema.hive.id, hiveId))
    expect(await voidReportsOfGoneTargets(ctx.db, new Date())).toBe(1)
    const [report] = await ctx.db.select().from(schema.contentReport)
    expect(report?.status).toBe('void')
  })
})
