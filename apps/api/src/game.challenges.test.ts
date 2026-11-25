// Tests d'intégration de R19 (« La gamification », docs/scenarios/refonte.md, « Les défis ») : le
// défi perso (trois proposés chaque lundi, un choisi ou aucun, réussi : 10 miel et 20 pollen) et le
// défi de ruche (un par semaine pour une ruche de 3 membres au moins, compté sur les gestes entre ses
// membres, réussi : 10 miel à chacun de ceux qui y ont participé). Contrat :
// packages/contracts/src/game.ts (`PERSONAL_CHALLENGES`, `HIVE_CHALLENGES`, `challengeFor`,
// `PersonalChallengeState`, `HarvestHiveChallenge`) ; choix 7 du plan.
//
// Les défis sont tirés au hasard (mais toujours pareil pour un membre et une semaine) : un test ne
// sait pas d'avance lequel il aura. Il lit donc le défi dans « Ma récolte », puis fait les gestes que
// ce défi compte (`personalStep`, `hiveStep`), quel qu'il soit.
//
// Les membres : Léa (qui relève les défis), Max (que Léa suit, auteur de six projets testables),
// Inès (que Léa ne suit pas ; Léa commente son projet pour butiner) et Noé (hors de la ruche).
import {
  CHALLENGE_POLLEN,
  challengeFor,
  HIVE_CHALLENGES,
  type HiveChallengeCode,
  HONEY,
  PERSONAL_CHALLENGES,
  type PersonalChallengeCode,
  POLLEN_GESTURES,
  REACTION_KINDS,
  weekOf,
} from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activity } from './testing/activity'
import { createTestContext, type TestContext } from './testing/context'
import { DAY, expectError, gameWorld, nextMonday, START } from './testing/game-world'
import { hiveGestures, signedUpMember, type TestMember } from './testing/hive-gestures'
import { later } from './testing/visitor-world'

let ctx: TestContext
let act: ReturnType<typeof activity>
let game: ReturnType<typeof gameWorld>
let hives: ReturnType<typeof hiveGestures>
let lea: TestMember
let max: TestMember
let ines: TestMember
let leaProject: string
let inesProject: string
let maxProjects: string[]

beforeEach(async () => {
  // La fausse horloge avant l'API : la limite de débit garde la fonction Date.now qu'elle trouve.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  ctx = await createTestContext()
  act = activity(ctx)
  game = gameWorld(ctx, act)
  hives = hiveGestures(ctx, act)
  lea = await signedUpMember(ctx, act, 'Léa', '203.0.113.31')
  max = await signedUpMember(ctx, act, 'Max', '203.0.113.32')
  ines = await signedUpMember(ctx, act, 'Inès', '203.0.113.33')
  leaProject = await game.testable(lea.cookie, 'Mon herbier')
  inesProject = await game.testable(ines.cookie, 'Le potager connecté')
  maxProjects = []
  for (const title of ['Quiz', 'Recettes', 'Météo', 'Carnet', 'Puzzle', 'Atlas']) {
    maxProjects.push(await game.testable(max.cookie, title))
  }
  later()
  await act.followMember(max.id, lea.cookie) // Max est un proche de Léa ; Inès non
})

afterEach(async () => {
  await ctx.close()
  vi.useRealTimers()
})

const personalTarget = (code: PersonalChallengeCode) =>
  PERSONAL_CHALLENGES.find((challenge) => challenge.code === code)?.target ?? 0

const hiveTarget = (code: HiveChallengeCode) =>
  HIVE_CHALLENGES.find((challenge) => challenge.code === code)?.target ?? 0

/** Le pollen que rapporte à Léa le dernier geste compté par ce défi perso. */
const lastGesturePollen = (code: PersonalChallengeCode) => {
  const gesture = PERSONAL_CHALLENGES.find((challenge) => challenge.code === code)?.gesture
  return gesture ? POLLEN_GESTURES[gesture].amount : 0
}

/**
 * Le geste n° `i` qu'un défi perso compte, fait par Léa sur les projets de Max (son proche), à partir
 * du projet n° `offset` : un retour (après être devenue testeuse), une mise à jour de son projet,
 * devenir testeuse, un commentaire, une réaction. Le geste préparatoire (devenir testeuse avant un
 * retour) est fait par `personalPrep`.
 */
const personalStep = async (code: PersonalChallengeCode, i: number, offset = 0) => {
  const project = maxProjects[offset + i] as string
  switch (code) {
    case 'feedback':
      await game.feedback(project, lea)
      return
    case 'update':
      await game.postUpdate(leaProject, lea.cookie)
      return
    case 'test':
      await game.joinTesters(project, lea.cookie)
      return
    case 'comment_3':
      await game.comment(project, lea.cookie)
      return
    case 'react_5':
      await game.react(project, lea.cookie)
      return
  }
}

