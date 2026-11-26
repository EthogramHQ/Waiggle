// Tests d'intégration de R20 : les données des Éclaireuses. Ce que l'export du compte en donne
// (l'entrée, le retrait et son motif, les retours avec la note de l'administrateur et l'adresse de
// leur capture, les missions faites), combien de temps on les garde (la purge de la nuit), et ce qui
// part avec un retour supprimé ou un compte supprimé. Scénario : docs/scenarios/refonte.md, « R20 —
// Les Éclaireuses », « Les données » ; plan R20, choix 12 et 13, relectures du plan (sécurité A5,
// juridique J1 à J4).
//
// Les membres : Louis, l'administrateur ; Inès et Malik, Éclaireuses (posées en base, voir
// testing/scout-world.ts) ; Zoé, un membre. La fausse horloge part d'un mercredi de novembre, 10 h
// à Paris.
//
// Les durées : 6 mois après la fin du mois des Éclaireuses (7 mois après l'envoi si le mois n'est
// jamais lancé), et 8 jours après sa semaine pour une mission. Les tests regardent de part et
// d'autre de chaque échéance, avec quelques jours de marge : la règle se lit « 6 mois du
// calendrier » au plan (relecture J4) et « 183 jours » au contrat, et les deux tombent entre.
import { AccountExport, programEndOf, weekOf } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inactiveAccounts } from './jobs/inactive-accounts'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import {
  createTestContext,
  TEST_API_URL,
  TEST_APP_URL,
  TEST_AUTH_SECRET,
  type TestContext,
} from './testing/context'
import { DAY, START } from './testing/game-world'
import { jpegImage } from './testing/images'
import {
  BUG,
  CONTEXT,
  makeScout,
  type ScoutTestMember,
  scoutFiles,
  scoutMember,
  scoutRowsOf,
  scoutWorld,
} from './testing/scout-world'
import { later } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
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
  scouts = scoutWorld(ctx, act)
  louis = await scoutMember(ctx, 'Louis', '203.0.113.51')
  ines = await scoutMember(ctx, 'Inès', '203.0.113.52')
  malik = await scoutMember(ctx, 'Malik', '203.0.113.53')
  zoe = await scoutMember(ctx, 'Zoé', '203.0.113.54')
  await act.makeAdmin(louis.id)
  await makeScout(ctx, ines.id)
  await makeScout(ctx, malik.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const plus = (date: Date, ms: number) => new Date(date.getTime() + ms)

/** L'export du compte (GET /v1/me/export), lu par le contrat. */
const exportOf = async (member: ScoutTestMember) => {
  const res = await act.send('GET', '/v1/me/export', member.cookie)
  expect(res.status).toBe(200)
  return AccountExport.parse(await res.json())
}

/** La purge de la nuit, à cette heure. */
const purgeAt = (now: Date) => nightlyPurge(ctx.db, now, ctx.storage)

/** Une capture : une petite image JPEG, ré-encodée par l'API. */
const capture = () => jpegImage(320, 240)

// ─── L'export ────────────────────────────────────────────────────────────────────────────────────

describe('the scout part of the account export', () => {
  it('puts the scout entry, her reports and her missions done in her export, and nothing for a member', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    const sent = await scouts.report(ines.cookie, {
      ...BUG,
      missionId: mission.id,
      context: CONTEXT,
    })
    later()
    await scouts.setReport(louis.cookie, sent.id, { status: 'fixed', fixedNote: 'Corrigé !' })

    const { scout } = await exportOf(ines)

    expect(scout).toEqual({
      joinedAt: START.toISOString(),
      removedAt: null,
      removalReason: null,
      reports: [
        {
          kind: 'bug',
          severity: 'annoying',
          text: BUG.text,
          context: CONTEXT,
          status: 'fixed',
          fixedNote: 'Corrigé !',
          adminNote: null,
          captureUrl: null,
          mission: 'Essaie la recherche',
          createdAt: sent.createdAt,
          fixedAt: new Date().toISOString(),
        },
      ],
      missionsDone: 1,
    })
    // Zoé n'a jamais été Éclaireuse ; Malik l'est, sans retour.
    expect((await exportOf(zoe)).scout).toBeNull()
    expect((await exportOf(malik)).scout).toMatchObject({ reports: [], missionsDone: 0 })
  })

  it('puts the removal date and reason in the scout export', async () => {
    await scouts.report(ines.cookie)
    later()
    const removedAt = new Date().toISOString()

    await scouts.removeScout(louis.cookie, ines.id, { reason: 'Des retours insultants.' })

    expect((await exportOf(ines)).scout).toMatchObject({
      joinedAt: START.toISOString(),
      removedAt,
      removalReason: 'Des retours insultants.',
    })
    expect((await exportOf(ines)).scout?.reports).toHaveLength(1)
  })

  it('includes the administrator note of each report in its author export', async () => {
    const sent = await scouts.report(ines.cookie)
    later()
    await scouts.setReport(louis.cookie, sent.id, { adminNote: 'Doublon du retour de Malik.' })

    const reports = (await exportOf(ines)).scout?.reports ?? []

    expect(reports.map((report) => report.adminNote)).toEqual(['Doublon du retour de Malik.'])
    // Jamais dans l'export d'une autre.
    expect(JSON.stringify(await exportOf(malik))).not.toContain('Doublon du retour de Malik.')
  })

  it('gives each report capture by its address in the scout export', async () => {
    const withCapture = await scouts.report(ines.cookie, BUG, await capture())
    later()
    const without = await scouts.report(ines.cookie, { kind: 'love', text: 'Tout est clair.' })
    expect(withCapture.mediaUrl).not.toBeNull()

    const reports = (await exportOf(ines)).scout?.reports ?? []

    const byText = new Map(reports.map((report) => [report.text, report.captureUrl]))
    expect(byText.get(withCapture.text)).toBe(withCapture.mediaUrl)
    expect(byText.get(without.text)).toBeNull()
  })
})

