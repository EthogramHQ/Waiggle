// Tests de « À la une », en tête d'Explorer (tranche R12, docs/scenarios/refonte.md, « À la une »,
// pour les membres, planche R12-A-La-Une) : en tête, une rangée « À la une » des projets de la
// vitrine, dans l'ordre choisi par la modération, en cartes qu'on fait défiler ; chaque carte ouvre
// le projet ; sans projet mis en avant, la rangée n'apparaît pas (aucune place vide).
//
// Ce que ces tests supposent de l'écran (plan R12, UI-G, choix 10, « API des modules partagés » ;
// à corriger si le code en décide autrement, en le disant) :
// - la rangée lit GET /v1/showcase (`useMemberShowcase()`, `showcase/api.ts`), la vitrine d'un
//   membre, déjà filtrée par l'API selon les blocages : l'écran montre ce qu'elle rend ;
// - son titre est un `header` « À la une » (`explore.featured`) ; chaque carte (`ui/ShowcaseCard`)
//   est un lien (ou un bouton) dont le nom contient le titre du projet ;
// - une carte d'un membre mène à l'adresse des membres `/projects/<id>` (choix 7).
// Le réseau : `api/client` remplacé (comme ExploreScreen.test.tsx), qui répond selon l'adresse ;
// les fils et les outils sont de faux hooks.
import type { FeedItem, FeedPage, ShowcaseItem, ToolList } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { categoryList } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../feed/api', () => ({
  ...jest.requireActual('../feed/api'),
  feedQueryKey: ['feed'],
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/explore',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: mockNavigate,
      setParams: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

// --- Les données ---

/** Une carte de la vitrine (contrat `ShowcaseItem`). */
const card = (id: string, title: string, name: string): ShowcaseItem => ({
  id,
  title,
  pitch: `${title}, en une phrase.`,
  status: 'testable',
  cover: null,
  author: { name, avatarUrl: null },
})
const decollage = card('d1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6', 'Décollage !', 'Papi Jean')
const papillon = card('e2f3a4b5-6c7d-4e8f-9a01-b2c3d4e5f607', 'Quel papillon ?', 'Hugo Lefèvre')
const ciel = card('f3a4b5c6-7d8e-4f90-8b12-c3d4e5f60718', 'Le ciel de ce soir', 'Inès Haddad')

/** La vitrine que lit Léa ; un test la vide. */
let featured: ShowcaseItem[] = [decollage, papillon, ciel]

const infiniteResult = (items: FeedItem[]) => ({
  data: { pages: [{ items, nextCursor: null } satisfies FeedPage], pageParams: [undefined] },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const recent: FeedItem = {
  kind: 'project',
  at: recipesProject.createdAt,
  project: summaryOf({ ...recipesProject, isMine: false }),
}

const T = {
  featured: fr.t(($) => $.explore.featured),
  testers: fr.t(($) => $.explore.testers),
}

/** Les adresses de l'API demandées par l'écran. */
const requestedPaths = () =>
  jest
    .mocked(request)
    .mock.calls.map(([path]) => new URL(String(path), 'https://api.test').pathname)

const visitedPaths = () =>
  [...mockPush.mock.calls, ...mockNavigate.mock.calls, ...mockReplace.mock.calls].map((call) =>
    pathOf(call[0]),
  )

/** Une carte de la rangée, par le titre de son projet : un lien, ou à défaut un bouton. */
const cardNamed = (title: string) => {
  const name = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const found =
    screen.queryAllByRole('link', { name })[0] ?? screen.queryAllByRole('button', { name })[0]
  if (!found) throw new Error(`no card « ${title} »`)
  return found
}

beforeEach(() => {
  featured = [decollage, papillon, ciel]
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  for (const mock of [mockPush, mockNavigate, mockReplace]) mock.mockReset()
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      const url = new URL(path, 'https://api.test')
      if (url.pathname === '/v1/categories') return { ok: true, data: categoryList('fr', {}) }
      if (url.pathname === '/v1/showcase') return { ok: true, data: { items: featured } }
      return { ok: false, error: 'internal' }
    }) as typeof request)
  jest
    .mocked(useDiscoverFeed)
    .mockReset()
    .mockReturnValue(
      // Les testeurs (carrousel) et « Récents » : le même projet de Max, il suffit ici.
      infiniteResult([recent]) as unknown as ReturnType<typeof useDiscoverFeed>,
    )
  jest
    .mocked(useFeedNews)
    .mockReset()
    .mockReturnValue({ count: null, more: false, authors: [], kinds: [] })
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(useTools).mockReturnValue({
    data: { tools: [], others: [] } satisfies ToolList,
    status: 'success',
    isPending: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useTools>)
})

describe('« À la une » at the top of Explorer (R12)', () => {
  it('shows « À la une » first, before « Ils cherchent des testeurs »', async () => {
    await renderWithProviders(<ExploreScreen />)

    await screen.findByRole('header', { name: T.featured })
    const headers = screen
      .getAllByRole('header')
      .map((header) => String(header.props.accessibilityLabel ?? ''))
      .filter((name) => name === T.featured || name === T.testers)
    expect(headers).toEqual([T.featured, T.testers])
  })

  it('shows the projects of the showcase, in the order chosen by the moderation', async () => {
    await renderWithProviders(<ExploreScreen />)
    await screen.findByRole('header', { name: T.featured })

    const titles = [decollage, papillon, ciel].map((one) => one.title)
    for (const title of titles) expect(cardNamed(title)).toBeTruthy()
    // L'ordre : celui des cartes dans l'écran.
    const order = screen
      .queryAllByRole(screen.queryAllByRole('link').length > 0 ? 'link' : 'button')
      .map((node) => String(node.props.accessibilityLabel ?? ''))
      .map((name) => titles.find((title) => name.includes(title)))
      .filter((title) => title !== undefined)
    expect([...new Set(order)]).toEqual(titles)
  })

  it('opens the page of the project when a card is touched', async () => {
    await renderWithProviders(<ExploreScreen />)
    await screen.findByRole('header', { name: T.featured })

    await fireEvent.press(cardNamed(papillon.title))

    expect(visitedPaths()).toContain(`/projects/${papillon.id}`)
  })

  it('reads the showcase of a member, never the one of a visitor', async () => {
    await renderWithProviders(<ExploreScreen />)
    await screen.findByRole('header', { name: T.featured })

    expect(requestedPaths()).toContain('/v1/showcase')
    expect(requestedPaths()).not.toContain('/v1/public/showcase')
  })

  it('shows no « À la une » row without any featured project, and keeps no empty place', async () => {
    featured = []
    await renderWithProviders(<ExploreScreen />)

    // Témoin : la page est là, et la vitrine a été lue.
    expect(await screen.findByRole('header', { name: T.testers })).toBeTruthy()
    await waitFor(() => expect(requestedPaths()).toContain('/v1/showcase'))
    expect(screen.queryByRole('header', { name: T.featured })).toBeNull()
    expect(screen.queryByText(T.featured)).toBeNull()
  })
})
