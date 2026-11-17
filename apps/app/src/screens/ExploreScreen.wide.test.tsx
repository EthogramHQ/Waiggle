// Tests d'Explorer sur un grand écran (tranche R15, docs/scenarios/refonte.md, « Explorer ») : dès
// 1 536 points, « Ils cherchent des testeurs » et « Outils populaires » passent dans un panneau à
// droite ; « À la une » puis « Récents » prennent la colonne principale, « Récents » sur quatre à
// cinq colonnes à 1 920. En dessous de 1 536, Explorer reste celui d'aujourd'hui (« Récents » sur
// trois colonnes à 1 280) ; sur téléphone, la page de R12.
//
// Le panneau est une région `complementary` (relecture du plan, C4) : une vue non `accessible`
// (sinon ses boutons se fondraient en un seul élément sur téléphone), que `getByRole` ne trouve
// donc pas. On la cherche en parcourant l'arbre rendu, par sa propriété `role` (RNTL 14 n'a plus
// `UNSAFE_getByProps`). Il est lu après « Récents », comme le panneau du Fil (R4).
//
// Jest ne mesure rien : la largeur vient de la fenêtre simulée (`Dimensions.set`). On compte les
// cases de la rangée de la grille (`ui/ProjectGrid`, une liste de rangées) qui porte une carte.
import type { DiscoverFeedPage, FeedItem, ProjectSummary, ToolList } from '@ruche/contracts'
import { screen, within } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
const mockScreenProps: Record<string, unknown>[] = []

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut a ses propres tests : ici, elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../feed/api', () => ({
  feedQueryKey: ['feed'],
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))
// « À la une » : vide ici (la section n'existe pas sans projet mis en avant).
jest.mock('../showcase/api', () => ({ useMemberShowcase: () => ({ data: { items: [] } }) }))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
// Le cadre de page, tel quel, mais dont le test lit les propriétés (la largeur `wide`).
jest.mock('../ui/Screen', () => {
  const actual = jest.requireActual('../ui/Screen')
  const { createElement } = require('react')
  return {
    ...actual,
    Screen: (props: Record<string, unknown>) => {
      mockScreenProps.push(props)
      return createElement(actual.Screen, props)
    },
  }
})
jest.mock('expo-router', () => ({
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
}))

// --- Les données ---

