// Tests des suites d'une entrée du grand livre (R19, plan, choix 7, 8 et 10), sans passer par les
// routes de geste : `award` appelé dans une transaction, comme le fera chaque route, puis ce qui en
// découle (game/after-award.ts) : l'avis d'un niveau, les sceaux, le défi perso et le défi de ruche,
// et leurs avis dans l'Activité (notifications/load.ts). Les mêmes règles vues depuis les routes :
// game.challenges, game.seals et game.notices.test.ts.
import { CHALLENGE_POLLEN, HONEY, PERSONAL_CHALLENGES, weekOf } from '@ruche/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AwardInput, award } from './game/award'
import {
  choosePersonalChallenge,
  hiveChallengesOf,
  offeredChallenges,
  personalChallengeOf,
} from './game/challenges'
import { writeNotice } from './game/notices'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { harvestGestures } from './testing/harvest-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let lea: TestMember
let max: TestMember
let ines: TestMember

// Un lundi, 9 h à Paris.
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.51')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.52')
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.53')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

type WithoutNow<T> = T extends unknown ? Omit<T, 'now'> : never

/** Un `award` dans sa transaction, une minute plus tard. */
const once = (input: WithoutNow<AwardInput>) =>
  ctx.db.transaction((tx) => {
    vi.setSystemTime(Date.now() + MINUTE)
    return award(tx, { ...input, now: new Date() })
  })

/** Ce membre commente le projet `projectId` de `author` (le commentaire n° `n`). */
const comment = (member: TestMember, projectId: string, author: TestMember, n: number) =>
  once({
    memberId: member.id,
    gesture: 'comment',
    sourceKind: 'comment',
    sourceId: `${projectId}-${n}`,
    sourceKey: `${projectId}:${n}`,
    counterpartId: author.id,
    projectId,
  })

/** Ce membre publie un projet (la source est un identifiant inventé). */
const publish = (member: TestMember, n: number) =>
  once({
    memberId: member.id,
    gesture: 'publish',
    sourceKind: 'project',
    sourceId: `${member.id}-${n}`,
    sourceKey: `${member.id}-${n}`,
  })

const rows = async <T>(query: ReturnType<typeof sql>) =>
  ((await ctx.db.execute(query)) as unknown as { rows: T[] }).rows

const honeyOf = async (memberId: string) =>
  (
    await rows<{ honey: number }>(
      sql`select coalesce(sum(amount), 0)::int as honey from honey_entry where member_id = ${memberId}`,
    )
  )[0]?.honey

const sealsOf = async (memberId: string) =>
  (await rows<{ code: string }>(sql`select code from seal where member_id = ${memberId}`)).map(
    (row) => row.code,
  )

const gameNotices = async (member: TestMember) =>
  (await harvestGestures(act).notifications(member.cookie)).filter((item) =>
    item.kind.startsWith('game_'),
  )

