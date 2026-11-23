// Tests de la page « Ma récolte » (R19, docs/scenarios/refonte.md, « R19 — La gamification », « Où
// on le voit ») : le panneau du niveau (sans le miel), « Cette semaine », « Mon défi » (à choisir,
// en cours, réussi, aucun), « Défis de mes ruches », « Classement de la semaine » (ou la phrase du
// retrait), « Mon miel » et « Mes sceaux · N », dans l'ordre de la planche R19-Recolte. Le faux
// serveur et les textes : `Harvest.testkit.tsx`.
import type { Harvest } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { labelOf } from '../testing/arrivedFocus'
import { leaHarvest, mondayHarvest, newcomerHarvest } from '../testing/harvest'
import { containing, fr } from '../testing/text'
import { moveReaderTo } from '../ui/focus'
import {
  challengeLabel,
  deferred,
  destinationOf,
  headings,
  honeyAmount,
  mockServer,
  pollenAmount,
  progressText,
  renderHarvest,
  resetHarvestMocks,
  sealsHeading,
  sentTo,
  startingWith,
  T,
} from './Harvest.testkit'
import { HarvestScreen } from './HarvestScreen'

const kit = () => require('./Harvest.testkit') as typeof import('./Harvest.testkit')

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({
  request: (...args: unknown[]) =>
    (kit().mockClient.request as (...a: unknown[]) => unknown)(...args),
  requestWithoutBody: (...args: unknown[]) =>
    (kit().mockClient.requestWithoutBody as (...a: unknown[]) => unknown)(...args),
  apiFetch: jest.fn(),
}))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn(() => Promise.resolve(null)) }))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('expo-router', () => kit().mockExpoRouter())
// Le lecteur d'écran du téléphone, amené où le focus va après un geste : on l'espionne.
jest.mock('../ui/focus', () => ({
  ...jest.requireActual('../ui/focus'),
  moveReaderTo: jest.fn(),
}))

beforeEach(() => {
  resetHarvestMocks()
  jest.mocked(moveReaderTo).mockClear()
})

/** Affiche « Ma récolte » avec cette récolte, et attend que la page soit lue. */
const openHarvest = async (harvest: Harvest = leaHarvest) => {
  mockServer.harvest = harvest
  await renderHarvest(<HarvestScreen />)
  await screen.findByRole('header', { name: T.weekTitle })
}

/** Le niveau peut être écrit dans l'alvéole du niveau, nommée par lui : visible ou nom lu. */
const shown = (text: string) => screen.queryByText(text) ?? screen.queryByLabelText(text)

const challengeRadio = (code: Parameters<typeof challengeLabel>[0]) =>
  screen.getByRole('radio', { name: startingWith(challengeLabel(code)) })

/** Les textes des vues où le lecteur d'écran du téléphone a été amené. */
const readerLabels = () => jest.mocked(moveReaderTo).mock.calls.map(([node]) => labelOf(node))

const familyBar = (family: 'forager' | 'builder' | 'keeper' | 'dancer', amount: number) =>
  fr.t(($) => $.game.harvest.week.family, {
    family: fr.t(($) => $.game.families[family]),
    amount,
  })

describe('HarvestScreen, the page', () => {
  it('has the title « Ma récolte »', async () => {
    await openHarvest()

    expect(screen.getByRole('header', { name: T.harvestTitle })).toBeTruthy()
  })

  it('reads the harvest of the member', async () => {
    await openHarvest()

    expect(sentTo('GET', '/v1/me/harvest').length).toBeGreaterThan(0)
  })

  it('shows its sections in the order of the board', async () => {
    await openHarvest()

    const order = [
      T.weekTitle,
      T.challengeTitle,
      T.hivesTitle,
      T.rankingsTitle,
      T.honeyTitle,
      sealsHeading(3),
    ]
    expect(headings().filter((heading) => order.includes(heading))).toEqual(order)
  })

  it('shows the level, the title and the pollen before the next level, without the honey', async () => {
    await openHarvest()

    expect(shown(fr.t(($) => $.game.level, { level: 4 }))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.game.titles.keeper_f))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.game.toNext, { count: 120, next: 5 }))).toBeTruthy()
    // Le solde se lit une fois, dans « Mon miel » : le panneau du niveau ne le répète pas.
    expect(screen.getAllByText(honeyAmount(35))).toHaveLength(1)
  })

  it('says the harvest could not load', async () => {
    mockServer.harvestError = 'internal'
    await renderHarvest(<HarvestScreen />)

    expect(await screen.findByText(containing(T.harvestLoadError))).toBeTruthy()
  })
})

