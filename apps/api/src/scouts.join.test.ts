// Tests d'intégration de R20 « Les Éclaireuses » : devenir Éclaireuse (le code à l'inscription, ou
// POST /v1/me/scout dans ses réglages), les 30 places, le mois, `Me.scout`, « Afficher la Goutte »
// (PATCH /v1/me/scout) et les missions de la semaine (GET /v1/me/scout/missions). Scénario :
// docs/scenarios/refonte.md, « R20 — Les Éclaireuses », « Devenir Éclaireuse », « Le mois des
// Éclaireuses », « Les missions de la semaine » ; plan : choix 2 à 5 et 8, relecture de sécurité A1
// (une place compte si l'adresse est vérifiée ou si l'entrée a moins de 24 h, sous un même verrou à
// l'inscription et dans les réglages) et relecture juridique J1 (une Éclaireuse retirée garde
// `Me.scout`, avec sa date de retrait).
//
// Les Éclaireuses qui ne servent qu'à remplir les places, le mois et les missions sont posés en base
// (testing/scout-seeds.ts) : ces tests ne dépendent que des routes de l'entrée.
import { randomBytes } from 'node:crypto'
import { ErrorResponse, MeScout, type ScoutMissions, weekOf } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { resources } from '@ruche/i18n'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadEnv } from './env'
import { memberCounterKeys } from './rate-limit'
import { createTestContext, type TestContext } from './testing/context'
import {
  activeScouts,
  addMission,
  endedProgram,
  freshCode,
  IDEA,
  launchProgram,
  memberIdOf,
  meScout,
  removeScout,
  scoutRows,
  sealsOf,
  seedScouts,
  sendReport,
} from './testing/scout-seeds'

let ctx: TestContext
// Les deux codes, tirés au hasard à chaque lancement (aucun vrai code dans le dépôt).
let signupCode: string
let scoutCode: string

// Un mercredi, 10 h à Paris : la semaine des missions commence le lundi 30 novembre.
const START = Date.parse('2026-12-02T09:00:00.000Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const lea = { name: 'Léa', email: 'lea@example.com', password: 'lea-long-password' }
const malik = { name: 'Malik', email: 'malik@example.com', password: 'malik-long-password' }
const nina = { name: 'Nina', email: 'nina@example.com', password: 'nina-long-password' }

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  signupCode = freshCode()
  scoutCode = freshCode()
  ctx = await createTestContext({ inviteCode: signupCode, scoutCode })
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

/** Un membre déjà inscrit avec le code commun, adresse vérifiée : son cookie et son identifiant. */
const member = async (account: typeof lea & { language?: string }) => {
  const cookie = await ctx.verifiedMember({ ...account, inviteCode: signupCode })
  return { cookie, id: await memberIdOf(ctx, account.email) }
}

/** Tape un code dans « Les Éclaireuses », « J'ai un code » (POST /v1/me/scout) ; réponse brute. */
const join = (cookie: string | null, body: unknown, headers: Record<string, string> = {}) =>
  ctx.request('/v1/me/scout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }), ...headers },
    body: JSON.stringify(body),
  })

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Le refus de l'inscription (Better Auth) : `{ code, message }` à la racine du corps. */
const expectSignUpRefusal = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(await res.json()).toMatchObject({ code })
}

const accounts = async () => (await ctx.db.select().from(schema.user)).length

/** Les avis de sceau de l'Activité d'un membre (GET /v1/notifications). */
const sealNotices = async (cookie: string) => {
  const res = await ctx.request('/v1/notifications', { headers: { cookie } })
  expect(res.status).toBe(200)
  const { items } = (await res.json()) as { items: { kind: string; code?: string }[] }
  return items.filter((item) => item.kind === 'game_seal').map((item) => item.code)
}

/** Les missions de la semaine (GET /v1/me/scout/missions) ; réponse brute. */
const missions = (cookie: string | null) =>
  ctx.request('/v1/me/scout/missions', { headers: cookie ? { cookie } : {} })

// --- À l'inscription ---

