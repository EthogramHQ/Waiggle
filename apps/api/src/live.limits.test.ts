// Tests d'intégration des limites du temps réel (R21) : 5 flux ouverts au plus par membre (au
// sixième, le plus ancien reçoit `replaced` puis se ferme), 30 ouvertures de flux et 60
// déclarations de sujets par membre et par minute. Scénario : docs/scenarios/refonte.md, « R21 — Le
// temps réel » ; plan R21, choix 7 ; relecture de sécurité du plan, A2 (le flux renvoyé ne se
// reconnecte qu'au retour au premier plan, d'où son dernier message `replaced`) et B3 (le quota des
// déclarations compté avant le validateur : une requête mal formée compte aussi).
import {
  ErrorResponse,
  LIVE_EVENT_NAMES,
  LIVE_MAX_STREAMS,
  LIVE_OPENS_PER_MINUTE,
  LIVE_TOPICS_PER_MINUTE,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import {
  closeAllLive,
  declareTopics,
  type LiveCast,
  later,
  liveCast,
  openLive,
  openLiveRaw,
  poke,
  putTopics,
  topic,
  useLiveClock,
} from './testing/live'

let ctx: TestContext
let act: ReturnType<typeof activity>
let cast: LiveCast

const UNKNOWN = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  cast = await liveCast(ctx, act)
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

const expectRateLimited = async (res: Response) => {
  expect(res.status).toBe(429)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
}

describe('the open streams of a member', () => {
  it(`closes the oldest of ${LIVE_MAX_STREAMS + 1} streams, which hears replaced first`, async () => {
    const streams = []
    for (let i = 0; i < LIVE_MAX_STREAMS; i++) streams.push(await openLive(ctx, cast.lea.cookie))
    const [oldest, second] = streams
    if (!oldest || !second) throw new Error('streams missing')

    const sixth = await openLive(ctx, cast.lea.cookie)

    const last = await oldest.nextFrame()
    expect(last).toEqual(expect.objectContaining({ event: LIVE_EVENT_NAMES.replaced }))
    expect(await oldest.closesWithin()).toBe(true)
    // Les cinq autres restent ouverts : le deuxième et le sixième reçoivent le témoin.
    for (const stream of [second, sixth]) {
      await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(cast.witness)])
    }
    const witness = await poke(act, cast)
    expect(await second.signalsUntil(witness)).toContainEqual(witness)
    expect(await sixth.signalsUntil(witness)).toContainEqual(witness)
  })

  it('counts the streams of each member apart', async () => {
    const oldest = await openLive(ctx, cast.lea.cookie)
    for (let i = 1; i < LIVE_MAX_STREAMS; i++) await openLive(ctx, cast.lea.cookie)
    const nora = await openLive(ctx, cast.nora.cookie)

    // Le flux de Nora ne renvoie aucun de ceux de Léa, et réciproquement.
    expect(await oldest.nextFrame(200)).toBe('timeout')
    expect(await nora.nextFrame(200)).toBe('timeout')
  })
})

describe('the opening quota', () => {
  it(`refuses the opening number ${LIVE_OPENS_PER_MINUTE + 1} within a minute with 429`, async () => {
    for (let i = 0; i < LIVE_OPENS_PER_MINUTE; i++) {
      const stream = await openLive(ctx, cast.lea.cookie)
      await stream.close()
    }

    const refused = await openLiveRaw(ctx, cast.lea.cookie)
    await expectRateLimited(refused.response)
    // Témoin : Nora ouvre encore le sien ; et Léa, une minute plus tard.
    await openLive(ctx, cast.nora.cookie)
    later()
    await openLive(ctx, cast.lea.cookie)
  })
})

describe('the declaration quota', () => {
  it(`refuses the declaration number ${LIVE_TOPICS_PER_MINUTE + 1} within a minute with 429`, async () => {
    const stream = await openLive(ctx, cast.lea.cookie)
    for (let i = 0; i < LIVE_TOPICS_PER_MINUTE; i++) {
      await declareTopics(ctx, cast.lea.cookie, stream, [topic.project(cast.witness)])
    }

    await expectRateLimited(
      await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] }),
    )
    // Témoin : une minute plus tard, la déclaration passe.
    later()
    expect(
      (await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] })).status,
    ).toBe(204)
  })

  it('counts even malformed requests, before the validator and the connection id', async () => {
    const stream = await openLive(ctx, cast.lea.cookie)
    const tooMany = Array.from({ length: 21 }, () => topic.project(cast.witness))
    // Trois requêtes refusées : un corps invalide, 21 sujets, une connexion inconnue.
    expect((await putTopics(ctx, cast.lea.cookie, stream.connectionId, 'x')).status).toBe(400)
    expect(
      (await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: tooMany })).status,
    ).toBe(400)
    expect((await putTopics(ctx, cast.lea.cookie, UNKNOWN, { topics: [] })).status).toBe(404)
    for (let i = 0; i < LIVE_TOPICS_PER_MINUTE - 3; i++) {
      await declareTopics(ctx, cast.lea.cookie, stream, [])
    }

    // Les trois refus ont compté : la suivante est la 61e.
    await expectRateLimited(
      await putTopics(ctx, cast.lea.cookie, stream.connectionId, { topics: [] }),
    )
    // Une fois le quota atteint, même un corps invalide reçoit 429, pas 400.
    await expectRateLimited(await putTopics(ctx, cast.lea.cookie, stream.connectionId, 'x'))
  })

  it('counts the declarations of each member apart', async () => {
    const lea = await openLive(ctx, cast.lea.cookie)
    const nora = await openLive(ctx, cast.nora.cookie)
    for (let i = 0; i < LIVE_TOPICS_PER_MINUTE; i++) {
      await declareTopics(ctx, cast.lea.cookie, lea, [])
    }

    await expectRateLimited(await putTopics(ctx, cast.lea.cookie, lea.connectionId, { topics: [] }))
    expect((await putTopics(ctx, cast.nora.cookie, nora.connectionId, { topics: [] })).status).toBe(
      204,
    )
  })
})
