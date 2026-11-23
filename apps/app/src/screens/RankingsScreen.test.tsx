// Tests de la page « Classement de la semaine » (R19, docs/scenarios/refonte.md, « Le classement de
// la semaine »), poussée depuis « Ma récolte » : les proches (ceux que le membre suit, et lui) puis
// un choix par ruche ; seuls ceux qui ont gagné du pollen cette semaine ; l'état vide du lundi ; le
// retrait. Le choix de portée (plan R19, choix d'interface) : un choix segmenté jusqu'à 4 choix
// (Proches et 3 ruches), au-delà un menu « Classement ». Le faux serveur : `Harvest.testkit.tsx`.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import {
  amisRanking,
  closeRanking,
  emptyRanking,
  familleRanking,
  leaHarvest,
} from '../testing/harvest'
import { amisId, familleId, jardiniersId, myFourHives } from '../testing/hives'
import { choiceRole, containing } from '../testing/text'
import {
  destinationOf,
  mockNav,
  mockServer,
  renderHarvest,
  resetHarvestMocks,
  sentTo,
  T,
} from './Harvest.testkit'
import { RankingsScreen } from './RankingsScreen'

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

beforeEach(() => {
  resetHarvestMocks()
  mockNav.pathname = '/harvest/rankings'
  mockServer.rankings.set('close', closeRanking)
  mockServer.rankings.set(familleId, familleRanking)
  mockServer.rankings.set(amisId, amisRanking)
  mockServer.rankings.set(jardiniersId, { ...amisRanking, hiveId: jardiniersId })
})

/** Les demandes de classement envoyées : leur portée et leur ruche. */
const rankingsAsked = () =>
  sentTo('GET', '/v1/rankings').map((one) => {
    const query = new URL(one.path, 'https://api.test').searchParams
    return { scope: query.get('scope'), hive: query.get('hive') }
  })

/** Les lignes du classement, dans l'ordre de lecture (chaque ligne mène à la page du membre). */
const rowLabels = () =>
  screen.queryAllByRole('link').map((link) => String(link.props.accessibilityLabel ?? ''))

const openRankings = async () => {
  await renderHarvest(<RankingsScreen />)
  await screen.findByRole('header', { name: T.rankingsPage })
}

/** Le choix de portée de ce nom (choix segmenté : un bouton radio). */
const scopeChoice = (name: string, checked?: boolean) =>
  screen.getByRole('radio', { name, ...(checked === undefined ? null : { checked }) })

describe('RankingsScreen, the ranking of the close ones', () => {
  it('has the title « Classement de la semaine »', async () => {
    await openRankings()

    expect(screen.getByRole('header', { name: T.rankingsPage })).toBeTruthy()
  })

  it('opens on the close ones, from the most pollen to the least', async () => {
    await openRankings()

    await waitFor(() => expect(rowLabels()).toHaveLength(4))
    expect(rankingsAsked()[0]).toEqual({ scope: 'close', hive: null })
    const labels = rowLabels()
    expect(labels[0]).toMatch(/Inès Haddad/)
    expect(labels[1]).toMatch(/Léa/)
    expect(labels[2]).toMatch(/Max Durand/)
    expect(labels[3]).toMatch(/Tante Odile/)
  })

  it('says « toi » to the reader on the own row only', async () => {
    await openRankings()

    await waitFor(() => expect(rowLabels()).toHaveLength(4))
    expect(rowLabels().filter((label) => /toi/.test(label))).toEqual([expect.stringMatching(/Léa/)])
  })

  it('leads each row to the page of its member', async () => {
    await openRankings()

    await waitFor(() => expect(rowLabels()).toHaveLength(4))
    expect(await destinationOf(/Inès Haddad/)).toBe('/members/ines-id')
  })

  it('says under the list who is in it, and that it starts again on Monday', async () => {
    await openRankings()

    expect(await screen.findByText(T.footnote)).toBeTruthy()
  })

  // Le lundi matin, avant le premier pollen : la mascotte endormie et une phrase, aucune ligne.
  it('says the week is starting while nobody has pollen yet', async () => {
    mockServer.rankings.set('close', emptyRanking)
    await openRankings()

    expect(await screen.findByText(T.empty)).toBeTruthy()
    expect(rowLabels()).toEqual([])
  })

  it('says the ranking could not load', async () => {
    mockServer.rankingsError = 'internal'
    await openRankings()

    expect(await screen.findByText(containing(T.rankingsLoadError))).toBeTruthy()
  })
})