describe('becoming a scout at sign-up', () => {
  it('creates the account with the scout code, makes it a scout and gives the founder seal', async () => {
    const res = await ctx.signUp({ ...nina, inviteCode: scoutCode })

    expect(res.status).toBe(200)
    expect(ctx.mailer.sent.map((sent) => sent.to)).toEqual([nina.email])
    const ninaId = await memberIdOf(ctx, nina.email)
    expect(await scoutRows(ctx)).toEqual([
      { memberId: ninaId, via: 'signup', removed: false, showDrop: true },
    ])
    expect(await sealsOf(ctx, ninaId)).toContain('scout_founder')
  })

  it('announces the founder seal in her activity and shows the drop once she is signed in', async () => {
    const cookie = await ctx.verifiedMember({ ...nina, inviteCode: scoutCode })

    expect(await sealNotices(cookie)).toContain('scout_founder')
    // Le mois n'est pas lancé : elle a déjà la Goutte (« Avant le lancement, une Éclaireuse a déjà
    // la Goutte »), sans fin de mois ni mission.
    expect(await meScout(ctx, cookie)).toEqual({
      active: true,
      joinedAt: new Date(START).toISOString(),
      removedAt: null,
      showDrop: true,
      programEndsAt: null,
      missionsLeft: 0,
    })
  })

  it('ignores capital letters and the spaces around the scout code, like the common code', async () => {
    const res = await ctx.signUp({ ...nina, inviteCode: `  ${scoutCode.toUpperCase()} ` })

    expect(res.status).toBe(200)
    expect(await activeScouts(ctx)).toBe(1)
  })

  it('still signs up with the common code, without making a scout', async () => {
    const lea1 = await member(lea)

    expect(await meScout(ctx, lea1.cookie)).toBeNull()
    expect(await scoutRows(ctx)).toEqual([])
    expect(await sealsOf(ctx, lea1.id)).not.toContain('scout_founder')
  })

  it('still refuses a wrong code at sign-up with the invite code refusal', async () => {
    const res = await ctx.signUp({ ...nina, inviteCode: freshCode() })

    await expectSignUpRefusal(res, 403, 'INVITE_CODE_INVALID')
    expect(await accounts()).toBe(0)
  })

  it('refuses the scout code at sign-up with scout_full once 30 scouts are active, and creates no account', async () => {
    await seedScouts(ctx, 30)
    const before = await accounts()

    const res = await ctx.signUp({ ...nina, inviteCode: scoutCode })

    // Le code de refus de l'inscription, à la manière de Better Auth (INVITE_CODE_INVALID).
    await expectSignUpRefusal(res, 403, 'SCOUT_FULL')
    expect(await accounts()).toBe(before)
    expect(ctx.mailer.sent).toEqual([])
    expect(await activeScouts(ctx)).toBe(30)
  })

  it('answers scout_full the same for a new address and an address that already has an account', async () => {
    await member(lea)
    await seedScouts(ctx, 30)

    const existing = await ctx.signUp({ ...lea, inviteCode: scoutCode })
    const unknown = await ctx.signUp({ ...nina, inviteCode: scoutCode })

    expect(existing.status).toBe(403)
    expect(unknown.status).toBe(existing.status)
    expect(await unknown.text()).toBe(await existing.text())
  })

  it('lets a new scout in at sign-up when a removed scout has freed her place', async () => {
    const [first] = await seedScouts(ctx, 30)
    await removeScout(ctx, first ?? '')

    const res = await ctx.signUp({ ...nina, inviteCode: scoutCode })

    expect(res.status).toBe(200)
    expect(await activeScouts(ctx)).toBe(30)
  })

  it('refuses the scout code at sign-up once the month is over, and creates no account', async () => {
    await endedProgram(ctx)

    const res = await ctx.signUp({ ...nina, inviteCode: scoutCode })

    await expectSignUpRefusal(res, 403, 'SCOUT_CLOSED')
    expect(await accounts()).toBe(0)
    expect(ctx.mailer.sent).toEqual([])
  })

  it('makes nobody a scout by code when no scout code is set', async () => {
    const closed = await createTestContext({ inviteCode: signupCode })
    try {
      const refused = await closed.signUp({ ...nina, inviteCode: scoutCode })
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ code: 'INVITE_CODE_INVALID' })

      const cookie = await closed.verifiedMember({ ...lea, inviteCode: signupCode })
      const res = await closed.request('/v1/me/scout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ code: scoutCode }),
      })
      await expectError(res, 400, 'scout_code_invalid')
    } finally {
      await closed.close()
    }
  })
})

