// Tests d'intégration de la tranche 6c : les réglages d'e-mail d'un membre (Mon profil, section
// « E-mails »), leur export et leur effacement avec le compte. Scénario : docs/scenarios/phase-1.md,
// « Précisions (tranche 6c) ». Deux réglages seulement : le récap de la semaine (activé par
// défaut) et un e-mail quand on le mentionne ou lui répond (désactivé par défaut).
//
// La fausse horloge part d'une date fixe, loin d'aujourd'hui : une date écrite par la base
// (now() en SQL) au lieu de l'API se verrait tout de suite dans l'export.
import {
  AccountExport,
  DEFAULT_EMAIL_PREFERENCES,
  EmailPreferences,
  ErrorResponse,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { mentionEmails } from './jobs/mention-emails'
import { weeklyRecap } from './jobs/weekly-recap'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: string // cookies de session
let malik: string
let inesId: string

const MINUTE = 60 * 1000
const START = new Date('2026-06-15T08:00:00.000Z')
const PATH = '/v1/me/email-preferences'

const inesAccount = {
  name: 'Inès Morel',
  email: 'ines@example.com',
  password: 'ines-long-password',
}

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await ctx.verifiedMember(inesAccount)
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  inesId = (await act.me(ines)).id
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms = 1000) => vi.setSystemTime(Date.now() + ms)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

const patch = (cookie: string | null, body: unknown) => act.send('PATCH', PATH, cookie, body)

/** Une requête SQL brute ; on précise nous-mêmes la forme du résultat. */
const rows = async <T>(query: SQL) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

describe('reading my e-mail settings', () => {
  it('asks to sign in without a session', async () => {
    await expectError(await act.send('GET', PATH, null), 401, 'unauthorized')
    await expectError(await patch(null, { weeklyRecap: false }), 401, 'unauthorized')
    // Témoin : avec une session, la même route répond.
    expect((await act.send('GET', PATH, ines)).status).toBe(200)
  })

  it('gives the defaults to a member who never changed anything: the recap on, mentions off', async () => {
    const res = await act.send('GET', PATH, ines)

    expect(res.status).toBe(200)
    const body = await res.json()
    // Rien de plus que les deux réglages (ni date d'envoi, ni jeton).
    expect(body).toEqual({ weeklyRecap: true, mentionEmails: false })
    expect(EmailPreferences.parse(body)).toEqual(DEFAULT_EMAIL_PREFERENCES)
  })
})

describe('changing my e-mail settings', () => {
  it('changes only the setting sent, and answers with both', async () => {
    expect(await act.setPreferences(ines, { mentionEmails: true })).toEqual({
      weeklyRecap: true,
      mentionEmails: true,
    })
    expect(await act.setPreferences(ines, { weeklyRecap: false })).toEqual({
      weeklyRecap: false,
      mentionEmails: true,
    })

    expect(await act.preferences(ines)).toEqual({ weeklyRecap: false, mentionEmails: true })
  })

  it('refuses an empty body, an unknown field or a wrong value, and changes nothing', async () => {
    await act.setPreferences(ines, { mentionEmails: true })

    for (const body of [
      {},
      { weeklyRecap: false, newsletter: true },
      { weeklyRecap: 'no' },
      { mentionEmails: null },
      [],
    ]) {
      await expectError(await patch(ines, body), 400, 'validation')
    }
    const notJson = await ctx.request(PATH, {
      method: 'PATCH',
      headers: { cookie: ines, 'content-type': 'application/json' },
      body: '{weeklyRecap: false',
    })
    expect(notJson.status).toBe(400)

    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: true })
  })

  it('refuses an oversized body without reading it', async () => {
    const res = await ctx.request(PATH, {
      method: 'PATCH',
      headers: { cookie: ines, 'content-type': 'application/json' },
      body: JSON.stringify({ weeklyRecap: false, padding: 'a'.repeat(1024 * 1024) }),
    })

    await expectError(res, 413, 'payload_too_large')
  })

  it('lets each member read and change her own settings only', async () => {
    await act.setPreferences(malik, { weeklyRecap: false, mentionEmails: true })

    // Malik a tout changé : Inès garde les réglages par défaut, et inversement.
    expect(await act.preferences(ines)).toEqual(DEFAULT_EMAIL_PREFERENCES)
    await act.setPreferences(ines, { mentionEmails: true })
    expect(await act.preferences(malik)).toEqual({ weeklyRecap: false, mentionEmails: true })
    expect(await act.preferences(ines)).toEqual({ weeklyRecap: true, mentionEmails: true })
  })

  it('answers 60 changes a minute, counting malformed ones, then asks to wait', async () => {
    for (let i = 0; i < 59; i++) {
      expect((await patch(ines, {})).status).toBe(400)
    }
    expect((await patch(ines, { mentionEmails: true })).status).toBe(200)

    await expectError(await patch(ines, { weeklyRecap: false }), 429, 'rate_limited')
    // Chaque membre a son compteur ; une minute plus tard, Inès peut de nouveau.
    expect((await patch(malik, { weeklyRecap: false })).status).toBe(200)
    later(MINUTE)
    expect((await patch(ines, { weeklyRecap: false })).status).toBe(200)
  })
})