/** Ce qu'il faut avant le geste compté : être testeuse du projet pour y faire un retour. */
const personalPrep = async (code: PersonalChallengeCode, offset = 0) => {
  if (code === 'feedback') await game.joinTesters(maxProjects[offset] as string, lea.cookie)
}

/** Lit les trois défis proposés à Léa cette semaine (elle n'a encore rien choisi). */
const offeredToLea = async () => {
  const { personalChallenge } = await game.harvest(lea.cookie)
  if (personalChallenge.state !== 'choose') {
    throw new Error(`expected three challenges to choose, got ${personalChallenge.state}`)
  }
  return personalChallenge.offered
}

describe('the personal challenge of the week', () => {
  it('offers three different challenges that stay the same all week', async () => {
    const offered = await offeredToLea()
    expect(offered).toHaveLength(3)
    expect(new Set(offered).size).toBe(3)

    // Dimanche soir, 22 h à Paris : toujours la même semaine, les mêmes trois.
    vi.setSystemTime(new Date('2026-11-22T21:00:00.000Z'))
    expect(await offeredToLea()).toEqual(offered)
  })

  it('draws the three challenges from the member and the week', async () => {
    const expected = challengeFor(lea.id, weekOf(new Date()), PERSONAL_CHALLENGES)
      .slice(0, 3)
      .map((challenge) => challenge.code)

    expect(await offeredToLea()).toEqual(expected)
  })

  it('refuses a challenge that is not among the three offered', async () => {
    const offered = await offeredToLea()
    const other = PERSONAL_CHALLENGES.map((c) => c.code).find((code) => !offered.includes(code))
    if (!other) throw new Error('every challenge is offered')

    await expectError(
      await game.patchGame(lea.cookie, { personalChallenge: other }),
      422,
      'invalid_challenge',
    )

    expect((await game.harvest(lea.cookie)).personalChallenge).toEqual({
      state: 'choose',
      offered,
    })
  })

  it('refuses a second choice in the same week, « Pas cette semaine » included', async () => {
    const [first, second] = await offeredToLea()
    if (!first || !second) throw new Error('fewer than two challenges offered')
    expect((await game.patchGame(lea.cookie, { personalChallenge: first })).status).toBe(204)

    await expectError(
      await game.patchGame(lea.cookie, { personalChallenge: second }),
      422,
      'invalid_challenge',
    )
    await expectError(
      await game.patchGame(lea.cookie, { personalChallenge: 'none' }),
      422,
      'invalid_challenge',
    )

    expect((await game.harvest(lea.cookie)).personalChallenge).toEqual({
      state: 'active',
      code: first,
      progress: 0,
      target: personalTarget(first),
    })
  })

  it('offers the same three challenges again after « Pas cette semaine »', async () => {
    const offered = await offeredToLea()
    expect((await game.patchGame(lea.cookie, { personalChallenge: 'none' })).status).toBe(204)

    expect((await game.harvest(lea.cookie)).personalChallenge).toEqual({ state: 'none', offered })

    // « Choisir un défi » défait « Pas cette semaine » : un des trois se choisit encore.
    const chosen = offered[1] as PersonalChallengeCode
    expect((await game.patchGame(lea.cookie, { personalChallenge: chosen })).status).toBe(204)
    expect((await game.harvest(lea.cookie)).personalChallenge).toMatchObject({
      state: 'active',
      code: chosen,
    })
  })

  it('pays 10 honey and 20 pollen once when the chosen challenge is done', async () => {
    const code = (await offeredToLea())[0] as PersonalChallengeCode
    const target = personalTarget(code)
    expect((await game.patchGame(lea.cookie, { personalChallenge: code })).status).toBe(204)
    // Léa butine d'abord (un commentaire chez Inès, qu'elle ne suit pas : ce geste ne compte pour
    // aucun défi) : le miel de la semaine est déjà là, il ne se mêle pas à celui du défi.
    await game.comment(inesProject, lea.cookie)
    await personalPrep(code)
    for (let i = 0; i < target - 1; i += 1) await personalStep(code, i)

    const before = await game.harvest(lea.cookie)
    expect(before.personalChallenge).toEqual({
      state: 'active',
      code,
      progress: target - 1,
      target,
    })

    await personalStep(code, target - 1)

    const done = await game.harvest(lea.cookie)
    expect(done.personalChallenge).toEqual({ state: 'done', code })
    expect(done.honey).toBe(before.honey + HONEY.challenge)
    expect(done.total).toBe(before.total + lastGesturePollen(code) + CHALLENGE_POLLEN)

    // Le même geste encore : le défi est réussi une fois, il ne paie plus.
    await personalPrep(code, target)
    await personalStep(code, 0, target)
    const after = await game.harvest(lea.cookie)
    expect(after.personalChallenge).toEqual({ state: 'done', code })
    expect(after.honey).toBe(done.honey)
  })

  // Décision du 23/11, « depuis le choix » : un défi choisi jeudi ne compte pas les gestes de lundi.
  it('counts only the gestures made after the personal challenge is chosen', async () => {
    const code = (await offeredToLea())[0] as PersonalChallengeCode
    const target = personalTarget(code)
    // Un geste du défi avant de le choisir (le choix vient une seconde plus tard, `patchGame`).
    await personalPrep(code)
    await personalStep(code, 0)

    expect((await game.patchGame(lea.cookie, { personalChallenge: code })).status).toBe(204)
    expect((await game.harvest(lea.cookie)).personalChallenge).toEqual({
      state: 'active',
      code,
      progress: 0,
      target,
    })

    // Le même geste après le choix, sur un autre projet de Max : lui compte.
    await personalPrep(code, 1)
    await personalStep(code, 0, 1)
    expect((await game.harvest(lea.cookie)).personalChallenge).toEqual(
      target === 1 ? { state: 'done', code } : { state: 'active', code, progress: 1, target },
    )
  })

  it('completes the personal challenge with gestures made after the choice, not before', async () => {
    const code = (await offeredToLea())[0] as PersonalChallengeCode
    const target = personalTarget(code)
    await personalPrep(code)
    await personalStep(code, 0)
    const chosenAt = await game.harvest(lea.cookie)
    expect((await game.patchGame(lea.cookie, { personalChallenge: code })).status).toBe(204)
    // Le geste d'avant ne réussit pas le défi au moment du choix : ni miel, ni pollen du défi.
    expect((await game.harvest(lea.cookie)).honey).toBe(chosenAt.honey)

    // Tous les gestes du défi sauf un, après le choix, à partir du deuxième projet de Max.
    await personalPrep(code, 1)
    for (let i = 0; i < target - 1; i += 1) await personalStep(code, i, 1)
    const before = await game.harvest(lea.cookie)
    expect(before.personalChallenge).toEqual({
      state: 'active',
      code,
      progress: target - 1,
      target,
    })

    await personalStep(code, target - 1, 1)

    const done = await game.harvest(lea.cookie)
    expect(done.personalChallenge).toEqual({ state: 'done', code })
    expect(done.honey).toBe(before.honey + HONEY.challenge)
    expect(done.total).toBe(before.total + lastGesturePollen(code) + CHALLENGE_POLLEN)
  })

  it('forgets an unfinished challenge the following Monday, without a trace', async () => {
    const code = (await offeredToLea())[0] as PersonalChallengeCode
    expect((await game.patchGame(lea.cookie, { personalChallenge: code })).status).toBe(204)
    // Léa a déjà le miel de sa semaine butinée (elle a publié en préparant le test) : on compare à
    // ce solde plutôt qu'à zéro.
    const before = await game.harvest(lea.cookie)

    nextMonday(vi)
    const harvest = await game.harvest(lea.cookie)

    // Une semaine neuve : trois défis à choisir, et rien gagné pour l'ancien.
    expect(harvest.personalChallenge.state).toBe('choose')
    expect(harvest.honey).toBe(before.honey)
  })
})

