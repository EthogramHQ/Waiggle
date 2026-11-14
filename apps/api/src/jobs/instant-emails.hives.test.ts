// Tests de l'invitation dans une ruche dans l'e-mail « tout de suite » (R10). Scénario :
// docs/scenarios/refonte.md, « R10 », « Recevoir une invitation » et « Le réglage Ruches » ; plan
// R10, « Ce qui change au plan », point 6 (le type `hives`, « Tout de suite » par défaut, entre dans
// l'index de l'e-mail « tout de suite » ; le lot ne prend un membre pour ce seul type que s'il a une
// invitation récente) ; choix Q1 (une invitation refusée reste 30 jours, sans nouvel e-mail).
//
// « Ruches » vaut « Tout de suite » par défaut (DEFAULT_EMAIL_PREFERENCES) : un membre qui n'a jamais
// touché à ses réglages, donc sans ligne `email_preference`, reçoit l'e-mail d'une invitation.
// L'e-mail ne contient jamais le nom de la ruche, écrit par un membre (choix 7 du scénario) : « Inès
// Haddad t'invite dans une ruche sur Waiggle. », ni de lien vers un membre ; son lien mène à l'onglet
// Ruches de l'appli, où l'invité lit le nom avant d'accepter.
//
// La tâche (instantEmails, voir instant-emails.test.ts) est lancée par le test, à l'heure de la
// fausse horloge. Les ruches et les invitations sont écrites en base (testing/hive-records.ts).
import { DEFAULT_EMAIL_PREFERENCES } from '@ruche/contracts'
import { fill, resources } from '@ruche/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Email } from '../email/templates'
import { createUnsubscribeToken, readUnsubscribeToken } from '../email/unsubscribe-token'
import { activity } from '../testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from '../testing/context'
import { hiveRows } from '../testing/hive-records'
import { instantEmails } from './instant-emails'

let ctx: TestContext
let act: ReturnType<typeof activity>
let hives: ReturnType<typeof hiveRows>
let ines: string // cookies de session
let max: string
let zoe: string
let malik: string
let inesId: string
let inesHandle: string
let maxId: string
let zoeId: string
let malikId: string

const SECOND = 1000
const MINUTE = 60 * SECOND
const DAY = 24 * 60 * MINUTE
const START = new Date('2026-06-15T08:00:00.000Z')

const maxAccount = { name: 'Max', email: 'max@example.com', password: 'max-long-password' }

const fr = resources.fr.translation.email
const en = resources.en.translation.email
const typeNames = resources.fr.translation.notificationSettings.types

/** Un nom de ruche reconnaissable : s'il sort dans l'e-mail, le test le voit. */
const HIVE_NAME = 'Famille Zébulon'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  hives = hiveRows(ctx)
  ines = await ctx.verifiedMember({
    name: 'Inès Haddad',
    email: 'ines@example.com',
    password: 'ines-long-password',
  })
  max = await ctx.verifiedMember(maxAccount)
  zoe = await ctx.verifiedMember({
    name: 'Zoé',
    email: 'zoe@example.com',
    password: 'zoe-long-password',
  })
  malik = await ctx.verifiedMember({
    name: 'Malik',
    email: 'malik@example.com',
    password: 'malik-long-password',
  })
  const inesMe = await act.me(ines)
  inesId = inesMe.id
  inesHandle = inesMe.handle
  maxId = (await act.me(max)).id
  zoeId = (await act.me(zoe)).id
  malikId = (await act.me(malik)).id
  later(MINUTE)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const later = (ms = SECOND) => vi.setSystemTime(Date.now() + ms)

const deps = () => ({
  db: ctx.db,
  mailer: ctx.mailer,
  appUrl: TEST_APP_URL,
  apiUrl: TEST_API_URL,
  secret: TEST_AUTH_SECRET,
})
const runInstant = () => instantEmails(deps(), new Date())

