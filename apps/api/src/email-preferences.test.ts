// Tests d'intégration des réglages d'e-mail d'un membre (Réglages → Notifications), de leur export
// et de leur effacement avec le compte. Tranche 6c, puis R8 : un choix par type (« Tout de suite »,
// « Dans le récap », « Jamais »), « Dans le récap » par défaut partout, et le récap de la semaine,
// activé par défaut. Scénario : docs/scenarios/refonte.md, « R8 — Les notifications », « L'écran
// Notifications des réglages » et « Mes données ».
//
// PATCH /v1/me/email-preferences ne prend qu'un réglage à la fois (celui que le membre vient de
// toucher) et répond avec tous. « Tout de suite » n'existe que pour les commentaires sur ses projets,
// les réponses et mentions, et le coin des testeurs : ailleurs, `now` est refusé (400).
//
// Jusqu'à R9, l'ancien interrupteur de 6c (`mention_emails`) est tenu en copie : vrai seulement
// quand « Réponses et mentions » est sur « Tout de suite » (relecture du plan, sec-A1 et jur-2a). Un
// retour à la version d'avant R8 respecte ainsi les choix pris entre-temps.
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
import { eq, type SQL, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUnsubscribeToken } from './email/unsubscribe-token'
import { instantEmails } from './jobs/instant-emails'
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

/** Les réglages d'un membre qui n'a jamais rien changé, écrits en entier. */
const DEFAULTS = {
  weeklyRecap: true,
  reactions: 'digest',
  comments: 'digest',
  replies: 'digest',
  follows: 'digest',
  updates: 'digest',
  testers: 'digest',
} as const

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

/** Le lien de désinscription d'un e-mail, cliqué (POST, comme le bouton « Confirmer »). */
const unsubscribe = (params: Record<string, string>) =>
  ctx.request(`/v1/email/unsubscribe?${new URLSearchParams(params)}`, { method: 'POST' })

/**
 * L'ancien interrupteur de 6c, lu en base : l'API ne le rend plus, mais l'écrit encore en copie.
 * Pas de ligne (jamais rien changé) : faux, sa valeur par défaut.
 */
const legacySwitch = async (userId: string) => {
  const [row] = await ctx.db
    .select({ on: schema.emailPreference.mentionEmails })
    .from(schema.emailPreference)
    .where(eq(schema.emailPreference.userId, userId))
  return row?.on ?? false
}

describe('reading my e-mail settings', () => {
  it('asks to sign in without a session', async () => {
    await expectError(await act.send('GET', PATH, null), 401, 'unauthorized')
    await expectError(await patch(null, { weeklyRecap: false }), 401, 'unauthorized')
    // Témoin : avec une session, la même route répond.
    expect((await act.send('GET', PATH, ines)).status).toBe(200)
  })

  it('gives the defaults to a member who never changed anything: the recap on, every type in the recap', async () => {
    const res = await act.send('GET', PATH, ines)

    expect(res.status).toBe(200)
    const body = await res.json()
    // Rien de plus que les sept réglages (ni date d'envoi, ni jeton, ni l'ancien interrupteur).
    expect(body).toEqual(DEFAULTS)
    expect(EmailPreferences.parse(body)).toEqual(DEFAULT_EMAIL_PREFERENCES)
  })
})

