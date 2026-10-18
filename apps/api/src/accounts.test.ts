// Tests d'intégration de la tranche 1 : les comptes.
// Chaque test démarre avec une base vide (PGlite en mémoire) et une fausse boîte d'envoi
// (`mailer.sent`) qui garde les e-mails au lieu de les envoyer. On suit les scénarios de
// docs/scenarios/phase-1.md, tranche 1.
import { appName } from '@ruche/brand'
import { AccountExport, ErrorResponse, Me } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, TEST_API_URL, type TestContext } from './testing/context'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

// Extrait le lien de vérification d'un e-mail capturé.
const linkIn = (text: string) => {
  const match = text.match(/https?:\/\/\S+/)
  if (!match) throw new Error(`no link in email: ${text}`)
  return new URL(match[0])
}

// Inscrit Léa et clique sur le lien de vérification reçu. Renvoie le cookie de session.
const signUpAndVerify = async () => {
  await ctx.signUp(lea)
  const email = ctx.mailer.sent.at(-1)
  if (!email) throw new Error('no verification email')
  const verify = await ctx.request(linkIn(email.text).pathname + linkIn(email.text).search)
  return ctx.cookiesFrom(verify)
}

describe('creating an account', () => {
  it('sends a verification email in French by default', async () => {
    const res = await ctx.signUp(lea)

    expect(res.status).toBe(200)
    expect(ctx.mailer.sent).toHaveLength(1)
    const [email] = ctx.mailer.sent
    expect(email?.to).toBe('lea@example.com')
    expect(email?.subject).toBe(`Active ton compte ${appName}`)
    const link = linkIn(email?.text ?? '')
    expect(link.pathname).toBe('/api/auth/verify-email')
    // Le lien part de notre domaine, jamais d'un domaine de redirection d'un prestataire.
    expect(link.origin).toBe(TEST_API_URL)
  })

  it('writes the email in the language of the member', async () => {
    await ctx.signUp(lea, { 'Accept-Language': 'en-GB,en;q=0.9' })

    expect(ctx.mailer.sent[0]?.subject).toBe(`Activate your ${appName} account`)
  })

  it('applies the same name rules as the profile: 80 characters, nothing invisible', async () => {
    const tooLong = await ctx.signUp({ ...lea, name: 'a'.repeat(81) })
    const reversed = await ctx.signUp({ ...lea, email: 'max@example.com', name: 'Max\u202Enimda' })

    expect(tooLong.status).toBe(400)
    expect(reversed.status).toBe(400)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(0)
  })

  it('refuses an invalid name the same way whether the address has an account or not', async () => {
    await ctx.signUp(lea)

    const existing = await ctx.signUp({ ...lea, name: 'a'.repeat(81) })
    const unknown = await ctx.signUp({ ...lea, email: 'new@example.com', name: 'a'.repeat(81) })

    expect(existing.status).toBe(unknown.status)
    expect(await existing.text()).toBe(await unknown.text())
  })

  it('ignores a profile picture hosted elsewhere, sent along with the sign-up', async () => {
    // Une image hébergée n'importe où révélerait l'adresse IP de chaque visiteur du profil.
    await ctx.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...lea, image: 'https://tracker.example/pixel.png' }),
    })

    const [user] = await ctx.db.select({ image: schema.user.image }).from(schema.user)
    expect(user).toEqual({ image: null })
  })

  it('refuses a password shorter than 12 characters', async () => {
    const res = await ctx.signUp({ ...lea, password: 'too-short1' })

    expect(res.status).toBe(400)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('does not let the member sign in before verifying the address', async () => {
    await ctx.signUp(lea)

    const res = await ctx.signIn(lea)

    expect(res.status).toBe(403)
    // Le lien est renvoyé, au cas où le premier e-mail se serait perdu.
    expect(ctx.mailer.sent).toHaveLength(2)
  })

  it('refuses a verification link that would send the member to another website', async () => {
    // Sinon, un e-mail authentique de Ruche pourrait mener vers un faux site (« open redirect »).
    const res = await ctx.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...lea, callbackURL: 'https://evil.example/phishing' }),
    })

    expect(res.ok).toBe(false)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('verifies the address and signs the member in when the link is opened', async () => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/v1/me', { headers: { cookie: cookies } })
    const me = Me.parse(await res.json())

    expect(me).toMatchObject({ name: 'Léa', email: 'lea@example.com', emailVerified: true })
    expect(me.language).toBe('fr')
  })
})