describe('RankingsScreen, the member who left the rankings', () => {
  beforeEach(() => {
    mockServer.rankingsError = 'rankingsOff'
    mockServer.harvest = { ...leaHarvest, settings: { ...leaHarvest.settings, inRankings: false } }
  })

  it('says the member left the rankings and sees none, with no row', async () => {
    await openRankings()

    expect(await screen.findByText(T.rankingsOff)).toBeTruthy()
    expect(rowLabels().filter((label) => /pollen/.test(label))).toEqual([])
  })

  it('leads to the setting to change this choice', async () => {
    await openRankings()

    await screen.findByText(T.rankingsOff)
    expect(await destinationOf(T.rankingsChange)).toBe('/settings/appearance')
  })
})

describe('RankingsScreen, the choice of the ranking', () => {
  it('offers the close ones and each hive side by side while there are up to three hives', async () => {
    await openRankings()

    expect(await screen.findByRole('radio', { name: T.close })).toBeTruthy()
    expect(scopeChoice(T.close, true)).toBeTruthy()
    expect(scopeChoice('Famille', false)).toBeTruthy()
    expect(scopeChoice('Amis du jeudi', false)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    // Pas de menu « Classement » tant que les choix tiennent côte à côte.
    expect(screen.queryByRole('button', { name: new RegExp(`^${T.scope},`) })).toBeNull()
  })

  it('shows the ranking of a hive once it is chosen', async () => {
    await openRankings()

    await fireEvent.press(await screen.findByRole('radio', { name: 'Famille' }))

    await waitFor(() => expect(rowLabels().some((label) => /Papi Jean/.test(label))).toBe(true))
    expect(rankingsAsked()).toContainEqual({ scope: 'hive', hive: familleId })
    expect(rowLabels().some((label) => /Inès Haddad/.test(label))).toBe(false)
    expect(scopeChoice('Famille', true)).toBeTruthy()
  })

  it('lists the close ones and every hive in a « Classement » menu past three hives', async () => {
    mockServer.hives = myFourHives
    await openRankings()

    const menu = await screen.findByRole('button', { name: `${T.scope}, ${T.close}` })
    // Le choix segmenté a disparu : aucun bouton radio de portée.
    expect(screen.queryByRole('radio', { name: 'Famille' })).toBeNull()
    await fireEvent.press(menu)
    for (const name of [T.close, 'Famille', 'Amis du jeudi', 'Atelier IA', 'Les jardiniers']) {
      expect(screen.getByRole(choiceRole(), { name: new RegExp(name) })).toBeTruthy()
    }
  })

  it('shows the ranking of the hive picked in the menu', async () => {
    mockServer.hives = myFourHives
    await openRankings()

    await fireEvent.press(await screen.findByRole('button', { name: `${T.scope}, ${T.close}` }))
    await fireEvent.press(screen.getByRole(choiceRole(), { name: /Les jardiniers/ }))

    await waitFor(() =>
      expect(rankingsAsked()).toContainEqual({ scope: 'hive', hive: jardiniersId }),
    )
    expect(await screen.findByRole('button', { name: `${T.scope}, Les jardiniers` })).toBeTruthy()
  })

  // Le paramètre d'adresse `hive` (lu après l'hydratation de la page web) : « Défis de mes ruches »
  // ou un lien partagé ouvrent directement le classement d'une ruche.
  it('opens on the hive named by the address', async () => {
    mockNav.params = { hive: amisId }
    await openRankings()

    await waitFor(() => expect(rowLabels().some((label) => /Hugo Lefèvre/.test(label))).toBe(true))
    expect(rankingsAsked()).toContainEqual({ scope: 'hive', hive: amisId })
    expect(scopeChoice('Amis du jeudi', true)).toBeTruthy()
  })
})
