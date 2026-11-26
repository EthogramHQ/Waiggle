// Tests d'intégration de R20 : la page de tri des Éclaireuses, pour l'administrateur seul
// (/v1/moderation/scouts). Le haut de la page (le mois, les places, les missions de la semaine, les
// Éclaireuses), « Lancer le mois », les missions, la liste des retours (filtrée, paginée), le statut
// et les notes d'un retour, et « Retirer ». Scénario : docs/scenarios/refonte.md, « R20 — Les
// Éclaireuses », « La page de tri » ; plan R20, choix 9, relectures du plan (sécurité A1, A2, A4,
// juridique J1).
//
// Les membres : Louis, l'administrateur ; Inès et Malik, Éclaireuses (posées en base, voir
// testing/scout-world.ts) ; Zoé, un membre ; Karim, un administrateur révoqué. La fausse horloge
// part d'un mercredi de novembre, 10 h à Paris.
//
// Tant que les routes n'existent pas, chaque test tombe sur le premier appel d'une route des
// Éclaireuses (404 au lieu de 200 ou 201), ou sur la table `scout` absente : c'est la bonne raison
// du rouge.
import {
  ErrorResponse,
  programEndOf,
  SCOUT_ADMIN_DAILY,
  SCOUT_PLACES,
  SCOUT_TRIAGE_PAGE_SIZE,
  weekOf,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, expectError, nextMonday, START } from './testing/game-world'