/** L'adresse du lien de désinscription en un clic d'un e-mail, ou null. */
const oneClickUrl = (email: Email) => {
  const header = email.headers?.['List-Unsubscribe'] ?? ''
  const inside = header.slice(1, -1)
  return header.startsWith('<') && URL.canParse(inside) ? new URL(inside) : null
}
const isInstant = (email: Email) =>
  readUnsubscribeToken(TEST_AUTH_SECRET, oneClickUrl(email)?.searchParams.get('token') ?? '')
    ?.kind === 'instant'
const instantTo = (address: string) =>
  ctx.mailer.sent.filter((email) => email.to === address && isInstant(email))
const onlyInstantTo = (address: string) => {
  const sent = instantTo(address)
  expect(sent).toHaveLength(1)
  return sent[0] as Email
}

const hrefsOf = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])

/** « Tu reçois cet e-mail parce que {{types}} est réglé… » : les morceaux et le nom des types. */
const expectReason = (text: string, types: (keyof typeof typeNames)[]) => {
  const template = types.length === 1 ? fr.instant.reason_one : fr.instant.reason_other
  for (const part of fill(template, { types: '{{types}}' }).split('{{types}}')) {
    expect(text).toContain(part.trim())
  }
  for (const type of types) expect(text).toContain(typeNames[type])
}

/** « Famille Zébulon », animée par Inès, avec Zoé ; Inès y invite Max. */
const inviteMax = async (name = HIVE_NAME) => {
  const hiveId = await hives.create({ name, animatorId: inesId, members: [{ id: zoeId }] })
  const invitationId = await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })
  return { hiveId, invitationId }
}

/**
 * Les requêtes envoyées à la base pendant `run`, avec leurs paramètres : un membre que la tâche
 * examine apparaît dans les paramètres des requêtes faites pour lui (ses notifications, sa prise).
 * Même procédé que testing/explain.ts, sans le plan.
 */
const queriesDuring = async (run: () => Promise<unknown>) => {
  type Client = { query: (sql: string, params?: unknown[], options?: unknown) => Promise<unknown> }
  const client = (ctx.db as unknown as { $client: Client }).$client
  const original = client.query
  const recorded: { sql: string; params: unknown[] }[] = []
  client.query = (sql, params = [], options) => {
    recorded.push({ sql, params })
    return original.call(client, sql, params, options)
  }
  try {
    await run()
  } finally {
    client.query = original
  }
  return recorded
}
const mentions = (queries: { params: unknown[] }[], id: string) =>
  queries.some((query) => query.params.some((param) => String(param).includes(id)))