describe('exporting my data', () => {
  const exportOf = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me/export', cookie)
    expect(res.status).toBe(200)
    return AccountExport.parse(await res.json())
  }

  it('gives the defaults, with no date, to a member who never changed anything', async () => {
    const data = await exportOf(ines)

    expect(data.emailPreferences).toEqual({
      weeklyRecap: true,
      mentionEmails: false,
      recapSentAt: null,
      recapUnvisited: 0,
      mentionSentAt: null,
      updatedAt: null,
    })
    // La dernière utilisation de chaque session, qui sert désormais à décider du récap.
    expect(data.sessions.length).toBeGreaterThan(0)
    expect(data.sessions.every((session) => typeof session.updatedAt === 'string')).toBe(true)
  })

  it('gives the settings, when they changed, and the dates of the last e-mails sent', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.setPreferences(ines, { mentionEmails: true })
    const changedAt = new Date().toISOString()
    later()
    await act.comment(meteo.id, malik, 'Et @ines_morel, la neige ?')
    later(16 * MINUTE)
    const deps = {
      db: ctx.db,
      mailer: ctx.mailer,
      appUrl: TEST_APP_URL,
      apiUrl: TEST_API_URL,
      secret: TEST_AUTH_SECRET,
    }
    const mentionsAt = new Date()
    await mentionEmails(deps, mentionsAt)
    later(MINUTE)
    await act.comment(meteo.id, malik, 'Je reviens demain.')
    later(MINUTE)
    const recapAt = new Date()
    await weeklyRecap(deps, recapAt)

    const data = await exportOf(ines)

    expect(data.emailPreferences).toEqual({
      weeklyRecap: true,
      mentionEmails: true,
      recapSentAt: recapAt.toISOString(),
      // Inès est venue depuis son inscription (sa session) : ce récap n'est pas « sans visite ».
      recapUnvisited: 0,
      mentionSentAt: mentionsAt.toISOString(),
      updatedAt: changedAt,
    })
    // Jamais de jeton de désinscription dans l'export.
    const raw = JSON.stringify(data)
    expect(raw).not.toContain(createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'recap'))
    expect(raw).not.toMatch(/token/i)
  })
})

describe('deleting my account', () => {
  it('erases my e-mail settings and every counter in my name', async () => {
    await act.setPreferences(ines, { mentionEmails: true })
    // Un lien de désinscription utilisé : son compteur porte aussi l'identifiant d'Inès.
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'recap')
    const unsubscribed = await ctx.request(
      `/v1/email/unsubscribe?${new URLSearchParams({ token })}`,
      { method: 'POST' },
    )
    expect(unsubscribed.status).toBe(204)
    await act.setPreferences(malik, { mentionEmails: true })

    await act.deleteAccount(ines, inesAccount.password)

    expect(
      await rows(sql`select user_id from email_preference where user_id = ${inesId}`),
    ).toHaveLength(0)
    const counters = await ctx.db.select({ key: schema.apiRateLimit.key }).from(schema.apiRateLimit)
    expect(counters.filter(({ key }) => key.includes(inesId))).toEqual([])
    // Témoin : les réglages de Malik restent.
    expect(await act.preferences(malik)).toEqual({ weeklyRecap: true, mentionEmails: true })
  })
})
