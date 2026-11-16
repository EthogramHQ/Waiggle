// Tests d'intégration de la tranche R11 (la conformité) : l'accord aux règles. À l'inscription, deux
// cases séparées (« J'accepte les règles », « J'ai 15 ans ou plus ») ; pour un membre inscrit avant
// une version, l'écran « Accepter » (POST /v1/me/rules). Le serveur écrit lui-même la version en
// vigueur (RULES_VERSION), la date et la déclaration d'âge dans rules_acceptance, une ligne par
// version acceptée, et l'export du membre les montre toutes. Scénario : docs/scenarios/refonte.md,
// « R11 — La conformité », parties « L'inscription » et « Les membres déjà inscrits » ; relecture de
// sécurité du plan, « Vérifié sans problème » (accords lus avant le test « l'adresse existe »,
// version tirée du serveur, `"true"` et `1` refusés).
//
// La garde des écritures (rules_required) a son propre fichier : rules-guard.test.ts.
//
// Le temps est maîtrisé par le test (fausse horloge, posée avant l'API) : la date d'un accord vient
// de `new Date()` côté API, jamais de `now()` SQL, et se vérifie à la milliseconde.
import { AccountExport, ErrorResponse, Me, RULES_CHANGES, RULES_VERSION } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { fill, resources } from '@ruche/i18n'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext
let act: ReturnType<typeof activity>

const START = new Date('2026-11-16T08:00:00.000Z')
const MINUTE = 60 * 1000
const fr = resources.fr.translation
const en = resources.en.translation

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }
const ines = { name: 'Ines', email: 'ines@example.com', password: 'ines-long-password' }

/** Le corps de l'écran « Accepter » : la version en vigueur, les deux cases cochées. */
const ACCEPT = { version: RULES_VERSION, acceptRules: true, ageDeclared: true }
/** Une version plus ancienne que celle en vigueur (un membre inscrit avant elle). */
const OLDER_VERSION = '2025-06-01'

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

const members = () => ctx.db.select({ id: schema.user.id }).from(schema.user)

/** Les accords gardés en base pour ce membre, des plus anciens aux plus récents. */
const acceptancesOf = (userId: string) =>
  ctx.db
    .select({
      version: schema.rulesAcceptance.version,
      acceptedAt: schema.rulesAcceptance.acceptedAt,
      ageDeclared: schema.rulesAcceptance.ageDeclared,
    })
    .from(schema.rulesAcceptance)
    .where(eq(schema.rulesAcceptance.userId, userId))
    .orderBy(asc(schema.rulesAcceptance.acceptedAt))

/**
 * Fait d'un membre un « inscrit d'avant » : on efface ses accords en base, comme pour un compte
 * créé avant R11 (aucune route ne retire un accord). Avec `older`, il garde l'accord d'une
 * version plus ancienne, datée d'une heure avant le début du test.
 */
const forgetAcceptances = async (userId: string, older = false) => {
  await ctx.db.delete(schema.rulesAcceptance).where(eq(schema.rulesAcceptance.userId, userId))
  if (older) {
    await ctx.db.insert(schema.rulesAcceptance).values({
      userId,
      version: OLDER_VERSION,
      acceptedAt: new Date(START.getTime() - 60 * MINUTE),
      ageDeclared: true,
    })
  }
}

/** Un refus de l'inscription : 400, le code de l'appli et le message dans la langue du visiteur. */
const expectSignUpRefusal = async (res: Response, code: string, message: string) => {
  expect(res.status).toBe(400)
  expect(await res.json()).toMatchObject({ code, message })
}

const accept = (cookie: string | null, body: unknown = ACCEPT) =>
  act.send('POST', '/v1/me/rules', cookie, body)

// ─── L'inscription ──────────────────────────────────────────────────────────────────────────────

