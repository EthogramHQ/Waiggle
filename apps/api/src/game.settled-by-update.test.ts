// Test d'intégration de la tranche R19 : un retour réglé par une mise à jour (« Réglé dans la
// v1.3 », R7b) paie son testeur comme « Marquer comme réglé », une seule fois quelle que soit la
// façon de le régler. Scénario : docs/scenarios/refonte.md, « R19 — La gamification », le tableau
// des gestes (« retour réglé : 25 au testeur ») ; plan, choix 3. Les autres gestes sont dans
// game.gestures.test.ts.
import { TesterMessage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { gesturesOf, pollenHeader } from './testing/pollen-ledger'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: TestMember
let max: TestMember
let meteo: string

const START = Date.parse('2026-11-23T08:00:00.000Z')
const later = () => vi.setSystemTime(Date.now() + 60 * 1000)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.31')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.32')
  later()
  meteo = (
    await act.publish(lea.cookie, 'Météo', {
      status: 'testable',
      demoUrl: 'https://meteo-demo.example.com/',
    })
  ).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const send = async (
  status: number,
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
) => {
  later()
  const res = await act.send(method, path, cookie, body)
  expect(res.status, `${method} ${path}: ${await res.clone().text()}`).toBe(status)
  return res
}

const update = (settledFeedbackIds: string[]) => ({
  title: null,
  version: null,
  lines: [{ family: 'fixed', text: 'Le score ne repart plus à zéro' }],
  photos: [],
  beforeAfter: false,
  settledFeedbackIds,
})

describe('a feedback settled by an update', () => {
  it('pays the tester 25 pollen once, and the author her update', async () => {
    const project = `/v1/projects/${meteo}`
    await send(204, 'POST', `${project}/testers`, max.cookie)
    const sent = await send(201, 'POST', `${project}/threads/${max.id}/messages`, max.cookie, {
      kind: 'feedback',
      outcome: 'partly',
      device: 'phone',
      text: 'Le score repart à zéro au niveau 3.',
      captureId: null,
    })
    const { id } = TesterMessage.parse(await sent.json())

    const published = await send(201, 'POST', `${project}/updates`, lea.cookie, update([id]))
    // Payé par la mise à jour elle-même, avant tout « Marquer comme réglé ».
    expect((await gesturesOf(ctx, max.id)).filter(([g]) => g === 'feedback_settled')).toEqual([
      ['feedback_settled', 25],
    ])
    // Remis à traiter puis réglé à la main : déjà payé, rien de plus.
    await send(204, 'DELETE', `${project}/messages/${id}/settled`, lea.cookie)
    await send(204, 'POST', `${project}/messages/${id}/settled`, lea.cookie)

    expect(pollenHeader(published)).toBe('20')
    expect((await gesturesOf(ctx, max.id)).filter(([g]) => g === 'feedback_settled')).toEqual([
      ['feedback_settled', 25],
    ])
    expect((await gesturesOf(ctx, lea.id)).filter(([g]) => g === 'update')).toEqual([
      ['update', 20],
    ])
  })
})
