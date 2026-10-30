// Tests d'intégration de la tranche R2, A4 : « Changer d'adresse » sur la page « Vérifie ta boîte
// mail », avant d'avoir vérifié (docs/scenarios/refonte.md). Un nouveau membre s'est trompé d'une
// lettre : il donne l'adresse saisie, son mot de passe et la bonne adresse
// (POST /v1/account/unverified-email, contrat ChangeUnverifiedEmailRequest), sans session. L'ancien
// lien cesse de marcher, un nouveau part à la bonne adresse. Règles du plan : sec-S7 (quotas après
// un mot de passe juste), sec-S9 (rien à l'ancienne adresse, minuscules, route publique sans
// session), sec-S13 (un lien d'inscription plus ancien que la correction est refusé), D4 (une
// adresse déjà prise reçoit la même réponse qu'une adresse libre), jur-7 (3 par jour vers une même
// nouvelle adresse).
import { appName } from '@ruche/brand'
import { ChangeUnverifiedEmailResponse, ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, TEST_APP_URL, type TestContext } from '../testing/context'

let ctx: TestContext

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const START = new Date('2026-11-02T08:00:00.000Z')
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const ROUTE = '/v1/account/unverified-email'
// Léa s'inscrit avec une faute de frappe, puis corrige.
const TYPO = 'lea@exampel.com'
const RIGHT = 'lea@example.com'
const lea = { name: 'Léa', email: TYPO, password: 'correct-horse-battery' }
const ines = { name: 'Inès', email: 'ines@example.com', password: 'ines-long-password' }
const VERIFIED_PAGE = `${TEST_APP_URL}/verified`
/** Une adresse IP par appel, pour que le quota par adresse IP ne cache pas les autres. */
const ip = (n: number) => ({ 'x-real-ip': `198.51.100.${n}` })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await ctx.close()
})

/** La correction, telle que l'appli l'envoie ; `body` peut être mal formé exprès. */
const correct = (body: unknown, headers: Record<string, string> = {}) =>
  ctx.request(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** La demande ordinaire de Léa : de l'adresse mal tapée vers la bonne. */
const leaCorrects = (newEmail = RIGHT, headers: Record<string, string> = {}) =>
  correct({ email: TYPO, password: lea.password, newEmail }, headers)

/** Les e-mails de vérification reçus par une adresse (le lien /verify-email). */
const verificationMailsTo = (to: string) =>
  ctx.mailer.sent.filter(
    (mail) => mail.to === to && mail.text.includes('/api/auth/verify-email?token='),
  )

const linkIn = (text: string) => {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`no link in e-mail: ${text}`)
  return new URL(match[0])
}

const lastLinkTo = (to: string) => {
  const mail = verificationMailsTo(to).at(-1)
  if (!mail) throw new Error(`no verification e-mail to ${to}`)
  return linkIn(mail.text)
}

const open = (link: URL) => ctx.request(link.pathname + link.search)

/** Où mène une redirection : la page et le code d'erreur éventuel. */
const landing = (res: Response) => {
  const location = res.headers.get('location')
  if (!location) throw new Error(`no redirection (status ${res.status})`)
  const url = new URL(location)
  return { page: `${url.origin}${url.pathname}`, error: url.searchParams.get('error') }
}

const accountNamed = async (name: string) => {
  const [row] = await ctx.db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user)
    .where(eq(schema.user.name, name))
  if (!row) throw new Error(`no account named ${name}`)
  return row
}

const errorOf = async (res: Response) => ErrorResponse.parse(await res.json()).error