/**
 * Le geste n° `i` qu'un défi de ruche compte, fait par `actor` sur les projets `projects` d'un autre
 * membre : un retour (devenir testeur, puis le retour), une mise à jour (de son propre projet,
 * `own`), devenir testeur, une réaction (cinq sortes par projet), un commentaire.
 */
const hiveStep = async (
  code: HiveChallengeCode,
  actor: TestMember,
  projects: string[],
  own: string,
  i: number,
) => {
  switch (code) {
    case 'feedback_5':
      await game.joinTesters(projects[i] as string, actor.cookie)
      await game.feedback(projects[i] as string, actor)
      return
    case 'updates_3':
      await game.postUpdate(own, actor.cookie)
      return
    case 'tested_3':
      await game.joinTesters(projects[i] as string, actor.cookie)
      return
    case 'reactions_10':
      await game.react(
        projects[Math.floor(i / REACTION_KINDS.length)] as string,
        actor.cookie,
        REACTION_KINDS[i % REACTION_KINDS.length],
      )
      return
    case 'comments_5':
      await game.comment(projects[i] as string, actor.cookie)
      return
  }
}

/** La ruche « Famille » de Léa, et ceux qui l'y rejoignent. */
const hiveWith = async (members: TestMember[]) => {
  const hive = await hives.create(lea.cookie, 'Famille')
  for (const member of members) {
    later()
    await hives.join(hive.id, lea.cookie, member)
  }
  return hive.id
}

