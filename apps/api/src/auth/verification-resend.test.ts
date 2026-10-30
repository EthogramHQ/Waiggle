// Tests d'intégration de la tranche R2, A3 : « Renvoyer l'e-mail » sur la page « Vérifie ta boîte
// mail » (docs/scenarios/refonte.md). La route POST /api/auth/send-verification-email de Better
// Auth, fermée depuis l'audit du 25/10/2026 (C5), est rouverte avec ses quotas : par adresse (1 par
// minute, 5 par heure, 10 par jour : sec-S4), comptés avant toute recherche de compte, et par
// adresse IP (5 par quart d'heure). La réponse est la même que l'adresse ait un compte ou non ; au
// quota, 429 avec `Retry-After` pour que l'écran dise à quelle heure réessayer. Le renvoi fait par
// la connexion d'un compte non vérifié (sendOnSignIn) a son propre compteur par membre (sec-S3).
import { schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/context'
import { AUTH_RATE_RULES } from './auth'

let ctx: TestContext

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const START = new Date('2026-11-02T08:00:00.000Z')
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const malik = { name: 'Malik', email: 'malik@example.com', password: 'another-horse-battery' }
/** La page de l'appli où mène tout lien de vérification d'inscription, quoi qu'en dise la demande. */
const VERIFIED_PAGE = `${TEST_APP_URL}/verified`
/** Une adresse IP par appel, pour que le quota par adresse IP ne cache pas ceux par adresse. */
const ip = (n: number) => ({ 'x-real-ip': `198.51.100.${n}` })

beforeEach(async () => {
  // La fausse horloge avant l'API : les quotas lisent l'horloge qu'ils trouvent à leur création.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await ctx.close()
})

/** « Renvoyer l'e-mail » (contrat ResendVerificationRequest), parfois avec un ajout piégé. */
const resend = (email: string, extra: object = {}, headers: Record<string, string> = {}) =>
  ctx.request('/api/auth/send-verification-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, ...extra }),
  })

/** Les e-mails de vérification reçus par une adresse (ceux qui portent le lien /verify-email). */
const verificationMailsTo = (to: string) =>
  ctx.mailer.sent.filter(
    (mail) => mail.to === to && mail.text.includes('/api/auth/verify-email?token='),
  )

const linkOf = (to: string) => {
  const mail = verificationMailsTo(to).at(-1)
  const match = mail?.text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`no verification link sent to ${to}`)
  return new URL(match[0])
}

const open = (link: URL) => ctx.request(link.pathname + link.search)

const accountOf = async (email: string) => {
  const [row] = await ctx.db
    .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  if (!row) throw new Error(`no account for ${email}`)
  return row
}

describe('resending the verification link', () => {
  it('sends a new link to an unverified address, which verifies the account and signs it in', async () => {
    await ctx.signUp(lea)
    expect(verificationMailsTo(lea.email)).toHaveLength(1)

    const res = await resend(lea.email)

    expect(res.status).toBe(200)
    expect(verificationMailsTo(lea.email)).toHaveLength(2)
    const link = linkOf(lea.email)
    const opened = await open(link)
    expect(opened.status).toBe(302)
    expect((await accountOf(lea.email)).emailVerified).toBe(true)
    const me = await ctx.request('/v1/me', { headers: { cookie: ctx.cookiesFrom(opened) } })
    expect(me.status).toBe(200)
  })

  it('answers the same for an address without account or already verified, and sends nothing', async () => {
    await ctx.signUp(lea)
    await ctx.verifiedMember(malik)
    const before = ctx.mailer.sent.length

    const unverified = await resend(lea.email, {}, ip(1))
    const unknown = await resend('nobody@example.com', {}, ip(2))
    const verified = await resend(malik.email, {}, ip(3))

    expect(unverified.status).toBe(200)
    expect(unknown.status).toBe(unverified.status)
    expect(verified.status).toBe(unverified.status)
    const body = await unverified.json()
    expect(await unknown.json()).toEqual(body)
    expect(await verified.json()).toEqual(body)
    expect(ctx.mailer.sent.slice(before).map((mail) => mail.to)).toEqual([lea.email])
  })

  // sec-S6 : la page où mène le lien est imposée, même quand la demande en propose une autre.
  it('ignores a trapped callbackURL: the link still leads to our page', async () => {
    await ctx.signUp(lea)

    await resend(lea.email, { callbackURL: `${TEST_APP_URL}/evil-page` })
    await resend(lea.email, { callbackURL: 'https://evil.example/steal' }, ip(2))

    for (const mail of verificationMailsTo(lea.email)) {
      expect(mail.text).not.toContain('evil')
      expect(mail.html).not.toContain('evil')
    }
    const link = linkOf(lea.email)
    expect(link.searchParams.get('callbackURL')).toBe(VERIFIED_PAGE)
    const opened = await open(link)
    expect(opened.headers.get('location')).toBe(VERIFIED_PAGE)
  })

  it('writes the e-mail in the language of the account', async () => {
    await ctx.signUp({ ...lea, language: 'en' })

    await resend(lea.email)

    expect(verificationMailsTo(lea.email).at(-1)?.html).toContain('<html lang="en"')
  })

  // sec-S5 : l'envoi part en arrière-plan ; une panne du courrier ne change rien à la réponse et
  // le journal ne garde pas l'adresse (jur-8).
  it('answers without waiting for the e-mail, and the same when the mailer fails', async () => {
    await ctx.signUp(lea)
    const ok = await (await resend(lea.email, {}, ip(1))).json()
    later(MINUTE + SECOND)
    const send = vi.spyOn(ctx.mailer, 'send').mockImplementation(() => new Promise(() => {}))
    const hanging = await Promise.race([
      resend(lea.email, {}, ip(2)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('the answer waited for the e-mail')), SECOND),
      ),
    ])
    expect(hanging.status).toBe(200)
    expect(send).toHaveBeenCalled()

    later(MINUTE + SECOND)
    send.mockRejectedValue(new Error('SMTP down'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await resend(lea.email, {}, ip(3))
    await new Promise((resolve) => setImmediate(resolve))

    expect(failing.status).toBe(200)
    expect(await failing.json()).toEqual(ok)
    expect(errors).toHaveBeenCalled()
    const logged = JSON.stringify(errors.mock.calls)
    expect(logged).not.toContain(lea.email)
    expect(logged).not.toContain('token=')
  })
})

