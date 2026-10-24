// Tests d'intégration de la tranche 1 : les comptes.
// Chaque test démarre avec une base vide (PGlite en mémoire) et une fausse boîte d'envoi
// (`mailer.sent`) qui garde les e-mails au lieu de les envoyer. On suit les scénarios de
// docs/scenarios/phase-1.md, tranche 1.
import { appName } from '@ruche/brand'
import { AccountExport, ErrorResponse, Me } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
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

  // Le cookie de session, tel que la production le pose (API en https) :
  // - préfixe __Secure- : le navigateur ne l'accepte que d'une page en https ;
  // - HttpOnly : aucun script de page ne peut le lire, même en cas de faille ;
  // - Secure : jamais envoyé sur une connexion en clair ;
  // - SameSite=Lax : pas envoyé avec un formulaire posté depuis un autre site ;
  // - Max-Age de 7 jours : la durée d'une session.
  it('keeps the session in a cookie that scripts and other sites cannot use', async () => {
    const secure = await createTestContext({ publicApiUrl: 'https://api.example.test' })
    try {
      await secure.verifiedMember(lea)

      const res = await secure.signIn(lea)
      const session = res.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('__Secure-ruche.session_token='))
      const attributes = (session ?? '')
        .split(';')
        .slice(1)
        .map((attribute) => attribute.trim().toLowerCase())

      expect(res.status).toBe(200)
      expect(session).toBeDefined()
      expect(attributes).toEqual(
        expect.arrayContaining([
          'httponly',
          'secure',
          'samesite=lax',
          'path=/',
          `max-age=${7 * 24 * 60 * 60}`,
        ]),
      )
      // Aucun attribut Domain : le cookie reste attaché au seul nom de l'API (api.waiggle.com).
      // Avec Domain=waiggle.com, il partirait vers tous les sous-domaines, y compris ceux d'un
      // prestataire (le futur news.waiggle.com des e-mails marketing).
      expect(attributes.some((attribute) => attribute.startsWith('domain='))).toBe(false)
    } finally {
      await secure.close()
    }
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

  // L'export lit toutes les données du membre : une lecture lourde, limitée à 30 par heure.
  it('blocks a 31st export within an hour', async () => {
    const cookies = await signUpAndVerify()
    for (let i = 0; i < 30; i++) {
      expect((await ctx.request('/v1/me/export', { headers: { cookie: cookies } })).status).toBe(
        200,
      )
    }

    const res = await ctx.request('/v1/me/export', { headers: { cookie: cookies } })

    expect(res.status).toBe(429)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('rate_limited')
    expect(res.headers.get('retry-after')).toBeTruthy()
  })

  it('gives how far I have seen my notifications, and nothing of what others did', async () => {
    const cookies = await signUpAndVerify()
    const exportOf = async () =>
      AccountExport.parse(
        await (await ctx.request('/v1/me/export', { headers: { cookie: cookies } })).json(),
      )
    // Jamais ouvert l'écran : null.
    expect((await exportOf()).notifications).toEqual({ seenAt: null })

    // L'appli ouvre l'écran : elle lit la liste, puis renvoie l'heure du serveur.
    const page = await ctx.request('/v1/notifications', { headers: { cookie: cookies } })
    expect(page.status).toBe(200)
    const { asOf } = (await page.json()) as { asOf: string }
    const seen = await ctx.request('/v1/notifications/seen', {
      method: 'PUT',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ upTo: asOf }),
    })
    expect(seen.status).toBe(204)

    expect((await exportOf()).notifications).toEqual({ seenAt: asOf })
  })

  it('gives, for each of my comments, the ids of the members I mention in it', async () => {
    const cookies = await signUpAndVerify()
    const ines = await ctx.verifiedMember({
      name: 'Inès Morel',
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    const inesId = Me.parse(
      await (await ctx.request('/v1/me', { headers: { cookie: ines } })).json(),
    ).id
    const json = (cookie: string) => ({ cookie, 'content-type': 'application/json' })
    const project = await ctx.request('/v1/projects', {
      method: 'POST',
      headers: json(ines),
      body: JSON.stringify({ title: 'Météo', pitch: 'La pluie de demain.' }),
    })
    expect(project.status).toBe(201)
    const { id: projectId } = (await project.json()) as { id: string }
    for (const body of ['Merci @ines_morel !', 'Sans mention.']) {
      const res = await ctx.request(`/v1/projects/${projectId}/comments`, {
        method: 'POST',
        headers: json(cookies),
        body: JSON.stringify({ body }),
      })
      expect(res.status).toBe(201)
    }

    const data = AccountExport.parse(
      await (await ctx.request('/v1/me/export', { headers: { cookie: cookies } })).json(),
    )

    expect(data.comments.map((c) => [c.body, c.mentions])).toEqual([
      ['Merci @ines_morel !', [inesId]],
      ['Sans mention.', []],
    ])
  })
})