// --- Dans ses réglages ---

describe('becoming a scout from the settings', () => {
  it('refuses a visitor without a session', async () => {
    await expectError(await join(null, { code: scoutCode }), 401, 'unauthorized')
    // Témoin : la garde des sessions répond déjà 401 sur une route absente ; avec sa session, Léa
    // entre.
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
  })

  it('makes a signed-up member a scout and answers with her profile', async () => {
    const lea1 = await member(lea)

    const res = await join(lea1.cookie, { code: scoutCode })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { scout?: unknown }
    expect(MeScout.parse(body.scout)).toMatchObject({ active: true, removedAt: null })
    expect(await scoutRows(ctx)).toEqual([
      { memberId: lea1.id, via: 'settings', removed: false, showDrop: true },
    ])
    expect(await sealsOf(ctx, lea1.id)).toContain('scout_founder')
    expect(await sealNotices(lea1.cookie)).toContain('scout_founder')
  })

  it('refuses a wrong code with the message of a wrong invite code, in her language', async () => {
    const lea1 = await member(lea)

    const french = await join(lea1.cookie, { code: freshCode() })
    const english = await join(
      lea1.cookie,
      { code: freshCode() },
      { 'accept-language': 'en-GB,en;q=0.9' },
    )

    expect(french.status).toBe(400)
    expect(ErrorResponse.parse(await french.json()).error).toEqual({
      code: 'scout_code_invalid',
      message: resources.fr.translation.auth.errors.inviteInvalid,
    })
    expect(english.status).toBe(400)
    expect(ErrorResponse.parse(await english.json()).error.message).toBe(
      resources.en.translation.auth.errors.inviteInvalid,
    )
    expect(await scoutRows(ctx)).toEqual([])
  })

  it('refuses the common invite code in the scout settings exactly like a wrong code', async () => {
    const lea1 = await member(lea)

    const common = await join(lea1.cookie, { code: signupCode })
    const wrong = await join(lea1.cookie, { code: freshCode() })

    expect(common.status).toBe(400)
    expect(common.status).toBe(wrong.status)
    expect(await common.text()).toBe(await wrong.text())
    expect(await scoutRows(ctx)).toEqual([])
  })

  it('accepts the scout code whatever its capital letters and surrounding spaces', async () => {
    const lea1 = await member(lea)

    const res = await join(lea1.cookie, { code: ` ${scoutCode.toUpperCase()}  ` })

    expect(res.status).toBe(200)
  })

  it('refuses a member who is already a scout with scout_already', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)

    later()
    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_already')
    expect(await activeScouts(ctx)).toBe(1)
  })

  it('never lets a removed scout come back, with scout_removed', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    await removeScout(ctx, lea1.id)

    later()
    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_removed')
    expect(await activeScouts(ctx)).toBe(0)
  })

  it('refuses the 31st scout with scout_full', async () => {
    const lea1 = await member(lea)
    await seedScouts(ctx, 30)

    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_full')
    expect(await activeScouts(ctx)).toBe(30)
  })

  it('gives the place of a removed scout to a new one', async () => {
    const lea1 = await member(lea)
    const [first] = await seedScouts(ctx, 30)
    await removeScout(ctx, first ?? '')

    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    expect(await activeScouts(ctx)).toBe(30)
  })

  it('refuses the scout code once the month is over, with scout_closed', async () => {
    const lea1 = await member(lea)
    await endedProgram(ctx)

    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_closed')
    expect(await scoutRows(ctx)).toEqual([])
  })

  it('accepts the scout code during the month', async () => {
    const lea1 = await member(lea)
    await launchProgram(ctx, new Date(START - 3 * 24 * HOUR))

    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
  })

  it('frees the place of a scout whose address is still unverified after 24 hours', async () => {
    const lea1 = await member(lea)
    await seedScouts(ctx, 29)
    // Nina s'inscrit avec le code des Éclaireuses et n'ouvre jamais le lien de vérification.
    expect((await ctx.signUp({ ...nina, inviteCode: scoutCode })).status).toBe(200)
    const ninaId = await memberIdOf(ctx, nina.email)
    expect(await activeScouts(ctx)).toBe(30)

    // Moins de 24 h : sa place compte encore.
    later(23 * HOUR)
    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_full')

    // Plus de 24 h : son entrée non vérifiée s'efface, et Léa prend la place.
    later(HOUR + MINUTE)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    const rows = await scoutRows(ctx)
    expect(rows.map((row) => row.memberId)).not.toContain(ninaId)
    expect(rows.map((row) => row.memberId)).toContain(lea1.id)
    expect(await activeScouts(ctx)).toBe(30)
  })

  it('keeps counting the place of an unverified scout who joined less than 24 hours ago', async () => {
    const lea1 = await member(lea)
    await seedScouts(ctx, 29)
    await seedScouts(ctx, 1, { verified: false, joinedAt: new Date(START - 23 * HOUR) })

    await expectError(await join(lea1.cookie, { code: scoutCode }), 409, 'scout_full')
  })

  it('makes only one member a scout when the last place is taken by sign-up and by the settings', async () => {
    const lea1 = await member(lea)
    await seedScouts(ctx, 29)

    // Les deux demandes partent ensemble. Sous PGlite (une seule connexion), elles passent l'une
    // après l'autre : ce test garde la règle (30 au plus), il ne prouve pas le verrou à lui seul.
    const [signUp, settings] = await Promise.all([
      ctx.signUp({ ...nina, inviteCode: scoutCode }),
      join(lea1.cookie, { code: scoutCode }),
    ])

    expect(await activeScouts(ctx)).toBe(30)
    const scouts = (await scoutRows(ctx)).map((row) => row.memberId)
    const ninaAccount = await ctx.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`${schema.user.email} = ${nina.email}`)
    const ninaIsScout = ninaAccount.some((row) => scouts.includes(row.id))
    const leaIsScout = scouts.includes(lea1.id)
    expect([ninaIsScout, leaIsScout].filter(Boolean)).toHaveLength(1)
    // Celle qui n'a pas la place l'apprend : 409 dans les réglages, 403 à l'inscription (ou un
    // compte créé sans titre, si la place est partie entre la vérification et la création).
    if (!leaIsScout) expect(settings.status).toBe(409)
    if (!ninaIsScout && ninaAccount.length === 0) expect(signUp.status).toBe(403)
  })

  it('counts even malformed requests against the scout code quota', async () => {
    const lea1 = await member(lea)
    // 10 essais par heure : elle en a déjà fait 8 ; un corps vide fait le 9e, un code qui n'est pas
    // du texte le 10e (comptés avant tout examen) ; le suivant, avec le bon code, est refusé.
    await ctx.db.insert(schema.apiRateLimit).values({
      key: memberCounterKeys(lea1.id).scoutCode,
      count: 8,
      windowStart: Date.now(),
    })
    await expectError(await join(lea1.cookie, {}), 400, 'validation')
    await expectError(await join(lea1.cookie, { code: 2026 }), 400, 'validation')

    await expectError(await join(lea1.cookie, { code: scoutCode }), 429, 'rate_limited')
    expect(await scoutRows(ctx)).toEqual([])
  })

  it('counts wrong codes in the quota: guessing the scout code is not possible', async () => {
    const lea1 = await member(lea)
    for (let attempt = 0; attempt < 10; attempt++) {
      later()
      await expectError(await join(lea1.cookie, { code: freshCode() }), 400, 'scout_code_invalid')
    }

    later()
    await expectError(await join(lea1.cookie, { code: scoutCode }), 429, 'rate_limited')
    expect(await scoutRows(ctx)).toEqual([])
  })
})

