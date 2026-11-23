// Tests d'intégration de la tranche R19 : une décision de modération (reports/decide.ts) révoque et
// rend le pollen du contenu visé. Les entrées sont écrites ici par `award` lui-même, dans une
// transaction, comme une route de geste le ferait : ces tests prouvent le branchement de la
// décision (retirer, rétablir) sans dépendre des routes de geste, couvertes par
// game.gestures.test.ts et game.moderation.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { award } from './game/award'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { ledgerOf } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: TestMember
let max: TestMember
let zoe: TestMember
let louis: TestMember
let meteo: string

const START = Date.parse('2026-11-23T08:00:00.000Z')
const later = () => vi.setSystemTime(Date.now() + 60 * 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.41')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.42')
  zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.43')
  louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.44')
  await act.makeAdmin(louis.id)
  later()
  meteo = (await act.publish(lea.cookie, 'Météo', {})).id
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Le commentaire de Max sur « Météo », puis son pollen et celui que Léa reçoit, par `award`. */
const commentWithPollen = async () => {
  later()
  const res = await act.send('POST', `/v1/projects/${meteo}/comments`, max.cookie, {
    body: 'Achetez mes parapluies !',
  })
  expect(res.status).toBe(201)
  const { id } = (await res.json()) as { id: string }
  const now = new Date()
  const source = { sourceKind: 'comment', sourceId: id, projectId: meteo, now } as const
  await ctx.db.transaction(async (tx) => {
    await award(tx, {
      ...source,
      memberId: max.id,
      gesture: 'comment',
      sourceKey: id,
      counterpartId: lea.id,
    })
    await award(tx, {
      ...source,
      memberId: lea.id,
      gesture: 'receive_comment',
      sourceKey: id,
      counterpartId: max.id,
    })
  })
  return id
}

const decide = async (
  action: 'remove' | 'restore',
  target: { kind: 'comment' | 'project'; id: string },
) => {
  later()
  if (action === 'remove') {
    const reported = await act.send('POST', '/v1/reports', zoe.cookie, { target, reason: 'other' })
    expect(reported.status).toBe(201)
    later()
    await act.decide(louis.cookie, {
      action,
      target,
      ground: 'rules',
      explanation: 'Contraire aux règles de la communauté.',
    })
  } else {
    await act.decide(louis.cookie, { action, target })
  }
}

const revokedOf = async (memberId: string) =>
  (await ledgerOf(ctx, memberId)).map((row) => [row.gesture, row.revoked])

describe('a moderation decision and the pollen ledger', () => {
  it('revokes the pollen of a removed comment, and gives it back when it is restored', async () => {
    const commentId = await commentWithPollen()
    // Témoin : avant le retrait, rien n'est révoqué.
    expect(await revokedOf(max.id)).toEqual([['comment', false]])

    await decide('remove', { kind: 'comment', id: commentId })
    expect(await revokedOf(max.id)).toEqual([['comment', true]])
    expect(await revokedOf(lea.id)).toEqual([['receive_comment', true]])

    await decide('restore', { kind: 'comment', id: commentId })
    expect(await revokedOf(max.id)).toEqual([['comment', false]])
    expect(await revokedOf(lea.id)).toEqual([['receive_comment', false]])
  })

  it('revokes what the author received on a removed project, never the gesture of the other', async () => {
    await commentWithPollen()

    await decide('remove', { kind: 'project', id: meteo })

    expect(await revokedOf(lea.id)).toEqual([['receive_comment', true]])
    expect(await revokedOf(max.id)).toEqual([['comment', false]])
  })
})
