// Tests d'intégration du flux du temps réel (R21) : GET /v1/live, une réponse `text/event-stream`
// qui ne se termine pas. Son premier message, `hello`, donne l'identifiant de la connexion ; ensuite,
// toutes les `LIVE_PING_MS`, un commentaire `: ping` garde la connexion ouverte (un intermédiaire
// coupe une connexion muette). Scénario : docs/scenarios/refonte.md, « R21 — Le temps réel » ; plan
// R21, choix 1 ; contrat : packages/contracts/src/live.ts.
//
// L'horloge est simulée (`useLiveClock` : `Date`, `setInterval`, `clearInterval`) : le battement
// se constate sans attendre vingt vraies secondes.
import { ErrorResponse, LIVE_PING_MS } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { closeAllLive, openLive, openLiveRaw, useLiveClock } from './testing/live'

let ctx: TestContext
let lea: TestMember

beforeEach(async () => {
  // La fausse horloge du temps réel, depuis un mardi matin, avant l'API.
  useLiveClock(new Date('2026-11-24T08:00:00.000Z'))
  ctx = await createTestContext()
  lea = await signedUpMember(ctx, activity(ctx), 'Léa', '203.0.113.31')
})

afterEach(async () => {
  await closeAllLive()
  await ctx.close()
  vi.useRealTimers()
})

/** Un identifiant de connexion : un uuid, tiré au hasard (relecture de sécurité du plan, B3). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('the live stream', () => {
  it('answers a member with an event stream', async () => {
    const stream = await openLive(ctx, lea.cookie)

    expect(stream.response.status).toBe(200)
    expect(stream.response.headers.get('content-type')).toMatch(/^text\/event-stream/)
    // Rien d'un flux ne doit rester dans un cache (le middleware `/v1/*` d'app.ts).
    expect(stream.response.headers.get('cache-control')).toContain('no-store')
  })

  it('says hello first, with a connection id that cannot be guessed', async () => {
    const first = await openLive(ctx, lea.cookie)
    const second = await openLive(ctx, lea.cookie)

    expect(first.connectionId).toMatch(UUID)
    expect(second.connectionId).toMatch(UUID)
    // Deux appareils, deux connexions : jamais le même identifiant.
    expect(second.connectionId).not.toBe(first.connectionId)
  })

  it('sends a ping comment every LIVE_PING_MS and nothing else while nothing happens', async () => {
    const stream = await openLive(ctx, lea.cookie)

    // Juste avant le battement : rien.
    await vi.advanceTimersByTimeAsync(LIVE_PING_MS - 1)
    expect(await stream.nextFrame(100)).toBe('timeout')

    await vi.advanceTimersByTimeAsync(1)
    expect(await stream.nextFrame()).toEqual({ comment: 'ping' })

    // Et le suivant, vingt secondes plus tard : la connexion reste vivante.
    await vi.advanceTimersByTimeAsync(LIVE_PING_MS)
    expect(await stream.nextFrame()).toEqual({ comment: 'ping' })
    expect(stream.isClosed()).toBe(false)
  })

  it('refuses a visitor without a session with 401, as a JSON error and not a stream', async () => {
    const raw = await openLiveRaw(ctx, null)

    expect(raw.response.status).toBe(401)
    expect(raw.response.headers.get('content-type')).toMatch(/^application\/json/)
    expect(ErrorResponse.parse(await raw.response.json()).error.code).toBe('unauthorized')
    // Témoin : le même appel avec la session de Léa ouvre le flux.
    const stream = await openLive(ctx, lea.cookie)
    expect(stream.response.status).toBe(200)
  })

  it('refuses a cookie that no longer opens a session', async () => {
    // Une session effacée (déconnexion) : le cookie ne vaut plus rien.
    const res = await ctx.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: lea.cookie, 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)

    const raw = await openLiveRaw(ctx, lea.cookie)
    expect(raw.response.status).toBe(401)
  })
})