import { jpegImage } from './testing/images'
import { ledgerOf } from './testing/pollen-ledger'
import {
  BUG,
  CONTEXT,
  honeyFor,
  makeScout,
  type ScoutTestMember,
  scoutMember,
  scoutWorld,
  unverifiedMember,
} from './testing/scout-world'
import { later, UNKNOWN_ID } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let scouts: ReturnType<typeof scoutWorld>
let louis: ScoutTestMember
let ines: ScoutTestMember
let malik: ScoutTestMember
let zoe: ScoutTestMember

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  scouts = scoutWorld(ctx, act)
  louis = await scoutMember(ctx, 'Louis', '203.0.113.31')
  ines = await scoutMember(ctx, 'Inès', '203.0.113.32')
  malik = await scoutMember(ctx, 'Malik', '203.0.113.33')
  zoe = await scoutMember(ctx, 'Zoé', '203.0.113.34')
  await act.makeAdmin(louis.id)
  await makeScout(ctx, ines.id)
  await makeScout(ctx, malik.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** La même demande vers une adresse qui n'existe pas : la réponse de référence. */
const nowhere = (method: string, cookie: string | null, body?: unknown) =>
  act.send(method, '/v1/inexistant', cookie, body)

/** Même statut, même corps qu'une adresse inconnue : rien ne trahit l'existence de la route. */
const expectSame = async (res: Response, reference: Response, label: string) => {
  expect(res.status, label).toBe(reference.status)
  expect(await res.text(), label).toEqual(await reference.text())
}

/** Les routes de la page de tri, avec un corps valide pour chacune. */
const triageRoutes = (reportId: string, memberId: string) =>
  [
    ['GET', '/v1/moderation/scouts', undefined],
    ['POST', '/v1/moderation/scouts/program', undefined],
    ['PUT', '/v1/moderation/scouts/missions', { missions: [{ textFr: 'Essaie la recherche' }] }],
    ['GET', '/v1/moderation/scouts/reports', undefined],
    ['PATCH', `/v1/moderation/scouts/reports/${reportId}`, { status: 'read' }],
    ['DELETE', `/v1/moderation/scouts/${memberId}`, { reason: 'Des retours insultants.' }],
  ] as const

/** Des corps invalides : du texte, un objet vide, des champs faux. */
const INVALID_BODIES = ['x', {}, { missions: 'x' }, { status: 'sent' }, { reason: '' }]

/** Une écriture de l'administration, une seconde après ce qui précède. */
const write = (method: string, path: string, cookie: string | null, body?: unknown) => {
  later()
  return act.send(method, path, cookie, body)
}

// ─── Qui voit la page de tri ─────────────────────────────────────────────────────────────────────

describe('the scouts triage routes, for anyone but an active administrator', () => {
  it('answers the same 404 as an unknown route on every scouts triage route to a visitor, a member, a scout and a revoked admin, even with an invalid body', async () => {
    const report = await scouts.report(ines.cookie)
    const karim = await scoutMember(ctx, 'Karim', '203.0.113.35')
    await act.makeAdmin(karim.id)
    await act.revokeAdmin(karim.id)

    for (const [who, cookie] of [
      ['visitor', null],
      ['member', zoe.cookie],
      ['scout', ines.cookie],
      ['revoked admin', karim.cookie],
    ] as const) {
      for (const [method, path, body] of triageRoutes(report.id, ines.id)) {
        for (const sent of [body, ...(method === 'GET' ? [] : INVALID_BODIES)]) {
          const label = `${who} ${method} ${path} ${JSON.stringify(sent)}`
          const res = await write(method, path, cookie, sent)
          expect(res.status, label).toBe(404)
          await expectSame(res, await nowhere(method, cookie, sent), label)
        }
      }
    }

    // Rien n'a été écrit : le mois n'est pas lancé, aucune mission, Inès n'est pas retirée, son
    // retour n'a pas été lu.
    const page = await scouts.triage(louis.cookie)
    expect(page.program).toEqual({ startedAt: null, endsAt: null })
    expect(page.missions).toEqual([])
    expect(page.scouts.find((scout) => scout.member.id === ines.id)?.removedAt).toBeNull()
    expect((await scouts.adminReport(louis.cookie, report.id))?.status).toBe('sent')
    // Témoin : l'administrateur atteint chaque route (aucune ne répond 404).
    for (const [method, path, body] of triageRoutes(report.id, ines.id)) {
      const res = await write(method, path, louis.cookie, body)
      expect(res.status, `admin ${method} ${path}`).not.toBe(404)
    }
  })

  it('reads the role at each request: a revoked administrator loses the page at once', async () => {
    expect((await act.send('GET', '/v1/moderation/scouts', louis.cookie)).status).toBe(200)

    await act.revokeAdmin(louis.id)

    expect((await act.send('GET', '/v1/moderation/scouts', louis.cookie)).status).toBe(404)
  })
})

// ─── Le quota de la page de tri (relecture de sécurité A2) ───────────────────────────────────────

describe('the scouts triage quota', () => {
  const mission = [{ textFr: 'Publie un projet avec une photo' }]

  it('counts even malformed requests against the scouts triage quota', async () => {
    for (let i = 1; i <= SCOUT_ADMIN_DAILY; i++) {
      const res = await act.send('PUT', '/v1/moderation/scouts/missions', louis.cookie, {
        missions: 'x',
      })
      expect(res.status, `request ${i}`).toBe(400)
    }

    const res = await scouts.putMissions(louis.cookie, mission)

    await expectError(res, 429, 'rate_limited')
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    // Rien n'a été écrit, et lire la page ne compte pas : elle s'ouvre encore.
    expect((await scouts.triage(louis.cookie)).missions).toEqual([])
    // Un jour plus tard, Louis écrit de nouveau.
    later()
    vi.setSystemTime(Date.now() + DAY)
    expect((await scouts.putMissions(louis.cookie, mission)).ok).toBe(true)
  })

  it('does not count other moderation requests against the scouts triage quota', async () => {
    // Des écritures de la modération, hors des Éclaireuses : des décisions mal formées (refusées par
    // la validation, puis par leur propre quota de 50).
    for (let i = 1; i <= SCOUT_ADMIN_DAILY; i++) {
      const res = await act.send('POST', '/v1/moderation/decisions', louis.cookie, {})
      expect([400, 429], `request ${i}`).toContain(res.status)
    }

    const res = await scouts.putMissions(louis.cookie, mission)

    expect(res.ok, `${res.status} ${await res.clone().text()}`).toBe(true)
    expect((await scouts.triage(louis.cookie)).missions).toHaveLength(1)
  })
})

// ─── Le haut de la page ──────────────────────────────────────────────────────────────────────────

describe('the top of the scouts page', () => {
  it('shows the month, the places, the missions of the week and every scout with her number of reports', async () => {
    await scouts.report(ines.cookie)
    later()
    await scouts.report(ines.cookie, { kind: 'idea', text: 'Un mode sombre plus doux.' })

    const page = await scouts.triage(louis.cookie)

    expect(page.program).toEqual({ startedAt: null, endsAt: null })
    expect(page.places).toEqual({ taken: 2, max: SCOUT_PLACES })
    expect(page.week).toBe(weekOf(new Date()))
    expect(page.missions).toEqual([])
    const byId = new Map(page.scouts.map((scout) => [scout.member.id, scout]))
    expect(byId.get(ines.id)).toMatchObject({ removedAt: null, reports: 2 })
    expect(byId.get(malik.id)).toMatchObject({ removedAt: null, reports: 0 })
    expect(byId.get(ines.id)?.joinedAt).toBe(START.toISOString())
    // Zoé n'est pas Éclaireuse, Louis non plus.
    expect(byId.has(zoe.id)).toBe(false)
    expect(byId.has(louis.id)).toBe(false)
  })

  it('lists the scouts page with a scout whose address is not verified yet', async () => {
    const pending = await unverifiedMember(ctx, 'Nora', '203.0.113.36')
    await makeScout(ctx, pending)

    const res = await act.send('GET', '/v1/moderation/scouts', louis.cookie)

    expect(res.status, await res.clone().text()).toBe(200)
    const page = await scouts.triage(louis.cookie)
    expect(page.scouts.map((scout) => scout.member.id).sort()).toEqual(
      [ines.id, malik.id, pending].sort(),
    )
    // Moins de 24 heures après son entrée, sa place compte.
    expect(page.places.taken).toBe(3)
  })
})

// ─── « Lancer le mois » ──────────────────────────────────────────────────────────────────────────

describe('launching the month of the scouts', () => {
  it('launches the month once: until midnight in Paris after the 30th day, the launch day counting for one', async () => {
    const res = await scouts.launch(louis.cookie)
    expect(res.ok, `${res.status} ${await res.clone().text()}`).toBe(true)

    const { program } = await scouts.triage(louis.cookie)
    expect(program.startedAt).toBe(new Date().toISOString())
    // Lancé le mercredi 18 novembre, il finit le 18 décembre à 0 h à Paris (23 h la veille en UTC).
    expect(program.endsAt).toBe(programEndOf(new Date()).toISOString())
    expect(program.endsAt).toBe('2026-12-17T23:00:00.000Z')
  })

  it('answers 409 scout_program_started to a second launch, and keeps the first dates', async () => {
    expect((await scouts.launch(louis.cookie)).ok).toBe(true)
    const first = (await scouts.triage(louis.cookie)).program
    later()

    await expectError(await scouts.launch(louis.cookie), 409, 'scout_program_started')

    expect((await scouts.triage(louis.cookie)).program).toEqual(first)
  })
})

// ─── Les missions de la semaine ──────────────────────────────────────────────────────────────────

describe('the missions of the week', () => {
  it('publishes up to 3 missions for the current week, in order, the English text optional', async () => {
    const missions = await scouts.setMissions(louis.cookie, [
      { textFr: 'Publie un projet avec une photo', textEn: 'Publish a project with a photo' },
      { textFr: 'Essaie Waiggle sur ton téléphone' },
      { textFr: 'Invite un proche dans une ruche' },
    ])

    expect(missions.map(({ position, textFr, textEn }) => ({ position, textFr, textEn }))).toEqual([
      {
        position: 1,
        textFr: 'Publie un projet avec une photo',
        textEn: 'Publish a project with a photo',
      },
      { position: 2, textFr: 'Essaie Waiggle sur ton téléphone', textEn: null },
      { position: 3, textFr: 'Invite un proche dans une ruche', textEn: null },
    ])
  })

  it('refuses a 4th mission, a mission without its French text, an empty text and the same mission twice', async () => {
    const [kept] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!kept) throw new Error('no mission')
    const four = [1, 2, 3, 4].map((n) => ({ textFr: `Mission ${n}` }))

    for (const missions of [
      four,
      [{ textEn: 'Try the search' }],
      [{ textFr: '' }],
      [
        { id: kept.id, textFr: 'Essaie la recherche' },
        { id: kept.id, textFr: 'Encore' },
      ],
    ]) {
      later()
      await expectError(await scouts.putMissions(louis.cookie, missions), 400, 'validation')
    }

    // Rien n'a changé.
    expect((await scouts.triage(louis.cookie)).missions).toEqual([kept])
  })

  it('keeps a mission cited by its id, deletes a mission left out, and its reports keep their text', async () => {
    const [first, second] = await scouts.setMissions(louis.cookie, [
      { textFr: 'Publie un projet avec une photo' },
      { textFr: 'Essaie Waiggle sur ton téléphone' },
    ])
    if (!first || !second) throw new Error('no missions')
    later()
    const answer = await scouts.report(ines.cookie, {
      kind: 'love',
      text: 'Sur téléphone, tout est fluide.',
      missionId: second.id,
    })
    expect(answer.mission?.id).toBe(second.id)
    later()

    const missions = await scouts.setMissions(louis.cookie, [
      { id: first.id, textFr: 'Publie un projet avec deux photos' },
    ])

    expect(missions).toEqual([
      { id: first.id, position: 1, textFr: 'Publie un projet avec deux photos', textEn: null },
    ])
    // Le retour reste, avec son texte, et perd le lien vers la mission effacée.
    const kept = await scouts.adminReport(louis.cookie, answer.id)
    expect(kept?.text).toBe('Sur téléphone, tout est fluide.')
    expect(kept?.mission).toBeNull()
  })

  it('starts every week without missions: those of last week are not shown any more', async () => {
    await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])

    nextMonday(vi)
    // Une session dure 7 jours : Louis se reconnecte.
    louis = { ...louis, cookie: await act.signInAgain(louis) }

    const page = await scouts.triage(louis.cookie)
    expect(page.week).toBe(weekOf(new Date()))
    expect(page.missions).toEqual([])
  })
})

