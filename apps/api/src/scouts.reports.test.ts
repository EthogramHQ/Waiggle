// Tests d'intégration de R20 « Les Éclaireuses » : envoyer un retour par la Goutte (POST
// /v1/me/scout/reports, en multipart), le relire dans « Mes retours » (GET) et le supprimer (DELETE
// /v1/me/scout/reports/{id}). Scénario : docs/scenarios/refonte.md, « R20 — Les Éclaireuses »,
// « Le retour normé », « Les missions de la semaine », « Mes retours et “Ta danse a été
// entendue” » ; plan : choix 6 et 7 (ordre des gardes : session, Éclaireuse active, quota de 20 par
// 24 h compté avant la validation, validation, image, transaction ; 25 pollen pour 4 retours par
// jour, 30 pollen une fois par mission), relecture de sécurité A3 (la partie `report` : une chaîne
// de 16 Ko au plus, du JSON strict ; `screen` coupée à « ? » ou « # » ; les caractères comptés en
// caractères) et relecture juridique J2, J3 et J5 (jamais la note de l'administrateur dans « Mes
// retours » ; l'avis « danse entendue » part avec le retour ; aucun contexte tiré des en-têtes).
//
// Les captures (format, poids, métadonnées, qui les voit) sont testées par scouts.media.test.ts.
// Quatre membres : Léa et Malik (Éclaireuses), Sami (membre ordinaire), Louis (l'administrateur).
import {
  ErrorResponse,
  MyScoutReports,
  type ScoutContext,
  ScoutReport,
  weekOf,
} from '@ruche/contracts'
import { schema } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { gesturesOf, ledgerOf, pollenHeader, pollenOf } from './testing/pollen-ledger'
import {
  addMission,
  endedProgram,
  freshCode,
  IDEA,
  launchProgram,
  memberIdOf,
  removeScout,
  sendReport,
} from './testing/scout-seeds'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: string // cookies de session
let malik: string
let sami: string
let louis: string
let leaId: string
let malikId: string

