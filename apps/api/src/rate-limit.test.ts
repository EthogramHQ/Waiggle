import { createTestPgliteDb } from '@ruche/db/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRateLimiter, type RateLimiter } from './rate-limit'

let close: () => Promise<void>
let limiter: RateLimiter
// Une horloge que le test fait avancer à la main, pour ne pas attendre une heure pour de vrai.
let now = 1_000_000

beforeEach(async () => {
  const handle = await createTestPgliteDb()
  close = handle.close
  limiter = createRateLimiter(handle.db, () => now)
})

afterEach(async () => {
  await close()
})

const rule = { windowMs: 60_000, max: 3 }

describe('createRateLimiter', () => {
  it('allows requests up to the limit, then refuses them', async () => {
    const results = []
    for (let i = 0; i < 4; i++) results.push((await limiter.hit('avatar:u1', rule)).allowed)

    expect(results).toEqual([true, true, true, false])
  })

  it('says how long to wait before trying again', async () => {
    for (let i = 0; i < 3; i++) await limiter.hit('avatar:u1', rule)
    now += 20_000

    const refused = await limiter.hit('avatar:u1', rule)

    expect(refused).toEqual({ allowed: false, retryAfterSeconds: 40 })
  })

  it('starts counting again once the time window is over', async () => {
    for (let i = 0; i < 4; i++) await limiter.hit('avatar:u1', rule)
    now += 60_000

    expect((await limiter.hit('avatar:u1', rule)).allowed).toBe(true)
  })

  it('counts each key separately', async () => {
    for (let i = 0; i < 3; i++) await limiter.hit('avatar:u1', rule)

    expect((await limiter.hit('avatar:u2', rule)).allowed).toBe(true)
  })
})