// ─── La liste des retours ────────────────────────────────────────────────────────────────────────

describe('the list of reports', () => {
  it('lists the reports newest first, 30 a page, then the next ones by the cursor, without a gap or a double', async () => {
    const sent: string[] = []
    for (let n = 1; n <= 16; n++) {
      for (const scout of [ines, malik]) {
        later()
        sent.push((await scouts.report(scout.cookie, { kind: 'idea', text: `Idée ${n}` })).id)
      }
    }

    const first = await scouts.reports(louis.cookie)
    expect(first.reports).toHaveLength(SCOUT_TRIAGE_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
    const second = await scouts.reports(louis.cookie, { cursor: first.nextCursor ?? undefined })
    expect(second.nextCursor).toBeNull()

    expect([...first.reports, ...second.reports].map((report) => report.id)).toEqual(
      [...sent].reverse(),
    )
  })

  it('filters the reports by status, kind and severity', async () => {
    const bug = await scouts.report(ines.cookie, { ...BUG, severity: 'blocking' })
    later()
    const confusing = await scouts.report(malik.cookie, {
      kind: 'confusing',
      severity: 'minor',
      text: 'Je ne trouve pas mes ruches.',
    })
    later()
    const idea = await scouts.report(ines.cookie, { kind: 'idea', text: 'Un mode hors ligne.' })
    later()
    await scouts.setReport(louis.cookie, confusing.id, { status: 'read' })

    const ids = async (query: object) =>
      (await scouts.reports(louis.cookie, query)).reports.map((report) => report.id)
    expect(await ids({ status: 'sent' })).toEqual([idea.id, bug.id])
    expect(await ids({ status: 'read' })).toEqual([confusing.id])
    expect(await ids({ kind: 'idea' })).toEqual([idea.id])
    expect(await ids({ severity: 'blocking' })).toEqual([bug.id])
    expect(await ids({ kind: 'confusing', severity: 'minor', status: 'read' })).toEqual([
      confusing.id,
    ])
    expect(await ids({ kind: 'love' })).toEqual([])
  })

  it('refuses an unknown filter value and a malformed cursor', async () => {
    for (const query of ['status=lost', 'kind=rant', 'severity=huge', 'cursor=%3Cscript%3E']) {
      await expectError(
        await act.send('GET', `/v1/moderation/scouts/reports?${query}`, louis.cookie),
        400,
        'validation',
      )
    }
  })

  it('shows the administrator everything of a report: its author, mission, context, capture and notes', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    const sent = await scouts.report(
      ines.cookie,
      { ...BUG, missionId: mission.id, context: CONTEXT },
      await jpegImage(320, 240),
    )
    later()
    await scouts.setReport(louis.cookie, sent.id, { adminNote: 'Vu avec Malik : même souci.' })

    const seen = await scouts.adminReport(louis.cookie, sent.id)

    expect(seen).toMatchObject({
      author: { id: ines.id },
      kind: 'bug',
      severity: 'annoying',
      text: BUG.text,
      mission: { id: mission.id, text: 'Essaie la recherche' },
      context: CONTEXT,
      mediaUrl: sent.mediaUrl,
      status: 'sent',
      adminNote: 'Vu avec Malik : même souci.',
      fixedNote: null,
    })
    expect(sent.mediaUrl).not.toBeNull()
  })
})

