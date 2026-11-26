// Tests d'intégration de R20 : les Éclaireuses dans le jeu de R19. Le pollen d'un retour (25, 4 par
// jour), d'une mission faite (30, une fois) et d'une danse entendue (50 et 10 miel, une fois), tous
// chez les Gardiennes ; la semaine butinée ; le titre Éclaireuse, porté par défaut et épinglable par
// elle seule ; le sceau « Éclaireuse fondatrice », qui ne se calcule pas ; le classement de la
// semaine, sans ce pollen ; les avis « Ta danse a été entendue » et « 3 missions cette semaine »,
// coupés par « Ma récolte ». Scénario : docs/scenarios/refonte.md, « R20 — Les Éclaireuses », « Le
// titre et le sceau », « Les missions de la semaine », « Mes retours et Ta danse a été entendue » ;
// plan R20, choix 9 et 11, relectures du plan (sécurité A4, juridique J3 et J6).
//
// Les membres : Louis, l'administrateur ; Inès et Malik, Éclaireuses (posées en base, voir
// testing/scout-world.ts) ; Zoé, un membre. La fausse horloge part d'un mercredi de novembre, 10 h
// à Paris.
//
// Tant que les routes et la table `scout` n'existent pas, chaque test tombe sur l'une d'elles :
// c'est la bonne raison du rouge.
import {
  type GameTitle,
  HONEY,
  POLLEN_GESTURES,
  SCOUT_EXCERPT_MAX,
  SCOUT_HEARD_HONEY,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, expectError, gameWorld, nextMonday, START } from './testing/game-world'
