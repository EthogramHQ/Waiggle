// Tests d'intégration de l'inscription sur invitation (docs/scenarios/phase-1.md, « Mise en
// ligne — Inscription sur invitation »). L'API de test est réglée avec un code, comme en
// production ; sans code (les autres fichiers de tests), l'inscription reste libre.
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext({ inviteCode: 'Miel-2026-Noel' })
})

afterEach(async () => {
  await ctx.close()
})

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const members = () => ctx.db.select().from(schema.user)

describe('signing up with an invite code', () => {
  it('creates the account with the right code and sends the verification email', async () => {
    const res = await ctx.signUp({ ...lea, inviteCode: 'Miel-2026-Noel' })

    expect(res.status).toBe(200)
    expect(await members()).toHaveLength(1)
    expect(ctx.mailer.sent).toHaveLength(1)
  })

  it('ignores capital letters and the spaces around the code', async () => {
    const res = await ctx.signUp({ ...lea, inviteCode: '  MIEL-2026-noel ' })

    expect(res.status).toBe(200)
    expect(await members()).toHaveLength(1)
  })

  it('refuses a sign-up without a code or with a wrong one, creating and sending nothing', async () => {
    const without = await ctx.signUp(lea)
    const wrong = await ctx.signUp({ ...lea, inviteCode: 'Miel-2025-Noel' })
    const notText = await ctx.signUp({ ...lea, inviteCode: 2026 as unknown as string })

    for (const res of [without, wrong, notText]) {
      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: 'INVITE_CODE_INVALID' })
    }
    expect(await members()).toHaveLength(0)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('explains the refusal in the language of the visitor', async () => {
    const french = await ctx.signUp({ ...lea, inviteCode: 'faux-code-123' })
    const english = await ctx.signUp(
      { ...lea, inviteCode: 'faux-code-123' },
      { 'Accept-Language': 'en-GB,en;q=0.9' },
    )

    expect(await french.json()).toMatchObject({
      message: 'Ce code d’invitation n’est pas valide. Demande-le à la personne qui t’a invité·e.',
    })
    expect(await english.json()).toMatchObject({
      message: 'This invite code is not valid. Ask the person who invited you for it.',
    })
  })

  it('answers a wrong code the same way whether the address has an account or not', async () => {
    await ctx.signUp({ ...lea, inviteCode: 'Miel-2026-Noel' })

    const existing = await ctx.signUp({ ...lea, inviteCode: 'faux-code-123' })
    const unknown = await ctx.signUp({
      ...lea,
      email: 'new@example.com',
      inviteCode: 'faux-code-123',
    })

    expect(existing.status).toBe(unknown.status)
    expect(await existing.text()).toBe(await unknown.text())
  })

  it('counts wrong codes in the sign-up limit: guessing the code is not possible', async () => {
    // La limite existante : 10 inscriptions par heure et par adresse IP (auth.ts).
    for (let attempt = 0; attempt < 10; attempt++) {
      const res = await ctx.signUp({ ...lea, inviteCode: `essai-numero-${attempt}` })
      expect(res.status).toBe(403)
    }

    const right = await ctx.signUp({ ...lea, inviteCode: 'Miel-2026-Noel' })

    expect(right.status).toBe(429)
    expect(await members()).toHaveLength(0)
  })

  it('changes nothing for a member who signs in', async () => {
    const cookies = await ctx.verifiedMember({ ...lea, inviteCode: 'Miel-2026-Noel' })
    expect(cookies).not.toBe('')

    const res = await ctx.signIn(lea)

    expect(res.status).toBe(200)
  })
})

describe('signing up without any invite code set (development)', () => {
  it('stays open, the code sent along being ignored', async () => {
    const open = await createTestContext()
    try {
      const res = await open.signUp({ ...lea, inviteCode: 'nimporte-quoi' })
      const without = await open.signUp({ ...lea, email: 'max@example.com' })

      expect(res.status).toBe(200)
      expect(without.status).toBe(200)
    } finally {
      await open.close()
    }
  })
})

describe('no other way in', () => {
  it('disables the Expo sign-in relay, which could send visitors to any site', async () => {
    const res = await ctx.request(
      '/api/auth/expo-authorization-proxy?authorizationURL=https://evil.example/&oauthState=a',
    )

    expect(res.status).toBe(404)
  })

  it('lets no route other than the sign-up with the code create an account', async () => {
    // Le garde-fou de la base de données (auth.ts), appelé comme le ferait une future connexion
    // par Google (/callback/:id) : la création est annulée.
    const beforeCreate = ctx.auth.options.databaseHooks?.user?.create?.before
    if (!beforeCreate) throw new Error('no user creation hook')
    const user = { name: 'Max', email: 'max@example.com', emailVerified: true } as never
    const from = (path: string) => ({ path }) as never

    expect(await beforeCreate(user, from('/callback/:id'))).toBe(false)
    expect(await beforeCreate(user, from('/sign-up/email'))).not.toBe(false)
  })
})