// ─── Le statut et les notes d'un retour ──────────────────────────────────────────────────────────

describe('changing a report', () => {
  it('changes the status and the private note of a report, and dates the change', async () => {
    const sent = await scouts.report(ines.cookie)
    later()

    await scouts.setReport(louis.cookie, sent.id, { status: 'planned', adminNote: 'Pour lundi.' })

    const seen = await scouts.adminReport(louis.cookie, sent.id)
    expect(seen).toMatchObject({ status: 'planned', adminNote: 'Pour lundi.', fixedAt: null })
    expect(seen?.updatedAt).toBe(new Date().toISOString())
    // Une note vide l'efface.
    later()
    await scouts.setReport(louis.cookie, sent.id, { adminNote: '' })
    expect((await scouts.adminReport(louis.cookie, sent.id))?.adminNote).toBeNull()
  })

  it('refuses the status sent, an empty change and a note for the scout with another status than fixed', async () => {
    const sent = await scouts.report(ines.cookie)

    for (const body of [
      { status: 'sent' },
      {},
      { status: 'read', fixedNote: 'Merci !' },
      { status: 'lost' },
    ]) {
      later()
      await expectError(await scouts.patchReport(louis.cookie, sent.id, body), 400, 'validation')
    }
    expect((await scouts.adminReport(louis.cookie, sent.id))?.status).toBe('sent')
  })

  it('refuses a note for the scout on a report that is not fixed yet', async () => {
    const sent = await scouts.report(ines.cookie)
    later()

    const res = await scouts.patchReport(louis.cookie, sent.id, { fixedNote: 'Merci !' })

    expect(res.status, await res.clone().text()).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect((await scouts.adminReport(louis.cookie, sent.id))?.fixedNote).toBeNull()
  })

  it('pays 50 pollen, 10 honey and one notice once when a report is marked fixed, and answers 409 the second time', async () => {
    const sent = await scouts.report(ines.cookie)
    later()

    await scouts.setReport(louis.cookie, sent.id, {
      status: 'fixed',
      fixedNote: 'Corrigé, merci !',
    })

    const fixed = await scouts.adminReport(louis.cookie, sent.id)
    expect(fixed).toMatchObject({ status: 'fixed', fixedNote: 'Corrigé, merci !' })
    expect(fixed?.fixedAt).toBe(new Date().toISOString())
    // La seconde fois, et tout autre statut ensuite : 409, sans rien payer ni annoncer de plus.
    for (const status of ['fixed', 'read', 'parked']) {
      later()
      await expectError(
        await scouts.patchReport(louis.cookie, sent.id, { status }),
        409,
        'scout_report_fixed',
      )
    }
    const heard = (await ledgerOf(ctx, ines.id)).filter((row) => row.gesture === 'scout_heard')
    expect(heard.map((row) => [row.amount, row.family])).toEqual([[50, 'keeper']])
    expect(await honeyFor(ctx, ines.id, 'scout_heard')).toEqual({ n: 1, total: 10 })
    const notices = (await scouts.notices(ines.cookie)).filter(
      (notice) => notice.kind === 'game_scout_heard',
    )
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ reportId: sent.id })
  })

  it('lets the administrator write the note for the scout once the report is fixed, without paying again', async () => {
    const sent = await scouts.report(ines.cookie)
    later()
    await scouts.setReport(louis.cookie, sent.id, { status: 'fixed' })
    later()

    await scouts.setReport(louis.cookie, sent.id, { fixedNote: 'En ligne depuis ce matin.' })

    expect(await scouts.adminReport(louis.cookie, sent.id)).toMatchObject({
      status: 'fixed',
      fixedNote: 'En ligne depuis ce matin.',
    })
    expect((await honeyFor(ctx, ines.id, 'scout_heard')).n).toBe(1)
  })

  it('announces nothing when a report is parked or planned', async () => {
    const sent = await scouts.report(ines.cookie)
    later()
    await scouts.setReport(louis.cookie, sent.id, { status: 'planned' })
    later()
    await scouts.setReport(louis.cookie, sent.id, { status: 'parked' })

    const notices = await scouts.notices(ines.cookie)
    expect(notices.filter((notice) => notice.kind.startsWith('game_scout'))).toEqual([])
    expect((await scouts.adminReport(louis.cookie, sent.id))?.status).toBe('parked')
  })

  it('answers the same 404 to an unknown report and to a malformed id', async () => {
    await scouts.report(ines.cookie)
    const unknown = await scouts.patchReport(louis.cookie, UNKNOWN_ID, { status: 'read' })
    expect(unknown.status).toBe(404)
    const unknownBody = await unknown.text()

    for (const id of ['42', 'pas-un-uuid', '%27%20or%201%3D1']) {
      const res = await scouts.patchReport(louis.cookie, id, { status: 'read' })
      expect(res.status, id).toBe(404)
      expect(await res.text(), id).toBe(unknownBody)
    }
    // Témoin : le même changement sur un vrai retour réussit.
    const real = (await scouts.reports(louis.cookie)).reports[0]
    if (!real) throw new Error('no report')
    expect((await scouts.patchReport(louis.cookie, real.id, { status: 'read' })).ok).toBe(true)
  })
})