/** Un projet d'un autre membre, en élément de fil ; avec une démo, il entre chez les testeurs. */
const itemOf = (n: number, title: string, demoUrl: string | null = null): FeedItem => ({
  kind: 'project',
  at: `2026-10-${String(20 - n).padStart(2, '0')}T12:00:00.000Z`,
  project: {
    ...summaryOf({
      ...recipesProject,
      id: `e2000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      title,
      author: {
        id: `u${10 + n}`,
        name: ['Nora', 'Max', 'Inès', 'Hugo'][n % 4] ?? 'Nora',
        avatarUrl: null,
      },
      isMine: false,
    }),
    demoUrl,
  } as ProjectSummary,
})

// « Récents » : six projets, assez pour remplir une rangée de cinq.
const recent = [
  'Arrosage malin',
  'Compte-bonbons',
  'Biscotte au parc',
  'Le ciel de ce soir',
  'Le journal de Chelsea',
  'La nuit étoilée',
].map((title, n) => itemOf(n, title))
// « Ils cherchent des testeurs » : deux projets testables, avec une démo.
const testers = [
  itemOf(7, 'Quel papillon ?', 'https://papillon.example.com'),
  itemOf(8, 'Décollage !', 'https://decollage.example.org'),
]

/** Un fil d'une page, comme le rend useInfiniteQuery. */
const feedOf = (page: DiscoverFeedPage) => ({
  data: { pages: [page], pageParams: [undefined] },
  status: 'success',
  isPending: false,
  isSuccess: true,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
})

const tools: ToolList = {
  tools: [
    ['claude', 'Claude', 41],
    ['chatgpt', 'ChatGPT', 38],
    ['lovable', 'Lovable', 34],
  ].map(([slug, name, projectCount]) => ({
    slug: String(slug),
    name: String(name),
    family: 'assistant' as const,
    aliases: [],
    projectCount: Number(projectCount),
  })),
  others: [],
}

beforeEach(() => {
  mockScreenProps.length = 0
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useFeedNews).mockReturnValue({ count: null, more: false, authors: [], kinds: [] })
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(useTools).mockReturnValue({
    data: tools,
    isError: false,
  } as unknown as ReturnType<typeof useTools>)
  jest
    .mocked(useDiscoverFeed)
    .mockImplementation(
      ({ testers: wanted }) =>
        feedOf(
          wanted
            ? { items: testers, nextCursor: null, followedAuthorIds: [] }
            : { items: recent, nextCursor: null, followedAuthorIds: [] },
        ) as unknown as ReturnType<typeof useDiscoverFeed>,
    )
})

// --- Les aides ---

/** Le temps d'un test, une fenêtre de cette taille ; le téléphone est remis à la fin. */
const atWindow = async (width: number, height: number, run: () => Promise<void>) => {
  const window = { width, height, scale: 2, fontScale: 1 }
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window, screen: window })
  try {
    await run()
  } finally {
    Dimensions.set({ window: phone, screen: phone })
  }
}

type Host = { props: Record<string, unknown>; parent: Host | null; children: (Host | string)[] }

/** Tous les éléments de l'arbre rendu, dans l'ordre de lecture (de haut en bas). */
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const inOrder = () => hostsOf(screen.root as unknown as Host)

/** Les régions `complementary` de la page (le panneau d'Explorer). */
const panels = () => inOrder().filter((node) => node.props.role === 'complementary')
const panel = () => {
  const found = panels()
  expect(found).toHaveLength(1)
  return found[0] as unknown as ReturnType<typeof screen.getByRole>
}

const RECENT = fr.t(($) => $.explore.recent)
const TESTERS = fr.t(($) => $.explore.testers)
const POPULAR_TOOLS = fr.t(($) => $.explore.popularTools)
const heading = (name: string) => screen.getByRole('header', { name })

/** Vrai si `first` est lu avant `second`. */
const readBefore = (first: unknown, second: unknown) => {
  const nodes = inOrder()
  const a = nodes.indexOf(first as Host)
  const b = nodes.indexOf(second as Host)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}

/**
 * Le nombre de cases de la rangée de la grille qui porte cette carte : on remonte depuis le lien de
 * la carte jusqu'à la liste (la grille) ; la vue traversée juste avant elle est la rangée.
 */
const cellsInRowOf = (title: string) => {
  let node: Host | null = screen.getByRole('link', { name: title }) as unknown as Host
  let row: Host | null = null
  while (node && node.props.accessibilityRole !== 'list' && node.props.role !== 'list') {
    row = node
    node = node.parent
  }
  if (!node || !row) throw new Error(`no grid around « ${title} »`)
  return row.children.length
}

const renderExplore = async () => {
  await renderWithProviders(<ExploreScreen />)
  // Témoin : la page est dessinée, « Récents » compris.
  expect(screen.getByRole('link', { name: 'Arrosage malin' })).toBeTruthy()
}

describe('Explore on a wide computer screen (R15)', () => {
  it('lays Explore out on the wide template', () =>
    atWindow(1920, 1080, async () => {
      await renderExplore()

      expect(mockScreenProps.at(-1)?.width).toBe('wide')
    }))

  /** Le panneau, avec les testeurs et les outils, lu après « Récents ». */
  const expectSidePanel = () => {
    const side = panel()
    expect(within(side).getByRole('header', { name: TESTERS })).toBeTruthy()
    expect(within(side).getByRole('header', { name: POPULAR_TOOLS })).toBeTruthy()
    // « Récents » (et ses cartes) restent dans la colonne principale.
    expect(within(side).queryByRole('header', { name: RECENT })).toBeNull()
    expect(within(side).queryByRole('link', { name: 'Arrosage malin' })).toBeNull()
    // Le panneau est lu après « Récents », comme celui du Fil.
    expect(readBefore(heading(RECENT), heading(TESTERS))).toBe(true)
    expect(readBefore(heading(RECENT), heading(POPULAR_TOOLS))).toBe(true)
  }

  it('Explore puts testers and popular tools in the side panel, read after Récents', () =>
    atWindow(1920, 1080, async () => {
      await renderExplore()
      expectSidePanel()
    }))

  it('already has the side panel at 1 536, where the wide margins end', () =>
    atWindow(1536, 864, async () => {
      await renderExplore()
      expectSidePanel()
    }))

  it('ExploreScreen counts Récents with the compact card width beside the panel', () =>
    atWindow(1920, 1080, async () => {
      await renderExplore()

      // Témoin : le panneau est là, à côté de « Récents ».
      expect(panels()).toHaveLength(1)
      // Quatre à cinq colonnes (scénario) : la carte compacte (320) et non celle du Fil.
      const columns = cellsInRowOf('Arrosage malin')
      expect(columns).toBeGreaterThanOrEqual(4)
      expect(columns).toBeLessThanOrEqual(5)
    }))
})

describe('Explore below 1 536 stays as it is today (R15)', () => {
  it('keeps the page without panel at 1 280, with Récents on three columns', () =>
    atWindow(1280, 800, async () => {
      await renderExplore()

      expect(panels()).toHaveLength(0)
      expect(cellsInRowOf('Arrosage malin')).toBe(3)
      // L'ordre d'aujourd'hui : les testeurs et les outils avant « Récents ».
      expect(readBefore(heading(TESTERS), heading(RECENT))).toBe(true)
      expect(readBefore(heading(POPULAR_TOOLS), heading(RECENT))).toBe(true)
    }))

  it('keeps the phone page of R12 at 390, in one column', async () => {
    await renderExplore()

    expect(panels()).toHaveLength(0)
    expect(cellsInRowOf('Arrosage malin')).toBe(1)
    expect(readBefore(heading(TESTERS), heading(RECENT))).toBe(true)
    expect(readBefore(heading(POPULAR_TOOLS), heading(RECENT))).toBe(true)
  })
})