describe('signing up with an address that already has an account', () => {
  it('answers exactly like a new sign-up, without revealing that the address exists', async () => {
    const first = await ctx.signUp(lea)
    const second = await ctx.signUp({
      ...lea,
      name: 'Someone else',
      password: 'another-password-1',
    })

    expect(second.status).toBe(first.status)
    const [a, b] = (await Promise.all([first.json(), second.json()])) as {
      user: Record<string, unknown>
    }[]
    expect(Object.keys(b?.user ?? {}).sort()).toEqual(Object.keys(a?.user ?? {}).sort())
  })

  it('warns the owner of the address by email and creates no second account', async () => {
    await signUpAndVerify()
    await ctx.signUp({ ...lea, password: 'another-password-1' })

    const last = ctx.mailer.sent.at(-1)
    expect(last?.to).toBe('lea@example.com')
    expect(last?.subject).toBe(`Tentative d’inscription sur ${appName}`)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(1)
  })
})

describe('signing in', () => {
  it('opens a session with the right password', async () => {
    await signUpAndVerify()

    const res = await ctx.signIn(lea)
    const me = await ctx.request('/v1/me', { headers: { cookie: ctx.cookiesFrom(res) } })

    expect(res.status).toBe(200)
    expect(me.status).toBe(200)
  })

  it('refuses a wrong password', async () => {
    await signUpAndVerify()

    const res = await ctx.signIn({ ...lea, password: 'wrong-password-123' })

    expect(res.status).toBe(401)
  })

  it('blocks further attempts after 5 failures in 15 minutes', async () => {
    await signUpAndVerify()

    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await ctx.signIn({ ...lea, password: `wrong-password-${attempt}` })
      expect(res.status).toBe(401)
    }
    // Même avec le bon mot de passe, la 6e tentative est bloquée.
    const blocked = await ctx.signIn(lea)

    expect(blocked.status).toBe(429)
  })
})

describe('the profile route', () => {
  it('asks to sign in when there is no session, in the visitor language', async () => {
    const res = await ctx.request('/v1/me', { headers: { 'Accept-Language': 'en' } })
    const body = ErrorResponse.parse(await res.json())

    expect(res.status).toBe(401)
    expect(body.error).toEqual({ code: 'unauthorized', message: 'Sign in to continue.' })
  })
})

describe('exporting my data', () => {
  it('downloads my profile, login methods and sessions, without any secret', async () => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/v1/me/export', { headers: { cookie: cookies } })
    const raw = await res.text()
    const data = AccountExport.parse(JSON.parse(raw))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(data.user.email).toBe('lea@example.com')
    expect(data.loginMethods).toEqual([expect.objectContaining({ provider: 'credential' })])
    expect(data.sessions.length).toBeGreaterThan(0)
    // Ni empreinte de mot de passe, ni jeton de session dans l'export.
    expect(raw).not.toMatch(/scrypt|password"|token/i)
  })

  it('is only available to a signed-in member', async () => {
    const res = await ctx.request('/v1/me/export')

    expect(res.status).toBe(401)
  })
})

describe('deleting my account', () => {
  it('erases the account once the password is confirmed', async () => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ password: lea.password }),
    })

    expect(res.status).toBe(200)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(0)
    expect(await ctx.db.select().from(schema.session)).toHaveLength(0)
    expect((await ctx.signIn(lea)).status).toBe(401)
  })

  it('refuses a deletion request sent from another website (CSRF)', async () => {
    // Un site piégé ouvert dans le même navigateur enverrait le cookie de session avec sa requête.
    // L'en-tête Origin trahit sa provenance : la demande est refusée.
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: {
        cookie: cookies,
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: lea.password }),
    })

    expect(res.status).toBe(403)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(1)
  })

  it('keeps the account when the password is wrong', async () => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'not-my-password-1' }),
    })

    expect(res.ok).toBe(false)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(1)
  })
})