describe('HarvestScreen, « Cette semaine »', () => {
  it('shows the pollen of the week and a bar per family, named by its gestures', async () => {
    await openHarvest()

    expect(screen.getByText(pollenAmount(85))).toBeTruthy()
    expect(screen.getByLabelText(familyBar('keeper', 47))).toBeTruthy()
    expect(screen.getByLabelText(familyBar('builder', 20))).toBeTruthy()
    expect(screen.getByLabelText(familyBar('forager', 18))).toBeTruthy()
    expect(screen.getByText(T.weekHelp)).toBeTruthy()
  })

  it('shows « Semaine butinée » once the week is foraged', async () => {
    await openHarvest()

    expect(screen.getByText(T.foraged)).toBeTruthy()
  })

  it('does not show « Semaine butinée » before the first gesture that helps this week', async () => {
    await openHarvest(mondayHarvest)

    // Témoin : la rubrique est bien là.
    expect(screen.getByRole('header', { name: T.weekTitle })).toBeTruthy()
    expect(screen.queryByText(T.foraged)).toBeNull()
  })

  // Option a11 des planches : un nouveau membre lit d'où vient le pollen, à la place de la série.
  it('tells a new member where pollen comes from', async () => {
    await openHarvest(newcomerHarvest)

    expect(screen.getByText(T.newcomer)).toBeTruthy()
  })

  it('does not tell where pollen comes from to a member who already foraged', async () => {
    await openHarvest()

    expect(screen.getByText(fr.t(($) => $.game.weeks, { count: 7 }))).toBeTruthy()
    expect(screen.queryByText(T.newcomer)).toBeNull()
  })
})

