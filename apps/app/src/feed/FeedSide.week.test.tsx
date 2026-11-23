// Tests de la ligne « Ta semaine » en tête de la colonne du Fil, sur ordinateur (R19,
// docs/scenarios/refonte.md, « Où on le voit » ; planche R19-Fil, option b16). Elle mène à
// « Ma récolte » (/harvest) et dit, selon la semaine (GET /v1/me/harvest) :
// - du pollen et un défi en cours : « 85 pollen · défi 2 sur 3 » ;
// - du pollen et le défi réussi : « 85 pollen · défi réussi » ;
// - du pollen sans défi : « 85 pollen » ;
// - le lundi, avant le premier pollen, des défis à choisir : « Nouveaux défis » ;
// - rien du tout : « Ma récolte ».
// Jamais « 0 pollen » (rien qui culpabilise).
//
// Le client réseau est remplacé par le faux serveur du jeu (screens/Game.testkit.ts) ; les autres
// lectures de la colonne (ses ruches, le fil des testeurs) sont de faux hooks, comme dans
// FeedSide.cover.test.tsx.
import type { Harvest } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { gameServer, leaHarvest } from '../screens/Game.testkit'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useDiscoverFeed } from './api'
import { FeedSide } from './FeedSide'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le client réseau : le faux serveur du jeu ; toute autre demande reçoit « introuvable ».
jest.mock('../api/client', () => {
  const route = (path: string, init?: RequestInit) =>
    require('../screens/Game.testkit')
      .gameServer.route(path, init)
      .then((answer: unknown) => answer ?? { ok: false, error: 'notFound' })
  return {
    ...jest.requireActual('../api/client'),
    request: jest.fn(route),
    requestWithoutBody: jest.fn(route),
  }
})
jest.mock('../hives/api', () => ({
  useMyHives: () => ({ isPending: false, data: { hives: [] } }),
}))
jest.mock('../suggestions/api', () => ({ useSuggestions: jest.fn() }))
jest.mock('../navigation/links', () => ({ useOpenDemo: () => jest.fn() }))
jest.mock('./api', () => ({ useDiscoverFeed: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/feed',
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      navigate: mockPush,
      back: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

const T = {
  title: fr.t(($) => $.game.side.title),
  active: fr.t(($) => $.game.side.active, { amount: 85, progress: 2, target: 3 }),
  done: fr.t(($) => $.game.side.done, { amount: 85 }),
  pollen: fr.t(($) => $.game.side.pollen, { amount: 85 }),
  monday: fr.t(($) => $.game.side.monday),
  empty: fr.t(($) => $.game.side.empty),
  zero: fr.t(($) => $.game.side.pollen, { amount: 0 }),
}

/** Une semaine sans pollen encore (le lundi matin). */
const emptyWeek: Harvest['week'] = {
  total: 0,
  byFamily: { forager: 0, builder: 0, keeper: 0, dancer: 0 },
}

/** Les défis proposés, à choisir. */
const offered: Harvest['personalChallenge'] = {
  state: 'choose',
  offered: ['feedback', 'update', 'react_5'],
}

/** Le texte, visible ou lu comme le nom d'un élément (la ligne peut être un lien nommé par lui). */
const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/** Affiche la colonne pour cette récolte, et attend la ligne qui dit `text`. */
const openWith = async (harvest: Harvest, text: string) => {
  gameServer.reset(harvest)
  await renderWithProviders(<FeedSide withSuggestions={false} shownProjectIds={new Set()} />)
  await screen
    .findAllByText(containing(text))
    .catch(() => screen.findAllByLabelText(containing(text)))
}

beforeEach(() => {
  mockPush.mockReset()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(useDiscoverFeed).mockReturnValue({
    data: {
      pages: [{ items: [], nextCursor: null, followedAuthorIds: [] }],
      pageParams: [undefined],
    },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useDiscoverFeed>)
})

describe('« Ta semaine » at the top of the feed column', () => {
  it('says the pollen of the week and the challenge in progress', async () => {
    await openWith(
      {
        ...leaHarvest,
        personalChallenge: { state: 'active', code: 'comment_3', progress: 2, target: 3 },
      },
      T.active,
    )

    expect(shown(T.title)).toBe(true)
  })

  it('says the pollen of the week and the challenge done', async () => {
    await openWith(
      { ...leaHarvest, personalChallenge: { state: 'done', code: 'feedback' } },
      T.done,
    )

    expect(shown(T.title)).toBe(true)
  })

  it('says the pollen alone when there is no challenge this week', async () => {
    await openWith({ ...leaHarvest, personalChallenge: { ...offered, state: 'none' } }, T.pollen)

    expect(shown(T.title)).toBe(true)
  })

  // Option b16 : le lundi, avant le premier pollen, « Nouveaux défis » ; jamais « 0 pollen ».
  it('says « Nouveaux défis » on Monday before the first pollen, never « 0 pollen »', async () => {
    await openWith({ ...leaHarvest, week: emptyWeek, personalChallenge: offered }, T.monday)

    expect(shown(T.zero)).toBe(false)
  })

  it('says « Ma récolte » when there is nothing to say, never « 0 pollen »', async () => {
    await openWith(
      { ...leaHarvest, week: emptyWeek, personalChallenge: { ...offered, state: 'none' } },
      T.empty,
    )

    expect(shown(T.zero)).toBe(false)
    expect(shown(T.monday)).toBe(false)
  })

  it('leads to « Ma récolte »', async () => {
    await openWith(leaHarvest, T.title)

    // Le lien porte le titre de la ligne dans son nom (« Ta semaine », puis ce qu'elle dit).
    await fireEvent.press(screen.getByRole('link', { name: containing(T.title) }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/harvest'])
  })
})