// ─── La purge ────────────────────────────────────────────────────────────────────────────────────

describe('the purge of the scout data', () => {
  it('erases reports and their capture files six months after the end of the month', async () => {
    expect((await scouts.launch(louis.cookie)).ok).toBe(true)
    const end = programEndOf(new Date())
    later()
    await scouts.report(ines.cookie, BUG, await capture())
    expect(scoutFiles(ctx)).toHaveLength(1)

    // Un peu moins de 6 mois après la fin : tout est là.
    await purgeAt(plus(end, 175 * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).reports).toBe(1)
    expect(scoutFiles(ctx)).toHaveLength(1)

    // Un peu plus de 6 mois après : les retours et leurs fichiers sont effacés.
    await purgeAt(plus(end, 190 * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).reports).toBe(0)
    expect(scoutFiles(ctx)).toEqual([])
    // L'entrée dans les Éclaireuses reste, avec le compte.
    expect((await scoutRowsOf(ctx, ines.id)).scout).toBe(1)
  })

  it('erases the reports of a month never launched seven months after they were sent', async () => {
    const sentAt = new Date()
    await scouts.report(ines.cookie, BUG, await capture())

    // 30 jours (le mois qu'il aurait duré), puis un peu moins de 6 mois : tout est là.
    await purgeAt(plus(sentAt, (30 + 175) * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).reports).toBe(1)
    expect(scoutFiles(ctx)).toHaveLength(1)

    // Un peu plus de 7 mois après l'envoi : effacés.
    await purgeAt(plus(sentAt, (30 + 190) * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).reports).toBe(0)
    expect(scoutFiles(ctx)).toEqual([])
  })

  it('erases the missions done 8 days after their week, and their reports keep their text', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    const sent = await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })
    const monday = new Date(`${weekOf(new Date())}T09:00:00.000Z`)
    expect((await scoutRowsOf(ctx, ines.id)).missionsDone).toBe(1)

    // Le dimanche de sa semaine : la mission et sa réponse sont là.
    await purgeAt(plus(monday, 6 * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).missionsDone).toBe(1)

    // Plus de 8 jours après sa semaine : effacées ; le retour reste, sans lien vers elle.
    await purgeAt(plus(monday, 16 * DAY))
    expect((await scoutRowsOf(ctx, ines.id)).missionsDone).toBe(0)
    const missions = (await ctx.db.execute(
      sql`select count(*)::int as n from scout_mission where id = ${mission.id}`,
    )) as unknown as { rows: { n: number }[] }
    expect(missions.rows[0]?.n).toBe(0)
    const kept = (await ctx.db.execute(
      sql`select text, mission_id as "missionId" from scout_report where id = ${sent.id}`,
    )) as unknown as { rows: { text: string; missionId: string | null }[] }
    expect(kept.rows).toEqual([{ text: BUG.text, missionId: null }])
  })
})