// Un mercredi, 10 h à Paris : la semaine des missions commence le lundi 30 novembre.
const START = Date.parse('2026-12-02T09:00:00.000Z')
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  const signupCode = freshCode()
  const scoutCode = freshCode()
  ctx = await createTestContext({ inviteCode: signupCode, scoutCode })
  act = activity(ctx)
  const account = async (name: string, inviteCode: string) => {
    const email = `${name.toLowerCase()}@example.com`
    const cookie = await ctx.verifiedMember({
      name,
      email,
      password: `${name.toLowerCase()}-long-password`,
      inviteCode,
    })
    return { cookie, id: await memberIdOf(ctx, email) }
  }
  // Léa et Malik deviennent Éclaireuses à l'inscription, avec le code des Éclaireuses.
  ;({ cookie: lea, id: leaId } = await account('Lea', scoutCode))
  ;({ cookie: malik, id: malikId } = await account('Malik', scoutCode))
  ;({ cookie: sami } = await account('Sami', signupCode))
  const admin = await account('Louis', signupCode)
  louis = admin.cookie
  await act.makeAdmin(admin.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Avance la fausse horloge (par défaut d'une minute). */
const later = (ms = MINUTE) => vi.setSystemTime(Date.now() + ms)

const expectError = async (res: Response, status: number, code: string) => {
  expect(res.status).toBe(status)
  expect(ErrorResponse.parse(await res.json()).error.code).toBe(code)
}

/** Envoie un retour qui doit être accepté, et le rend. */
const send = async (cookie: string, report: unknown = IDEA) => {
  later()
  const res = await sendReport(ctx, cookie, report)
  expect(res.status).toBe(201)
  return ScoutReport.parse(await res.json())
}

/** « Mes retours » (GET /v1/me/scout/reports) ; réponse brute. */
const myReports = (cookie: string | null) =>
  ctx.request('/v1/me/scout/reports', { headers: cookie ? { cookie } : {} })

const myReportsOf = async (cookie: string) => {
  const res = await myReports(cookie)
  expect(res.status).toBe(200)
  return MyScoutReports.parse(await res.json()).reports
}

/** Supprime un retour ; réponse brute. */
const remove = (cookie: string | null, id: string) =>
  ctx.request(`/v1/me/scout/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: cookie ? { cookie } : {},
  })

/** Ce qui est joint, tel que la feuille l'écrit en clair. */
const CONTEXT: ScoutContext = {
  screen: '/projects/42',
  platform: 'web',
  width: 1280,
  appVersion: 'a1b2c3d',
  language: 'fr',
  scheme: 'night',
}

/** Les colonnes du contexte d'un retour, lues en base (choix 1 du plan). */
const storedContext = async (id: string) => {
  const result = await ctx.db.execute(
    sql`select screen, platform, width, app_version as "appVersion", language, scheme
        from scout_report where id = ${id}`,
  )
  return (result as unknown as { rows: Record<string, unknown>[] }).rows[0]
}

/** Le nombre de retours rangés en base, tous membres confondus. */
const storedReports = async () => {
  const result = await ctx.db.execute(sql`select count(*)::int as n from scout_report`)
  return (result as unknown as { rows: { n: number }[] }).rows[0]?.n
}

// --- Qui peut envoyer ---

describe('who can send a report', () => {
  it('refuses a visitor without a session', async () => {
    await expectError(await sendReport(ctx, null, IDEA), 401, 'unauthorized')
    // Témoin : la garde des sessions répond déjà 401 sur une route absente ; avec sa session, Léa
    // envoie.
    expect(await storedReports()).toBe(0)
    await send(lea)
  })

  it('refuses a report from a member who is not a scout', async () => {
    await expectError(await sendReport(ctx, sami, IDEA), 403, 'scout_only')
    expect(await storedReports()).toBe(0)
  })

  it('refuses a report from a removed scout', async () => {
    await removeScout(ctx, malikId)

    await expectError(await sendReport(ctx, malik, IDEA), 403, 'scout_only')
    expect(await storedReports()).toBe(0)
  })

  it('takes reports before the month is launched and during it', async () => {
    await send(lea)
    await launchProgram(ctx, new Date(START - 5 * DAY))
    await send(lea)

    expect(await storedReports()).toBe(2)
  })

  it('refuses a report once the month is over, with scout_closed', async () => {
    await endedProgram(ctx)

    await expectError(await sendReport(ctx, lea, IDEA), 409, 'scout_closed')
    expect(await storedReports()).toBe(0)
  })
})

// --- Ce qu'un retour contient ---

describe('what a report holds', () => {
  it('stores a report and answers it with the status sent', async () => {
    const report = await send(lea)

    expect(report).toEqual({
      id: expect.any(String),
      kind: 'idea',
      severity: null,
      text: IDEA.text,
      mission: null,
      context: null,
      mediaUrl: null,
      status: 'sent',
      fixedNote: null,
      createdAt: new Date(START + 2 * MINUTE).toISOString(),
      fixedAt: null,
    })
  })

  it('asks a severity for a bug or a confusing spot, and refuses one for an idea or a love', async () => {
    const text = 'Le bouton Publier ne répond plus.'
    for (const refused of [
      { kind: 'bug', text },
      { kind: 'confusing', text },
      { kind: 'idea', severity: 'minor', text },
      { kind: 'love', severity: 'blocking', text },
      { kind: 'bug', severity: 'critical', text },
      { kind: 'praise', text },
    ]) {
      later()
      await expectError(await sendReport(ctx, lea, refused), 400, 'validation')
    }
    expect(await storedReports()).toBe(0)

    expect(await send(lea, { kind: 'bug', severity: 'blocking', text })).toMatchObject({
      kind: 'bug',
      severity: 'blocking',
    })
    expect(await send(lea, { kind: 'confusing', severity: 'minor', text })).toMatchObject({
      severity: 'minor',
    })
    expect(await send(lea, { kind: 'love', text: 'J’adore la danse des abeilles.' })).toMatchObject(
      { kind: 'love', severity: null },
    )
  })

  it('refuses an empty or invisible text, and a text beyond 2 000 characters', async () => {
    for (const text of ['', '   ', '​​', 'a'.repeat(2001)]) {
      later()
      await expectError(await sendReport(ctx, lea, { kind: 'idea', text }), 400, 'validation')
    }
    expect(await storedReports()).toBe(0)

    expect((await send(lea, { kind: 'idea', text: 'a'.repeat(2000) })).text).toHaveLength(2000)
  })

  it('counts the 2 000 characters of a report text in characters, not UTF-16 units', async () => {
    // « 🐝 » est un seul caractère, mais deux unités UTF-16 : 2 000 abeilles font 4 000 unités.
    const bees = '🐝'.repeat(2000)

    const report = await send(lea, { kind: 'love', text: bees })

    expect([...report.text]).toHaveLength(2000)
    later()
    await expectError(
      await sendReport(ctx, lea, { kind: 'love', text: `${bees}🐝` }),
      400,
      'validation',
    )
  })

  it('refuses a report part with a field that is not part of a report', async () => {
    for (const extra of [{ adminNote: 'Note' }, { status: 'fixed' }, { memberId: malikId }]) {
      later()
      await expectError(await sendReport(ctx, lea, { ...IDEA, ...extra }), 400, 'validation')
    }
    expect(await storedReports()).toBe(0)
  })

  it('refuses a report part larger than 16 KB, even made of spaces around valid JSON', async () => {
    const padded = `${JSON.stringify(IDEA)}${' '.repeat(17 * 1024)}`

    await expectError(await sendReport(ctx, lea, padded), 400, 'validation')
    expect(await storedReports()).toBe(0)
  })

  it('answers 400 to a report part that is not JSON or is sent as a file, before processing the image', async () => {
    // Une capture qui n'est pas une image : si elle était traitée avant la partie `report`, la
    // réponse serait 415 (unsupported_media_type), pas 400.
    const notAnImage = { bytes: new TextEncoder().encode('pas une image'), type: 'image/png' }
    const asFile = new FormData()
    asFile.append(
      'report',
      new File([JSON.stringify(IDEA)], 'report.json', { type: 'application/json' }),
    )
    asFile.append('file', new File([notAnImage.bytes], 'capture.png', { type: 'image/png' }))

    for (const res of [
      await sendReport(ctx, lea, '{"kind": "idea", "text": ', notAnImage),
      await sendReport(ctx, lea, 'idée', notAnImage),
      await ctx.request('/v1/me/scout/reports', {
        method: 'POST',
        headers: { cookie: lea },
        body: asFile,
      }),
      await ctx.request('/v1/me/scout/reports', {
        method: 'POST',
        headers: { cookie: lea },
        body: (() => {
          const form = new FormData()
          form.append('file', new File([notAnImage.bytes], 'capture.png', { type: 'image/png' }))
          return form
        })(),
      }),
    ]) {
      await expectError(res, 400, 'validation')
    }
    expect([...ctx.storage.files.keys()].filter((key) => key.startsWith('scouts/'))).toEqual([])
    expect(await storedReports()).toBe(0)
  })
})

// --- Ce qui est joint ---

describe('what is attached to a report', () => {
  it('stores the attached context as it was shown', async () => {
    const report = await send(lea, { ...IDEA, context: CONTEXT })

    expect(report.context).toEqual(CONTEXT)
    expect(await storedContext(report.id)).toEqual(CONTEXT)
  })

  it('stores no context when the report comes without one, whatever the request headers say', async () => {
    later()
    const res = await sendReport(ctx, lea, IDEA, undefined, {
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      'accept-language': 'en-GB,en;q=0.9',
      referer: 'http://localhost:8081/projects/42?invite=abc',
    })

    expect(res.status).toBe(201)
    const report = ScoutReport.parse(await res.json())
    expect(report.context).toBeNull()
    expect(await storedContext(report.id)).toEqual({
      screen: null,
      platform: null,
      width: null,
      appVersion: null,
      language: null,
      scheme: null,
    })
  })

  it('stores a screen without its query and fragment, and refuses one that does not start with a slash', async () => {
    const report = await send(lea, {
      ...IDEA,
      context: { ...CONTEXT, screen: '/projects/42?invite=secret-token#comments' },
    })
    const fragment = await send(lea, {
      ...IDEA,
      context: { ...CONTEXT, screen: '/settings#scouts' },
    })

    expect(report.context?.screen).toBe('/projects/42')
    expect(await storedContext(report.id)).toMatchObject({ screen: '/projects/42' })
    expect(fragment.context?.screen).toBe('/settings')
    for (const screen of ['projects/42', 'https://evil.example/projects/42', '']) {
      later()
      await expectError(
        await sendReport(ctx, lea, { ...IDEA, context: { ...CONTEXT, screen } }),
        400,
        'validation',
      )
    }
    expect(await storedReports()).toBe(2)
  })

  it('refuses a screen with a control or bidirectional character, or longer than 200', async () => {
    for (const screen of [
      '/projects/‮42',
      '/projects/‏42',
      '/projects/\u000742',
      '/projects/4 2',
      `/${'a'.repeat(200)}`,
    ]) {
      later()
      await expectError(
        await sendReport(ctx, lea, { ...IDEA, context: { ...CONTEXT, screen } }),
        400,
        'validation',
      )
    }
    expect(await storedReports()).toBe(0)
  })

  it('refuses an attached app version that is not a plain hexadecimal version', async () => {
    for (const appVersion of ['<b>1.0</b>', 'build 7', '1.0‮']) {
      later()
      await expectError(
        await sendReport(ctx, lea, { ...IDEA, context: { ...CONTEXT, appVersion } }),
        400,
        'validation',
      )
    }
    expect(await storedReports()).toBe(0)
  })

  it('refuses a context that misses a field: it is all or nothing', async () => {
    const { scheme: _scheme, ...partial } = CONTEXT

    await expectError(await sendReport(ctx, lea, { ...IDEA, context: partial }), 400, 'validation')
  })
})

// --- Les missions ---

describe('answering a mission of the week', () => {
  it('links the report to the mission and pays 25 and 30 pollen, the mission once only', async () => {
    const mission = await addMission(ctx, { textFr: 'Publie un projet avec une photo' })

    later()
    const first = await sendReport(ctx, lea, { ...IDEA, missionId: mission })
    expect(first.status).toBe(201)
    expect(pollenHeader(first)).toBe('55')
    expect(ScoutReport.parse(await first.json()).mission).toEqual({
      id: mission,
      text: 'Publie un projet avec une photo',
    })

    later()
    const again = await sendReport(ctx, lea, { ...IDEA, missionId: mission })
    expect(again.status).toBe(201)
    expect(pollenHeader(again)).toBe('25')

    expect(await gesturesOf(ctx, leaId)).toEqual([
      ['scout_report', 25],
      ['scout_mission', 30],
      ['scout_report', 25],
    ])
    const ledger = await ledgerOf(ctx, leaId)
    expect(ledger.map((row) => [row.sourceKind, row.family])).toEqual([
      ['scout_report', 'keeper'],
      ['scout_mission', 'keeper'],
      ['scout_report', 'keeper'],
    ])
  })

  it('pays the mission to each scout who answers it', async () => {
    const mission = await addMission(ctx, { textFr: 'Essaie Waiggle sur ton téléphone' })

    await send(lea, { ...IDEA, missionId: mission })
    await send(malik, { ...IDEA, missionId: mission })

    expect(await pollenOf(ctx, leaId)).toBe(55)
    expect(await pollenOf(ctx, malikId)).toBe(55)
  })

  it('refuses a mission of another week and an unknown mission with the same 400', async () => {
    const lastWeek = await addMission(ctx, {
      week: '2026-11-23',
      textFr: 'Change ta photo de profil',
    })
    const nextWeek = await addMission(ctx, {
      week: weekOf(new Date(START + 7 * DAY)),
      textFr: 'Invite un proche',
    })
    // Témoin : une mission de la semaine est acceptée.
    const current = await addMission(ctx, { textFr: 'Publie un projet avec une photo' })
    await send(lea, { ...IDEA, missionId: current })

    const bodies: string[] = []
    for (const missionId of [lastWeek, nextWeek, crypto.randomUUID()]) {
      later()
      const res = await sendReport(ctx, lea, { ...IDEA, missionId })
      expect(res.status).toBe(400)
      bodies.push(await res.text())
    }
    expect(ErrorResponse.parse(JSON.parse(bodies[0] ?? '{}')).error.code).toBe(
      'scout_mission_invalid',
    )
    expect(new Set(bodies).size).toBe(1)
    expect(await storedReports()).toBe(1)
  })
})

// --- Le pollen et les quotas ---

describe('the pollen and the limits of the reports', () => {
  it('pays 25 pollen for the first 4 reports of the day only', async () => {
    const headers: (string | null)[] = []
    for (let index = 0; index < 5; index++) {
      later()
      const res = await sendReport(ctx, lea, IDEA)
      expect(res.status).toBe(201)
      headers.push(pollenHeader(res))
    }

    expect(headers).toEqual(['25', '25', '25', '25', null])
    expect(await pollenOf(ctx, leaId)).toBe(100)
    expect(await storedReports()).toBe(5)
  })

  it('refuses the 21st report of the day with 429', async () => {
    // 20 retours par 24 h : elle en a déjà envoyé 19.
    await ctx.db.insert(schema.apiRateLimit).values({
      key: memberCounterKeys(leaId).scoutReport,
      count: 19,
      windowStart: Date.now(),
    })
    await send(lea)

    later()
    await expectError(await sendReport(ctx, lea, IDEA), 429, 'rate_limited')
    expect(await storedReports()).toBe(1)
    // Le compteur est à elle : Malik envoie toujours.
    await send(malik)
  })

  it('counts even malformed requests against the scout report quota', async () => {
    // Elle en a déjà envoyé 18 ; un JSON cassé fait le 19e, une sorte inconnue le 20e (comptés
    // avant toute validation) ; le suivant, bien formé, est refusé.
    await ctx.db.insert(schema.apiRateLimit).values({
      key: memberCounterKeys(leaId).scoutReport,
      count: 18,
      windowStart: Date.now(),
    })
    await expectError(await sendReport(ctx, lea, '{'), 400, 'validation')
    await expectError(
      await sendReport(ctx, lea, { kind: 'rant', text: 'Rien ne va.' }),
      400,
      'validation',
    )

    await expectError(await sendReport(ctx, lea, IDEA), 429, 'rate_limited')
    expect(await storedReports()).toBe(0)
  })
})

// --- Mes retours ---

describe('my reports', () => {
  it('lists her own reports only, the most recent first', async () => {
    const older = await send(lea, { ...IDEA, text: 'Le premier retour.' })
    await send(malik, { ...IDEA, text: 'Le retour de Malik.' })
    const newer = await send(lea, { kind: 'bug', severity: 'annoying', text: 'Le second.' })

    expect(await myReportsOf(lea)).toEqual([newer, older])
  })

  it('never returns the administrator note in My reports', async () => {
    const report = await send(lea)
    await ctx.db.execute(
      sql`update scout_report
          set admin_note = 'Note privée : doublon du retour de Malik', status = 'read'
          where id = ${report.id}`,
    )

    const res = await myReports(lea)

    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(raw).not.toContain('Note privée')
    expect(raw).not.toContain('adminNote')
    expect(MyScoutReports.parse(JSON.parse(raw)).reports).toEqual([{ ...report, status: 'read' }])
  })

  it('shows the status, the date and the note of a fixed report', async () => {
    const report = await send(lea)
    const fixedAt = new Date(START + DAY)
    await ctx.db.execute(
      sql`update scout_report
          set status = 'fixed', fixed_note = 'Corrigé le 3/12, merci !',
            fixed_at = ${fixedAt.toISOString()}::timestamptz at time zone 'UTC'
          where id = ${report.id}`,
    )

    expect(await myReportsOf(lea)).toEqual([
      {
        ...report,
        status: 'fixed',
        fixedNote: 'Corrigé le 3/12, merci !',
        fixedAt: fixedAt.toISOString(),
      },
    ])
  })

  it('lets a scout read her reports after the month and after her removal', async () => {
    const report = await send(lea)
    await endedProgram(ctx)
    expect((await myReportsOf(lea)).map((row) => row.id)).toEqual([report.id])

    await removeScout(ctx, leaId)
    expect((await myReportsOf(lea)).map((row) => row.id)).toEqual([report.id])
  })

  it('shows the 100 most recent reports at most', async () => {
    await ctx.db.execute(
      sql`insert into scout_report (id, member_id, kind, text, status, created_at, updated_at)
          select gen_random_uuid(), ${leaId}, 'idea', 'Retour ' || n, 'sent',
            ${new Date(START).toISOString()}::timestamptz at time zone 'UTC' - n * interval '1 minute',
            ${new Date(START).toISOString()}::timestamptz at time zone 'UTC' - n * interval '1 minute'
          from generate_series(1, 101) as n`,
    )

    const reports = await myReportsOf(lea)

    expect(reports).toHaveLength(100)
    expect(reports[0]?.text).toBe('Retour 1')
    expect(reports.at(-1)?.text).toBe('Retour 100')
  })

  it('refuses a visitor without a session', async () => {
    await expectError(await myReports(null), 401, 'unauthorized')
    // Témoin : la garde des sessions répond déjà 401 sur une route absente ; avec sa session, Léa
    // lit sa liste.
    expect(await myReportsOf(lea)).toEqual([])
  })
})

// --- Supprimer un retour ---

describe('deleting a report', () => {
  it('deletes her report from My reports and keeps her pollen', async () => {
    const report = await send(lea)
    const kept = await send(lea, { ...IDEA, text: 'Un autre retour.' })

    later()
    const res = await remove(lea, report.id)

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect((await myReportsOf(lea)).map((row) => row.id)).toEqual([kept.id])
    expect(await storedReports()).toBe(1)
    expect(await pollenOf(ctx, leaId)).toBe(50)
  })

  it('answers the same 404 to the report of another scout, an unknown id and a malformed id', async () => {
    const his = await send(malik)
    // Témoin : elle supprime le sien.
    const mine = await send(lea)
    expect((await remove(lea, mine.id)).status).toBe(204)

    const bodies: string[] = []
    for (const id of [his.id, crypto.randomUUID(), 'pas-un-identifiant']) {
      later()
      const res = await remove(lea, id)
      expect(res.status, id).toBe(404)
      bodies.push(await res.text())
    }
    expect(new Set(bodies).size).toBe(1)
    expect((await myReportsOf(malik)).map((row) => row.id)).toEqual([his.id])
  })

  it('refuses a visitor without a session', async () => {
    const report = await send(lea)

    await expectError(await remove(null, report.id), 401, 'unauthorized')
    expect(await storedReports()).toBe(1)
  })

  it('removes the heard notice and its excerpt when the scout deletes the report', async () => {
    const report = await send(lea, { kind: 'bug', severity: 'annoying', text: 'Le fil saute.' })
    later()
    const fixed = await act.send('PATCH', `/v1/moderation/scouts/reports/${report.id}`, louis, {
      status: 'fixed',
    })
    expect(fixed.status).toBe(200)
    // Les avis « Ta danse a été entendue » de son Activité, lus tels que l'API les rend.
    const heard = async () => {
      const res = await ctx.request('/v1/notifications', { headers: { cookie: lea } })
      expect(res.status).toBe(200)
      const { items } = (await res.json()) as { items: { kind: string }[] }
      return items.filter((item) => item.kind === 'game_scout_heard')
    }
    expect(await heard()).toEqual([
      expect.objectContaining({ reportId: report.id, excerpt: 'Le fil saute.' }),
    ])

    later()
    expect((await remove(lea, report.id)).status).toBe(204)

    expect(await heard()).toEqual([])
    const res = await ctx.request('/v1/notifications', { headers: { cookie: lea } })
    expect(await res.text()).not.toContain('Le fil saute.')
  })
})