// --- Me.scout ---

describe('the scout state of the signed-in member', () => {
  it('is null for a member who never was a scout', async () => {
    const lea1 = await member(lea)

    expect(await meScout(ctx, lea1.cookie)).toBeNull()
  })

  it('gives the end of the month once it is launched', async () => {
    const lea1 = await member(lea)
    const endsAt = await launchProgram(ctx, new Date(START - 2 * 24 * HOUR))
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)

    expect(await meScout(ctx, lea1.cookie)).toMatchObject({
      active: true,
      programEndsAt: endsAt.toISOString(),
    })
  })

  it('counts the missions of the week she has not answered yet', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    const first = await addMission(ctx, { position: 1, textFr: 'Publie un projet avec une photo' })
    await addMission(ctx, { position: 2, textFr: 'Essaie Waiggle sur ton téléphone' })
    await addMission(ctx, { position: 3, textFr: 'Suis un projet d’un proche' })
    // Une mission de la semaine passée ne compte plus.
    await addMission(ctx, { week: '2026-11-23', position: 1, textFr: 'Change ta photo' })
    expect(await meScout(ctx, lea1.cookie)).toMatchObject({ missionsLeft: 3 })

    later()
    const res = await sendReport(ctx, lea1.cookie, { ...IDEA, missionId: first })
    expect(res.status).toBe(201)

    expect(await meScout(ctx, lea1.cookie)).toMatchObject({ missionsLeft: 2 })
  })

  it('still returns the scout state with its removal date to a removed scout', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    later()
    await removeScout(ctx, lea1.id)

    expect(await meScout(ctx, lea1.cookie)).toEqual({
      active: false,
      joinedAt: new Date(START).toISOString(),
      removedAt: new Date(START + MINUTE).toISOString(),
      showDrop: true,
      programEndsAt: null,
      missionsLeft: 0,
    })
  })

  it('turns inactive once the month is over, keeping her scout state', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)
    await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    const endsAt = await endedProgram(ctx)

    expect(await meScout(ctx, lea1.cookie)).toMatchObject({
      active: false,
      removedAt: null,
      programEndsAt: endsAt.toISOString(),
      missionsLeft: 0,
    })
  })
})