describe('correcting my address before verifying it', () => {
  it('sends the link to the corrected address, and the old link no longer works', async () => {
    await ctx.signUp(lea)
    const oldLink = lastLinkTo(TYPO)
    const { createdAt } = await accountNamed('Léa')
    later(SECOND)

    const res = await leaCorrects()

    expect(res.status).toBe(200)
    expect(ChangeUnverifiedEmailResponse.parse(await res.json())).toEqual({ sentTo: RIGHT })
    const account = await accountNamed('Léa')
    expect(account.email).toBe(RIGHT)
    expect(account.emailVerified).toBe(false)
    // La date d'inscription ne bouge pas : la purge des comptes jamais vérifiés (30 jours) non plus.
    expect(account.createdAt).toEqual(createdAt)
    // sec-S9 : rien ne part à l'ancienne adresse.
    expect(verificationMailsTo(TYPO)).toHaveLength(1)
    expect(ctx.mailer.sent.filter((mail) => mail.to === TYPO)).toHaveLength(1)

    const old = await open(oldLink)
    expect(landing(old).error).not.toBeNull()
    expect((await accountNamed('Léa')).emailVerified).toBe(false)
    const fresh = await open(lastLinkTo(RIGHT))
    expect(landing(fresh)).toEqual({ page: VERIFIED_PAGE, error: null })
    expect((await accountNamed('Léa')).emailVerified).toBe(true)
    expect((await ctx.signIn({ email: RIGHT, password: lea.password })).status).toBe(200)
    expect((await ctx.signIn(lea)).status).toBe(401)
  })

  it('writes the new e-mail in the language of the account, to our page only', async () => {
    await ctx.signUp({ ...lea, language: 'en' })

    await leaCorrects()

    const mail = verificationMailsTo(RIGHT).at(-1)
    expect(mail?.html).toContain('<html lang="en"')
    const link = lastLinkTo(RIGHT)
    expect(link.origin).toBe(new URL(ctx.auth.options.baseURL ?? '').origin)
    expect(link.searchParams.get('callbackURL')).toBe(VERIFIED_PAGE)
  })

  // sec-S9 : les adresses se rangent en minuscules, comme Better Auth le fait à l'inscription.
  it('stores the new address in lower case and answers it that way', async () => {
    await ctx.signUp(lea)

    const res = await leaCorrects('Lea.Morel@Example.COM')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sentTo: 'lea.morel@example.com' })
    expect((await accountNamed('Léa')).email).toBe('lea.morel@example.com')
    expect(verificationMailsTo('lea.morel@example.com')).toHaveLength(1)
  })

  it('works without any session, and ignores the session of someone else', async () => {
    await ctx.signUp(lea)
    const inesCookie = await ctx.verifiedMember(ines)

    const res = await leaCorrects(RIGHT, { cookie: inesCookie })

    expect(res.status).toBe(200)
    expect((await accountNamed('Léa')).email).toBe(RIGHT)
    expect((await accountNamed('Inès')).email).toBe(ines.email)
  })

  it('refuses a request sent from another website (CSRF)', async () => {
    await ctx.signUp(lea)

    const res = await leaCorrects(RIGHT, { origin: 'https://evil.example' })

    expect(res.status).toBe(403)
    expect((await accountNamed('Léa')).email).toBe(TYPO)
  })

  // sec-S5 (comme les autres envois de R2) : l'e-mail part en arrière-plan.
  it('answers without waiting for the e-mail, and the same when the mailer fails', async () => {
    await ctx.signUp(lea)
    const send = vi.spyOn(ctx.mailer, 'send').mockImplementation(() => new Promise(() => {}))

    const res = await Promise.race([
      leaCorrects(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('the answer waited for the e-mail')), SECOND),
      ),
    ])
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalled()

    send.mockRejectedValue(new Error('SMTP down'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await correct(
      { email: RIGHT, password: lea.password, newEmail: 'lea2@example.com' },
      ip(2),
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(failing.status).toBe(200)
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/lea2?@|token=/)
  })
})

describe('a refused correction', () => {
  it('answers 401 for an unknown address and for a wrong password, the same way, without e-mail', async () => {
    await ctx.signUp(lea)
    const before = ctx.mailer.sent.length

    const unknown = await correct(
      { email: 'nobody@example.com', password: lea.password, newEmail: RIGHT },
      ip(1),
    )
    const wrong = await correct(
      { email: TYPO, password: 'wrong-password-123', newEmail: RIGHT },
      ip(2),
    )

    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    const a = await errorOf(unknown)
    const b = await errorOf(wrong)
    expect(a.code).toBe('unauthorized')
    expect(b).toEqual(a)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    expect((await accountNamed('Léa')).email).toBe(TYPO)
  })

  it('answers 409 already_verified for a verified account, and changes nothing', async () => {
    await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const res = await correct({
      email: ines.email,
      password: ines.password,
      newEmail: 'ines.b@example.com',
    })

    expect(res.status).toBe(409)
    expect((await errorOf(res)).code).toBe('already_verified')
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    expect((await accountNamed('Inès')).email).toBe(ines.email)
  })

  it('says it in the language of the visitor', async () => {
    await ctx.verifiedMember(ines)

    const res = await correct(
      { email: ines.email, password: ines.password, newEmail: 'ines.b@example.com' },
      { 'accept-language': 'en' },
    )

    expect(res.status).toBe(409)
    expect((await errorOf(res)).message).toBe(fill(resources.en.translation.errors.alreadyVerified))
  })

  it('refuses a malformed request with 400, and a password that is too long before hashing it', async () => {
    await ctx.signUp(lea)

    expect((await correct('x', ip(1))).status).toBe(400)
    expect((await correct({ email: TYPO, newEmail: RIGHT }, ip(2))).status).toBe(400)
    expect(
      (await correct({ email: TYPO, password: lea.password, newEmail: 'nope' }, ip(3))).status,
    ).toBe(400)
    const tooLong = await correct(
      { email: TYPO, password: 'x'.repeat(10_000), newEmail: RIGHT },
      ip(4),
    )
    expect(tooLong.status).toBe(400)
    expect((await accountNamed('Léa')).email).toBe(TYPO)
  })
})

