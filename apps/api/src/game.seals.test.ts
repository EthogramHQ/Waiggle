// Tests d'intégration de R19 (« La gamification », docs/scenarios/refonte.md, « Les sceaux de
// cire ») : les sceaux des premières fois et des paliers, et un sceau par catégorie de projet. Contrat :
// packages/contracts/src/game.ts (`MILESTONE_SEALS`, `SEALS`, `CATEGORY_SEAL_TARGET`, `EarnedSeal`) ;
// choix 8 du plan.
//
// Les règles vérifiées : chaque sceau se gagne une fois ; il reste même si la modération retire le
// contenu qui l'a fait gagner ; le sceau d'une catégorie vient au troisième projet différent de la
// catégorie testé ou commenté, jamais pour « Autre » ; les plus récents d'abord, dans « Ma récolte »
// comme sur la page du membre. Les avis « Nouveau sceau » de l'Activité sont dans
// game.notices.test.ts ; le rattrapage des sceaux d'avant R19 dans packages/db.
//
// Les membres : Léa (qui gagne les sceaux), Max (l'auteur des projets qu'elle teste et commente),
// Inès (qui signale) et Louis (l'administrateur, qui retire).
import type { Harvest } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, gameWorld, nextMonday, START } from './testing/game-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { later, visitorGestures } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof gameWorld>
let lea: TestMember
let max: TestMember
let ines: TestMember

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = gameWorld(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.41')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.42')
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.43')
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

/** Les codes des sceaux de Léa, dans l'ordre de « Ma récolte ». */
const sealsOfLea = async () => (await game.harvest(lea.cookie)).seals.map((seal) => seal.code)

/** Le sceau de ce code dans une récolte, ou rien. */
const sealIn = (harvest: Harvest, code: string) => harvest.seals.find((seal) => seal.code === code)

describe('the seals of first times and milestones', () => {
  it('earns the first project seal once', async () => {
    await game.testable(lea.cookie, 'Mon herbier')
    expect(await sealsOfLea()).toEqual(['first_project'])

    await game.testable(lea.cookie, 'Mon second projet')

    expect(await sealsOfLea()).toEqual(['first_project'])
  })

  it('keeps a seal after the moderation removes the content that earned it', async () => {
    const louis = await signedUpMember(ctx, act, 'Louis', '203.0.113.44')
    await act.makeAdmin(louis.id)
    const project = await game.testable(lea.cookie, 'Mon herbier')
    const earned = sealIn(await game.harvest(lea.cookie), 'first_project')
    expect(earned).toBeDefined()

    await visitorGestures(ctx, act).remove(ines.cookie, louis.cookie, {
      kind: 'project',
      id: project,
    })

    // Le sceau reste, à sa date d'origine.
    expect(sealIn(await game.harvest(lea.cookie), 'first_project')).toEqual(earned)
  })

  it('earns the first feedback seal, then the first settled one when the author settles it', async () => {
    const project = await game.testable(max.cookie, 'Quiz des capitales')
    await game.joinTesters(project, lea.cookie)
    expect(await sealsOfLea()).toEqual([])

    const message = await game.feedback(project, lea)
    expect(await sealsOfLea()).toEqual(['first_feedback'])

    await game.settle(project, lea.id, message.id, max.cookie)
    expect(await sealsOfLea()).toEqual(['first_settled', 'first_feedback'])
  })

  it('earns « 10 projects tested » with the tenth project, not before', async () => {
    const projects: string[] = []
    for (let i = 1; i <= 10; i += 1) projects.push(await game.testable(max.cookie, `Projet ${i}`))

    // Cinq projets testés par jour au plus rapportent : neuf en deux jours.
    for (const [i, project] of projects.slice(0, 9).entries()) {
      if (i === 5) vi.setSystemTime(Date.now() + DAY)
      await game.joinTesters(project, lea.cookie)
    }
    expect(await sealsOfLea()).not.toContain('tested_10')

    await game.joinTesters(projects[9] as string, lea.cookie)

    expect(await sealsOfLea()).toContain('tested_10')
  })

  it('earns the first hive seal, then « a hive of 5 » and « 5 invitations accepted »', async () => {
    const hives = hiveGestures(ctx, act)
    const hive = await hives.create(lea.cookie, 'Famille')
    expect(await sealsOfLea()).toEqual(['first_hive'])

    const others = [max, ines]
    for (const [i, name] of ['Noé', 'Rose', 'Zoé'].entries()) {
      others.push(await signedUpMember(ctx, act, name, `203.0.113.${45 + i}`))
    }
    // Trois invités : la ruche a 4 membres, Léa comprise.
    for (const member of others.slice(0, 3)) {
      later()
      await hives.join(hive.id, lea.cookie, member)
    }
    expect(await sealsOfLea()).toEqual(['first_hive'])

    // Le quatrième : 5 membres, Léa comprise.
    later()
    await hives.join(hive.id, lea.cookie, others[3] as TestMember)
    expect(await sealsOfLea()).toEqual(['hive_5', 'first_hive'])

    // La cinquième invitation acceptée.
    later()
    await hives.join(hive.id, lea.cookie, others[4] as TestMember)
    expect(await sealsOfLea()).toEqual(['invitations_5', 'hive_5', 'first_hive'])
  })

  it('earns « 10 weeks foraged » with the tenth week, even with a pause between them', async () => {
    const project = await game.testable(max.cookie, 'Quiz des capitales')
    let cookie = lea.cookie
    for (let week = 1; week <= 10; week += 1) {
      // Une semaine sans geste au milieu : la série hiverne, elle ne repart pas de zéro.
      if (week === 6) {
        nextMonday(vi)
        cookie = await act.signInAgain(lea)
      }
      await game.comment(project, cookie, `Semaine ${week}`)
      if (week === 9) {
        const harvest = await game.harvest(cookie)
        expect(harvest.weeks.count).toBe(9)
        expect(harvest.seals.map((seal) => seal.code)).not.toContain('weeks_10')
      }
      if (week < 10) {
        nextMonday(vi)
        // Une session dure 7 jours : Léa se reconnecte chaque semaine.
        cookie = await act.signInAgain(lea)
      }
    }

    expect((await game.harvest(cookie)).seals.map((seal) => seal.code)).toContain('weeks_10')
  })

  it('shows the most recent seals first, on her page too', async () => {
    const project = await game.testable(lea.cookie, 'Mon herbier')
    vi.setSystemTime(Date.now() + 60 * 60 * 1000)
    await game.postUpdate(project, lea.cookie)

    const harvest = await game.harvest(lea.cookie)
    expect(harvest.seals.map((seal) => seal.code)).toEqual(['first_update', 'first_project'])

    const page = await game.memberPage(lea.id, max.cookie)
    expect(page.game?.seals).toEqual(harvest.seals)
  })
})