// --- « Afficher la Goutte » ---

describe('showing or hiding the drop', () => {
  /** Change le réglage (PATCH /v1/me/scout) ; réponse brute. */
  const setDrop = (cookie: string | null, body: unknown) =>
    ctx.request('/v1/me/scout', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: JSON.stringify(body),
    })

  it('hides the drop and answers with her profile', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)

    const res = await setDrop(lea1.cookie, { showDrop: false })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { scout?: unknown }
    expect(MeScout.parse(body.scout)).toMatchObject({ showDrop: false, active: true })
    expect(await meScout(ctx, lea1.cookie)).toMatchObject({ showDrop: false })
    expect(await scoutRows(ctx)).toEqual([
      { memberId: lea1.id, via: 'settings', removed: false, showDrop: false },
    ])

    later()
    expect((await setDrop(lea1.cookie, { showDrop: true })).status).toBe(200)
    expect(await meScout(ctx, lea1.cookie)).toMatchObject({ showDrop: true })
  })

  it('refuses a visitor, and a setting that is not a yes or no or comes with another field', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)

    await expectError(await setDrop(null, { showDrop: false }), 401, 'unauthorized')
    await expectError(await setDrop(lea1.cookie, { showDrop: 'no' }), 400, 'validation')
    await expectError(
      await setDrop(lea1.cookie, { showDrop: false, active: true }),
      400,
      'validation',
    )
    expect(await meScout(ctx, lea1.cookie)).toMatchObject({ showDrop: true, active: true })
  })

  it('refuses the setting to a member who is not a scout', async () => {
    const lea1 = await member(lea)

    await expectError(await setDrop(lea1.cookie, { showDrop: false }), 403, 'scout_only')
    expect(await scoutRows(ctx)).toEqual([])
  })
})

// --- Les missions de la semaine ---

