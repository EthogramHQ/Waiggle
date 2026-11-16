// Tests de la pastille « Exemple » sur les cartes de projet que voit un membre (tranche R12b,
// scénario « Les exemples », « Ce que voient les membres et les visiteurs ») : la carte de « À la
// une » en tête d'Explorer (`ui/ShowcaseCard`) et la carte d'un projet dans une liste (Fil,
// Explorer, recherche : `projects/SummaryCard`, qui prépare `ui/ProjectCard`) portent « Exemple »
// quand l'auteur est un compte d'exemples, et rien sinon.
//
// L'interface attendue : `ExploreScreen` et `SummaryCard` lisent le champ `example` du contrat
// (`ShowcaseItem.author`, `ProjectSummary.author`) et posent `ui/ExampleBadge`. La carte de la vitrine
// de l'accueil, vue par un visiteur : PublicExamples.test.tsx. Le réseau : `api/client` remplacé,
// qui répond selon l'adresse (comme ExploreScreen.showcase.test.tsx) ; les fils et les outils sont
// de faux hooks.
import type { FeedItem, FeedPage, ShowcaseItem, ToolList } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { SummaryCard } from '../projects/SummaryCard'
import { categoryList } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { exampleAuthor, exampleProject, recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
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
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/explore',
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      navigate: jest.fn(),
      setParams: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => ({}),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

// --- Les données ---

/** Une carte de la vitrine (contrat `ShowcaseItem`). */
const card = (id: string, title: string, author: ShowcaseItem['author']): ShowcaseItem => ({
  id,
  title,
  pitch: `${title}, en une phrase.`,
  status: 'testable',
  cover: null,
  author,
})
const decollage = card('d1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6', 'Décollage !', {
  name: 'Papi Jean',
  avatarUrl: null,
})
const papillon = card('e2f3a4b5-6c7d-4e8f-9a01-b2c3d4e5f607', 'Quel papillon ?', {
  name: 'Hugo Lefèvre',
  avatarUrl: null,
})
/** Le projet du compte d'exemples, mis à la une comme un autre. */
const plantes = card(exampleProject.id, exampleProject.title, {
  name: exampleAuthor.name,
  avatarUrl: null,
  example: true,
})

/** La vitrine que lit Léa ; chaque test la pose. */
let featured: ShowcaseItem[] = []

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

/** Un projet ordinaire de Max, dans « Récents » et les testeurs. */
const recent: FeedItem = {
  kind: 'project',
  at: recipesProject.createdAt,
  project: summaryOf({ ...recipesProject, isMine: false }),
}

const T = {
  example: fr.t(($) => $.common.example),
  featured: fr.t(($) => $.explore.featured),
}

/** Les pastilles « Exemple » lues à l'écran. */
const badges = () => screen.queryAllByText(T.example)

beforeEach(() => {
  featured = [decollage, papillon]
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
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
    .mockReturnValue(infiniteResult([recent]) as unknown as ReturnType<typeof useDiscoverFeed>)
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

describe('« À la une » with a project of the examples account (R12b)', () => {
  it('shows « Exemple » on its card', async () => {
    featured = [plantes, decollage, papillon]
    await renderWithProviders(<ExploreScreen />)

    await screen.findByRole('header', { name: T.featured })
    expect(await screen.findByText(containing(plantes.title))).toBeTruthy()
    // Une seule carte d'exemples dans la rangée, et rien d'autre sur la page qui en vienne.
    expect(badges()).toHaveLength(1)
  })

  it('shows no « Exemple » on the cards of ordinary members', async () => {
    await renderWithProviders(<ExploreScreen />)

    // Témoin : la rangée et ses cartes sont là.
    await screen.findByRole('header', { name: T.featured })
    expect(await screen.findByText(containing(decollage.title))).toBeTruthy()
    expect(badges()).toHaveLength(0)
  })
})

describe('the card of a project in a list, by the examples account (R12b)', () => {
  it('shows « Exemple »', async () => {
    await renderWithProviders(<SummaryCard project={summaryOf(exampleProject)} />)

    expect(await screen.findByText(exampleProject.title)).toBeTruthy()
    expect(badges()).toHaveLength(1)
  })

  it('shows no « Exemple » for an ordinary member', async () => {
    await renderWithProviders(
      <SummaryCard project={summaryOf({ ...recipesProject, isMine: false })} />,
    )

    // Témoin : la carte est là.
    expect(await screen.findByText(recipesProject.title)).toBeTruthy()
    expect(badges()).toHaveLength(0)
  })

  it('has « Exemple » read by screen readers on a phone', async () => {
    await renderWithProviders(<SummaryCard project={summaryOf(exampleProject)} />)

    await screen.findByText(exampleProject.title)
    // Sur téléphone, un lien nommé se lit par son nom et son indice, jamais par les textes qu'il
    // contient. La pastille est donc soit hors de tout lien ou bouton (comme le statut de la carte
    // depuis R4), soit dans le nom ou l'indice du lien qui la contient.
    const [badge] = badges()
    expect(badge).toBeTruthy()
    let node = badge?.parent ?? null
    while (node) {
      const props = node.props as Record<string, unknown>
      if (['link', 'button'].includes(String(props.role ?? props.accessibilityRole))) break
      node = node.parent
    }
    if (node) {
      const props = node.props as Record<string, unknown>
      const read = `${String(props.accessibilityLabel ?? '')} ${String(props.accessibilityHint ?? '')}`
      expect(read).toContain(T.example)
    }
  })
})
