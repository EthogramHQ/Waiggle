// Tests des routes du jeu (R19) sans passer par les routes de geste : le pollen est attribué par
// `award` dans une transaction, comme le fait chaque geste, puis on lit « Ma récolte »
// (GET /v1/me/harvest), on règle son jeu (PATCH /v1/me/game), on décore son rayon
// (PUT /v1/me/game/decoration) et on offre du miel (POST /v1/projects/{id}/honey). Les mêmes
// règles vues depuis les gestes : game.harvest.test.ts et game.honey.test.ts.
import { HONEY, HoneyShortError, NotificationPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type AwardInput, award } from './game/award'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, expectError, harvestGestures, WEEK } from './testing/harvest-world'
import { signedUpMember, type TestMember } from './testing/hive-gestures'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof harvestGestures>
let lea: TestMember
let max: TestMember

// Un lundi, 9 h à Paris.
const START = Date.parse('2026-11-23T08:00:00.000Z')
const MINUTE = 60 * 1000

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = harvestGestures(act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.61')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.62')
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

/** Ce membre publie (50 pollen de Bâtisseuse) ; la source est un identifiant inventé. */
const publish = (member: TestMember, n: number) =>
  once({
    memberId: member.id,
    gesture: 'publish',
    sourceKind: 'project',
    sourceId: `${member.id}-${n}`,
    sourceKey: `${member.id}-${n}`,
  })

/** Ce membre commente le projet de Max (Butineuse, et la semaine butinée : 5 miel). */
const comment = (member: TestMember, n: number) =>
  once({
    memberId: member.id,
    gesture: 'comment',
    sourceKind: 'comment',
    sourceId: `comment-${member.id}-${n}`,
    sourceKey: `comment-${n}`,
    counterpartId: max.id,
  })

/** Un projet public de Max. */
const maxProject = async (title: string) =>
  (await act.publish(max.cookie, title, { visibility: 'public' })).id

describe('the harvest read from the ledger', () => {
  it('sums the pollen by family, gives the level, the title and the families obtained', async () => {
    await publish(lea, 1)
    await publish(lea, 2)
    await comment(lea, 1)

    const harvest = await game.harvest(lea.cookie)

    // 2 publications (100) et un commentaire (10) : niveau 2 (à 100), 190 avant le niveau 3.
    expect(harvest).toMatchObject({ level: 2, total: 110, toNext: 190 })
    expect(harvest.week.byFamily).toEqual({ forager: 10, builder: 100, keeper: 0, dancer: 0 })
    expect(harvest.obtainedFamilies).toEqual(['builder'])
    expect(harvest.title).toEqual({ family: 'builder', form: 'f', pinned: false })
    expect(harvest.weeks).toEqual({ count: 1, hibernating: false, currentForaged: true })
    expect(harvest.honey).toBe(HONEY.week)
  })

  it('drops from the title a family older than 28 days, and pins it back once obtained', async () => {
    await publish(lea, 1)
    await publish(lea, 2)
    vi.setSystemTime(Date.now() + 29 * DAY)
    lea.cookie = await act.signInAgain(lea)
    max.cookie = await act.signInAgain(max)
    await comment(lea, 1)

    expect((await game.harvest(lea.cookie)).title).toEqual({
      family: 'forager',
      form: 'f',
      pinned: false,
    })
    await game.setGame(lea.cookie, { pinnedFamily: 'builder', titleForm: 'm', levelSeen: 2 })
    const pinned = await game.harvest(lea.cookie)
    expect(pinned.title).toEqual({ family: 'builder', form: 'm', pinned: true })
    expect(pinned.levelSeen).toBe(2)
    // Refusé en entier : le niveau 3 n'est pas atteint, la forme ne change pas non plus.
    await expectError(
      await game.patchGame(lea.cookie, { levelSeen: 3, titleForm: 'f' }),
      422,
      'invalid_level_seen',
    )
    expect((await game.harvest(lea.cookie)).settings.titleForm).toBe('m')
  })
})

describe('spending honey', () => {
  it('buys a tint once, then chooses it again for free', async () => {
    await comment(lea, 1)
    vi.setSystemTime(Date.now() + WEEK)
    // Une session dure 7 jours : Léa se reconnecte.
    lea.cookie = await act.signInAgain(lea)
    await comment(lea, 2)
    expect((await game.harvest(lea.cookie)).honey).toBe(2 * HONEY.week)

    expect(
      (
        await act.send('PUT', '/v1/me/game/decoration', lea.cookie, {
          tint: 'amber',
          pattern: 'smooth',
        })
      ).status,
    ).toBe(204)
    const bought = await game.harvest(lea.cookie)
    expect(bought).toMatchObject({
      honey: 0,
      decoration: { tint: 'amber', pattern: 'smooth' },
      ownedDecorations: { tints: ['honey', 'amber'], patterns: ['smooth'] },
    })

    // Un motif neuf de 15 miel : refusé, avec le prix et le solde, et rien ne change.
    const short = await act.send('PUT', '/v1/me/game/decoration', lea.cookie, {
      tint: 'amber',
      pattern: 'waffle',
    })
    expect(short.status).toBe(409)
    expect(HoneyShortError.parse(await short.json()).error).toMatchObject({
      needed: 15,
      balance: 0,
    })
    expect((await game.harvest(lea.cookie)).decoration).toEqual({
      tint: 'amber',
      pattern: 'smooth',
    })
  })

  it('offers honey once per project, tells the author, and refuses without honey', async () => {
    const quiz = await maxProject('Quiz')
    const recettes = await maxProject('Recettes')
    await comment(lea, 1)

    expect((await act.send('POST', `/v1/projects/${quiz}/honey`, lea.cookie)).status).toBe(204)
    await expectError(
      await act.send('POST', `/v1/projects/${quiz}/honey`, lea.cookie),
      409,
      'honey_already',
    )
    const short = await act.send('POST', `/v1/projects/${recettes}/honey`, lea.cookie)
    expect(short.status).toBe(409)
    expect(HoneyShortError.parse(await short.json()).error).toMatchObject({
      code: 'honey_short',
      needed: HONEY.gift,
      balance: 0,
    })

    const notices = await act.send('GET', '/v1/notifications', max.cookie)
    const gifts = NotificationPage.parse(await notices.json()).items.filter(
      (item) => item.kind === 'game_honey_gift',
    )
    expect(gifts).toHaveLength(1)
    expect(gifts[0]).toMatchObject({ actor: { id: lea.id }, project: { id: quiz } })
    // Pas de circulation : l'auteur n'en gagne pas.
    expect((await game.harvest(max.cookie)).honey).toBe(0)
  })

  it('answers 404 to a honey gift on her own project, without debiting', async () => {
    await comment(lea, 1)
    const own = (await act.publish(lea.cookie, 'Le mien', { visibility: 'public' })).id

    await expectError(
      await act.send('POST', `/v1/projects/${own}/honey`, lea.cookie),
      404,
      'not_found',
    )
    expect((await game.harvest(lea.cookie)).honey).toBe(HONEY.week)
  })
})