// Better Auth ouvre d'office des routes que l'appli n'appelle jamais. Chacune est une porte de
// plus : changer de mot de passe avec une session volée (100 essais par minute), lister ou couper
// les sessions, se connecter par un fournisseur (Google…) que nous n'avons pas, dont le nom finirait
// dans les logs. Fermées, elles répondent comme une adresse inconnue, même avec une session.
describe('authentication routes the app does not use', () => {
  it.each([
    ['POST', '/change-password', { currentPassword: lea.password, newPassword: 'new-password-1' }],
    ['GET', '/list-sessions', undefined],
    ['POST', '/revoke-session', { token: 'any-token' }],
    ['POST', '/revoke-sessions', {}],
    ['POST', '/revoke-other-sessions', {}],
    ['POST', '/sign-in/social', { provider: 'google' }],
    ['POST', '/link-social', { provider: 'google' }],
  ] as const)('are closed: %s %s', async (method, path, body) => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request(`/api/auth${path}`, {
      method,
      headers: { cookie: cookies, ...(body && { 'content-type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    })

    expect(res.status).toBe(404)
    // Le refus vient de la fermeture, pas de la route elle-même (« fournisseur inconnu »…).
    expect(await res.text()).not.toMatch(/PROVIDER|SESSION|PASSWORD/i)
    // Témoin : la session ouverte par l'inscription marche toujours, mot de passe inchangé.
    expect((await ctx.request('/v1/me', { headers: { cookie: cookies } })).status).toBe(200)
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

  it('erases how far I have seen my notifications, the mentions of me and those I wrote', async () => {
    const cookies = await signUpAndVerify()
    const ines = await ctx.verifiedMember({
      name: 'Inès Morel',
      email: 'ines@example.com',
      password: 'ines-long-password',
    })
    const json = (cookie: string) => ({ cookie, 'content-type': 'application/json' })
    const project = await ctx.request('/v1/projects', {
      method: 'POST',
      headers: json(ines),
      body: JSON.stringify({ title: 'Météo', pitch: 'La pluie de demain.' }),
    })
    const { id: projectId } = (await project.json()) as { id: string }
    // Léa mentionne Inès, Inès mentionne Léa (son pseudo : « lea »).
    for (const [cookie, body] of [
      [cookies, 'Merci @ines_morel !'],
      [ines, 'Avec plaisir @lea'],
    ] as const) {
      const res = await ctx.request(`/v1/projects/${projectId}/comments`, {
        method: 'POST',
        headers: json(cookie),
        body: JSON.stringify({ body }),
      })
      expect(res.status).toBe(201)
    }
    const seen = await ctx.request('/v1/notifications/seen', {
      method: 'PUT',
      headers: json(cookies),
      body: JSON.stringify({ upTo: new Date().toISOString() }),
    })
    expect(seen.status).toBe(204)
    // Témoin : avant la suppression, deux mentions et deux états de lecture (Léa et Inès).
    expect(await ctx.db.select().from(schema.commentMention)).toHaveLength(2)
    expect(await ctx.db.select().from(schema.notificationState)).toHaveLength(2)

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: json(cookies),
      body: JSON.stringify({ password: lea.password }),
    })

    expect(res.status).toBe(200)
    // Il ne reste que l'état de lecture d'Inès, et aucune mention : ni de Léa, ni écrite par elle.
    expect(await ctx.db.select().from(schema.commentMention)).toEqual([])
    const inesId = Me.parse(
      await (await ctx.request('/v1/me', { headers: { cookie: ines } })).json(),
    ).id
    const states = await ctx.db.select().from(schema.notificationState)
    expect(states.map((s) => s.userId)).toEqual([inesId])
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

  // Better Auth accepte, sans mot de passe, une session de moins d'un jour (« fraîche ») : quelqu'un
  // qui trouve un téléphone ouvert pourrait effacer le compte. On exige le mot de passe, toujours.
  it.each([
    ['without a password', {}],
    ['with an empty password', { password: '' }],
    ['with a deletion token instead of the password', { token: 'any-token' }],
  ])('keeps the account when the request comes %s, even from a fresh session', async (_, body) => {
    const cookies = await signUpAndVerify()

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(res.status).toBe(400)
    expect(await ctx.db.select().from(schema.user)).toHaveLength(1)
  })
})

// Décision de Louis (restauration, option a) : une sauvegarde restaurée ramènerait un compte
// supprimé depuis. La suppression laisse donc une ligne de journal, « Account deleted
// <identifiant> », pour la refaire ; ni adresse, ni nom.
describe('the trace of a deleted account, for a restored backup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes the identifier of the account, and nothing else about it', async () => {
    const cookies = await signUpAndVerify()
    const [row] = await ctx.db.select({ id: schema.user.id }).from(schema.user)
    const logs = (['log', 'info', 'warn', 'error'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    )

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ password: lea.password }),
    })

    expect(res.status).toBe(200)
    const lines = logs.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' ')))
    expect(lines).toContain(`Account deleted ${row?.id}`)
    expect(lines.join('\n')).not.toContain(lea.email)
    expect(lines.join('\n')).not.toContain(lea.name)
  })

  it('writes nothing when the deletion is refused', async () => {
    const cookies = await signUpAndVerify()
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await ctx.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { cookie: cookies, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password-here' }),
    })

    expect(res.status).not.toBe(200)
    expect(logged.mock.calls.flat().join(' ')).not.toContain('Account deleted')
  })
})