describe('the level and the seals after an entry', () => {
  it('tells the level passed and the first project seal once, counted as unread', async () => {
    const unread = await harvestGestures(act).unread(lea.cookie)
    await publish(lea, 1)
    await publish(lea, 2)
    await publish(max, 1)

    const notices = await gameNotices(lea)
    expect(notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'game_level', level: 2 }),
        expect.objectContaining({ kind: 'game_seal', code: 'first_project' }),
      ]),
    )
    expect(notices).toHaveLength(2)
    expect(await harvestGestures(act).unread(lea.cookie)).toBe(unread + 2)
    expect(await sealsOf(lea.id)).toEqual(['first_project'])
  })

  it('writes no notice while harvest notices are off, and hides the earlier ones', async () => {
    await publish(lea, 1)
    expect(await gameNotices(lea)).toHaveLength(1)
    await ctx.db.execute(
      sql`insert into member_game (member_id, harvest_notices) values (${lea.id}, false)`,
    )
    await publish(lea, 2)
    expect(await gameNotices(lea)).toEqual([])

    await ctx.db.execute(
      sql`update member_game set harvest_notices = true where member_id = ${lea.id}`,
    )
    expect((await gameNotices(lea)).map((notice) => notice.kind)).toEqual(['game_seal'])
  })

  it('earns the seal of a category with the third different project tested or commented', async () => {
    const projects = []
    for (const title of ['La soupe', 'Le pain', 'La tarte']) {
      projects.push((await act.publish(max.cookie, title, { primaryCategory: 'cooking' })).id)
    }
    const [soup, bread, pie] = projects as [string, string, string]
    await comment(lea, soup, max, 1)
    await comment(lea, soup, max, 2)
    await comment(lea, bread, max, 3)
    expect(await sealsOf(lea.id)).not.toContain('cooking')

    await comment(lea, pie, max, 4)
    expect(await sealsOf(lea.id)).toContain('cooking')
  })

  it('gives « a hive of 5 » to the creator when another member invited the fifth', async () => {
    const hives = hiveGestures(ctx, act)
    const hive = await hives.create(lea.cookie, 'Famille')
    const others = [max, ines]
    for (const [i, name] of ['Noé', 'Rose'].entries()) {
      others.push(await signedUpMember(ctx, act, name, `203.0.113.${54 + i}`))
    }
    for (const member of others) {
      vi.setSystemTime(Date.now() + MINUTE)
      await hives.join(hive.id, lea.cookie, member)
    }
    // Rose, la cinquième, gagne le pollen de son entrée : c'est lui qui fait passer la ruche à 5.
    const rose = others[3] as TestMember
    await once({
      memberId: rose.id,
      gesture: 'invitation_joined',
      sourceKind: 'hive',
      sourceId: hive.id,
      sourceKey: hive.id,
      counterpartId: max.id,
    })
    expect(await sealsOf(lea.id)).toContain('hive_5')
    expect(await sealsOf(rose.id)).not.toContain('hive_5')
  })
})

describe('the personal challenge', () => {
  it('offers the three drawn challenges, refuses another one, then a second choice', async () => {
    const offered = offeredChallenges(lea.id, weekOf(new Date()))
    expect(await personalChallengeOf(ctx.db, lea.id, new Date())).toEqual({
      state: 'choose',
      offered,
    })
    const other = PERSONAL_CHALLENGES.map((c) => c.code).find((code) => !offered.includes(code))
    if (!other || !offered[0] || !offered[1]) throw new Error('unexpected draw')
    const choose = (choice: Parameters<typeof choosePersonalChallenge>[2]) =>
      ctx.db.transaction((tx) => choosePersonalChallenge(tx, lea.id, choice, new Date()))

    expect(await choose(other)).toBe('invalid_challenge')
    expect(await choose('none')).toBeNull()
    expect(await personalChallengeOf(ctx.db, lea.id, new Date())).toEqual({
      state: 'none',
      offered,
    })
    expect(await choose(offered[0])).toBeNull()
    expect(await choose(offered[1])).toBe('invalid_challenge')
    expect(await choose('none')).toBe('invalid_challenge')
  })

  it('pays 10 honey and 20 pollen once when « Publie une mise à jour » is done', async () => {
    // Le défi « update » est choisi directement en base parmi les proposés : le tirage est au hasard.
    const week = weekOf(new Date())
    await ctx.db.execute(sql`insert into personal_challenge (member_id, week, offered, chosen, created_at)
      values (${lea.id}, ${week}, array['update', 'feedback', 'test']::text[], 'update', ${new Date().toISOString()})`)
    const update = (n: number) =>
      once({
        memberId: lea.id,
        gesture: 'update',
        sourceKind: 'update',
        sourceId: `update-${n}`,
        sourceKey: `update-${n}`,
        projectId: '3f1d7a52-7d0e-4a8f-9c41-0f4a8d1e2b6c',
      })
    const before = await honeyOf(lea.id)
    expect(await update(1)).toBe(20)

    expect(await personalChallengeOf(ctx.db, lea.id, new Date())).toEqual({
      state: 'done',
      code: 'update',
    })
    // Le miel de la semaine butinée (5) et celui du défi (10) ; le pollen du défi, hors plafonds.
    expect(await honeyOf(lea.id)).toBe((before ?? 0) + HONEY.week + HONEY.challenge)
    const challenge = await rows<{ amount: number; family: string }>(
      sql`select amount, family from pollen_entry where member_id = ${lea.id} and gesture = 'challenge'`,
    )
    expect(challenge).toEqual([{ amount: CHALLENGE_POLLEN, family: 'builder' }])

    await update(2)
    expect(await honeyOf(lea.id)).toBe((before ?? 0) + HONEY.week + HONEY.challenge)
  })
})