describe('the quotas of the resend', () => {
  it('refuses a 2nd resend for the same address within a minute, with Retry-After, whether it has an account or not', async () => {
    await ctx.signUp(lea)
    expect((await resend(lea.email, {}, ip(1))).status).toBe(200)
    expect((await resend('nobody@example.com', {}, ip(2))).status).toBe(200)

    const known = await resend(lea.email, {}, ip(3))
    const unknown = await resend('nobody@example.com', {}, ip(4))

    for (const res of [known, unknown]) {
      expect(res.status).toBe(429)
      const retryAfter = Number(res.headers.get('retry-after'))
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(60)
    }
    expect(verificationMailsTo(lea.email)).toHaveLength(2)
    // Une minute plus tard, le renvoi repart.
    later(MINUTE + SECOND)
    expect((await resend(lea.email, {}, ip(5))).status).toBe(200)
    expect(verificationMailsTo(lea.email)).toHaveLength(3)
  })

  // sec-S3 : une demande compte une fois (pas une fois dans le hook et une fois à l'envoi) : cinq
  // renvois espacés d'une minute passent tous dans l'heure.
  it('allows 5 resends an hour, a minute apart, and refuses the 6th until the hour is over', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 5; i++) {
      if (i > 1) later(MINUTE + SECOND)
      expect((await resend(lea.email, {}, ip(i))).status, `resend ${i}`).toBe(200)
    }
    expect(verificationMailsTo(lea.email)).toHaveLength(6)
    later(MINUTE + SECOND)

    const sixth = await resend(lea.email, {}, ip(6))

    expect(sixth.status).toBe(429)
    const retryAfter = Number(sixth.headers.get('retry-after'))
    expect(retryAfter).toBeGreaterThan(60)
    expect(retryAfter).toBeLessThanOrEqual(HOUR / SECOND)
    expect(verificationMailsTo(lea.email)).toHaveLength(6)
  })

  // sec-S4 : 10 par jour par adresse.
  it('refuses an 11th resend for the same address within a day', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 10; i++) {
      // Cinq par heure, une minute entre deux : une heure de plus après le cinquième.
      later(i === 6 ? HOUR + MINUTE : MINUTE + SECOND)
      expect((await resend(lea.email, {}, ip(i))).status, `resend ${i}`).toBe(200)
    }
    later(HOUR + MINUTE)

    const eleventh = await resend(lea.email, {}, ip(11))

    expect(eleventh.status).toBe(429)
    expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(verificationMailsTo(lea.email)).toHaveLength(11)
    // Le lendemain, le renvoi repart.
    later(24 * HOUR)
    expect((await resend(lea.email, {}, ip(12))).status).toBe(200)
  })

  // sec-S1 et sec-S2 (comme le mot de passe oublié) : l'adresse compte avant la recherche de son
  // compte, et sous une seule écriture (minuscules, sans blancs).
  it('counts the address before looking for its account, however it is written', async () => {
    expect((await resend('LEA@Example.com', {}, ip(1))).status).toBe(200)
    await ctx.signUp(lea)

    const second = await resend(' lea@example.com ', {}, ip(2))

    expect(second.status).toBe(429)
    expect(verificationMailsTo(lea.email)).toHaveLength(1)
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    for (const key of keys) expect(key.toLowerCase()).not.toContain('lea@')
  })

  it('refuses a 6th request from the same connection within 15 minutes, malformed ones included', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 5; i++) {
      expect((await resend('not-an-address')).status).toBe(400)
    }

    const sixth = await resend(lea.email)

    expect(sixth.status).toBe(429)
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(verificationMailsTo(lea.email)).toHaveLength(1)
    expect(AUTH_RATE_RULES).toMatchObject({
      '/send-verification-email': { window: 15 * 60, max: 5 },
    })
  })
})