describe('signing up with the two boxes', () => {
  it('refuses a sign-up without the rules accepted, with RULES_NOT_ACCEPTED, creating and sending nothing', async () => {
    const without = await ctx.signUp({ ...lea, acceptRules: undefined })
    const unticked = await ctx.signUp({ ...lea, acceptRules: false })

    for (const res of [without, unticked]) {
      await expectSignUpRefusal(res, 'RULES_NOT_ACCEPTED', fill(fr.errors.rulesNotAccepted))
    }
    expect(await members()).toHaveLength(0)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('refuses a sign-up without the age declared, with AGE_NOT_DECLARED, creating and sending nothing', async () => {
    const without = await ctx.signUp({ ...lea, ageDeclared: undefined })
    const unticked = await ctx.signUp({ ...lea, ageDeclared: false })

    for (const res of [without, unticked]) {
      await expectSignUpRefusal(res, 'AGE_NOT_DECLARED', fill(fr.errors.ageNotDeclared))
    }
    expect(await members()).toHaveLength(0)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('answers RULES_NOT_ACCEPTED when both boxes are missing, in the order of the screen', async () => {
    const res = await ctx.signUp({ ...lea, acceptRules: undefined, ageDeclared: undefined })

    await expectSignUpRefusal(res, 'RULES_NOT_ACCEPTED', fill(fr.errors.rulesNotAccepted))
    expect(await members()).toHaveLength(0)
  })

  it('only takes the boolean true for each box, never "true" or 1', async () => {
    for (const value of ['true', 1, 'yes', null, {}]) {
      const rules = await ctx.signUp({ ...lea, acceptRules: value })
      await expectSignUpRefusal(rules, 'RULES_NOT_ACCEPTED', fill(fr.errors.rulesNotAccepted))
      const age = await ctx.signUp({ ...lea, ageDeclared: value })
      await expectSignUpRefusal(age, 'AGE_NOT_DECLARED', fill(fr.errors.ageNotDeclared))
    }
    expect(await members()).toHaveLength(0)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('explains the refusal in the language of the visitor', async () => {
    const english = { 'Accept-Language': 'en-GB,en;q=0.9' }

    await expectSignUpRefusal(
      await ctx.signUp({ ...lea, acceptRules: false }, english),
      'RULES_NOT_ACCEPTED',
      fill(en.errors.rulesNotAccepted),
    )
    await expectSignUpRefusal(
      await ctx.signUp({ ...lea, ageDeclared: false }, english),
      'AGE_NOT_DECLARED',
      fill(en.errors.ageNotDeclared),
    )
  })

  // Relecture de sécurité du plan (« Vérifié sans problème ») : les accords sont lus avant de
  // chercher si l'adresse a un compte ; sinon la réponse dirait qui est inscrit.
  it('gives an address that already has an account the same refusal, without the boxes', async () => {
    expect((await ctx.signUp(lea)).status).toBe(200)
    const sentBefore = ctx.mailer.sent.length

    for (const missing of [{ acceptRules: undefined }, { ageDeclared: undefined }]) {
      const existing = await ctx.signUp({ ...lea, ...missing })
      const unknown = await ctx.signUp({ ...lea, email: 'new@example.com', ...missing })

      expect(existing.status).toBe(400)
      expect(existing.status).toBe(unknown.status)
      expect(await existing.text()).toBe(await unknown.text())
    }
    expect(await members()).toHaveLength(1)
    expect(ctx.mailer.sent).toHaveLength(sentBefore)
  })

  it('keeps the version of the server, the date and the age declaration once the account is created', async () => {
    // La version envoyée par une page ancienne (ou par un curieux) ne compte pas : le serveur écrit
    // la sienne.
    const res = await ctx.signUp({ ...lea, version: OLDER_VERSION } as typeof lea)
    expect(res.status).toBe(200)

    const [user] = await members()
    if (!user) throw new Error('no account created')
    const rows = await acceptancesOf(user.id)
    expect(rows.map((row) => ({ ...row, acceptedAt: row.acceptedAt.toISOString() }))).toEqual([
      { version: RULES_VERSION, acceptedAt: START.toISOString(), ageDeclared: true },
    ])
  })

  it('tells Me that a new member accepted the current rules, with nothing that changes', async () => {
    const cookie = await ctx.verifiedMember(lea)

    const me = await act.me(cookie)
    expect(me.rulesAccepted).toBe(true)
    expect(me.rulesChanges).toEqual([])
  })
})

// ─── L'écran « Accepter » : POST /v1/me/rules ─────────────────────────────────────────────────────

describe('accepting the current rules', () => {
  it('tells Me that a member who accepted only an older version has not accepted, with what changes', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const witness = await ctx.verifiedMember(ines)
    await forgetAcceptances((await act.me(cookie)).id, true)

    const me = await act.me(cookie)
    expect(me.rulesAccepted).toBe(false)
    expect(me.rulesChanges).toEqual([...RULES_CHANGES])
    // Témoin : Inès, inscrite avec les deux cases, a accepté la version en vigueur.
    expect((await act.me(witness)).rulesAccepted).toBe(true)
  })

  it('accepts the current rules and answers Me', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const leaId = (await act.me(cookie)).id
    await forgetAcceptances(leaId, true)
    later()

    const res = await accept(cookie)

    expect(res.status).toBe(200)
    const me = Me.parse(await res.json())
    expect(me).toMatchObject({ id: leaId, rulesAccepted: true, rulesChanges: [] })
    expect((await act.me(cookie)).rulesAccepted).toBe(true)
    // La date de l'accord vient de l'API (new Date()), à la milliseconde ; l'ancien accord reste.
    const rows = await acceptancesOf(leaId)
    expect(rows.map((row) => ({ ...row, acceptedAt: row.acceptedAt.toISOString() }))).toEqual([
      {
        version: OLDER_VERSION,
        acceptedAt: new Date(START.getTime() - 60 * MINUTE).toISOString(),
        ageDeclared: true,
      },
      { version: RULES_VERSION, acceptedAt: new Date().toISOString(), ageDeclared: true },
    ])
  })

  it('refuses another version than the current one, or a box that is not the boolean true', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const leaId = (await act.me(cookie)).id
    await forgetAcceptances(leaId)

    const bodies = [
      { ...ACCEPT, version: OLDER_VERSION },
      { ...ACCEPT, version: '2099-01-01' },
      { ...ACCEPT, version: undefined },
      { ...ACCEPT, acceptRules: 'true' },
      { ...ACCEPT, acceptRules: 1 },
      { ...ACCEPT, acceptRules: false },
      { ...ACCEPT, acceptRules: undefined },
      { ...ACCEPT, ageDeclared: 'true' },
      { ...ACCEPT, ageDeclared: 1 },
      { ...ACCEPT, ageDeclared: false },
      { ...ACCEPT, ageDeclared: undefined },
      'x',
    ]
    for (const body of bodies) {
      const res = await accept(cookie, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
      expect(ErrorResponse.parse(await res.json()).error.code).toBe('validation')
    }
    expect(await acceptancesOf(leaId)).toEqual([])
    expect((await act.me(cookie)).rulesAccepted).toBe(false)
    // Témoin : le bon corps est accepté.
    expect((await accept(cookie)).status).toBe(200)
  })

  it('keeps the first date when the same version is accepted twice', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const leaId = (await act.me(cookie)).id
    await forgetAcceptances(leaId)
    later()
    const first = new Date().toISOString()
    expect((await accept(cookie)).status).toBe(200)
    later()

    const again = await accept(cookie)

    expect(again.status).toBe(200)
    expect(Me.parse(await again.json()).rulesAccepted).toBe(true)
    const rows = await acceptancesOf(leaId)
    expect(rows.map((row) => row.acceptedAt.toISOString())).toEqual([first])
  })

  it('answers 401 without a session', async () => {
    const cookie = await ctx.verifiedMember(lea)
    await forgetAcceptances((await act.me(cookie)).id)

    const res = await accept(null)
    expect(res.status).toBe(401)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('unauthorized')
    // Témoin : la même demande, avec la session, est acceptée.
    expect((await accept(cookie)).status).toBe(200)
  })

  it('only writes the acceptance of the member who sends it', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const other = await ctx.verifiedMember(ines)
    const leaId = (await act.me(cookie)).id
    const inesId = (await act.me(other)).id
    await forgetAcceptances(leaId)
    await forgetAcceptances(inesId)

    // Un identifiant de membre glissé dans le corps ne change rien : seul le membre connecté compte.
    expect((await accept(cookie, { ...ACCEPT, userId: inesId })).status).toBe(200)

    expect((await act.me(cookie)).rulesAccepted).toBe(true)
    expect((await act.me(other)).rulesAccepted).toBe(false)
    expect(await acceptancesOf(inesId)).toEqual([])
  })
})

// ─── Mes données : l'export ───────────────────────────────────────────────────────────────────────

describe('exporting the acceptances', () => {
  it('exports every acceptance, oldest first, with its version, its date and the age declaration', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const leaId = (await act.me(cookie)).id
    // Un accord plus ancien, posé en base avant le sien (aucune route n'accepte une autre version).
    await ctx.db.insert(schema.rulesAcceptance).values({
      userId: leaId,
      version: OLDER_VERSION,
      acceptedAt: new Date(START.getTime() - 60 * MINUTE),
      ageDeclared: true,
    })

    const res = await act.send('GET', '/v1/me/export', cookie)
    expect(res.status).toBe(200)
    const data = AccountExport.parse(await res.json())

    expect(data.rulesAcceptances).toEqual([
      {
        version: OLDER_VERSION,
        acceptedAt: new Date(START.getTime() - 60 * MINUTE).toISOString(),
        ageDeclared: true,
      },
      { version: RULES_VERSION, acceptedAt: START.toISOString(), ageDeclared: true },
    ])
  })

  it('exports nothing of the acceptances of another member', async () => {
    const cookie = await ctx.verifiedMember(lea)
    const other = await ctx.verifiedMember(ines)
    later()
    await forgetAcceptances((await act.me(other)).id)
    expect((await accept(other)).status).toBe(200)

    const data = AccountExport.parse(await (await act.send('GET', '/v1/me/export', cookie)).json())

    // Léa n'a que son accord de l'inscription, pas celui qu'Inès vient de donner.
    expect(data.rulesAcceptances).toEqual([
      { version: RULES_VERSION, acceptedAt: START.toISOString(), ageDeclared: true },
    ])
  })
})