describe('the seal of a category', () => {
  it('earns the seal of a category after testing or commenting three different projects of it', async () => {
    const [soup, bread, pie] = [
      await game.testable(max.cookie, 'La soupe du jour', { primaryCategory: 'cooking' }),
      await game.testable(max.cookie, 'Le pain maison', { primaryCategory: 'cooking' }),
      await game.testable(max.cookie, 'La tarte aux pommes', { primaryCategory: 'cooking' }),
    ] as string[]
    // Deux commentaires sur la soupe, un test du pain : deux projets différents seulement.
    await game.comment(soup as string, lea.cookie, 'Délicieux !')
    await game.comment(soup as string, lea.cookie, 'Encore meilleur réchauffé.')
    await game.joinTesters(bread as string, lea.cookie)
    expect(await sealsOfLea()).not.toContain('cooking')

    await game.comment(pie as string, lea.cookie)

    expect(await sealsOfLea()).toEqual(['cooking'])
  })

  it('counts the main category of a project only', async () => {
    const projects = []
    for (const title of ['La soupe', 'Le pain', 'La tarte']) {
      // La cuisine en seconde catégorie, la musique en principale.
      projects.push(
        await game.testable(max.cookie, title, {
          primaryCategory: 'music',
          secondaryCategory: 'cooking',
        }),
      )
    }
    for (const project of projects) await game.comment(project, lea.cookie)

    expect(await sealsOfLea()).toEqual(['music'])
  })

  it('never gives a seal for the « other » category', async () => {
    for (const title of ['Un', 'Deux', 'Trois', 'Quatre']) {
      const project = await game.testable(max.cookie, title, { primaryCategory: 'other' })
      await game.comment(project, lea.cookie)
    }
    // Témoin : les mêmes gestes sur trois jeux font gagner le sceau des jeux.
    for (const title of ['Échecs', 'Dames', 'Go']) {
      const project = await game.testable(max.cookie, title, { primaryCategory: 'games' })
      await game.comment(project, lea.cookie)
    }

    expect(await sealsOfLea()).toEqual(['games'])
  })
})