// D4 (sec-S8, jur-B3) : une nouvelle adresse déjà prise reçoit la même réponse qu'une adresse
// libre ; son propriétaire est prévenu, comme à l'inscription ; rien ne change.
describe('a new address that already has an account', () => {
  it('gets the same answer as a free one, warns the owner, and changes nothing', async () => {
    await ctx.signUp(lea)
    await ctx.verifiedMember(ines)
    const before = ctx.mailer.sent.length

    const taken = await leaCorrects(ines.email, ip(1))

    expect(taken.status).toBe(200)
    expect(await taken.json()).toEqual({ sentTo: ines.email })
    expect((await accountNamed('Léa')).email).toBe(TYPO)
    const sent = ctx.mailer.sent.slice(before)
    expect(sent.map((mail) => mail.to)).toEqual([ines.email])
    const [warning] = sent
    expect(warning?.subject).toBe(fill(resources.fr.translation.email.existingAccount.subject))
    expect(warning?.subject).toContain(appName)
    // sec-S9 : rien du demandeur dans cet e-mail.
    for (const part of [warning?.text ?? '', warning?.html ?? '']) {
      expect(part).not.toContain('Léa')
      expect(part).not.toContain('exampel')
    }
    expect(verificationMailsTo(ines.email)).toEqual([])
    expect((await accountNamed('Inès')).email).toBe(ines.email)
  })
})

// sec-S13 : un lien d'inscription émis avant la correction ne vaut plus rien, même s'il désigne
// une adresse que le compte reprend ensuite. Léa corrige vers la bonne adresse, puis revient à la
// première : le tout premier lien (plus ancien que la première correction) est refusé, le dernier
// aboutit.
describe('a sign-up link issued before the correction', () => {
  it('is refused even when the account comes back to that address', async () => {
    await ctx.signUp(lea)
    const first = lastLinkTo(TYPO)
    later(2 * SECOND)
    expect((await leaCorrects(RIGHT, ip(1))).status).toBe(200)
    later(2 * SECOND)
    const back = await correct({ email: RIGHT, password: lea.password, newEmail: TYPO }, ip(2))
    expect(back.status).toBe(200)
    expect((await accountNamed('Léa')).email).toBe(TYPO)

    const refused = await open(first)

    expect(landing(refused).error).not.toBeNull()
    expect((await accountNamed('Léa')).emailVerified).toBe(false)
    const accepted = await open(lastLinkTo(TYPO))
    expect(landing(accepted)).toEqual({ page: VERIFIED_PAGE, error: null })
    expect((await accountNamed('Léa')).emailVerified).toBe(true)
  })
})