import { ledgerOf, markExample, pollenHeader, suspend } from './testing/pollen-ledger'
import {
  BUG,
  honeyFor,
  makeScout,
  type ScoutTestMember,
  scoutMember,
  scoutWorld,
} from './testing/scout-world'
import { later } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof gameWorld>
let scouts: ReturnType<typeof scoutWorld>
let louis: ScoutTestMember
let ines: ScoutTestMember
let malik: ScoutTestMember
let zoe: ScoutTestMember

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = gameWorld(ctx, act)
  scouts = scoutWorld(ctx, act)
  louis = await scoutMember(ctx, 'Louis', '203.0.113.41')
  ines = await scoutMember(ctx, 'Inès', '203.0.113.42')
  malik = await scoutMember(ctx, 'Malik', '203.0.113.43')
  zoe = await scoutMember(ctx, 'Zoé', '203.0.113.44')
  await act.makeAdmin(louis.id)
  await makeScout(ctx, ines.id)
  await makeScout(ctx, malik.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Les entrées d'un geste dans le grand livre d'un membre, en paires [montant, famille]. */
const entriesOf = async (memberId: string, gesture: string) =>
  (await ledgerOf(ctx, memberId))
    .filter((row) => row.gesture === gesture)
    .map((row) => [row.amount, row.family])

/** Les avis d'une sorte dans l'Activité d'un membre. */
const noticesOf = async (member: ScoutTestMember, kind: string) =>
  (await scouts.notices(member.cookie)).filter((notice) => notice.kind === kind)

/** L'administrateur marque un retour « Corrigé ». */
const fix = async (reportId: string) => {
  later()
  await scouts.setReport(louis.cookie, reportId, { status: 'fixed' })
}

/** Le titre de ce membre, lu dans sa récolte. */
const titleOf = async (member: ScoutTestMember): Promise<GameTitle | null> =>
  (await game.harvest(member.cookie)).title

// ─── Le pollen des Éclaireuses ───────────────────────────────────────────────────────────────────

describe('the pollen of the scouts', () => {
  it('pays 25 pollen in the keeper family for a report, 4 reports a day at most', async () => {
    const headers: (string | null)[] = []
    for (let n = 1; n <= 5; n++) {
      later()
      const res = await scouts.sendReport(ines.cookie, { kind: 'idea', text: `Idée ${n}` })
      expect(res.status, await res.clone().text()).toBe(201)
      headers.push(pollenHeader(res))
    }

    expect(headers).toEqual(['25', '25', '25', '25', null])
    const rows = (await ledgerOf(ctx, ines.id)).filter((row) => row.gesture === 'scout_report')
    expect(rows.map((row) => [row.amount, row.family, row.sourceKind])).toEqual(
      Array(4).fill([25, 'keeper', 'scout_report']),
    )
    // Le lendemain, à Paris, un retour rapporte de nouveau.
    vi.setSystemTime(Date.now() + DAY)
    expect(pollenHeader(await scouts.sendReport(ines.cookie))).toBe('25')
  })

  it('pays 30 pollen in the keeper family once for a mission answered, on top of the report', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()

    await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })
    later()
    await scouts.report(ines.cookie, { kind: 'love', text: 'Rapide !', missionId: mission.id })

    expect(await entriesOf(ines.id, 'scout_mission')).toEqual([[30, 'keeper']])
    expect(await entriesOf(ines.id, 'scout_report')).toEqual([
      [25, 'keeper'],
      [25, 'keeper'],
    ])
    // Une autre Éclaireuse qui répond à la même mission est payée aussi.
    later()
    await scouts.report(malik.cookie, { ...BUG, missionId: mission.id })
    expect(await entriesOf(malik.id, 'scout_mission')).toEqual([[30, 'keeper']])
  })

  it('pays a mission once, even after its report is deleted and the mission answered again', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    const first = await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })
    later()
    await scouts.deleteReport(ines.cookie, first.id)
    later()

    await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })

    expect(await entriesOf(ines.id, 'scout_mission')).toEqual([[30, 'keeper']])
  })

  it('makes the week foraged with a single report, and credits its honey', async () => {
    const before = await game.harvest(ines.cookie)
    expect(before.weeks.currentForaged).toBe(false)

    await scouts.report(ines.cookie)

    const after = await game.harvest(ines.cookie)
    expect(after.weeks.currentForaged).toBe(true)
    expect(after.week.byFamily.keeper).toBe(POLLEN_GESTURES.scout_report.amount)
    expect(after.honey).toBe(before.honey + HONEY.week)
  })

  it('gives no honey for a fixed report to an example account or a suspended scout', async () => {
    const fromExample = await scouts.report(ines.cookie)
    later()
    const fromSuspended = await scouts.report(malik.cookie)
    later()
    await markExample(ctx, ines.id)
    await suspend(act, louis.cookie, malik.id)

    await fix(fromExample.id)
    await fix(fromSuspended.id)

    for (const member of [ines, malik]) {
      expect(await honeyFor(ctx, member.id, 'scout_heard'), member.email).toEqual({
        n: 0,
        total: 0,
      })
      expect(await entriesOf(member.id, 'scout_heard'), member.email).toEqual([])
    }
    // Les deux retours sont bien corrigés.
    for (const id of [fromExample.id, fromSuspended.id]) {
      expect((await scouts.adminReport(louis.cookie, id))?.status).toBe('fixed')
    }
    // Témoin : une Éclaireuse ordinaire reçoit son miel.
    const nora = await scoutMember(ctx, 'Nora', '203.0.113.45')
    await makeScout(ctx, nora.id)
    later()
    await fix((await scouts.report(nora.cookie)).id)
    expect(await honeyFor(ctx, nora.id, 'scout_heard')).toEqual({ n: 1, total: SCOUT_HEARD_HONEY })
  })
})

// ─── Le classement de la semaine (relecture juridique J6) ────────────────────────────────────────

describe('the weekly rankings', () => {
  it('leaves scout gestures out of the weekly rankings', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    const sent = await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })
    await fix(sent.id)

    // Seul le pollen d'Éclaireuse : Inès n'est pas classée.
    expect((await game.ranking(ines.cookie, 'scope=close')).rows).toEqual([])

    later()
    await act.publish(ines.cookie, 'Météo', { visibility: 'public' })

    const rows = (await game.ranking(ines.cookie, 'scope=close')).rows
    expect(rows.map((row) => [row.member.id, row.pollen])).toEqual([
      [ines.id, POLLEN_GESTURES.publish.amount],
    ])
    // Le niveau et la famille, eux, comptent tout.
    const harvest = await game.harvest(ines.cookie)
    expect(harvest.week.byFamily.keeper).toBe(
      POLLEN_GESTURES.scout_report.amount +
        POLLEN_GESTURES.scout_mission.amount +
        POLLEN_GESTURES.scout_heard.amount,
    )
  })
})

