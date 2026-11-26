// Tests de l'export, de la purge et de la suppression de compte des Éclaireuses, écrits directement en
// base (R20, lot BC2) : ils ne dépendent ni de la route d'envoi d'un retour ni de la page de tri,
// donc ils vérifient ces trois règles seules, avant l'assemblage des lots.
import { AccountExport, weekOf } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nightlyPurge } from './jobs/nightly-purge'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, gameWorld, START } from './testing/game-world'
import { makeScout, type ScoutTestMember, scoutFiles, scoutMember } from './testing/scout-world'
import { later } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let ines: ScoutTestMember
let zoe: ScoutTestMember

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  ines = await scoutMember(ctx, 'Inès', '203.0.113.52')
  zoe = await scoutMember(ctx, 'Zoé', '203.0.113.54')
  await makeScout(ctx, ines.id)
  later()
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const key = (_name: string) => `scouts/${crypto.randomUUID()}.webp`
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms)
const count = async (table: string) => {
  const result = (await ctx.db.execute(
    sql`select count(*)::int as n from ${sql.raw(table)}`,
  )) as unknown as { rows: { n: number }[] }
  return result.rows[0]?.n ?? 0
}

/** Un retour d'Inès posé en base, avec une capture si `key` est donné. */
const addReport = async (key: string | null, at = new Date(), missionId: string | null = null) => {
  const id = crypto.randomUUID()
  if (key) await ctx.storage.put(key, new Uint8Array([1, 2, 3]))
  await ctx.db.insert(schema.scoutReport).values({
    id,
    memberId: ines.id,
    kind: 'bug',
    severity: 'annoying',
    text: 'Le bouton ne répond pas.',
    missionId,
    screen: '/projects',
    platform: 'web',
    width: 390,
    appVersion: 'abcdef1',
    language: 'fr',
    scheme: 'day',
    mediaKey: key,
    status: 'fixed',
    fixedNote: 'Corrigé !',
    adminNote: 'Doublon.',
    fixedAt: at,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

describe('scout data, written straight into the database', () => {
  it('exports the entry, the reports with their notes and capture address, and the missions done', async () => {
    const missionId = crypto.randomUUID()
    await ctx.db.insert(schema.scoutMission).values({
      id: missionId,
      week: weekOf(new Date()),
      position: 1,
      textFr: 'Essaie la recherche',
      createdAt: new Date(),
    })
    const reportId = await addReport(key('a'), new Date(), missionId)
    await ctx.db
      .insert(schema.scoutMissionDone)
      .values({ memberId: ines.id, missionId, reportId, createdAt: new Date() })

    const res = await act.send('GET', '/v1/me/export', ines.cookie)
    const { scout } = AccountExport.parse(await res.json())

    expect(scout).toMatchObject({
      removedAt: null,
      removalReason: null,
      missionsDone: 1,
      reports: [
        {
          adminNote: 'Doublon.',
          fixedNote: 'Corrigé !',
          mission: 'Essaie la recherche',
          context: { screen: '/projects', platform: 'web', width: 390, language: 'fr' },
          captureUrl: expect.stringMatching(/\/media\/scouts\/.*\.webp$/),
        },
      ],
    })
    const other = AccountExport.parse(
      await (await act.send('GET', '/v1/me/export', zoe.cookie)).json(),
    )
    expect(other.scout).toBeNull()
  })

  it('purges reports and capture files 6 months after the program end, missions 8 days after their week', async () => {
    const end = new Date(START.getTime() + 30 * DAY)
    await ctx.db.insert(schema.scoutProgram).values({ id: 1, startedAt: START, endsAt: end })
    const missionId = crypto.randomUUID()
    const monday = new Date(`${weekOf(new Date())}T09:00:00.000Z`)
    await ctx.db.insert(schema.scoutMission).values({
      id: missionId,
      week: weekOf(new Date()),
      position: 1,
      textFr: 'M',
      createdAt: new Date(),
    })
    const reportId = await addReport(key('b'), new Date(), missionId)
    await ctx.db
      .insert(schema.scoutMissionDone)
      .values({ memberId: ines.id, missionId, reportId, createdAt: new Date() })

    await nightlyPurge(ctx.db, plus(monday, 6 * DAY), ctx.storage)
    expect(await count('scout_mission')).toBe(1)

    await nightlyPurge(ctx.db, plus(monday, 16 * DAY), ctx.storage)
    expect(await count('scout_mission')).toBe(0)
    expect(await count('scout_mission_done')).toBe(0)
    expect(await count('scout_report')).toBe(1)

    await nightlyPurge(ctx.db, plus(end, 175 * DAY), ctx.storage)
    expect(await count('scout_report')).toBe(1)
    await nightlyPurge(ctx.db, plus(end, 190 * DAY), ctx.storage)
    expect(await count('scout_report')).toBe(0)
    expect(scoutFiles(ctx)).toEqual([])
    expect(await count('scout')).toBe(1)
  })

  it('purges the reports of a month never launched 7 months after they were sent', async () => {
    await addReport(key('c'))
    await nightlyPurge(ctx.db, plus(new Date(), (30 + 175) * DAY), ctx.storage)
    expect(await count('scout_report')).toBe(1)
    await nightlyPurge(ctx.db, plus(new Date(), (30 + 190) * DAY), ctx.storage)
    expect(await count('scout_report')).toBe(0)
    expect(scoutFiles(ctx)).toEqual([])
  })

  it('deletes the capture files with the account', async () => {
    await addReport(key('d'))
    expect(scoutFiles(ctx)).toHaveLength(1)

    await act.deleteAccount(ines.cookie, ines.password)

    expect(scoutFiles(ctx)).toEqual([])
    expect(await count('scout_report')).toBe(0)
    expect(await count('scout')).toBe(0)
  })

  it('gives the title Scout, pins it for a scout only, and drops it once she is removed', async () => {
    const game = gameWorld(ctx, act)
    expect((await game.harvest(ines.cookie)).title).toMatchObject({
      family: 'scout',
      pinned: false,
    })
    expect((await game.harvest(zoe.cookie)).title?.family).not.toBe('scout')

    expect((await game.patchGame(ines.cookie, { pinnedFamily: 'scout' })).status).toBe(204)
    expect((await game.harvest(ines.cookie)).title).toMatchObject({ family: 'scout', pinned: true })
    expect((await game.patchGame(zoe.cookie, { pinnedFamily: 'scout' })).status).toBe(422)

    await ctx.db.execute(
      sql`update scout set removed_at = ${new Date().toISOString()}::timestamptz at time zone 'UTC',
          removal_reason = 'Abus' where member_id = ${ines.id}`,
    )
    expect((await game.harvest(ines.cookie)).title?.family).not.toBe('scout')
    expect((await game.patchGame(ines.cookie, { pinnedFamily: 'scout' })).status).toBe(422)
  })
})