describe('changing my e-mail settings', () => {
  it('changes only the setting sent, and answers with all of them', async () => {
    expect(await act.setPreferences(ines, { comments: 'now' })).toEqual({
      ...DEFAULTS,
      comments: 'now',
    })
    expect(await act.setPreferences(ines, { replies: 'never' })).toEqual({
      ...DEFAULTS,
      comments: 'now',
      replies: 'never',
    })
    expect(await act.setPreferences(ines, { weeklyRecap: false })).toEqual({
      ...DEFAULTS,
      weeklyRecap: false,
      comments: 'now',
      replies: 'never',
    })

    expect(await act.preferences(ines)).toEqual({
      ...DEFAULTS,
      weeklyRecap: false,
      comments: 'now',
      replies: 'never',
    })
  })

  it('accepts every choice on comments, replies and the testers corner', async () => {
    for (const type of ['comments', 'replies', 'testers'] as const) {
      for (const choice of ['now', 'never', 'digest'] as const) {
        const res = await patch(ines, { [type]: choice })
        expect(res.status, `${type} ${choice}`).toBe(200)
        expect((await act.preferences(ines))[type]).toBe(choice)
      }
    }
  })

  it('refuses « now » on reactions, follows and updates, and changes nothing', async () => {
    for (const type of ['reactions', 'follows', 'updates'] as const) {
      await expectError(await patch(ines, { [type]: 'now' }), 400, 'validation')
      // Témoin : les deux autres choix passent.
      expect((await patch(ines, { [type]: 'never' })).status).toBe(200)
      expect((await patch(ines, { [type]: 'digest' })).status).toBe(200)
    }

    expect(await act.preferences(ines)).toEqual(DEFAULTS)
  })

  it('refuses two settings at once, an empty body, an unknown field or a wrong value, and changes nothing', async () => {
    await act.setPreferences(ines, { replies: 'now' })

    for (const body of [
      {},
      // Un seul réglage à la fois : celui que le membre vient de toucher.
      { weeklyRecap: false, comments: 'now' },
      { replies: 'never', testers: 'never' },
      { weeklyRecap: false, newsletter: true },
      // L'interrupteur de 6c n'existe plus dans le contrat.
      { mentionEmails: true },
      { comments: 'soon' },
      { comments: 'NOW' },
      { weeklyRecap: 'no' },
      { replies: null },
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

    expect(await act.preferences(ines)).toEqual({ ...DEFAULTS, replies: 'now' })
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
    await act.setPreferences(malik, { weeklyRecap: false })
    await act.setPreferences(malik, { testers: 'now' })

    // Malik a changé deux réglages : Inès garde les réglages par défaut, et inversement.
    expect(await act.preferences(ines)).toEqual(DEFAULTS)
    await act.setPreferences(ines, { comments: 'never' })
    expect(await act.preferences(malik)).toEqual({
      ...DEFAULTS,
      weeklyRecap: false,
      testers: 'now',
    })
    expect(await act.preferences(ines)).toEqual({ ...DEFAULTS, comments: 'never' })
  })

  it('answers 60 changes a minute, counting malformed ones, then asks to wait', async () => {
    for (let i = 0; i < 59; i++) {
      expect((await patch(ines, {})).status).toBe(400)
    }
    expect((await patch(ines, { replies: 'now' })).status).toBe(200)

    await expectError(await patch(ines, { weeklyRecap: false }), 429, 'rate_limited')
    // Chaque membre a son compteur ; une minute plus tard, Inès peut de nouveau.
    expect((await patch(malik, { weeklyRecap: false })).status).toBe(200)
    later(MINUTE)
    expect((await patch(ines, { weeklyRecap: false })).status).toBe(200)
  })
})

// Relecture du plan, sec-A1 et jur-2a : `mention_emails` n'est plus lue, mais reste écrite en copie
// de « Réponses et mentions : Tout de suite » jusqu'à R9. Si l'on revient à la version d'avant R8,
// l'ancienne tâche des mentions lit cet interrupteur : un membre passé à « Dans le récap » ou à
// « Jamais », ou désinscrit par un lien, ne doit plus rien recevoir d'elle.
describe('the legacy mention switch, kept as a copy until R9', () => {
  it('turns mention_emails off when replies leave now, by the settings or by a link', async () => {
    await act.setPreferences(ines, { replies: 'now' })
    expect(await legacySwitch(inesId)).toBe(true)

    // Par les réglages : « Dans le récap », puis « Jamais ».
    await act.setPreferences(ines, { replies: 'digest' })
    expect(await legacySwitch(inesId)).toBe(false)
    await act.setPreferences(ines, { replies: 'now' })
    await act.setPreferences(ines, { replies: 'never' })
    expect(await legacySwitch(inesId)).toBe(false)

    // Par chaque sorte de lien : l'e-mail « tout de suite » (en un clic, puis avec « Jamais »),
    // l'ancien e-mail de mentions, et « Tout couper » depuis le récap.
    for (const params of [
      { token: createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'instant') },
      { token: createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'instant'), choice: 'never' },
      { token: createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'mentions') },
      { token: createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'recap'), scope: 'all' },
    ]) {
      await act.setPreferences(ines, { replies: 'now' })
      expect(await legacySwitch(inesId)).toBe(true)

      expect((await unsubscribe(params)).status, JSON.stringify(params)).toBe(204)

      expect((await act.preferences(ines)).replies).not.toBe('now')
      expect(await legacySwitch(inesId), JSON.stringify(params)).toBe(false)
    }
  })

  it('turns the legacy mention switch off when replies leave now, and never on', async () => {
    // Aucun autre réglage ne l'allume : ni les commentaires ou le coin à « Tout de suite », ni le récap.
    await act.setPreferences(ines, { comments: 'now' })
    await act.setPreferences(ines, { testers: 'now' })
    await act.setPreferences(ines, { weeklyRecap: false })
    await act.setPreferences(ines, { weeklyRecap: true })
    expect(await legacySwitch(inesId)).toBe(false)

    // Un lien ne l'allume jamais, même chez un membre aux réponses sur « Jamais ».
    await act.setPreferences(ines, { replies: 'never' })
    for (const kind of ['instant', 'mentions', 'recap'] as const) {
      const token = createUnsubscribeToken(TEST_AUTH_SECRET, inesId, kind)
      expect((await unsubscribe({ token })).status).toBe(204)
      expect((await unsubscribe({ token, scope: 'all' })).status).toBe(204)
    }
    expect(await legacySwitch(inesId)).toBe(false)
    expect((await act.preferences(ines)).replies).toBe('never')

    // Un membre qui n'a jamais rien réglé, désinscrit par un lien : la ligne créée le garde éteint.
    const malikId = (await act.me(malik)).id
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, malikId, 'instant')
    expect((await unsubscribe({ token, scope: 'all' })).status).toBe(204)
    expect(await legacySwitch(malikId)).toBe(false)

    // Témoin : « Réponses et mentions » sur « Tout de suite » l'allume, et seulement lui.
    await act.setPreferences(ines, { replies: 'now' })
    expect(await legacySwitch(inesId)).toBe(true)
    await act.setPreferences(ines, { comments: 'never' })
    expect(await legacySwitch(inesId)).toBe(true)
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
      ...DEFAULTS,
      recapSentAt: null,
      recapUnvisited: 0,
      instantSentAt: null,
      recapV2At: null,
      updatedAt: null,
    })
    // La dernière utilisation de chaque session, qui sert désormais à décider du récap.
    expect(data.sessions.length).toBeGreaterThan(0)
    expect(data.sessions.every((session) => typeof session.updatedAt === 'string')).toBe(true)
  })

  it('gives the choice of each type, and the dates of the last e-mails sent', async () => {
    const meteo = await act.publish(ines, 'Météo')
    later()
    await act.setPreferences(ines, { reactions: 'never' })
    later()
    await act.setPreferences(ines, { replies: 'now' })
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
    const instantAt = new Date()
    await instantEmails(deps, instantAt)
    later(MINUTE)
    await act.comment(meteo.id, malik, 'Je reviens demain.')
    later(MINUTE)
    const recapAt = new Date()
    await weeklyRecap(deps, recapAt)

    const data = await exportOf(ines)

    expect(data.emailPreferences).toEqual({
      ...DEFAULTS,
      reactions: 'never',
      replies: 'now',
      recapSentAt: recapAt.toISOString(),
      // Inès est venue depuis son inscription (sa session) : ce récap n'est pas « sans visite ».
      recapUnvisited: 0,
      instantSentAt: instantAt.toISOString(),
      // R8 : ce récap est le premier habillé ; sa date reste toute la vie du compte, donc ici aussi.
      recapV2At: recapAt.toISOString(),
      updatedAt: changedAt,
    })
    // Jamais de jeton de désinscription dans l'export, ni l'ancien interrupteur.
    const raw = JSON.stringify(data)
    for (const kind of ['recap', 'instant'] as const) {
      expect(raw).not.toContain(createUnsubscribeToken(TEST_AUTH_SECRET, inesId, kind))
    }
    expect(raw).not.toMatch(/token/i)
    expect(raw).not.toContain('mentionEmails')
    expect(raw).not.toContain('mentionSentAt')
  })
})

