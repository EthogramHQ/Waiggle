// Les mots de passe : leur hachage (test de garde), puis, depuis la tranche R2 (docs/scenarios/
// refonte.md, « Le mot de passe »), le mot de passe oublié (POST /api/auth/request-password-reset,
// puis /reset-password depuis le lien reçu) et le changement de mot de passe depuis les réglages
// (POST /api/auth/change-password). Les trois routes de Better Auth étaient fermées ; R2 les ouvre
// avec les règles du plan (A1, A2) et de ses relectures de sécurité (sec-B1, B2, S1, S2, S5, S6,
// S10, S11, S12, S14) et juridique (jur-2, jur-8).
//
// Les tests de la première partie remplacent scrypt par un hachage rapide (testing/context.ts) :
// le premier vérifie que la configuration de production, elle, garde bien scrypt.
import { createHash } from 'node:crypto'
import { ErrorResponse, Me } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { createTestPgliteDb } from '@ruche/db/pglite'
import { fill, resources } from '@ruche/i18n'
import { verifyPassword } from 'better-auth/crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryMailer } from '../email/mailer'
import { createMemoryStorage } from '../media/storage'
import { activity } from '../testing/activity'
import {
  createTestContext,
  fastPasswordHashing,
  TEST_APP_URL,
  type TestContext,
} from '../testing/context'
import { AUTH_RATE_RULES, createAuth } from './auth'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

describe('password hashing', () => {
  it('keeps scrypt in the production configuration', async () => {
    const { db, close } = await createTestPgliteDb()
    closers.push(close)
    // Les mêmes options que src/index.ts : aucune option `password`.
    const auth = createAuth({
      db,
      mailer: createMemoryMailer(),
      storage: createMemoryStorage(),
      secret: 'production-like-secret-long-enough-for-tests',
      publicApiUrl: 'https://api.example.com',
      appUrl: 'https://app.example.com',
      rateLimit: true,
      inviteCode: 'Miel-2026-Noel',
    })
    // $context : la configuration que Better Auth s'est réellement construite.
    const { password } = await auth.$context
    const hash = await password.hash('correct-horse-battery')

    // L'empreinte de scrypt dans Better Auth : « sel:clé » en hexadécimal (16 et 64 octets).
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
    expect(await verifyPassword({ hash, password: 'correct-horse-battery' })).toBe(true)
    expect(await fastPasswordHashing.verify({ hash, password: 'correct-horse-battery' })).toBe(
      false,
    )
  })

  it('uses the fast hashing in tests, which still tells two passwords apart', async () => {
    const ctx = await createTestContext()
    closers.push(ctx.close)
    const { password } = await ctx.auth.$context
    const hash = await password.hash('correct-horse-battery')

    expect(hash).toMatch(/^test-scrypt:/)
    expect(await password.verify({ hash, password: 'correct-horse-battery' })).toBe(true)
    expect(await password.verify({ hash, password: 'correct-horse-batterY' })).toBe(false)
    // Deux empreintes du même mot de passe diffèrent : chacune a son sel.
    expect(await password.hash('correct-horse-battery')).not.toBe(hash)
  })
})

// ─── Tranche R2 : le mot de passe oublié et le changement de mot de passe ───────────────────────

let ctx: TestContext

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
// Une fausse horloge, posée AVANT l'API (pôle code, « Dates ») : les quotas, les sessions et les
// jetons lisent l'horloge de JavaScript dès leur création.
const START = new Date('2026-11-02T08:00:00.000Z')
const later = (ms: number) => vi.setSystemTime(Date.now() + ms)

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const malik = { name: 'Malik', email: 'malik@example.com', password: 'another-horse-battery' }
const NEW_PASSWORD = 'new-horse-battery-2026'
const OTHER_PASSWORD = 'yet-another-horse-2026'
/** La page de l'appli où mène le lien du mot de passe oublié : le jeton y est le seul paramètre. */
const RESET_PAGE = `${TEST_APP_URL}/reset-password`
/** Une adresse IP par appel, pour que les quotas par adresse IP ne cachent pas ceux par membre. */
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

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  ctx.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** « Mot de passe oublié ? » : l'adresse, et parfois ce qu'un visiteur malin ajouterait. */
const forgot = (email: string, extra: object = {}, headers: Record<string, string> = {}) =>
  post('/api/auth/request-password-reset', { email, ...extra }, headers)

/** Les e-mails du mot de passe oublié reçus par une adresse : ceux qui portent le lien de la page. */
const resetMailsTo = (to: string) =>
  ctx.mailer.sent.filter((mail) => mail.to === to && mail.text.includes(`${RESET_PAGE}?token=`))

const linkIn = (text: string) => {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`no link in e-mail: ${text}`)
  return new URL(match[0])
}

/** Le lien du dernier e-mail de mot de passe oublié reçu par une adresse. */
const lastResetLink = (to: string) => {
  const mail = resetMailsTo(to).at(-1)
  if (!mail) throw new Error(`no reset e-mail to ${to}`)
  return linkIn(mail.text)
}