describe('the invitation e-mail', () => {
  it('sends it at once by default, 15 minutes after, to a member who never changed a setting', async () => {
    expect(DEFAULT_EMAIL_PREFERENCES.hives).toBe('now')
    await inviteMax()

    later(14 * MINUTE)
    await runInstant()
    expect(instantTo(maxAccount.email)).toEqual([])

    later(2 * MINUTE)
    await runInstant()
    const email = onlyInstantTo(maxAccount.email)
    expect(email.subject).toBe(fill(fr.instant.subjectHiveInvited, { name: 'Inès Haddad' }))
    expect(email.text).toContain(
      fill(fr.instant.hiveInvited, { name: 'Inès Haddad', handle: inesHandle }),
    )
    expect(email.text).toContain(fill(fr.instant.hiveInvitedExplain))
    expect(email.text).toContain(fr.instant.openHives)
    // Le lien mène à l'onglet Ruches de l'appli, où l'invitation se lit avec le nom de la ruche.
    expect(hrefsOf(email.html)).toContain(`${TEST_APP_URL}/hives`)
  })

  it('never writes the hive name in the e-mail, nor a link to a member', async () => {
    // Un nom qui porte aussi une adresse : ni l'un ni l'autre ne sort.
    await inviteMax('Famille Zébulon sur zebre-pirate.example')
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(maxAccount.email)
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain('Zébulon')
      expect(part).not.toContain('zebre-pirate')
    }
    for (const href of hrefsOf(email.html)) {
      expect(
        href?.startsWith(`${TEST_APP_URL}/`) || href?.startsWith(`${TEST_API_URL}/`),
        href,
      ).toBe(true)
      // Ni la page de l'inviteur, ni celle de la ruche : seulement l'onglet Ruches.
      expect(href, href).not.toContain(inesId)
      expect(href, href).not.toContain(inesHandle)
      expect(href, href).not.toMatch(/\/members\/|\/hives\/./)
    }
  })

  it('says in the invitation e-mail why it was sent, and its link turns off hive e-mails only', async () => {
    await inviteMax()
    later(16 * MINUTE)
    await runInstant()
    const email = onlyInstantTo(maxAccount.email)

    expectReason(email.text, ['hives'])
    // Le bouton « Se désabonner » de la messagerie (RFC 8058), l'adresse de l'en-tête telle quelle.
    const url = oneClickUrl(email)
    const res = await ctx.app.request(`${url?.pathname}${url?.search}`, {
      method: 'POST',
      headers: {
        'x-real-ip': '198.51.100.20',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
    })

    expect(res.status).toBe(204)
    // « Ruches » passe dans le récap ; le récap reste, les autres types ne bougent pas.
    expect(await act.preferences(max)).toEqual({ ...DEFAULT_EMAIL_PREFERENCES, hives: 'digest' })
  })

  it('gathers the invitation with the other « now » types in one e-mail', async () => {
    await act.setPreferences(max, { comments: 'now' })
    const carnet = await act.publish(max, 'Carnet')
    later()
    await act.comment(carnet.id, malik, 'Joli carnet.')
    later()
    await inviteMax()
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(maxAccount.email)
    expect(email.text).toContain(
      fill(fr.instant.hiveInvited, { name: 'Inès Haddad', handle: inesHandle }),
    )
    expect(email.text).toContain('Joli carnet.')
    expectReason(email.text, ['comments', 'hives'])
  })

  it('is written in the language of the member', async () => {
    await act.updateProfile(max, { language: 'en' })
    await inviteMax()
    later(16 * MINUTE)

    await runInstant()

    const email = onlyInstantTo(maxAccount.email)
    expect(email.subject).toBe(fill(en.instant.subjectHiveInvited, { name: 'Inès Haddad' }))
    expect(email.text).toContain(
      fill(en.instant.hiveInvited, { name: 'Inès Haddad', handle: inesHandle }),
    )
  })
})

