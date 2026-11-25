// Tests d'intégration de R19 (« La gamification », docs/scenarios/refonte.md, « Le miel ») : offrir
// du miel au projet d'un autre membre (POST /v1/projects/{id}/honey) et décorer son rayon
// (PUT /v1/me/game/decoration). Contrat : packages/contracts/src/game.ts (`HONEY`, `DECORATIONS`,
// `decorationPrice`, `HoneyShortError`).
//
// Le miel ne s'achète pas : il se gagne, ici par les semaines butinées (5 miel la semaine où l'on
// commente le projet d'un autre membre, choix 6 du plan). Un test qui veut 10 miel butine deux
// semaines de suite (`forage`, puis `nextMonday`). Les autorisations communes aux cinq routes du
// jeu (401 sans session, compte suspendu, quotas) sont dans game.harvest.test.ts.
//
// Les membres : Léa (qui offre et décore), Max (l'auteur des projets), Inès (dont Léa commente le
// projet pour butiner), le compte d'exemples, Noé (qui bloque Léa), Zoé (que Léa bloque) et Louis
// (l'administrateur, qui retire un projet).
import { appName } from '@ruche/brand'
import { DEFAULT_DECORATION, HONEY, HoneyShortError, NotificationPage } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { expectDone, expectError, gameWorld, nextMonday, START } from './testing/game-world'
import { signedUpMember, type TestMember } from './testing/hive-gestures'
import { later, UNKNOWN_ID, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof gameWorld>
let lea: TestMember
let max: TestMember
let ines: TestMember
let inesProject: string
let maxProject: string

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = gameWorld(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.11')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.12')
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.13')
  inesProject = await game.testable(ines.cookie, 'Le potager connecté')
  maxProject = await game.testable(max.cookie, 'Quiz des capitales')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Léa commente le projet d'Inès : la semaine est butinée, elle rapporte 5 miel. */
const forage = async (member: TestMember = lea) => {
  await game.comment(inesProject, member.cookie)
}

/** Léa butine cette semaine et la suivante : 10 miel. Le test continue le lundi suivant. */
const forageTwoWeeks = async () => {
  await forage()
  nextMonday(vi)
  await forage()
}

/** La liste des avis de l'Activité de ce membre. */
const noticesOf = async (cookie: string) => {
  const res = await act.send('GET', '/v1/notifications', cookie)
  expect(res.status).toBe(200)
  return NotificationPage.parse(await res.json()).items
}

describe('offering honey to the project of another member', () => {
  it('spends 5 honey and tells the author « Léa offered you honey »', async () => {
    await forage()
    expect((await game.harvest(lea.cookie)).honey).toBe(HONEY.week)

    await expectDone(await game.offerHoney(lea.cookie, maxProject))

    expect((await game.harvest(lea.cookie)).honey).toBe(HONEY.week - HONEY.gift)
    const gift = (await noticesOf(max.cookie)).find((notice) => notice.kind === 'game_honey_gift')
    expect(gift).toMatchObject({
      kind: 'game_honey_gift',
      actor: { id: lea.id, name: 'Léa' },
      project: { id: maxProject },
    })
  })

  it('gives the author no honey in return', async () => {
    await forage()
    await forage(max)
    expect((await game.harvest(max.cookie)).honey).toBe(HONEY.week)

    await expectDone(await game.offerHoney(lea.cookie, maxProject))

    // Pas de circulation : l'auteur garde son solde, il n'en gagne pas.
    expect((await game.harvest(max.cookie)).honey).toBe(HONEY.week)
  })

  it('refuses a second gift to the same project, without debiting', async () => {
    await forageTwoWeeks()
    expect((await game.harvest(lea.cookie)).honey).toBe(2 * HONEY.week)
    await expectDone(await game.offerHoney(lea.cookie, maxProject))

    await expectError(await game.offerHoney(lea.cookie, maxProject), 409, 'honey_already')

    expect((await game.harvest(lea.cookie)).honey).toBe(2 * HONEY.week - HONEY.gift)
  })

  it('refuses a gift when the honey is short, with the price and the balance, and debits nothing', async () => {
    const res = await game.offerHoney(lea.cookie, maxProject)

    expect(res.status).toBe(409)
    const body = HoneyShortError.parse(await res.json())
    expect(body.error).toMatchObject({ code: 'honey_short', needed: HONEY.gift, balance: 0 })
    expect(body.error.message).not.toBe('')
    expect((await game.harvest(lea.cookie)).honey).toBe(0)
    // Rien n'a été offert : l'auteur n'a aucun avis.
    expect((await noticesOf(max.cookie)).some((n) => n.kind === 'game_honey_gift')).toBe(false)
  })

  it('lets only one of two simultaneous gifts through with 5 honey', async () => {
    const otherProject = await game.testable(max.cookie, 'Le carnet de recettes')
    await forage()

    // Les deux offres partent en même temps, sur deux projets différents : le solde, lu sous
    // verrou, ne paie qu'une fois.
    const answers = await Promise.all([
      game.offerHoney(lea.cookie, maxProject),
      game.offerHoney(lea.cookie, otherProject),
    ])

    expect(answers.map((res) => res.status).sort()).toEqual([204, 409])
    const refused = answers.find((res) => res.status === 409)
    if (!refused) throw new Error('no refused gift')
    expect(HoneyShortError.parse(await refused.json()).error.code).toBe('honey_short')
    expect((await game.harvest(lea.cookie)).honey).toBe(0)
  })

  it('answers the same 404 to a honey gift on an unknown, private, removed, blocked or example project', async () => {
    const world = visitorGestures(ctx, act)
    const bot = await signedUpMember(ctx, act, `${appName}Bot`, '203.0.113.14')
    const noe = await signedUpMember(ctx, act, 'Noé', '203.0.113.15')
    const zoe = await signedUpMember(ctx, act, 'Zoé', '203.0.113.16')
    const louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.17')
    await act.makeAdmin(louis.id)

    const privateProject = await game.testable(max.cookie, 'Mon brouillon', {
      visibility: 'private',
    })
    const removedProject = await game.testable(max.cookie, 'Le projet retiré')
    await world.remove(ines.cookie, louis.cookie, { kind: 'project', id: removedProject })
    const exampleProject = await game.testable(bot.cookie, 'Un exemple')
    await game.markExample(bot.id)
    const blockerProject = await game.testable(noe.cookie, 'Le projet de Noé')
    later()
    await act.block(lea.id, noe.cookie) // Noé bloque Léa
    const blockedProject = await game.testable(zoe.cookie, 'Le projet de Zoé')
    later()
    await act.block(zoe.id, lea.cookie) // Léa bloque Zoé
    const ownProject = await game.testable(lea.cookie, 'Mon propre projet')

    // Léa a de quoi offrir : un refus ne peut pas venir du solde.
    await forage()
    const reference = await game.offerHoney(lea.cookie, UNKNOWN_ID)
    expect(reference.status).toBe(404)
    const referenceBody = await reference.json()

    for (const [label, id] of [
      ['malformed', 'not-a-project'],
      ['private', privateProject],
      ['removed', removedProject],
      ['example', exampleProject],
      ['blocked by its author', blockerProject],
      ['author blocked', blockedProject],
      ['her own', ownProject],
    ] as const) {
      const res = await game.offerHoney(lea.cookie, id)
      expect(res.status, label).toBe(404)
      expect(await res.json(), label).toEqual(referenceBody)
    }
    // Aucun de ces refus n'a rien débité.
    expect((await game.harvest(lea.cookie)).honey).toBe(HONEY.week)
  })
})

describe('decorating my comb', () => {
  it('starts with the free honey tint and smooth pattern, and chooses them again for free', async () => {
    const harvest = await game.harvest(lea.cookie)
    expect(harvest.decoration).toEqual(DEFAULT_DECORATION)
    expect(harvest.ownedDecorations).toEqual({ tints: ['honey'], patterns: ['smooth'] })

    await expectDone(await game.decorate(lea.cookie, { tint: 'honey', pattern: 'smooth' }))

    expect((await game.harvest(lea.cookie)).honey).toBe(0)
  })

  it('charges only what is not bought yet, and nothing the second time', async () => {
    await forageTwoWeeks()

    // Ambre (10 miel) et Lisse (offert) : seule la teinte se paie.
    await expectDone(await game.decorate(lea.cookie, { tint: 'amber', pattern: 'smooth' }))
    const bought = await game.harvest(lea.cookie)
    expect(bought.honey).toBe(0)
    expect(bought.decoration).toEqual({ tint: 'amber', pattern: 'smooth' })
    expect(bought.ownedDecorations.tints).toEqual(expect.arrayContaining(['honey', 'amber']))

    // Revenir à Miel, puis reprendre Ambre : un achat vaut pour toujours, sans miel.
    await expectDone(await game.decorate(lea.cookie, { tint: 'honey', pattern: 'smooth' }))
    await expectDone(await game.decorate(lea.cookie, { tint: 'amber', pattern: 'smooth' }))
    const again = await game.harvest(lea.cookie)
    expect(again.honey).toBe(0)
    expect(again.decoration).toEqual({ tint: 'amber', pattern: 'smooth' })
  })

  it('refuses a decoration the honey cannot pay, with its price and the balance', async () => {
    await forageTwoWeeks()

    // Pollen (10) et Gaufré (15) : 25 miel, Léa en a 10.
    const res = await game.decorate(lea.cookie, { tint: 'pollen', pattern: 'waffle' })

    expect(res.status).toBe(409)
    expect(HoneyShortError.parse(await res.json()).error).toMatchObject({
      code: 'honey_short',
      needed: 25,
      balance: 2 * HONEY.week,
    })
    const harvest = await game.harvest(lea.cookie)
    expect(harvest.honey).toBe(2 * HONEY.week)
    expect(harvest.decoration).toEqual(DEFAULT_DECORATION)
    expect(harvest.ownedDecorations).toEqual({ tints: ['honey'], patterns: ['smooth'] })
  })

  it('refuses a tint or a pattern outside the list', async () => {
    await expectError(
      await act.send('PUT', '/v1/me/game/decoration', lea.cookie, {
        tint: 'gold',
        pattern: 'smooth',
      }),
      400,
      'validation',
    )
    await expectError(
      await act.send('PUT', '/v1/me/game/decoration', lea.cookie, {
        tint: 'honey',
        pattern: 'smooth',
        price: 0,
      }),
      400,
      'validation',
    )
  })

  it('shows the chosen decoration on her page to another member', async () => {
    await forageTwoWeeks()
    await expectDone(await game.decorate(lea.cookie, { tint: 'amber', pattern: 'smooth' }))

    const page = await game.memberPage(lea.id, max.cookie)

    expect(page.game?.decoration).toEqual({ tint: 'amber', pattern: 'smooth' })
  })
})