/** Le jeton du dernier lien reçu : ce que la page de l'appli envoie à l'API. */
const lastToken = (to: string) => {
  const token = lastResetLink(to).searchParams.get('token')
  if (!token) throw new Error('no token in the reset link')
  return token
}

/** « Choisir un nouveau mot de passe » depuis le lien (contrat ResetPasswordRequest). */
const reset = (token: string, newPassword = NEW_PASSWORD, headers: Record<string, string> = {}) =>
  post('/api/auth/reset-password', { token, newPassword }, headers)

/** « Changer mon mot de passe » depuis les réglages (contrat ChangePasswordRequest). */
const changePassword = (cookie: string, body: unknown, headers: Record<string, string> = {}) =>
  post('/api/auth/change-password', body, { cookie, ...headers })

const me = (cookie: string) => ctx.request('/v1/me', { headers: { cookie } })

/** Le compte d'une adresse, lu en base. */
const accountOf = async (email: string) => {
  const [row] = await ctx.db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      emailVerified: schema.user.emailVerified,
      updatedAt: schema.user.updatedAt,
    })
    .from(schema.user)
    .where(eq(schema.user.email, email))
  if (!row) throw new Error(`no account for ${email}`)
  return row
}

/** Le pseudo actuel d'un membre (null : aucun), lu en base : un compte non vérifié n'en a pas. */
const handleOf = async (userId: string) => {
  const [row] = await ctx.db
    .select({ handle: schema.memberHandle.handle })
    .from(schema.memberHandle)
    .where(and(eq(schema.memberHandle.userId, userId), isNull(schema.memberHandle.releasedAt)))
  return row?.handle ?? null
}

/** Les jetons temporaires qui désignent ce membre (ceux du mot de passe oublié, sec-S12). */
const resetTokensOf = (userId: string) =>
  ctx.db.select().from(schema.verification).where(eq(schema.verification.value, userId))

/** Le code d'une erreur de Better Auth (INVALID_TOKEN, INVALID_PASSWORD…). */
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code

/** Attend une promesse, mais au plus une seconde : la réponse ne doit pas attendre un e-mail. */
const withinASecond = <T>(step: T | Promise<T>) =>
  Promise.race([
    Promise.resolve(step),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('the answer waited for the e-mail')), SECOND),
    ),
  ])

/** Suspend un membre (tranche 7c), par un administrateur créé pour l'occasion. */
const suspend = async (memberId: string) => {
  const act = activity(ctx)
  const admin = await ctx.verifiedMember({
    name: 'Louis',
    email: 'louis@example.com',
    password: 'louis-long-password',
  })
  await act.makeAdmin((await act.me(admin)).id)
  const res = await act.send('POST', '/v1/moderation/decisions', admin, {
    action: 'suspend',
    memberId,
    duration: '7d',
    ground: 'rules',
    explanation: 'Des messages insultants, plusieurs fois.',
  })
  expect(res.status).toBe(201)
}

// ─── A1. Mot de passe oublié ─────────────────────────────────────────────────────────────────────