describe('when no invitation e-mail goes out', () => {
  it('sends nothing when hives is set to the recap or to never', async () => {
    await act.setPreferences(max, { hives: 'digest' })
    await act.setPreferences(zoe, { hives: 'never' })
    const hiveId = await hives.create({ name: HIVE_NAME, animatorId: inesId, members: [] })
    await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId })
    await hives.invite({ hiveId, inviteeId: zoeId, inviterId: inesId })
    // Témoin : Malik, aux réglages par défaut.
    await hives.invite({ hiveId, inviteeId: malikId, inviterId: inesId })
    later(16 * MINUTE)

    await runInstant()

    expect(instantTo(maxAccount.email)).toEqual([])
    expect(instantTo('zoe@example.com')).toEqual([])
    expect(instantTo('malik@example.com')).toHaveLength(1)
  })

  it('sends no new invitation e-mail to a member who refused that hive in the last 30 days', async () => {
    const { hiveId, invitationId } = await inviteMax()
    later(16 * MINUTE)
    await runInstant()
    expect(instantTo(maxAccount.email)).toHaveLength(1) // le premier e-mail est parti

    // Max refuse. Une nouvelle invitation dans la même ruche est refusée (choix Q1)…
    later(MINUTE)
    const refuse = await act.send('DELETE', `/v1/hive-invitations/${invitationId}`, max)
    expect(refuse.status).toBe(204)
    later(MINUTE)
    const again = await act.send('POST', `/v1/hives/${hiveId}/invitations`, ines, { userId: maxId })
    expect(again.status).toBe(409)

    // … et aucun e-mail ne repart pendant les 30 jours, même après l'heure d'intervalle.
    for (const step of [2 * 60 * MINUTE, DAY, 20 * DAY]) {
      later(step)
      await runInstant()
    }
    expect(instantTo(maxAccount.email)).toHaveLength(1)
  })

  it('sends nothing for an invitation refused or accepted within the 15 minutes', async () => {
    const hiveId = await hives.create({ name: HIVE_NAME, animatorId: inesId, members: [] })
    await hives.invite({ hiveId, inviteeId: maxId, inviterId: inesId, refusedAt: new Date() })
    // Zoé a accepté : elle est entrée, et l'invitation est effacée (rien en base).
    await hives.join(hiveId, { id: zoeId, invitedBy: inesId })
    await hives.invite({ hiveId, inviteeId: malikId, inviterId: inesId }) // témoin
    later(16 * MINUTE)

    await runInstant()

    expect(instantTo(maxAccount.email)).toEqual([])
    expect(instantTo('zoe@example.com')).toEqual([])
    expect(instantTo('malik@example.com')).toHaveLength(1)
  })

  it('leaves out of the instant batch a member whose only instant type is hives and who has no new invitation', async () => {
    // Zoé a une ligne de réglages (« Ruches » à « Tout de suite », le reste au récap) : elle est dans
    // l'index des e-mails « tout de suite ». Elle n'a qu'une invitation refusée et une expirée.
    await act.setPreferences(zoe, { hives: 'now' })
    const hiveId = await hives.create({ name: HIVE_NAME, animatorId: inesId, members: [] })
    const atelier = await hives.create({ name: 'Atelier', animatorId: malikId, members: [] })
    await hives.invite({
      hiveId: atelier,
      inviteeId: zoeId,
      inviterId: malikId,
      createdAt: new Date(Date.now() - 31 * DAY),
    })
    await hives.invite({ hiveId, inviteeId: zoeId, inviterId: inesId, refusedAt: new Date() })
    // Témoin : Malik, « Commentaires » à « Tout de suite », est examiné par la tâche.
    await act.setPreferences(malik, { comments: 'now' })
    later(16 * MINUTE)

    const queries = await queriesDuring(runInstant)

    expect(mentions(queries, malikId)).toBe(true)
    expect(mentions(queries, zoeId)).toBe(false)
    // Max, sans ligne de réglages et sans invitation, ne l'est pas non plus.
    expect(mentions(queries, maxId)).toBe(false)

    // Témoin : une invitation récente la fait entrer dans le lot, et l'e-mail part.
    const familleBis = await hives.create({ name: 'Cousins', animatorId: inesId, members: [] })
    await hives.invite({ hiveId: familleBis, inviteeId: zoeId, inviterId: inesId })
    later(16 * MINUTE)
    const next = await queriesDuring(runInstant)
    expect(mentions(next, zoeId)).toBe(true)
    expect(instantTo('zoe@example.com')).toHaveLength(1)
  })
})

describe('the instant unsubscribe link and hives', () => {
  it('turns hives off instant with the instant unsubscribe link', async () => {
    const unsubscribe = (params: Record<string, string>) =>
      ctx.request(`/v1/email/unsubscribe?${new URLSearchParams(params)}`, { method: 'POST' })

    // Max n'a rien réglé : « Ruches » à « Tout de suite » par défaut ; le lien le passe au récap.
    const maxToken = createUnsubscribeToken(TEST_AUTH_SECRET, maxId, 'instant')
    expect((await unsubscribe({ token: maxToken })).status).toBe(204)
    expect((await act.preferences(max)).hives).toBe('digest')

    // « Jamais » choisi sur la page du lien.
    const zoeToken = createUnsubscribeToken(TEST_AUTH_SECRET, zoeId, 'instant')
    expect((await unsubscribe({ token: zoeToken, choice: 'never' })).status).toBe(204)
    expect(await act.preferences(zoe)).toEqual({ ...DEFAULT_EMAIL_PREFERENCES, hives: 'never' })

    // Le lien du récap ne touche pas aux ruches (témoin : il coupe le récap).
    const recapToken = createUnsubscribeToken(TEST_AUTH_SECRET, malikId, 'recap')
    expect((await unsubscribe({ token: recapToken })).status).toBe(204)
    expect(await act.preferences(malik)).toEqual({
      ...DEFAULT_EMAIL_PREFERENCES,
      weeklyRecap: false,
    })
  })
})