describe('HarvestScreen, « Mon défi »', () => {
  it('offers the three challenges of the week to choose from', async () => {
    await openHarvest()

    expect(screen.getAllByText(T.chooseTitle).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(challengeRadio('feedback')).toBeTruthy()
    expect(challengeRadio('update')).toBeTruthy()
    expect(challengeRadio('comment_3')).toBeTruthy()
    expect(screen.getByRole('button', { name: T.skip })).toBeTruthy()
  })

  it('sends the chosen challenge once, then shows it in progress', async () => {
    await openHarvest()

    await fireEvent.press(challengeRadio('update'))
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))

    await waitFor(() => expect(screen.queryAllByRole('radio')).toHaveLength(0))
    expect(sentTo('PATCH', '/v1/me/game').map((one) => one.body)).toEqual([
      { personalChallenge: 'update' },
    ])
    expect(screen.getByText(challengeLabel('update'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.confirm })).toBeNull()
  })

  // Relecture d'interface du plan, UI-3 : après le choix, le focus va au titre de la carte du défi
  // (sur téléphone, le lecteur d'écran y est amené), pas en haut de la page.
  it('moves focus to the chosen challenge card', async () => {
    await openHarvest()

    await fireEvent.press(challengeRadio('comment_3'))
    jest.mocked(moveReaderTo).mockClear()
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))

    await waitFor(() =>
      expect(readerLabels().some((label) => label?.startsWith(challengeLabel('comment_3')))).toBe(
        true,
      ),
    )
  })

  it('lets the member pass this week, then offers « Choisir un défi »', async () => {
    await openHarvest()

    await fireEvent.press(screen.getByRole('button', { name: T.skip }))

    expect(await screen.findByText(T.none)).toBeTruthy()
    expect(sentTo('PATCH', '/v1/me/game').map((one) => one.body)).toEqual([
      { personalChallenge: 'none' },
    ])
    expect(screen.getByRole('button', { name: T.chooseAgain })).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  // UI-3 : après « Pas cette semaine », le focus va à « Choisir un défi ».
  it('moves focus to « Choisir un défi » after « Pas cette semaine »', async () => {
    await openHarvest()

    jest.mocked(moveReaderTo).mockClear()
    await fireEvent.press(screen.getByRole('button', { name: T.skip }))

    await waitFor(() => expect(readerLabels()).toContain(T.chooseAgain))
  })

  // Relecture d'interface du plan, B1 : « Pas cette semaine » se défait, avec les trois mêmes défis.
  it('offers the same three challenges again after « Pas cette semaine »', async () => {
    await openHarvest({
      ...leaHarvest,
      personalChallenge: { state: 'none', offered: ['feedback', 'update', 'comment_3'] },
    })

    expect(screen.getByText(T.none)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: T.chooseAgain }))

    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(challengeRadio('feedback')).toBeTruthy()
    expect(challengeRadio('update')).toBeTruthy()
    expect(challengeRadio('comment_3')).toBeTruthy()
    // « Choisir un défi » rouvre le choix sans rien envoyer ; le choix, lui, part.
    expect(sentTo('PATCH', '/v1/me/game')).toHaveLength(0)
    await fireEvent.press(challengeRadio('feedback'))
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))
    await waitFor(() =>
      expect(sentTo('PATCH', '/v1/me/game').map((one) => one.body)).toEqual([
        { personalChallenge: 'feedback' },
      ]),
    )
  })

  it('says the choice could not be saved, and keeps the three challenges', async () => {
    mockServer.answer('PATCH', '/v1/me/game', () => ({ ok: false, error: 'internal' }))
    await openHarvest()

    await fireEvent.press(challengeRadio('update'))
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))

    expect(await screen.findByText(T.challengeError)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('shows « Choisir ce défi » busy while the choice is sent', async () => {
    const answer = deferred<{ ok: true; data: null }>()
    mockServer.answer('PATCH', '/v1/me/game', () => answer.promise)
    await openHarvest()

    await fireEvent.press(challengeRadio('update'))
    await fireEvent.press(screen.getByRole('button', { name: T.confirm }))

    await waitFor(() => expect(screen.getByRole('button', { name: T.confirm })).toBeBusy())
    await act(async () => answer.resolve({ ok: true, data: null }))
  })

  it('shows the challenge in progress with its comb', async () => {
    await openHarvest({
      ...leaHarvest,
      personalChallenge: { state: 'active', code: 'comment_3', progress: 1, target: 3 },
    })

    expect(screen.getByText(challengeLabel('comment_3'))).toBeTruthy()
    const gauges = screen.getAllByRole('progressbar')
    expect(gauges.map((gauge) => gauge.props['aria-valuetext'])).toContain(progressText(1, 3))
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('shows a challenge done with the honey it brought', async () => {
    await openHarvest({ ...leaHarvest, personalChallenge: { state: 'done', code: 'feedback' } })

    expect(screen.getByText(challengeLabel('feedback'))).toBeTruthy()
    expect(screen.getByText(T.done)).toBeTruthy()
    expect(
      screen.getByText(fr.t(($) => $.game.harvest.challenge.reward, { amount: 10 })),
    ).toBeTruthy()
  })
})

describe('HarvestScreen, « Défis de mes ruches »', () => {
  it('shows the challenge of each hive with its progress, never who did nothing', async () => {
    await openHarvest()

    expect(screen.getByRole('header', { name: T.hivesTitle })).toBeTruthy()
    expect(screen.getAllByText(containing('Famille')).length).toBeGreaterThan(0)
    expect(screen.getByText(fr.t(($) => $.game.challenges.hive.feedback_5))).toBeTruthy()
    const gauges = screen.getAllByRole('progressbar')
    expect(gauges.map((gauge) => gauge.props['aria-valuetext'])).toContain(progressText(3, 5))
  })

  // Option a14 : un défi tiré ce lundi dit « Nouveau », jamais « 0 sur 10 ».
  it('says « Nouveau » for a hive challenge drawn this Monday, never « 0 sur 10 »', async () => {
    await openHarvest(mondayHarvest)

    expect(screen.getByText(fr.t(($) => $.game.challenges.hive.reactions_10))).toBeTruthy()
    expect(screen.getAllByText(T.isNew).length).toBeGreaterThan(0)
    expect(screen.queryByText(progressText(0, 10))).toBeNull()
    for (const gauge of screen.queryAllByRole('progressbar')) {
      expect(gauge.props['aria-valuetext']).not.toBe(progressText(0, 10))
    }
  })

  it('leaves the section out without a hive of three members', async () => {
    await openHarvest({ ...leaHarvest, hiveChallenges: [] })

    // Témoin : la page est là, avec la rubrique suivante.
    expect(screen.getByRole('header', { name: T.honeyTitle })).toBeTruthy()
    expect(screen.queryByRole('header', { name: T.hivesTitle })).toBeNull()
  })
})

describe('HarvestScreen, « Classement de la semaine »', () => {
  it('leads to the ranking of the week', async () => {
    await openHarvest()

    expect(await destinationOf(T.rankingsOpen)).toBe('/harvest/rankings')
  })

  // Option b6 : retiré, la phrase remplace la rubrique, et « Changer ce choix » mène aux réglages.
  it('says the member left the rankings, and leads to the setting to change it', async () => {
    await openHarvest({
      ...leaHarvest,
      settings: { ...leaHarvest.settings, inRankings: false },
    })

    expect(screen.getByText(T.rankingsOff)).toBeTruthy()
    expect(screen.queryByRole('link', { name: T.rankingsOpen })).toBeNull()
    expect(screen.queryByRole('button', { name: T.rankingsOpen })).toBeNull()
    expect(await destinationOf(T.rankingsChange)).toBe('/settings/appearance')
  })

  it('does not speak of leaving the rankings to a member who appears in them', async () => {
    await openHarvest()

    expect(
      screen.queryByRole('link', { name: T.rankingsOpen }) ??
        screen.getByRole('button', { name: T.rankingsOpen }),
    ).toBeTruthy()
    expect(screen.queryByText(T.rankingsOff)).toBeNull()
  })
})

describe('HarvestScreen, « Mon miel »', () => {
  it('shows the balance, how honey is earned, and what it buys', async () => {
    await openHarvest()

    expect(screen.getByRole('header', { name: T.honeyTitle })).toBeTruthy()
    expect(screen.getByText(honeyAmount(35))).toBeTruthy()
    expect(screen.getByText(T.honeyHelp)).toBeTruthy()
    expect(screen.getAllByText(containing(T.offer)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(T.offerHint)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: startingWith(T.decorate) })).toBeTruthy()
  })
})

describe('HarvestScreen, « Mes sceaux »', () => {
  it('shows every seal earned under « Mes sceaux · 3 »', async () => {
    await openHarvest()

    expect(screen.getByRole('header', { name: sealsHeading(3) })).toBeTruthy()
    for (const name of [
      fr.t(($) => $.game.seals.first_feedback),
      fr.t(($) => $.game.seals.category.cooking),
      fr.t(($) => $.game.seals.first_project),
    ]) {
      expect(screen.getAllByText(containing(name)).length).toBeGreaterThan(0)
    }
  })

  // Option a4 : pas de vitrine des sceaux manquants, une ligne sobre.
  it('says that other seals remain to discover, without showing any missing one', async () => {
    await openHarvest()

    expect(screen.getByText(T.sealsMore)).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.game.seals.weeks_25)))).toBeNull()
    expect(screen.queryByText(containing(fr.t(($) => $.game.seals.hive_5)))).toBeNull()
  })
})