// ─── Le titre et le sceau ────────────────────────────────────────────────────────────────────────

describe('the title of a scout', () => {
  it('gives a scout the title Scout by default, on her harvest and on her page', async () => {
    expect(await titleOf(ines)).toMatchObject({ family: 'scout', pinned: false })

    const page = await game.memberPage(ines.id, zoe.cookie)
    expect(page.game?.title).toMatchObject({ family: 'scout', pinned: false })
    // Zoé, qui n'est pas Éclaireuse, ne porte pas ce titre.
    expect((await titleOf(zoe))?.family).not.toBe('scout')
  })

  it('keeps the title Scout for a scout with gestures in other families, unless she pins one', async () => {
    later()
    await act.publish(ines.cookie, 'Météo', { visibility: 'public' })

    expect(await titleOf(ines)).toMatchObject({ family: 'scout', pinned: false })

    // Elle épingle Éclaireuse : son titre l'est ; sans épingle, il revient à Éclaireuse.
    expect((await game.patchGame(ines.cookie, { pinnedFamily: 'scout' })).status).toBe(204)
    expect(await titleOf(ines)).toMatchObject({ family: 'scout', pinned: true })
    expect((await game.patchGame(ines.cookie, { pinnedFamily: null })).status).toBe(204)
    expect(await titleOf(ines)).toMatchObject({ family: 'scout', pinned: false })
  })

  it('refuses the title Scout to a member who is not a scout, or no longer one', async () => {
    await expectError(
      await game.patchGame(zoe.cookie, { pinnedFamily: 'scout' }),
      422,
      'family_not_obtained',
    )
    later()
    await scouts.removeScout(louis.cookie, malik.id, { reason: 'Des retours insultants.' })
    await expectError(
      await game.patchGame(malik.cookie, { pinnedFamily: 'scout' }),
      422,
      'family_not_obtained',
    )
    // Témoin : Inès, Éclaireuse, l'épingle.
    expect((await game.patchGame(ines.cookie, { pinnedFamily: 'scout' })).status).toBe(204)
  })

  it('gives a removed scout the title of the R19 rule again, even when she had pinned Scout', async () => {
    await scouts.report(ines.cookie)
    expect((await game.patchGame(ines.cookie, { pinnedFamily: 'scout' })).status).toBe(204)
    later()

    await scouts.removeScout(louis.cookie, ines.id, { reason: 'Des retours insultants.' })

    // Son pollen reste : le titre de ses gestes, les Gardiennes, non épinglé.
    expect(await titleOf(ines)).toMatchObject({ family: 'keeper', pinned: false })
    expect(await entriesOf(ines.id, 'scout_report')).toEqual([[25, 'keeper']])
  })
})

describe('the seal of the founding scouts', () => {
  it('never gives the scout_founder seal through the seal milestones, to a scout or to anyone', async () => {
    // Des gestes qui font calculer les sceaux : des retours, une publication.
    for (let n = 1; n <= 3; n++) {
      later()
      await scouts.report(ines.cookie, { kind: 'idea', text: `Idée ${n}` })
    }
    later()
    await act.publish(zoe.cookie, 'Météo', { visibility: 'public' })

    for (const member of [ines, zoe]) {
      const seals = (await game.harvest(member.cookie)).seals.map((seal) => seal.code)
      expect(seals, member.email).not.toContain('scout_founder')
    }
    // Témoin : la publication de Zoé lui a bien fait gagner un sceau de palier.
    expect((await game.harvest(zoe.cookie)).seals.length).toBeGreaterThan(0)
  })
})

// ─── Les avis ────────────────────────────────────────────────────────────────────────────────────