// ─── « Retirer » (relecture juridique J1) ────────────────────────────────────────────────────────

describe('removing a scout', () => {
  it('refuses to remove a scout without a reason', async () => {
    for (const body of [undefined, {}, { reason: '' }, { reason: '   ' }, 'x']) {
      later()
      await expectError(await scouts.removeScout(louis.cookie, ines.id, body), 400, 'validation')
    }

    const page = await scouts.triage(louis.cookie)
    expect(page.scouts.find((scout) => scout.member.id === ines.id)?.removedAt).toBeNull()
    expect(page.places.taken).toBe(2)
    // Témoin : avec un motif, le retrait passe.
    later()
    const res = await scouts.removeScout(louis.cookie, ines.id, {
      reason: 'Des retours insultants.',
    })
    expect(res.ok, `${res.status} ${await res.clone().text()}`).toBe(true)
  })

  it('removes a scout with a reason: she is no longer active, her place is free, her reports stay', async () => {
    const sent = await scouts.report(ines.cookie)
    later()

    const res = await scouts.removeScout(louis.cookie, ines.id, {
      reason: 'Des retours insultants.',
    })

    expect(res.ok, `${res.status} ${await res.clone().text()}`).toBe(true)
    const page = await scouts.triage(louis.cookie)
    expect(page.scouts.find((scout) => scout.member.id === ines.id)?.removedAt).toBe(
      new Date().toISOString(),
    )
    expect(page.places.taken).toBe(1)
    expect(await scouts.meScout(ines.cookie)).toMatchObject({
      active: false,
      removedAt: new Date().toISOString(),
    })
    // Ses retours restent dans la liste ; elle n'en envoie plus.
    expect((await scouts.adminReport(louis.cookie, sent.id))?.id).toBe(sent.id)
    later()
    await expectError(await scouts.sendReport(ines.cookie), 403, 'scout_only')
  })

  it('tells a removed scout in her activity why she was removed and how to reach the editor', async () => {
    // « Ma récolte » coupée : l'avis du retrait n'en dépend pas (relecture juridique J1).
    await act.muteHarvest(ines.cookie)
    later()

    await scouts.removeScout(louis.cookie, ines.id, { reason: 'Des retours insultants.' })

    const removed = (await scouts.notices(ines.cookie)).filter(
      (notice) => notice.kind === 'game_scout_removed',
    )
    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({ reason: 'Des retours insultants.' })
    // L'adresse de l'éditeur est dans le texte de l'avis (`{{contactEmail}}`, rempli par l'appli) :
    // l'API n'en donne que le motif. Les autres n'en reçoivent rien.
    for (const other of [malik, zoe]) {
      const notices = await scouts.notices(other.cookie)
      expect(notices.filter((notice) => notice.kind === 'game_scout_removed')).toEqual([])
    }
  })

  it('answers 404 to remove a member who is not a scout, an unknown member and a malformed id', async () => {
    const reason = { reason: 'Des retours insultants.' }
    for (const id of [zoe.id, louis.id, UNKNOWN_ID, 'pas un id']) {
      later()
      const res = await scouts.removeScout(louis.cookie, encodeURIComponent(id), reason)
      expect(res.status, id).toBe(404)
      expect(ErrorResponse.safeParse(await res.json()).success, id).toBe(true)
    }
    // Rien n'a bougé ; témoin : Inès, elle, peut être retirée.
    expect((await scouts.triage(louis.cookie)).places.taken).toBe(2)
    expect((await scouts.removeScout(louis.cookie, ines.id, reason)).ok).toBe(true)
  })
})