describe('the missions of the week', () => {
  it('lists the missions of the week in their order, in her language, French by default', async () => {
    const lea1 = await member(lea)
    const malik1 = await member({ ...malik, language: 'en' })
    for (const scout of [lea1, malik1]) {
      expect((await join(scout.cookie, { code: scoutCode })).status).toBe(200)
    }
    const second = await addMission(ctx, {
      position: 2,
      textFr: 'Essaie Waiggle sur ton téléphone',
      textEn: 'Try Waiggle on your phone',
    })
    const first = await addMission(ctx, { position: 1, textFr: 'Publie un projet avec une photo' })
    await addMission(ctx, { week: '2026-11-23', position: 1, textFr: 'Change ta photo' })

    const french = await missions(lea1.cookie)
    const english = await missions(malik1.cookie)

    expect(french.status).toBe(200)
    expect((await french.json()) as ScoutMissions).toEqual({
      week: '2026-11-30',
      missions: [
        { id: first, text: 'Publie un projet avec une photo', done: false },
        { id: second, text: 'Essaie Waiggle sur ton téléphone', done: false },
      ],
    })
    expect(english.status).toBe(200)
    expect((await english.json()) as ScoutMissions).toEqual({
      week: '2026-11-30',
      missions: [
        { id: first, text: 'Publie un projet avec une photo', done: false },
        { id: second, text: 'Try Waiggle on your phone', done: false },
      ],
    })
  })

  it('marks done a mission she has answered, for her only', async () => {
    const lea1 = await member(lea)
    const malik1 = await member(malik)
    for (const scout of [lea1, malik1]) {
      expect((await join(scout.cookie, { code: scoutCode })).status).toBe(200)
    }
    const mission = await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    later()
    expect((await sendReport(ctx, lea1.cookie, { ...IDEA, missionId: mission })).status).toBe(201)

    const mine = (await (await missions(lea1.cookie)).json()) as ScoutMissions
    const his = (await (await missions(malik1.cookie)).json()) as ScoutMissions

    expect(mine.missions).toEqual([{ id: mission, text: expect.any(String), done: true }])
    expect(his.missions).toEqual([{ id: mission, text: expect.any(String), done: false }])
  })

  it('answers an empty list for a week without missions', async () => {
    const lea1 = await member(lea)
    expect((await join(lea1.cookie, { code: scoutCode })).status).toBe(200)

    const res = await missions(lea1.cookie)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ week: weekOf(new Date(START)), missions: [] })
  })

  it('refuses a visitor, a member who is not a scout and a removed scout', async () => {
    const lea1 = await member(lea)
    const malik1 = await member(malik)
    expect((await join(malik1.cookie, { code: scoutCode })).status).toBe(200)
    await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    // Témoin : une Éclaireuse active les lit.
    expect((await missions(malik1.cookie)).status).toBe(200)
    await removeScout(ctx, malik1.id)

    await expectError(await missions(null), 401, 'unauthorized')
    await expectError(await missions(lea1.cookie), 403, 'scout_only')
    await expectError(await missions(malik1.cookie), 403, 'scout_only')
  })
})

// --- La configuration du serveur ---

describe('the scout code in the server configuration', () => {
  // Comme env.test.ts : une configuration de production complète, au code commun tiré au hasard.
  const inviteCode = randomBytes(8).toString('hex')
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://ruche:secret@db:5432/ruche',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    PUBLIC_API_URL: 'https://api.waiggle.com',
    APP_URL: 'https://waiggle.com',
    MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: 'key',
    MAIL_FROM_EMAIL: 'no-reply@waiggle.com',
    SIGNUP_INVITE_CODE: inviteCode,
  }

  it('reads the scout code, and has none when it is absent or empty', () => {
    const code = randomBytes(8).toString('hex')

    expect(loadEnv({ ...production, SCOUT_INVITE_CODE: ` ${code} ` }).scoutCode).toBe(code)
    expect(loadEnv(production).scoutCode).toBeNull()
    expect(loadEnv({ ...production, SCOUT_INVITE_CODE: '' }).scoutCode).toBeNull()
  })

  it('refuses a scout code shorter than 12 characters, spaces around it not counted', () => {
    expect(() => loadEnv({ ...production, SCOUT_INVITE_CODE: '  eclaireuse  ' })).toThrow(
      /SCOUT_INVITE_CODE/,
    )
  })

  it('refuses a scout code equal to the sign-up code once normalized', () => {
    expect(() =>
      loadEnv({ ...production, SCOUT_INVITE_CODE: `  ${inviteCode.toUpperCase()} ` }),
    ).toThrow(/SCOUT_INVITE_CODE/)
  })

  it('refuses a scout code that is a public example of the repository', () => {
    for (const example of ['Miel-2026-Noel', ' SMOKE-test-invite-code ', 'F3A9C2E17B4D8A06']) {
      expect(() => loadEnv({ ...production, SCOUT_INVITE_CODE: example })).toThrow(
        /SCOUT_INVITE_CODE/,
      )
    }
  })
})