describe('the scout notices', () => {
  it('tells a scout her dance was heard, with the start of her report, once', async () => {
    const long = `${'Le bouton Publier reste gris '.repeat(5)}et rien ne se passe.`
    const short = await scouts.report(ines.cookie)
    later()
    const longer = await scouts.report(ines.cookie, {
      kind: 'bug',
      severity: 'blocking',
      text: long,
    })
    await fix(short.id)
    await fix(longer.id)

    const heard = await noticesOf(ines, 'game_scout_heard')
    expect(heard).toHaveLength(2)
    const byReport = new Map(
      heard.flatMap((notice) =>
        notice.kind === 'game_scout_heard' ? [[notice.reportId, notice.excerpt] as const] : [],
      ),
    )
    expect(byReport.get(short.id)).toBe(BUG.text)
    // Un texte long : ses 80 premiers caractères au plus, puis « … ».
    const excerpt = byReport.get(longer.id) ?? ''
    expect(excerpt.endsWith('…')).toBe(true)
    expect([...excerpt].length).toBeLessThanOrEqual(SCOUT_EXCERPT_MAX + 1)
    expect(long.startsWith(excerpt.slice(0, -1).trimEnd())).toBe(true)
    // Les autres n'en reçoivent rien.
    expect(await noticesOf(malik, 'game_scout_heard')).toEqual([])
  })

  it('does not tell a scout her dance was heard when her harvest notices are off, and still pays her', async () => {
    const sent = await scouts.report(ines.cookie)
    await act.muteHarvest(ines.cookie)

    await fix(sent.id)

    expect(await noticesOf(ines, 'game_scout_heard')).toEqual([])
    expect(await entriesOf(ines.id, 'scout_heard')).toEqual([[50, 'keeper']])
    expect(await honeyFor(ctx, ines.id, 'scout_heard')).toEqual({ n: 1, total: SCOUT_HEARD_HONEY })
  })

  it('tells each active scout the number of missions the first time they are published in a week, once', async () => {
    // Une semaine sans mission : rien.
    expect((await scouts.putMissions(louis.cookie, [])).ok).toBe(true)
    expect(await noticesOf(ines, 'game_scout_missions')).toEqual([])
    later()
    await scouts.removeScout(louis.cookie, malik.id, { reason: 'Des retours insultants.' })

    await scouts.setMissions(louis.cookie, [
      { textFr: 'Publie un projet avec une photo' },
      { textFr: 'Essaie Waiggle sur ton téléphone' },
    ])
    later()
    await scouts.setMissions(louis.cookie, [
      { textFr: 'Publie un projet avec une photo' },
      { textFr: 'Essaie Waiggle sur ton téléphone' },
      { textFr: 'Invite un proche dans une ruche' },
    ])

    const told = await noticesOf(ines, 'game_scout_missions')
    expect(told).toHaveLength(1)
    expect(told[0]).toMatchObject({ count: 2 })
    // Ni l'Éclaireuse retirée, ni un membre, ni l'administrateur.
    for (const other of [malik, zoe, louis]) {
      expect(await noticesOf(other, 'game_scout_missions'), other.email).toEqual([])
    }

    // La semaine suivante, des missions publiées : un nouvel avis.
    nextMonday(vi)
    louis = { ...louis, cookie: await act.signInAgain(louis) }
    ines = { ...ines, cookie: await act.signInAgain(ines) }
    await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    const counts = (await noticesOf(ines, 'game_scout_missions')).map((notice) =>
      notice.kind === 'game_scout_missions' ? notice.count : null,
    )
    expect(counts.sort()).toEqual([1, 2])
  })

  it('does not tell a scout about the missions when her harvest notices are off', async () => {
    await act.muteHarvest(malik.cookie)
    later()

    await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])

    expect(await noticesOf(malik, 'game_scout_missions')).toEqual([])
    // Témoin : Inès, récolte allumée, est prévenue.
    expect(await noticesOf(ines, 'game_scout_missions')).toHaveLength(1)
  })
})
