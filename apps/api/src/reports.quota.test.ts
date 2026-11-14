// Tests d'intégration de la tranche R9 : le quota des signalements, tel que la feuille « Signaler »
// le lit dès son ouverture (`remainingToday` de GET /v1/reports/target). Scénario :
// docs/scenarios/refonte.md, « Les cas où l'on ne signale pas » (20 signalements en 24 heures : la
// feuille le dit dès son ouverture) ; plan R9, « API » (`peek`) et relecture de sécurité P8 : lire
// le quota est un `select` avec l'expiration du compteur, sans aucune écriture.
//
// Trois membres : Léa (l'autrice de « Météo » et des commentaires), Max (qui signale) et Zoé (qui
// a son propre compteur). Le compteur des signalements se range dans `api_rate_limit`, sous la clé
// `memberCounterKeys(id).report` ; sa fenêtre de 24 heures part du premier signalement.
//
// Le temps est maîtrisé par le test (fausse horloge, voir reports.test.ts).
import { REPORTS_PER_DAY, ReportTargetPreview } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let max: string
let zoe: string
let maxId: string
let meteo: { id: string } // le projet public de Léa

const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR
const START = new Date('2026-06-15T08:00:00.000Z')

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await ctx.verifiedMember({
    name: 'Léa',
    email: 'lea@example.com',
    password: 'correct-horse-battery',
  })
  max = await ctx.verifiedMember({
    name: 'Max',
    email: 'max@example.com',
    password: 'another-long-password',
  })
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-pw-1',
  })
  maxId = (await act.me(max)).id
  meteo = await act.publish(lea, 'Météo', { pitch: 'La pluie de demain, quartier par quartier.' })
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une seconde : deux gestes n'ont jamais la même date). */
const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

/** Ce qu'il reste à Max (ou à un autre) aujourd'hui, lu dans l'aperçu de « Météo ». */
const remaining = async (cookie = max) => {
  later()
  const res = await act.send(
    'GET',
    `/v1/reports/target?${new URLSearchParams({ kind: 'project', id: meteo.id })}`,
    cookie,
  )
  expect(res.status).toBe(200)
  return ReportTargetPreview.parse(await res.json()).remainingToday
}

/** `n` commentaires de Léa, chacun signalé par Max (201 attendu). */
const reportComments = async (n: number) => {
  for (let i = 1; i <= n; i++) {
    const comment = await act.comment(meteo.id, lea, `Commentaire ${i}`)
    later()
    const res = await act.send('POST', '/v1/reports', max, {
      target: { kind: 'comment', id: comment.id },
      reason: 'other',
    })
    expect(res.status, `report ${i}`).toBe(201)
  }
}

/** Le compteur des signalements de Max, tel que la base le garde (absent : aucune fenêtre). */
const maxCounter = () =>
  ctx.db
    .select()
    .from(schema.apiRateLimit)
    .where(eq(schema.apiRateLimit.key, memberCounterKeys(maxId).report))

describe('the reports left for today, in the preview', () => {
  it('counts down with each report of the day, a malformed one included, down to 0', async () => {
    expect(await remaining()).toBe(REPORTS_PER_DAY)

    await reportComments(3)
    expect(await remaining()).toBe(REPORTS_PER_DAY - 3)
    // Zoé a son propre compteur.
    expect(await remaining(zoe)).toBe(REPORTS_PER_DAY)

    await reportComments(REPORTS_PER_DAY - 4)
    // Le dernier, mal formé, compte aussi : le compteur passe avant la validation.
    later()
    const malformed = await act.send('POST', '/v1/reports', max, {
      target: { kind: 'project', id: 'x' },
      reason: 'other',
    })
    expect(malformed.status).toBe(400)

    // À 0, l'aperçu répond encore : la feuille le dit dès son ouverture.
    expect(await remaining()).toBe(0)
    later()
    const refused = await act.send('POST', '/v1/reports', max, {
      target: { kind: 'project', id: meteo.id },
      reason: 'other',
    })
    expect(refused.status).toBe(429)
    expect(await remaining()).toBe(0)
  })

  // Relecture de sécurité (plan R9, « Tests demandés », mot pour mot).
  it('gives the whole daily quota back in remainingToday once 24 hours have passed, without any new report', async () => {
    await reportComments(3)
    expect(await remaining()).toBe(REPORTS_PER_DAY - 3)
    const [before] = await maxCounter()

    later(DAY)
    expect(await remaining()).toBe(REPORTS_PER_DAY)
    // Rien n'a été écrit pour le dire : la fenêtre passée est seulement lue comme expirée.
    expect(await maxCounter()).toEqual([before])
  })

  // Relecture de sécurité (plan R9, « Tests demandés », mot pour mot).
  it('reading the preview neither counts nor starts a window', async () => {
    for (let i = 0; i < REPORTS_PER_DAY + 5; i++) {
      expect(await remaining(), `reading ${i + 1}`).toBe(REPORTS_PER_DAY)
    }
    expect(await maxCounter()).toEqual([])

    // La fenêtre part du premier signalement, pas de la première lecture : lue à 8 h, puis un
    // signalement à 7 h le lendemain, il compte encore à 9 h (une fenêtre ouverte par la lecture
    // aurait expiré à 8 h, et rendu tout le quota).
    later(23 * HOUR)
    await reportComments(1)
    later(2 * HOUR)
    expect(await remaining()).toBe(REPORTS_PER_DAY - 1)
  })
})