describe('asking for a password reset', () => {
  it('answers the same whether the address has an account or not, and e-mails only the account', async () => {
    await ctx.verifiedMember(lea)
    const before = ctx.mailer.sent.length

    const known = await forgot(lea.email)
    const unknown = await forgot('nobody@example.com')

    expect(known.status).toBe(200)
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
    const sent = ctx.mailer.sent.slice(before)
    expect(sent.map((mail) => mail.to)).toEqual([lea.email])
  })

  // Le lien mène à la page de l'appli, pas à la route GET de Better Auth : il ne porte que le
  // jeton (sec-S6, jur-2), que la page enverra à POST /reset-password.
  it('links to the reset page of the app, with the token as its only parameter', async () => {
    await ctx.verifiedMember(lea)

    await forgot(lea.email)

    const link = lastResetLink(lea.email)
    expect(`${link.origin}${link.pathname}`).toBe(RESET_PAGE)
    expect([...link.searchParams.keys()]).toEqual(['token'])
    expect(link.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('writes the e-mail in the language of the account', async () => {
    await ctx.verifiedMember({ ...malik, language: 'en' })
    await ctx.verifiedMember(lea)

    await forgot(malik.email)
    await forgot(lea.email, {}, ip(2))

    const english = resetMailsTo(malik.email).at(-1)
    const french = resetMailsTo(lea.email).at(-1)
    expect(english?.html).toContain('<html lang="en"')
    expect(english?.subject).toBe(fill(resources.en.translation.email.resetPassword.subject))
    expect(french?.html).toContain('<html lang="fr"')
    expect(french?.subject).toBe(fill(resources.fr.translation.email.resetPassword.subject))
  })

  // jur-2 : l'adresse n'a peut-être encore rien prouvé ; l'e-mail peut partir chez un inconnu
  // après une faute de frappe à l'inscription. Il ne lui apprend jamais le nom du compte (le texte
  // validé choisit une salutation sans nom dans tous les cas).
  it('greets nobody by name, verified or not', async () => {
    await ctx.signUp(lea)
    await ctx.verifiedMember(malik)

    await forgot(lea.email)
    await forgot(malik.email, {}, ip(2))

    for (const [to, name] of [
      [lea.email, 'Léa'],
      [malik.email, 'Malik'],
    ] as const) {
      const mail = resetMailsTo(to).at(-1)
      expect(mail, to).toBeDefined()
      expect(mail?.text).not.toContain(name)
      expect(mail?.html).not.toContain(name)
    }
  })

  // sec-S6 : un visiteur peut envoyer n'importe quel `redirectTo` à Better Auth. Le lien de
  // l'e-mail n'en tient aucun compte : toujours notre page, et aucun e-mail vers un autre site.
  it('ignores a trapped redirectTo and still links to our page only', async () => {
    await ctx.verifiedMember(lea)

    await forgot(lea.email, { redirectTo: `${TEST_APP_URL}/evil-page` })
    await forgot(lea.email, { redirectTo: 'https://evil.example/steal' }, ip(2))

    const mails = ctx.mailer.sent.filter((mail) => mail.to === lea.email)
    for (const mail of mails) {
      expect(mail.text).not.toContain('evil')
      expect(mail.html).not.toContain('evil')
    }
    const link = lastResetLink(lea.email)
    expect(`${link.origin}${link.pathname}`).toBe(RESET_PAGE)
    expect([...link.searchParams.keys()]).toEqual(['token'])
  })

  // sec-S5 : l'envoi part en arrière-plan. Attendre l'e-mail dirait, par la durée de la réponse,
  // si l'adresse a un compte (rien ne part pour une adresse inconnue).
  it('answers without waiting for the e-mail to leave', async () => {
    await ctx.verifiedMember(lea)
    vi.spyOn(ctx.mailer, 'send').mockImplementation(() => new Promise(() => {}))

    const res = await withinASecond(forgot(lea.email))

    expect(res.status).toBe(200)
  })

  // sec-S5, jur-8 : un envoi qui échoue ne change pas la réponse, et le journal ne garde ni
  // l'adresse ni le jeton.
  it('answers the same when the mailer fails, and logs neither the address nor the token', async () => {
    await ctx.verifiedMember(lea)
    const ok = await (await forgot(lea.email)).json()
    vi.spyOn(ctx.mailer, 'send').mockRejectedValue(new Error('SMTP down'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await forgot(lea.email, {}, ip(2))
    // L'envoi est en arrière-plan : on laisse sa promesse échouer avant de lire le journal.
    await new Promise((resolve) => setImmediate(resolve))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(ok)
    expect(errors).toHaveBeenCalled()
    const logged = JSON.stringify(errors.mock.calls)
    expect(logged).not.toContain(lea.email)
    expect(logged).not.toContain('token=')
    expect(logged).not.toContain('SMTP down')
  })
})

describe('the quotas of the password reset request', () => {
  // sec-S1 : le quota par adresse (3 par heure) se compte avant toute recherche de compte. On le
  // prouve avec une adresse qui n'a PAS encore de compte : trois demandes à vide, puis le compte
  // est créé, et la quatrième demande n'envoie rien.
  it('counts an address before looking for its account: 3 per hour, even for an unknown address', async () => {
    for (let i = 1; i <= 3; i++) expect((await forgot(lea.email, {}, ip(i))).status).toBe(200)
    await ctx.verifiedMember(lea)
    const before = ctx.mailer.sent.length

    const fourth = await forgot(lea.email, {}, ip(4))

    // La réponse ne change pas : rien ne révèle le quota d'une adresse (scénario, garde-fous).
    expect(fourth.status).toBe(200)
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    // Une heure plus tard, l'e-mail repart.
    later(HOUR + MINUTE)
    expect((await forgot(lea.email, {}, ip(5))).status).toBe(200)
    expect(resetMailsTo(lea.email)).toHaveLength(1)
  })

  it('sends no 11th e-mail to the same address within a day', async () => {
    await ctx.verifiedMember(lea)
    for (let i = 1; i <= 10; i++) {
      // Trois par heure : l'horloge avance d'une heure après chaque groupe de trois.
      if (i > 1 && (i - 1) % 3 === 0) later(HOUR + MINUTE)
      expect((await forgot(lea.email, {}, ip(i))).status).toBe(200)
    }
    expect(resetMailsTo(lea.email)).toHaveLength(10)
    later(HOUR + MINUTE)

    expect((await forgot(lea.email, {}, ip(11))).status).toBe(200)

    expect(resetMailsTo(lea.email)).toHaveLength(10)
  })

  // sec-S2 : la clé du compteur est un HMAC de l'adresse en minuscules, sans blancs. Une adresse
  // écrite en capitales, ou avec une espace, use le même compteur ; et aucune clé ne garde
  // l'adresse en clair ni son simple SHA-256, qu'un dictionnaire d'adresses retrouverait (jur-6).
  it('counts the address written in capitals or with spaces as the same address, under a keyed hash', async () => {
    await ctx.verifiedMember(lea)
    expect((await forgot('LEA@Example.com', {}, ip(1))).status).toBe(200)
    expect((await forgot(' lea@example.com ', {}, ip(2))).status).toBe(200)
    expect((await forgot('Lea@EXAMPLE.COM', {}, ip(3))).status).toBe(200)
    const before = ctx.mailer.sent.length

    expect((await forgot(lea.email, {}, ip(4))).status).toBe(200)

    expect(ctx.mailer.sent.slice(before)).toEqual([])
    const keys = (await ctx.db.select().from(schema.apiRateLimit)).map((row) => row.key)
    const plainDigest = createHash('sha256').update(lea.email).digest('hex')
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain('lea@')
      expect(key).not.toContain(plainDigest)
    }
  })

  // sec-S1 : une adresse mal formée compte aussi (Better Auth la refuse ensuite). Preuve : après
  // cinq demandes mal formées de la même adresse IP, la sixième, bien formée, bute sur le quota
  // par adresse IP, compté lui aussi avant la validation.
  it('refuses a 6th request from the same connection within 15 minutes, malformed ones included', async () => {
    await ctx.verifiedMember(lea)
    for (let i = 1; i <= 5; i++) {
      expect((await forgot('not-an-address')).status).toBe(400)
    }

    const sixth = await forgot(lea.email)

    expect(sixth.status).toBe(429)
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(resetMailsTo(lea.email)).toEqual([])
    // Témoin : une autre connexion passe.
    expect((await forgot(lea.email, {}, ip(9))).status).toBe(200)
    expect(resetMailsTo(lea.email)).toHaveLength(1)
    expect(AUTH_RATE_RULES).toMatchObject({
      '/request-password-reset': { window: 15 * 60, max: 5 },
    })
  })
})

// ─── A1, suite : choisir un nouveau mot de passe depuis le lien ─────────────────────────────────

describe('choosing a new password from the link', () => {
  it('changes the password, signs out every device and lets the member sign in with the new one', async () => {
    const phone = await ctx.verifiedMember(lea)
    const laptop = ctx.cookiesFrom(await ctx.signIn(lea))
    await forgot(lea.email)

    const res = await reset(lastToken(lea.email))

    expect(res.status).toBe(200)
    // sec-S14 : la révocation se prouve par la route, pas par la base.
    expect((await me(phone)).status).toBe(401)
    expect((await me(laptop)).status).toBe(401)
    expect((await ctx.signIn(lea)).status).toBe(401)
    const signedIn = await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })
    expect(signedIn.status).toBe(200)
    expect((await me(ctx.cookiesFrom(signedIn))).status).toBe(200)
  })

  it('refuses the same link a second time, with the INVALID_TOKEN code', async () => {
    await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)
    expect((await reset(token)).status).toBe(200)

    const again = await reset(token, OTHER_PASSWORD)

    expect(again.status).toBe(400)
    expect(await codeOf(again)).toBe('INVALID_TOKEN')
    expect((await ctx.signIn({ email: lea.email, password: OTHER_PASSWORD })).status).toBe(401)
    expect((await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('refuses a link older than one hour, and a damaged one, the same way', async () => {
    await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)
    later(HOUR + SECOND)

    const expired = await reset(token)
    const damaged = await reset(`${token.slice(0, -2)}xx`)

    expect(expired.status).toBe(400)
    expect(await codeOf(expired)).toBe('INVALID_TOKEN')
    expect(damaged.status).toBe(400)
    expect(await codeOf(damaged)).toBe('INVALID_TOKEN')
    expect((await ctx.signIn(lea)).status).toBe(200)
    // La durée vient du réglage de Better Auth, lu aussi par l'e-mail (jur-4).
    expect(ctx.auth.options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(3600)
  })

  it('keeps the rules of the password: too short is refused and nothing changes', async () => {
    await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)

    const res = await reset(token, 'short')

    expect(res.status).toBe(400)
    expect((await ctx.signIn(lea)).status).toBe(200)
  })

  it('sends the security e-mail « password changed », without the password, in the language of the account', async () => {
    await ctx.verifiedMember({ ...lea, language: 'en' })
    await forgot(lea.email)
    const token = lastToken(lea.email)
    const before = ctx.mailer.sent.length

    expect((await reset(token)).status).toBe(200)

    const sent = ctx.mailer.sent.slice(before)
    expect(sent.map((mail) => mail.to)).toEqual([lea.email])
    const [mail] = sent
    expect(mail?.html).toContain('<html lang="en"')
    expect(mail?.text).not.toContain(NEW_PASSWORD)
    expect(mail?.html).not.toContain(NEW_PASSWORD)
    // Ce n'est pas un nouveau lien de mot de passe oublié : aucun jeton dedans.
    expect(mail?.text).not.toContain('token=')
    expect(mail?.subject).not.toBe(resetMailsTo(lea.email)[0]?.subject)
  })

  // Décision de Louis du 29/10/2026 : le lien vérifie aussi l'adresse (il prouve qu'on lit sa
  // boîte), et le membre reçoit son pseudo comme après le lien d'inscription.
  it('verifies the address the link was sent to, gives the handle, and lets the member sign in', async () => {
    await ctx.signUp(lea)
    const { id } = await accountOf(lea.email)
    expect(await handleOf(id)).toBeNull()
    await forgot(lea.email)

    expect((await reset(lastToken(lea.email))).status).toBe(200)

    expect((await accountOf(lea.email)).emailVerified).toBe(true)
    expect(await handleOf(id)).toBe('lea')
    const signedIn = await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })
    expect(signedIn.status).toBe(200)
    expect(Me.parse(await (await me(ctx.cookiesFrom(signedIn))).json()).handle).toBe('lea')
  })

  // sec-B1 : seulement si c'est l'adresse à laquelle le lien est parti. Après la demande, l'adresse
  // du compte change (ici directement en base : la route A4 efface les jetons, sec-B2, et ne
  // permet pas d'arriver dans cet état) ; le lien change encore le mot de passe, mais ne vérifie
  // pas la nouvelle adresse, à qui rien n'a été envoyé.
  it('does not verify an address the link was not sent to', async () => {
    await ctx.signUp(lea)
    const { id } = await accountOf(lea.email)
    await forgot(lea.email)
    const token = lastToken(lea.email)
    await ctx.db
      .update(schema.user)
      .set({ email: 'lea.b@example.com' })
      .where(eq(schema.user.id, id))

    expect((await reset(token)).status).toBe(200)

    expect((await accountOf('lea.b@example.com')).emailVerified).toBe(false)
    expect(await handleOf(id)).toBeNull()
    expect((await ctx.signIn({ email: 'lea.b@example.com', password: NEW_PASSWORD })).status).toBe(
      403,
    )
  })

  // sec-S14 : un membre suspendu peut changer son mot de passe, mais reste suspendu.
  it('lets a suspended member reset the password, who stays suspended', async () => {
    await ctx.verifiedMember(lea)
    await suspend((await accountOf(lea.email)).id)
    await forgot(lea.email)

    expect((await reset(lastToken(lea.email))).status).toBe(200)

    const cookie = ctx.cookiesFrom(await ctx.signIn({ email: lea.email, password: NEW_PASSWORD }))
    expect((await me(cookie)).status).toBe(200)
    const post1 = await post(
      '/v1/projects',
      { title: 'Météo', pitch: 'La pluie de demain.' },
      { cookie },
    )
    expect(post1.status).toBe(403)
    expect(ErrorResponse.parse(await post1.json()).error.code).toBe('suspended')
  })

  it('refuses an 11th attempt from the same connection within 15 minutes', async () => {
    await ctx.verifiedMember(lea)
    for (let i = 1; i <= 10; i++) {
      expect((await reset(`fake-token-${i}`)).status).toBe(400)
    }

    const eleventh = await reset('fake-token-11')

    expect(eleventh.status).toBe(429)
    expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(AUTH_RATE_RULES).toMatchObject({ '/reset-password': { window: 15 * 60, max: 10 } })
  })
})

// ─── sec-B2 : tous les jetons de mot de passe oublié tombent avec chaque changement ─────────────

describe('the earlier reset links', () => {
  it('fall when one of them is used', async () => {
    await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const first = lastToken(lea.email)
    await forgot(lea.email, {}, ip(2))
    const second = lastToken(lea.email)
    expect(second).not.toBe(first)

    expect((await reset(first)).status).toBe(200)

    const res = await reset(second, OTHER_PASSWORD)
    expect(res.status).toBe(400)
    expect(await codeOf(res)).toBe('INVALID_TOKEN')
    expect((await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('fall when the member changes the password from the settings', async () => {
    const cookie = await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)

    const changed = await changePassword(cookie, {
      currentPassword: lea.password,
      newPassword: NEW_PASSWORD,
    })
    expect(changed.status).toBe(200)

    const res = await reset(token, OTHER_PASSWORD)
    expect(res.status).toBe(400)
    expect(await codeOf(res)).toBe('INVALID_TOKEN')
    expect((await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })).status).toBe(200)
  })

  it('fall when the member corrects the unverified address', async () => {
    await ctx.signUp(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)

    const corrected = await post('/v1/account/unverified-email', {
      email: lea.email,
      password: lea.password,
      newEmail: 'lea.b@example.com',
    })
    expect(corrected.status).toBe(200)

    const res = await reset(token)
    expect(res.status).toBe(400)
    expect(await codeOf(res)).toBe('INVALID_TOKEN')
  })

  it('fall when an address change is completed', async () => {
    const cookie = await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)
    const verifyLinks = (to: string) =>
      ctx.mailer.sent
        .filter((mail) => mail.to === to && mail.text.includes('/api/auth/verify-email'))
        .map((mail) => linkIn(mail.text))
    const asked = await post(
      '/api/auth/change-email',
      { newEmail: 'lea.b@example.com', password: lea.password },
      { cookie },
    )
    expect(asked.status).toBe(200)
    const first = verifyLinks(lea.email).at(-1)
    if (!first) throw new Error('no first link')
    await ctx.request(first.pathname + first.search, { headers: { cookie } })
    const second = verifyLinks('lea.b@example.com').at(-1)
    if (!second) throw new Error('no second link')
    // D1 : le second lien aboutit dans la session du membre.
    await ctx.request(second.pathname + second.search, { headers: { cookie } })
    expect((await accountOf('lea.b@example.com')).emailVerified).toBe(true)

    const res = await reset(token)
    expect(res.status).toBe(400)
    expect(await codeOf(res)).toBe('INVALID_TOKEN')
  })
})

// ─── sec-S12 : ce que la table des jetons garde ─────────────────────────────────────────────────

describe('the stored reset tokens', () => {
  it('never contain the token itself, and only the reset puts a member id in a row', async () => {
    await ctx.verifiedMember(lea)
    const { id } = await accountOf(lea.email)
    // L'inscription a déjà écrit ses jetons : aucun ne désigne le membre par son identifiant.
    expect(await resetTokensOf(id)).toEqual([])
    await forgot(lea.email)
    const token = lastToken(lea.email)

    const rows = await ctx.db.select().from(schema.verification)
    for (const row of rows) {
      expect(row.identifier).not.toContain(token)
      expect(row.value).not.toContain(token)
    }
    expect(await resetTokensOf(id)).toHaveLength(1)
    expect(ctx.auth.options.verification?.storeIdentifier).toBe('hashed')

    expect((await reset(token)).status).toBe(200)
    expect(await resetTokensOf(id)).toEqual([])
  })

  it('are erased with the account (jur-6)', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const { id } = await accountOf(lea.email)
    await forgot(lea.email)
    expect(await resetTokensOf(id)).toHaveLength(1)

    const deleted = await post('/api/auth/delete-user', { password: lea.password }, { cookie })

    expect(deleted.status).toBe(200)
    expect(await resetTokensOf(id)).toEqual([])
  })
})

// ─── sec-S11 : la route GET /reset-password/:token de Better Auth reste fermée ───────────────────

// Better Auth ouvre aussi GET /reset-password/:token, qui redirige vers n'importe quelle page de
// retour avec le jeton dans l'adresse. Nos liens n'en ont pas besoin : une garde la ferme, sous
// toutes ses écritures, comme une adresse inconnue.
describe('the redirecting reset route of Better Auth', () => {
  it.each([
    ['GET', '/reset-password/some-token?callbackURL=http://localhost:8081/reset-password'],
    ['POST', '/reset-password/some-token?callbackURL=http://localhost:8081/reset-password'],
    ['GET', '/reset-password/some-token'],
    ['GET', '/reset-password/some-token/'],
    ['GET', '/reset-password/some-token/?callbackURL=http://localhost:8081/x'],
    ['GET', '//reset-password/some-token?callbackURL=http://localhost:8081/x'],
    ['GET', '/reset-password%2Fsome-token?callbackURL=http://localhost:8081/x'],
    ['GET', '/reset-password/some%2Ftoken?callbackURL=http://localhost:8081/x'],
    ['GET', '/reset-password/%2E%2E/reset-password/t?callbackURL=http://localhost:8081/x'],
  ] as const)('answers 404 to %s %s, like an unknown address', async (method, path) => {
    await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const token = lastToken(lea.email)
    const real = path.replace('some-token', token).replace('some%2Ftoken', token)

    const res = await ctx.request(`/api/auth${real}`, { method })

    expect(res.status).toBe(404)
    expect(res.headers.get('location')).toBeNull()
    expect(await res.text()).not.toContain(token)
    // Témoin : la vraie route, POST /reset-password, est ouverte (un faux jeton : 400, pas 404).
    const open = await reset('fake-token')
    expect(open.status).toBe(400)
    expect(await codeOf(open)).toBe('INVALID_TOKEN')
  })
})

// ─── A2. Changer mon mot de passe depuis les réglages ───────────────────────────────────────────

describe('changing my password from the settings', () => {
  it('asks to sign in when there is no session', async () => {
    await ctx.verifiedMember(lea)

    const res = await post('/api/auth/change-password', {
      currentPassword: lea.password,
      newPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(401)
    expect((await ctx.signIn(lea)).status).toBe(200)
  })

  it('refuses a wrong current password with its code, changes nothing and sends no e-mail', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const before = ctx.mailer.sent.length

    const res = await changePassword(cookie, {
      currentPassword: 'wrong-password-123',
      newPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(400)
    expect(await codeOf(res)).toBe('INVALID_PASSWORD')
    expect(ctx.mailer.sent.slice(before)).toEqual([])
    expect((await me(cookie)).status).toBe(200)
    expect((await ctx.signIn(lea)).status).toBe(200)
    expect((await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })).status).toBe(401)
  })

  it('changes the password, signs out the other devices, keeps this one and sends the security e-mail', async () => {
    const phone = await ctx.verifiedMember({ ...lea, language: 'en' })
    const laptop = ctx.cookiesFrom(await ctx.signIn(lea))
    const before = ctx.mailer.sent.length

    const res = await changePassword(laptop, {
      currentPassword: lea.password,
      newPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(200)
    expect((await me(laptop)).status).toBe(200)
    expect((await me(phone)).status).toBe(401)
    expect((await ctx.signIn(lea)).status).toBe(401)
    expect((await ctx.signIn({ email: lea.email, password: NEW_PASSWORD })).status).toBe(200)
    const sent = ctx.mailer.sent.slice(before)
    expect(sent.map((mail) => mail.to)).toEqual([lea.email])
    expect(sent[0]?.html).toContain('<html lang="en"')
    expect(sent[0]?.text).not.toContain(NEW_PASSWORD)
    expect(sent[0]?.text).not.toContain(lea.password)
  })

  // sec-S10 : l'appli ne décide pas de garder les autres appareils ; l'API l'impose.
  it('signs out the other devices even when the request asks to keep them', async () => {
    const phone = await ctx.verifiedMember(lea)
    const laptop = ctx.cookiesFrom(await ctx.signIn(lea))

    const res = await changePassword(laptop, {
      currentPassword: lea.password,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: false,
    })

    expect(res.status).toBe(200)
    expect((await me(phone)).status).toBe(401)
    expect((await me(laptop)).status).toBe(200)
  })

  it('keeps the rules of the password: too short is refused and nothing changes', async () => {
    const cookie = await ctx.verifiedMember(lea)

    const res = await changePassword(cookie, {
      currentPassword: lea.password,
      newPassword: 'short',
    })

    expect(res.status).toBe(400)
    expect((await ctx.signIn(lea)).status).toBe(200)
  })

  // sec-S14 : un membre suspendu peut changer son mot de passe, mais reste suspendu.
  it('lets a suspended member change the password, who stays suspended', async () => {
    const cookie = await ctx.verifiedMember(lea)
    await suspend((await accountOf(lea.email)).id)

    const res = await changePassword(cookie, {
      currentPassword: lea.password,
      newPassword: NEW_PASSWORD,
    })

    expect(res.status).toBe(200)
    const project = await post(
      '/v1/projects',
      { title: 'Météo', pitch: 'La pluie de demain.' },
      { cookie },
    )
    expect(project.status).toBe(403)
    expect(ErrorResponse.parse(await project.json()).error.code).toBe('suspended')
  })
})

describe('the quotas of the password change', () => {
  // A2 : 5 essais par quart d'heure et par membre, comptés AVANT la vérification du mot de passe
  // (chaque essai compte, d'où qu'il vienne : une session volée ne peut pas deviner le mot de
  // passe en changeant d'adresse IP).
  it('refuses a 6th attempt of the same member within 15 minutes, from any connection, before checking the password', async () => {
    const cookie = await ctx.verifiedMember(lea)
    for (let i = 1; i <= 5; i++) {
      const res = await changePassword(
        cookie,
        { currentPassword: `wrong-password-${i}`, newPassword: NEW_PASSWORD },
        ip(i),
      )
      expect(res.status).toBe(400)
    }

    const sixth = await changePassword(
      cookie,
      { currentPassword: lea.password, newPassword: NEW_PASSWORD },
      ip(6),
    )

    expect(sixth.status).toBe(429)
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await ctx.signIn(lea)).status).toBe(200)
    // Un quart d'heure plus tard, le membre peut de nouveau essayer.
    later(15 * MINUTE + SECOND)
    const again = await changePassword(
      cookie,
      { currentPassword: lea.password, newPassword: NEW_PASSWORD },
      ip(7),
    )
    expect(again.status).toBe(200)
  })

  // sec-S10 : une requête mal formée compte aussi.
  it('counts malformed requests in the quota of the member', async () => {
    const cookie = await ctx.verifiedMember(lea)
    for (let i = 1; i <= 5; i++) {
      expect((await changePassword(cookie, 'x', ip(i))).status).toBe(400)
    }

    const sixth = await changePassword(
      cookie,
      { currentPassword: lea.password, newPassword: NEW_PASSWORD },
      ip(6),
    )

    expect(sixth.status).toBe(429)
    expect((await ctx.signIn(lea)).status).toBe(200)
  })

  // sec-S10 : 10 par jour par membre, en plus.
  it('refuses an 11th change of the same member within a day', async () => {
    const cookie = await ctx.verifiedMember(lea)
    let current = lea.password
    for (let i = 1; i <= 10; i++) {
      if (i === 6) later(15 * MINUTE + SECOND)
      const next = `password-number-${i}-horse`
      const res = await changePassword(
        cookie,
        { currentPassword: current, newPassword: next },
        ip(i),
      )
      expect(res.status, `change ${i}`).toBe(200)
      current = next
    }
    later(15 * MINUTE + SECOND)

    const eleventh = await changePassword(
      cookie,
      { currentPassword: current, newPassword: NEW_PASSWORD },
      ip(11),
    )

    expect(eleventh.status).toBe(429)
    expect(Number(eleventh.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await ctx.signIn({ email: lea.email, password: current })).status).toBe(200)
    // Le lendemain, le membre peut de nouveau changer.
    later(24 * HOUR)
    const again = await changePassword(
      cookie,
      { currentPassword: current, newPassword: NEW_PASSWORD },
      ip(12),
    )
    expect(again.status).toBe(200)
  })

  // Par adresse IP aussi (AUTH_RATE_RULES) : deux membres, trois essais chacun, même connexion.
  it('refuses a 6th attempt from the same connection within 15 minutes, whoever asks', async () => {
    const leaCookie = await ctx.verifiedMember(lea)
    const malikCookie = await ctx.verifiedMember(malik)
    for (const [cookie, member] of [
      [leaCookie, lea],
      [malikCookie, malik],
    ] as const) {
      for (let i = 1; i <= 3; i++) {
        const res = await changePassword(cookie, {
          currentPassword: `wrong-${i}`,
          newPassword: NEW_PASSWORD,
        })
        expect(res.status, member.name).toBe(i === 3 && member === malik ? 429 : 400)
      }
    }

    const seventh = await changePassword(malikCookie, {
      currentPassword: malik.password,
      newPassword: NEW_PASSWORD,
    })

    expect(seventh.status).toBe(429)
    expect(AUTH_RATE_RULES).toMatchObject({ '/change-password': { window: 15 * 60, max: 5 } })
  })

  // Les compteurs du membre portent son identifiant : ils partent avec le compte (jur-6).
  it('erases the counters of the member with the account', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const { id } = await accountOf(lea.email)
    for (let i = 1; i <= 2; i++) {
      await changePassword(
        cookie,
        { currentPassword: `wrong-password-${i}`, newPassword: NEW_PASSWORD },
        ip(i),
      )
    }
    const withCounter = (await ctx.db.select().from(schema.apiRateLimit)).filter((row) =>
      row.key.includes(id),
    )
    expect(withCounter.length).toBeGreaterThan(0)

    const deleted = await post('/api/auth/delete-user', { password: lea.password }, { cookie })

    expect(deleted.status).toBe(200)
    const left = (await ctx.db.select().from(schema.apiRateLimit)).filter((row) =>
      row.key.includes(id),
    )
    expect(left).toEqual([])
  })
})

// ─── Ajoutés par le backend (R2) ────────────────────────────────────────────────────────────────

describe('the answer of a reset request over the quota of its address', () => {
  // Au-delà du quota, notre hook répond à la place de Better Auth (auth/password.ts) : la réponse
  // doit rester mot pour mot la sienne, sinon elle dirait que le quota de l'adresse est atteint.
  // Ce test rougit si une mise à jour de Better Auth change son texte.
  it('is word for word the answer of Better Auth', async () => {
    await ctx.verifiedMember(lea)
    const answers = []
    for (let i = 1; i <= 4; i++) answers.push(await (await forgot(lea.email, {}, ip(i))).json())

    expect(resetMailsTo(lea.email)).toHaveLength(3)
    expect(answers[3]).toEqual(answers[0])
    expect(await (await forgot('nobody@example.com', {}, ip(5))).json()).toEqual(answers[0])
  })

  // Une adresse mal formée reçoit toujours le refus de Better Auth, quota atteint ou non.
  it('still refuses a malformed address the same way once its quota is reached', async () => {
    const statuses = []
    for (let i = 1; i <= 5; i++) statuses.push((await forgot('not-an-address', {}, ip(i))).status)

    expect(statuses).toEqual([400, 400, 400, 400, 400])
  })
})

describe('the account deletion after a reset request', () => {
  // jur-6 : les compteurs de l'adresse (des empreintes, mais qui la désignent) partent aussi.
  it('erases the counters of the address of the account', async () => {
    const cookie = await ctx.verifiedMember(lea)
    await forgot(lea.email)
    const counters = async () => (await ctx.db.select().from(schema.apiRateLimit)).length
    const withAddress = await counters()

    expect(
      (await post('/api/auth/delete-user', { password: lea.password }, { cookie })).status,
    ).toBe(200)

    expect(await counters()).toBeLessThan(withAddress)
    expect(
      (await ctx.db.select().from(schema.apiRateLimit)).filter((row) =>
        row.key.startsWith('password-reset'),
      ),
    ).toEqual([])
  })
})