describe('deleting my account', () => {
  it('erases my e-mail settings and every counter in my name', async () => {
    await act.setPreferences(ines, { comments: 'now' })
    // Un lien de désinscription utilisé : son compteur porte aussi l'identifiant d'Inès.
    const token = createUnsubscribeToken(TEST_AUTH_SECRET, inesId, 'instant')
    expect((await unsubscribe({ token })).status).toBe(204)
    await act.setPreferences(malik, { testers: 'now' })

    await act.deleteAccount(ines, inesAccount.password)

    expect(
      await rows(sql`select user_id from email_preference where user_id = ${inesId}`),
    ).toHaveLength(0)
    const counters = await ctx.db.select({ key: schema.apiRateLimit.key }).from(schema.apiRateLimit)
    expect(counters.filter(({ key }) => key.includes(inesId))).toEqual([])
    // Témoin : les réglages de Malik restent.
    expect(await act.preferences(malik)).toEqual({ ...DEFAULTS, testers: 'now' })
  })
})

// Décision de Louis (restauration, option a) : baisser un réglage dans l'appli est aussi un refus,
// qu'une sauvegarde restaurée perdrait. R8 (relecture du plan, jur-2b) : une ligne par choix baissé,
// « Unsubscribe <identifiant> <type> <digest|never> » ; « Unsubscribe <identifiant> recap » quand le
// récap est coupé. Sans adresse ni nom. Baisser : passer de « Tout de suite » à « Dans le récap » ou
// à « Jamais », ou de « Dans le récap » à « Jamais ».
describe('the trace of a setting lowered, for a restored backup', () => {
  /** Les lignes « Unsubscribe … » écrites dans les journaux pendant `action`. */
  const unsubscribeLinesDuring = async (action: () => unknown) => {
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )
    await action()
    const lines = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
    for (const secret of ['ines@example.com', 'Inès']) {
      expect(lines.join('\n')).not.toContain(secret)
    }
    return lines.filter((line) => line.startsWith('Unsubscribe '))
  }

  it('logs each lowered choice with its type and new value', async () => {
    const lines = await unsubscribeLinesDuring(async () => {
      await act.setPreferences(ines, { comments: 'now' }) // remonté : rien
      await act.setPreferences(ines, { comments: 'digest' })
      await act.setPreferences(ines, { replies: 'never' })
      await act.setPreferences(ines, { testers: 'now' }) // remonté : rien
      await act.setPreferences(ines, { testers: 'never' })
      await act.setPreferences(ines, { reactions: 'never' })
      await act.setPreferences(ines, { follows: 'never' })
      await act.setPreferences(ines, { updates: 'never' })
      await act.setPreferences(ines, { weeklyRecap: false })
    })

    expect(lines).toEqual([
      `Unsubscribe ${inesId} comments digest`,
      `Unsubscribe ${inesId} replies never`,
      `Unsubscribe ${inesId} testers never`,
      `Unsubscribe ${inesId} reactions never`,
      `Unsubscribe ${inesId} follows never`,
      `Unsubscribe ${inesId} updates never`,
      `Unsubscribe ${inesId} recap`,
    ])
  })

  it('writes nothing when a setting is raised, or when the change is refused', async () => {
    await act.setPreferences(ines, { replies: 'never' })
    await act.setPreferences(ines, { weeklyRecap: false })

    const lines = await unsubscribeLinesDuring(async () => {
      await act.setPreferences(ines, { replies: 'digest' })
      await act.setPreferences(ines, { replies: 'now' })
      await act.setPreferences(ines, { comments: 'now' })
      await act.setPreferences(ines, { weeklyRecap: true })
      expect((await patch(ines, { reactions: 'now' })).status).toBe(400)
      expect((await patch(ines, { weeklyRecap: 'no' })).status).toBe(400)
      expect((await patch(null, { weeklyRecap: false })).status).toBe(401)
    })

    expect(lines).toEqual([])
  })
})