// sec-S3 : se connecter avant d'avoir vérifié renvoie aussi le lien (sendOnSignIn). Ce renvoi a son
// propre compteur, par membre (3 par heure), sans 429 : un tiers qui épuise le quota de l'adresse
// par « Renvoyer l'e-mail » n'empêche pas le membre de recevoir son lien en se connectant.
describe('the link resent by a sign-in before verification', () => {
  it('still leaves after a third party used up the resend quota of the address', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 5; i++) {
      if (i > 1) later(MINUTE + SECOND)
      expect((await resend(lea.email, {}, ip(i))).status).toBe(200)
    }
    later(MINUTE + SECOND)
    expect((await resend(lea.email, {}, ip(6))).status).toBe(429)
    const before = verificationMailsTo(lea.email).length

    const signIn = await ctx.signIn(lea)

    expect(signIn.status).toBe(403)
    expect(verificationMailsTo(lea.email)).toHaveLength(before + 1)
    expect((await accountOf(lea.email)).emailVerified).toBe(false)
  })

  it('leaves at most 3 times an hour, without ever answering 429', async () => {
    await ctx.signUp(lea)
    const before = verificationMailsTo(lea.email).length

    const statuses: number[] = []
    for (let i = 1; i <= 4; i++) {
      // Un quota de la connexion par adresse IP (5 par quart d'heure) : une adresse par essai.
      const res = await ctx.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...ip(i) },
        body: JSON.stringify({ email: lea.email, password: lea.password }),
      })
      statuses.push(res.status)
    }

    expect(statuses).toEqual([403, 403, 403, 403])
    expect(verificationMailsTo(lea.email)).toHaveLength(before + 3)
    // Une heure plus tard, la connexion renvoie de nouveau le lien.
    later(HOUR + MINUTE)
    await ctx.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ip(5) },
      body: JSON.stringify({ email: lea.email, password: lea.password }),
    })
    expect(verificationMailsTo(lea.email)).toHaveLength(before + 4)
  })

  it('does not use up the resend quota of the address', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 3; i++) {
      await ctx.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...ip(i) },
        body: JSON.stringify({ email: lea.email, password: lea.password }),
      })
    }
    const before = verificationMailsTo(lea.email).length

    const res = await resend(lea.email, {}, ip(9))

    expect(res.status).toBe(200)
    expect(verificationMailsTo(lea.email)).toHaveLength(before + 1)
  })

  // sec-S6, relecture de sécurité de R2 (C3) : la connexion accepte un `callbackURL`, que Better
  // Auth recopierait dans le lien. La page reste imposée : le lien mène à /verified, rien d'autre.
  it('leads to our page even when the sign-in asks for another one', async () => {
    await ctx.signUp(lea)
    const before = verificationMailsTo(lea.email).length

    const signIn = await ctx.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ip(1) },
      body: JSON.stringify({
        email: lea.email,
        password: lea.password,
        callbackURL: `${TEST_APP_URL}/evil-page`,
      }),
    })

    expect(signIn.status).toBe(403)
    expect(verificationMailsTo(lea.email)).toHaveLength(before + 1)
    const mail = verificationMailsTo(lea.email).at(-1)
    expect(mail?.text).not.toContain('evil')
    expect(mail?.html).not.toContain('evil')
    const link = linkOf(lea.email)
    expect(link.searchParams.get('callbackURL')).toBe(VERIFIED_PAGE)
    const opened = await open(link)
    expect(opened.headers.get('location')).toBe(VERIFIED_PAGE)
  })
})