describe('the challenge of a hive', () => {
  it('gives a weekly challenge only to a hive of three members or more', async () => {
    const hiveId = await hiveWith([max])
    // Deux membres : aucun défi, ni dans « Ma récolte » ni sur la page de la ruche.
    expect((await game.harvest(lea.cookie)).hiveChallenges).toEqual([])
    expect((await hives.page(hiveId, lea.cookie)).challenge).toBeNull()

    later()
    await hives.join(hiveId, lea.cookie, ines)

    const [challenge, ...others] = (await game.harvest(lea.cookie)).hiveChallenges
    expect(others).toEqual([])
    if (!challenge) throw new Error('no challenge for a hive of three')
    expect(challenge).toEqual({
      hiveId,
      hiveName: 'Famille',
      code: challenge.code,
      progress: 0,
      target: hiveTarget(challenge.code),
      done: false,
      isNew: true,
    })
    // Le même défi sur la page de la ruche, pour chacun de ses membres.
    const { hiveName: _name, ...onThePage } = challenge
    expect((await hives.page(hiveId, max.cookie)).challenge).toEqual(onThePage)
  })

  it('counts only the gestures made between members of the hive, and pays 10 honey to those who took part', async () => {
    const noe = await signedUpMember(ctx, act, 'Noé', '203.0.113.34')
    const noeProjects = [
      await game.testable(noe.cookie, 'Le projet de Noé'),
      await game.testable(noe.cookie, 'Le second projet de Noé'),
    ]
    const hiveId = await hiveWith([max, ines])
    // Une semaine neuve : ce qui précède (projets, ruche) ne compte pas, le défi part de zéro.
    nextMonday(vi)
    const challenge = (await game.harvest(lea.cookie)).hiveChallenges[0]
    if (!challenge) throw new Error('no challenge for the hive')
    const { code } = challenge
    const target = hiveTarget(code)

    // Léa fait tous les gestes du défi sauf un, sur les projets de Max (deux membres de la ruche).
    for (let i = 0; i < target - 1; i += 1) {
      // Le lendemain pour la seconde moitié : les plafonds du jour (4 retours) ne coupent rien.
      if (i === 3) vi.setSystemTime(Date.now() + DAY)
      await hiveStep(code, lea, maxProjects, leaProject, i)
    }
    // Noé, hors de la ruche, fait le même geste sur un projet de Max, et Max sur un projet de Noé :
    // ni l'un ni l'autre ne compte.
    await hiveStep(code, noe, maxProjects.slice(5), noeProjects[0] as string, 0)
    if (code !== 'updates_3') await hiveStep(code, max, noeProjects, maxProjects[0] as string, 0)

    const before = await game.harvest(lea.cookie)
    expect(before.hiveChallenges).toEqual([
      { ...challenge, progress: target - 1, done: false, isNew: false },
    ])
    const inesBefore = (await game.harvest(ines.cookie)).honey

    await hiveStep(code, lea, maxProjects, leaProject, target - 1)

    const after = await game.harvest(lea.cookie)
    expect(after.hiveChallenges[0]).toMatchObject({ hiveId, code, done: true })
    expect(after.honey).toBe(before.honey + HONEY.hiveChallenge)
    // Inès n'a rien fait : la ruche a réussi, mais le miel va à ceux qui y ont participé.
    const inesAfter = await game.harvest(ines.cookie)
    expect(inesAfter.hiveChallenges[0]).toMatchObject({ hiveId, done: true })
    expect(inesAfter.honey).toBe(inesBefore)

    // Un geste de plus : le défi est réussi une fois, il ne paie plus.
    await hiveStep(code, lea, maxProjects, leaProject, target === 10 ? 10 : 5)
    expect((await game.harvest(lea.cookie)).honey).toBe(after.honey)
  })

  it('gives a hive a fresh challenge the following Monday', async () => {
    const hiveId = await hiveWith([max, ines])
    const first = (await game.harvest(lea.cookie)).hiveChallenges[0]
    expect(first?.hiveId).toBe(hiveId)

    nextMonday(vi)

    expect((await game.harvest(lea.cookie)).hiveChallenges).toEqual([
      expect.objectContaining({ hiveId, progress: 0, done: false, isNew: true }),
    ])
  })
})