// ─── Tranche 7a : les signalements et les retraits, dans l'export et à la suppression du compte ──
// Règles 16 et 18 de la relecture du plan (22/10/2026). Léa publie, Max signale, Zoé est une
// autre membre, Louis l'administrateur (rôle posé en base, comme infra/grant-admin.sh).
describe('reports and removals of an account', () => {
  let act: ReturnType<typeof activity>
  let leaCookie: string
  let max: string
  let zoe: string
  let louis: string
  let leaId: string
  let maxId: string
  let louisId: string

  const maxAccount = { name: 'Max', email: 'max@example.com', password: 'another-long-password' }

  beforeEach(async () => {
    // Une fausse horloge, posée après la création de l'API (voir plus haut) : on l'avance d'une
    // seconde entre deux signalements, pour que leur ordre soit connu. Seule Date est remplacée.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now())
    act = activity(ctx)
    leaCookie = await signUpAndVerify()
    max = await ctx.verifiedMember(maxAccount)
    zoe = await ctx.verifiedMember({
      name: 'Zoé',
      email: 'zoe@example.com',
      password: 'zoe-long-password',
    })
    louis = await ctx.verifiedMember({
      name: 'Louis',
      email: 'louis@example.com',
      password: 'louis-long-password',
    })
    leaId = (await act.me(leaCookie)).id
    maxId = (await act.me(max)).id
    louisId = (await act.me(louis)).id
    await act.makeAdmin(louisId)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const later = () => vi.setSystemTime(Date.now() + 1000)

  const exportOf = async (cookie: string) => {
    const res = await act.send('GET', '/v1/me/export', cookie)
    expect(res.status).toBe(200)
    const raw = await res.text()
    return { raw, data: AccountExport.parse(JSON.parse(raw)) }
  }
  const reports = () =>
    ctx.db.select().from(schema.contentReport).orderBy(schema.contentReport.createdAt)

  describe('in the export', () => {
    it('lists the reports I made, oldest first, without the reported text', async () => {
      const meteo = await act.publish(leaCookie, 'Météo', {
        pitch: 'Un pitch très reconnaissable.',
      })
      const published = await act.comment(meteo.id, leaCookie, 'Un commentaire reconnaissable')
      const first = await act.report(max, { kind: 'project', id: meteo.id }, 'privacy', 'Ma photo.')
      later()
      await act.report(max, { kind: 'comment', id: published.id }, 'harassment')
      const decision = await act.decide(louis, {
        action: 'dismiss',
        target: { kind: 'project', id: meteo.id },
      })
      const stored = await reports()

      const { raw, data } = await exportOf(max)

      expect(first.id).toBe(stored[0]?.id)
      expect(data.reports).toEqual([
        {
          targetKind: 'project',
          targetId: meteo.id,
          reason: 'privacy',
          details: 'Ma photo.',
          createdAt: stored[0]?.createdAt.toISOString(),
          outcome: 'dismissed',
          decidedAt: decision.createdAt,
        },
        {
          targetKind: 'comment',
          targetId: published.id,
          reason: 'harassment',
          details: null,
          createdAt: stored[1]?.createdAt.toISOString(),
          outcome: 'open',
          decidedAt: null,
        },
      ])
      for (const leak of [
        'Météo',
        'Un pitch très reconnaissable',
        'Un commentaire reconnaissable',
      ]) {
        expect(raw, leak).not.toContain(leak)
      }
    })

    it('never lists the reports that target me', async () => {
      await act.report(leaCookie, { kind: 'member', id: maxId }, 'impersonation', 'Faux Max.')
      await act.report(zoe, { kind: 'member', id: maxId }, 'other')

      const { raw, data } = await exportOf(max)

      expect(data.reports).toEqual([])
      expect(raw).not.toContain('impersonation')
      expect(raw).not.toContain('Faux Max')
      // Témoin : Léa, elle, retrouve le signalement qu'elle a fait.
      expect((await exportOf(leaCookie)).data.reports).toMatchObject([
        { targetKind: 'member', targetId: maxId, reason: 'impersonation', details: 'Faux Max.' },
      ])
    })

    it('gives the removals of my projects, notes and comments, with ground and explanation', async () => {
      const meteo = await act.publish(leaCookie, 'Météo')
      const velo = await act.publish(zoe, 'Vélo')
      const noteRes = await act.send('POST', `/v1/projects/${meteo.id}/notes`, leaCookie, {
        body: 'Une note retirée',
      })
      const note = (await noteRes.json()) as { id: string }
      const published = await act.comment(velo.id, leaCookie, 'Un commentaire retiré')
      // Le projet en dernier : retiré, il cache ses notes aux autres membres, qui ne peuvent plus
      // les signaler (404, règle 5).
      for (const target of [
        { kind: 'note', id: note.id },
        { kind: 'comment', id: published.id },
        { kind: 'project', id: meteo.id },
      ] as const) {
        await act.report(max, target, 'other')
        await act.decide(louis, {
          action: 'remove',
          target,
          ground: target.kind === 'comment' ? 'illegal' : 'rules',
          explanation: `Retrait : ${target.kind}`,
        })
      }

      const { raw, data } = await exportOf(leaCookie)

      const removal = (ground: string, kind: string) => ({
        ground,
        explanation: `Retrait : ${kind}`,
        at: expect.any(String),
        afterReport: true,
      })
      expect(data.projects.find((p) => p.id === meteo.id)?.removal).toEqual(
        removal('rules', 'project'),
      )
      expect(data.notes.find((n) => n.id === note.id)?.removal).toEqual(removal('rules', 'note'))
      expect(data.comments.find((c) => c.id === published.id)?.removal).toEqual(
        removal('illegal', 'comment'),
      )
      // Ni l'administrateur, ni la personne qui a signalé.
      for (const leak of [louisId, maxId, 'Louis']) expect(raw, leak).not.toContain(leak)
      // Les signalements qui la visent n'y sont pas.
      expect(data.reports).toEqual([])
    })
  })

  describe('when the account is deleted', () => {
    it('voids the open or dismissed reports on her contents, and keeps those followed by a removal', async () => {
      const meteo = await act.publish(leaCookie, 'Météo')
      const velo = await act.publish(leaCookie, 'Vélo', { pitch: 'Un pitch gardé un an.' })
      const published = await act.comment(meteo.id, leaCookie, 'Un commentaire de Léa')
      await act.report(max, { kind: 'project', id: meteo.id }) // reste ouvert
      await act.report(max, { kind: 'comment', id: published.id }) // classé
      await act.decide(louis, { action: 'dismiss', target: { kind: 'comment', id: published.id } })
      await act.report(max, { kind: 'project', id: velo.id }) // suivi d'un retrait
      await act.decide(louis, {
        action: 'remove',
        target: { kind: 'project', id: velo.id },
        ground: 'rules',
        explanation: 'Arnaque.',
      })

      await act.deleteAccount(leaCookie, lea.password)

      const rows = await reports()
      const byTarget = Object.fromEntries(
        rows.map((r) => [r.targetId, [r.status, r.targetAuthorId, r.reporterId === maxId]]),
      )
      expect(byTarget).toEqual({
        [meteo.id]: ['void', null, true],
        [published.id]: ['void', null, true],
        [velo.id]: ['removed', null, true],
      })
      // Le signalement suivi d'un retrait garde son texte jusqu'au terme d'un an.
      // Tranche 7b : la copie est un tableau de champs.
      expect(JSON.stringify(rows.find((r) => r.targetId === velo.id)?.snapshot)).toContain(
        'Un pitch gardé un an.',
      )
    })

    it('keeps the reports she made, without her name', async () => {
      const velo = await act.publish(zoe, 'Vélo')
      await act.report(max, { kind: 'project', id: velo.id }, 'scam_spam', 'Une arnaque.')

      await act.deleteAccount(max, maxAccount.password)

      expect(await reports()).toEqual([
        expect.objectContaining({
          reporterId: null,
          targetId: velo.id,
          reason: 'scam_spam',
          details: 'Une arnaque.',
          status: 'open',
        }),
      ])
    })

    it('touches no report when the deletion is refused', async () => {
      const meteo = await act.publish(leaCookie, 'Météo')
      await act.report(max, { kind: 'project', id: meteo.id })

      const refused = await act.send('POST', '/api/auth/delete-user', leaCookie, {
        password: 'not-the-right-password',
      })

      expect(refused.status).not.toBe(200)
      expect((await reports()).map((r) => [r.status, r.targetAuthorId])).toEqual([['open', leaId]])
    })

    it('takes the administrator role with the account, and keeps his decisions without his name', async () => {
      const meteo = await act.publish(leaCookie, 'Météo')
      await act.report(max, { kind: 'project', id: meteo.id })
      await act.decide(louis, { action: 'dismiss', target: { kind: 'project', id: meteo.id } })

      await act.deleteAccount(louis, 'louis-long-password')

      expect(await ctx.db.select().from(schema.adminMember)).toEqual([])
      expect(await ctx.db.select().from(schema.moderationDecision)).toEqual([
        expect.objectContaining({ action: 'dismiss', targetId: meteo.id, adminId: null }),
      ])
    })
  })
})
