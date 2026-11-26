// Tests d'intégration des signaux des ruches (R21, le temps réel) : une ruche qui change (son nom,
// un membre qui part, un membre retiré par l'animateur) fait relire sa page à ses membres
// d'aujourd'hui, et la liste de ruches du membre concerné (`me`, `hive`). Le flux ne porte jamais
// de contenu : seulement le sujet et la sorte. Scénario : docs/scenarios/refonte.md, « R21 — Le
// temps réel » ; plan R21, « Points d'émission » (hives/write.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { hiveGestures } from './testing/hive-gestures'
import {
  closeAllLive,
  declareTopics,
  type LiveCast,
  later,
  liveCast,
  openLive,
  poke,
  signal,
  topic,
  useLiveClock,
} from './testing/live'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveGestures>
let cast: LiveCast

beforeEach(async () => {
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveGestures(ctx, act)
  cast = await liveCast(ctx, act)
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

/** Famille, la ruche de Zoé, avec Léa et Nora. */
const famille = async () => {
  const hive = await hives.create(cast.zoe.cookie, 'Famille')
  await hives.join(hive.id, cast.zoe.cookie, cast.lea)
  await hives.join(hive.id, cast.zoe.cookie, cast.nora)
  later()
  return hive.id
}

describe('the page of a hive', () => {
  it('signals a member who leaves to the members who look at the hive, not to an outsider', async () => {
    const hiveId = await famille()
    const zoe = await openLive(ctx, cast.zoe.cookie)
    await declareTopics(ctx, cast.zoe.cookie, zoe, [topic.hive(hiveId)])
    const marc = await openLive(ctx, cast.marc.cookie)
    // Marc n'est pas de Famille : sa déclaration est ignorée, il ne reçoit que le témoin.
    await declareTopics(ctx, cast.marc.cookie, marc, [
      topic.hive(hiveId),
      topic.project(cast.witness),
    ])

    later()
    await hives.removeMember(hiveId, cast.nora.cookie, cast.nora.id)
    const witness = await poke(act, cast)

    expect(await zoe.nextSignal()).toEqual(signal(topic.hive(hiveId), 'hive'))
    expect(await marc.signalsUntil(witness)).toEqual([witness])
  })

  it('signals a new name of the hive to its members', async () => {
    const hiveId = await famille()
    const lea = await openLive(ctx, cast.lea.cookie)
    await declareTopics(ctx, cast.lea.cookie, lea, [topic.hive(hiveId)])

    later()
    const res = await act.send('PATCH', `/v1/hives/${hiveId}`, cast.zoe.cookie, {
      name: 'La famille',
    })
    expect(res.status).toBe(200)

    expect(await lea.nextSignal()).toEqual(signal(topic.hive(hiveId), 'hive'))
  })

  it('tells a member removed by the animator that their hives and their activity changed', async () => {
    const hiveId = await famille()
    const nora = await openLive(ctx, cast.nora.cookie)

    later()
    await hives.removeMember(hiveId, cast.zoe.cookie, cast.nora.id)

    const signals = await nora.signalsDuring(500)
    expect(signals).toContainEqual(signal('me', 'hive'))
    expect(signals).toContainEqual(signal('me', 'notifications'))
  })
})