describe('the quotas of the correction', () => {
  // Par adresse IP, 5 par quart d'heure, comptés avant la validation (sec-S9 : « counts even
  // malformed »).
  it('refuses a 6th request from the same connection within 15 minutes, malformed ones included', async () => {
    await ctx.signUp(lea)
    for (let i = 1; i <= 5; i++) expect((await correct('x')).status).toBe(400)

    const sixth = await leaCorrects()

    expect(sixth.status).toBe(429)
    expect((await errorOf(sixth)).code).toBe('rate_limited')
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await accountNamed('Léa')).email).toBe(TYPO)
    // Témoin : une autre connexion passe.
    expect((await leaCorrects(RIGHT, ip(9))).status).toBe(200)
  })

  // Par adresse de départ, 3 par heure, comptés avant la recherche du compte : trois essais sur
  // une adresse sans compte, puis le compte est créé, et le quatrième essai est refusé.
  it('counts the address before looking for its account: 3 per hour, from any connection', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await correct({ email: TYPO, password: lea.password, newEmail: RIGHT }, ip(i))
      expect(res.status).toBe(401)
    }
    await ctx.signUp(lea)

    const fourth = await leaCorrects(RIGHT, ip(4))

    expect(fourth.status).toBe(429)
    expect(Number(fourth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await accountNamed('Léa')).email).toBe(TYPO)
    // La clé du compteur ne garde pas l'adresse en clair (sec-S2).
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    for (const key of keys) expect(key.toLowerCase()).not.toContain('lea@')
    later(HOUR + MINUTE)
    expect((await leaCorrects(RIGHT, ip(5))).status).toBe(200)
  })

  // sec-S7 : après un mot de passe juste, un compteur par compte (3 par heure, 5 par jour) : quatre
  // corrections enchaînées, chacune depuis la nouvelle adresse, et la quatrième est refusée.
  it('refuses a 4th successful correction of the same account within an hour, and a 6th within a day', async () => {
    await ctx.signUp(lea)
    const addresses = [TYPO, 'lea1@example.com', 'lea2@example.com', 'lea3@example.com']
    for (let i = 1; i <= 3; i++) {
      const res = await correct(
        { email: addresses[i - 1], password: lea.password, newEmail: addresses[i] },
        ip(i),
      )
      expect(res.status, `correction ${i}`).toBe(200)
    }

    const fourth = await correct(
      { email: 'lea3@example.com', password: lea.password, newEmail: 'lea4@example.com' },
      ip(4),
    )

    expect(fourth.status).toBe(429)
    expect(Number(fourth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await accountNamed('Léa')).email).toBe('lea3@example.com')
    // Une heure plus tard, deux de plus passent (5 par jour), la sixième est refusée.
    later(HOUR + MINUTE)
    expect(
      (
        await correct(
          { email: 'lea3@example.com', password: lea.password, newEmail: 'lea4@example.com' },
          ip(5),
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await correct(
          { email: 'lea4@example.com', password: lea.password, newEmail: 'lea5@example.com' },
          ip(6),
        )
      ).status,
    ).toBe(200)
    const sixth = await correct(
      { email: 'lea5@example.com', password: lea.password, newEmail: 'lea6@example.com' },
      ip(7),
    )
    expect(sixth.status).toBe(429)
    expect((await accountNamed('Léa')).email).toBe('lea5@example.com')
  })

  // sec-S7 et jur-7 : par adresse de destination, 3 par heure et 3 par jour : quatre comptes qui
  // visent la même boîte, et la quatrième demande est refusée, encore deux heures plus tard.
  it('sends at most 3 e-mails a day to the same new address, whoever asks', async () => {
    const target = 'shared@example.com'
    const members = ['Alix', 'Bao', 'Chloé', 'Dan'].map((name, i) => ({
      name,
      email: `member${i + 1}@example.com`,
      password: `member-${i + 1}-long-password`,
    }))
    for (const member of members) await ctx.signUp(member)
    const statuses: number[] = []
    for (const [i, member] of members.entries()) {
      const res = await correct(
        { email: member.email, password: member.password, newEmail: target },
        ip(i + 1),
      )
      statuses.push(res.status)
    }

    expect(statuses).toEqual([200, 200, 200, 429])
    expect(ctx.mailer.sent.filter((mail) => mail.to === target)).toHaveLength(3)
    later(2 * HOUR)
    const dan = members[3]
    if (!dan) throw new Error('no fourth member')
    const again = await correct(
      { email: dan.email, password: dan.password, newEmail: target },
      ip(9),
    )
    expect(again.status).toBe(429)
    expect(ctx.mailer.sent.filter((mail) => mail.to === target)).toHaveLength(3)
  })

  // Les compteurs d'un compte portent son identifiant : ils partent avec lui (jur-6).
  it('erases the counters of the account when it is deleted', async () => {
    await ctx.signUp(lea)
    expect((await leaCorrects(RIGHT, ip(1))).status).toBe(200)
    const { id } = await accountNamed('Léa')
    const withCounter = (await ctx.db.select().from(schema.apiRateLimit)).filter((row) =>
      row.key.includes(id),
    )
    expect(withCounter.length).toBeGreaterThan(0)
    const cookie = ctx.cookiesFrom(await open(lastLinkTo(RIGHT)))

    const deleted = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ password: lea.password }),
    })

    expect(deleted.status).toBe(200)
    const left = (await ctx.db.select().from(schema.apiRateLimit)).filter((row) =>
      row.key.includes(id),
    )
    expect(left).toEqual([])
  })
})
