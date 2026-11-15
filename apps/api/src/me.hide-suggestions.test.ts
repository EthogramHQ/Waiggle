// Tests d'intégration de « Ne pas me proposer aux autres » dans PATCH /v1/me (R10) : le réglage
// s'enregistre seul, sans toucher au reste du profil, `Me` le rend, et un compte suspendu peut le
// changer (contrat, ProfileUpdate : « ce réglage ne publie rien »).
// Scénario : docs/scenarios/refonte.md, « R10 », « Ne pas me proposer aux autres ».
import { Me } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let karim: string // cookies de session
let louis: string
let karimId: string

const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-15T08:00:00.000Z'))
  ctx = await createTestContext()
  act = activity(ctx)
  karim = await ctx.verifiedMember({
    name: 'Karim Benali',
    email: 'karim@example.com',
    password: 'karim-long-password',
  })
  louis = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  karimId = (await act.me(karim)).id
  await act.makeAdmin((await act.me(louis)).id)
  later()
  await act.updateProfile(karim, { bio: 'Jardinier du dimanche.' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const patchMe = (cookie: string, body: unknown) => act.send('PATCH', '/v1/me', cookie, body)

describe('not being suggested to others', () => {
  it('saves the choice alone, keeps the rest of the profile, and returns it in Me', async () => {
    const res = await patchMe(karim, { hideFromSuggestions: true })
    expect(res.status).toBe(200)
    expect(Me.parse(await res.json()).hideFromSuggestions).toBe(true)

    const me = await act.me(karim)
    expect(me.hideFromSuggestions).toBe(true)
    expect(me.bio).toBe('Jardinier du dimanche.')

    // Une bio changée seule ne remet pas le réglage à faux.
    later()
    expect((await patchMe(karim, { bio: 'Potager et IA.' })).status).toBe(200)
    expect((await act.me(karim)).hideFromSuggestions).toBe(true)

    later()
    expect((await patchMe(karim, { hideFromSuggestions: false })).status).toBe(200)
    expect((await act.me(karim)).hideFromSuggestions).toBe(false)
  })

  it('saves the choice for a member who never wrote a profile', async () => {
    const lea = await ctx.verifiedMember({
      name: 'Léa',
      email: 'lea@example.com',
      password: 'lea-long-password',
    })
    later()
    expect((await patchMe(lea, { hideFromSuggestions: true })).status).toBe(200)
    expect((await act.me(lea)).hideFromSuggestions).toBe(true)
  })

  it('refuses a value that is not a boolean', async () => {
    expect((await patchMe(karim, { hideFromSuggestions: 'yes' })).status).toBe(400)
    expect((await act.me(karim)).hideFromSuggestions).toBe(false)
  })

  it('lets a suspended member change it, but nothing else with it', async () => {
    later()
    const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
      action: 'suspend',
      memberId: karimId,
      duration: '7d',
      ground: 'rules',
      explanation: 'Des messages insultants, plusieurs fois.',
    })
    expect(suspended.status).toBe(201)
    later()

    expect((await patchMe(karim, { hideFromSuggestions: true })).status).toBe(200)
    expect((await act.me(karim)).hideFromSuggestions).toBe(true)
    // Une bio glissée dans la même demande : tout est refusé, comme avant R10.
    const mixed = await patchMe(karim, { hideFromSuggestions: false, bio: 'Une autre bio.' })
    expect(mixed.status).toBe(403)
    expect((await act.me(karim)).hideFromSuggestions).toBe(true)
  })
})