describe('the challenge of a hive', () => {
  it('counts the gestures between members only, pays those who took part, tells everyone', async () => {
    const hives = hiveGestures(ctx, act)
    const hive = await hives.create(lea.cookie, 'Famille')
    for (const member of [max, ines]) {
      vi.setSystemTime(Date.now() + MINUTE)
      await hives.join(hive.id, lea.cookie, member)
    }
    const noe = await signedUpMember(ctx, act, 'Noé', '203.0.113.59')
    const maxProject = (await act.publish(max.cookie, 'Quiz')).id
    const noeProject = (await act.publish(noe.cookie, 'Atlas')).id
    // « 5 commentaires entre vous », posé en base avant la première lecture : le tirage est au hasard.
    const week = weekOf(new Date())
    await ctx.db.execute(sql`insert into hive_challenge (hive_id, week, code, target, created_at)
      values (${hive.id}, ${week}, 'comments_5', 5, ${new Date().toISOString()})`)
    expect((await hiveChallengesOf(ctx.db, [hive.id], new Date())).get(hive.id)).toEqual({
      hiveId: hive.id,
      code: 'comments_5',
      progress: 0,
      target: 5,
      done: false,
      isNew: true,
    })

    for (const n of [1, 2, 3, 4]) await comment(lea, maxProject, max, n)
    // Hors de la ruche : Noé chez Max, Léa chez Noé. Rien ne compte.
    await comment(noe, maxProject, max, 10)
    await comment(lea, noeProject, noe, 11)
    expect((await hiveChallengesOf(ctx.db, [hive.id], new Date())).get(hive.id)).toMatchObject({
      progress: 4,
      done: false,
      isNew: false,
    })

    await comment(lea, maxProject, max, 5)
    expect((await hiveChallengesOf(ctx.db, [hive.id], new Date())).get(hive.id)).toMatchObject({
      progress: 5,
      done: true,
    })
    const honey = { lea: await honeyOf(lea.id), ines: await honeyOf(ines.id) }
    expect(honey.ines).toBe(0)
    expect(honey.lea).toBe(HONEY.week + HONEY.hiveChallenge)
    for (const [member, gift] of [
      [lea, HONEY.hiveChallenge],
      [max, 0],
      [ines, 0],
    ] as const) {
      expect(
        (await gameNotices(member)).filter((notice) => notice.kind === 'game_hive_challenge'),
      ).toEqual([
        expect.objectContaining({
          code: 'comments_5',
          honey: gift,
          hive: expect.objectContaining({ id: hive.id, name: 'Famille' }),
        }),
      ])
    }

    // Une fois réussi, un geste de plus ne paie plus.
    await comment(lea, maxProject, max, 6)
    expect(await honeyOf(lea.id)).toBe(honey.lea)

    // Inès quitte la ruche : l'avis disparaît pour elle.
    await hives.removeMember(hive.id, ines.cookie, ines.id)
    expect(
      (await gameNotices(ines)).filter((notice) => notice.kind === 'game_hive_challenge'),
    ).toEqual([])
  })

  it('gives no challenge to a hive of two members', async () => {
    const hives = hiveGestures(ctx, act)
    const hive = await hives.create(lea.cookie, 'Famille')
    await hives.join(hive.id, lea.cookie, max)
    expect((await hiveChallengesOf(ctx.db, [hive.id], new Date())).size).toBe(0)
  })
})

describe('the notice of a honey gift', () => {
  it('names the giver and the project, hides it once either blocked the other', async () => {
    const meteo = (await act.publish(ines.cookie, 'Météo')).id
    await ctx.db.transaction((tx) =>
      writeNotice(
        tx,
        ines.id,
        { kind: 'honey_gift', actorId: max.id, projectId: meteo },
        new Date(),
      ),
    )
    // Publier a aussi valu à Inès le sceau « Premier envol » : on ne regarde que le miel offert.
    const gifts = async () =>
      (await gameNotices(ines)).filter((notice) => notice.kind === 'game_honey_gift')
    expect(await gifts()).toEqual([
      expect.objectContaining({
        kind: 'game_honey_gift',
        actor: expect.objectContaining({ id: max.id, name: 'Max' }),
        project: expect.objectContaining({ id: meteo, title: 'Météo' }),
      }),
    ])

    await act.block(ines.id, max.cookie)
    expect(await gifts()).toEqual([])
  })
})