// ─── Un retour supprimé, un compte supprimé ──────────────────────────────────────────────────────

describe('a deleted report', () => {
  it('takes a deleted report out of the triage list and its heard notice out of her activity', async () => {
    const sent = await scouts.report(ines.cookie)
    later()
    await scouts.setReport(louis.cookie, sent.id, { status: 'fixed' })
    const heard = (await scouts.notices(ines.cookie)).filter(
      (notice) => notice.kind === 'game_scout_heard',
    )
    expect(heard).toHaveLength(1)
    later()

    await scouts.deleteReport(ines.cookie, sent.id)

    expect(await scouts.adminReport(louis.cookie, sent.id)).toBeUndefined()
    expect(
      (await scouts.notices(ines.cookie)).filter((notice) => notice.kind === 'game_scout_heard'),
    ).toEqual([])
    expect(JSON.stringify(await scouts.notices(ines.cookie))).not.toContain(BUG.text)
    // Le pollen reste (le scénario : « le pollen reste »).
    const rows = (await ctx.db.execute(
      sql`select count(*)::int as n from pollen_entry
          where member_id = ${ines.id} and gesture = 'scout_heard' and revoked_at is null`,
    )) as unknown as { rows: { n: number }[] }
    expect(rows.rows[0]?.n).toBe(1)
  })
})

describe('a deleted account', () => {
  /** Pose en base la dernière visite d'un membre, et la date de son avertissement d'inactivité. */
  const setActivity = (userId: string, lastActiveAt: Date, noticeAt: Date | null = null) =>
    ctx.db
      .update(schema.user)
      .set({ lastActiveAt, inactiveNoticeAt: noticeAt })
      .where(eq(schema.user.id, userId))

  it('erases her scout entry, her reports and her missions done with her account', async () => {
    const [mission] = await scouts.setMissions(louis.cookie, [{ textFr: 'Essaie la recherche' }])
    if (!mission) throw new Error('no mission')
    later()
    await scouts.report(ines.cookie, { ...BUG, missionId: mission.id })
    later()
    await scouts.report(malik.cookie)

    await act.deleteAccount(ines.cookie, ines.password)

    expect(await scoutRowsOf(ctx, ines.id)).toEqual({ scout: 0, reports: 0, missionsDone: 0 })
    const page = await scouts.triage(louis.cookie)
    expect(page.scouts.map((scout) => scout.member.id)).toEqual([malik.id])
    expect(page.places.taken).toBe(1)
    // Témoin : le retour de Malik reste.
    expect((await scoutRowsOf(ctx, malik.id)).reports).toBe(1)
  })

  it('deletes the capture files when the account is deleted, by the member or by the inactive accounts job', async () => {
    await scouts.report(ines.cookie, BUG, await capture())
    later()
    await scouts.report(malik.cookie, BUG, await capture())
    expect(scoutFiles(ctx)).toHaveLength(2)

    // Inès supprime son compte : sa capture part, celle de Malik reste.
    await act.deleteAccount(ines.cookie, ines.password)
    expect(scoutFiles(ctx)).toHaveLength(1)

    // Malik ne revient plus : trois ans et quelques semaines plus tard, la tâche des comptes
    // inactifs supprime son compte (averti 31 jours avant), et sa capture avec.
    const now = new Date(START)
    now.setUTCFullYear(now.getUTCFullYear() + 3)
    const run = plus(now, 40 * DAY)
    await setActivity(malik.id, START, plus(run, -31 * DAY))
    for (const other of [louis, zoe]) await setActivity(other.id, run)
    vi.setSystemTime(run)
    const result = await inactiveAccounts(
      {
        db: ctx.db,
        mailer: ctx.mailer,
        storage: ctx.storage,
        appUrl: TEST_APP_URL,
        apiUrl: TEST_API_URL,
        secret: TEST_AUTH_SECRET,
      },
      run,
    )

    expect(result).toEqual({ warned: 0, deleted: 1 })
    expect(scoutFiles(ctx)).toEqual([])
    expect(await scoutRowsOf(ctx, malik.id)).toEqual({ scout: 0, reports: 0, missionsDone: 0 })
  })
})
