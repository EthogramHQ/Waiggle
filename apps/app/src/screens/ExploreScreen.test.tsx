// Tests de l'onglet Explorer (refonte, tranche R3, docs/scenarios/refonte.md, « Explorer ») : le
// titre, le champ qui ouvre la recherche, « Ils cherchent des testeurs » (un carrousel), « Outils
// populaires » et « Récents », qui reprend l'ancien fil « Découvrir » de l'accueil (ses tests
// viennent de l'ancien HomeScreen.test.tsx, coupé depuis en HomeScreen.*.test.tsx). Les fils, les
// outils et le suivi sont de faux hooks, choisis par chaque test ; la barre du haut (TopNav) a ses
// propres tests et n'est pas dessinée ici.
//
// R6b (scénario « Les catégories en filtre », relecture du plan, décisions 15) : au-dessus de
// « Récents », une rangée de pastilles « Toutes », puis chaque catégorie qui a un projet visible,
// dans l'ordre de la feuille de publication ; le filtre vit dans l'adresse (`?category=animals`),
// lue seulement une fois la page hydratée ; un code mal formé est ignoré ; sans projet, « Aucun
// projet dans « Animaux » pour l'instant. » ; catégories en panne : on peut quand même retirer le
// filtre ; changer de filtre n'annonce aucune nouveauté. Les catégories viennent de l'API
// (GET /v1/categories), servies ici par un faux réseau (`api/client`), quel que soit le hook qui
// les lit.
import type {
  CatalogueTool,
  DiscoverFeedPage,
  FeedItem,
  FeedPage,
  Project,
  ProjectSummary,
  ToolList,
} from '@ruche/contracts'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { request } from '../api/client'
import type * as FeedApi from '../feed/api'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { categoryList, categoryName } from '../testing/categories'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { hrefOf, pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// R6b : le faux réseau. GET /v1/categories (et, pour un describe, les fils eux-mêmes) répondent par
// les fonctions de `network`, choisies par chaque test.
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// R6b : la page est-elle hydratée (web, ui/theme/hydration.ts) ? Oui par défaut ; un test la
// garde « pré-rendue », puis l'hydrate. useSyncExternalStore : l'écran se redessine au changement.
const mockHydration = { done: true, listeners: new Set<() => void>() }
jest.mock('../ui/theme/hydration', () => {
  const actual = jest.requireActual('../ui/theme/hydration')
  const { useSyncExternalStore } = require('react')
  return {
    ...actual,
    useHydrated: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockHydration.listeners.add(listener)
          return () => {
            mockHydration.listeners.delete(listener)
          }
        },
        () => mockHydration.done,
      ),
  }
})
// Le profil (la suspension, la photo) : Léa, membre ordinaire.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre du haut (ordinateur) a ses tests (TopNav.test.tsx) : ici, elle ne dessine rien, pour que
// le champ et les liens trouvés soient bien ceux de la page.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
// Les fils : useDiscoverFeed sert deux fois (testeurs pour le carrousel, tous pour « Récents »).
// R6b : le reste du module tel quel (une aide ajoutée par l'écran reste là).
jest.mock('../feed/api', () => ({
  ...jest.requireActual('../feed/api'),
  feedQueryKey: ['feed'],
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))
// GET /v1/tools : un faux hook (tools/api.ts, nouveau en R3).
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
// Suivre l'auteur d'une carte : un faux hook, dont le test lit les appels.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
/**
 * R6b : l'adresse de la page, comme le vrai routeur la tient. `setParams` (et `replace` vers
 * /explore) la change, et l'écran qui la lit (`useLocalSearchParams`) se redessine.
 */
const mockAddress = {
  params: {} as Record<string, string>,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockAddress.listeners.add(listener)
    return () => {
      mockAddress.listeners.delete(listener)
    }
  },
  read: () => mockAddress.params,
  set(next: Record<string, string>) {
    mockAddress.params = next
    for (const listener of mockAddress.listeners) listener()
  },
}
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un texte au rôle de lien, qui passe son adresse au faux `push`.
jest.mock('expo-router', () => {
  const { createElement, useSyncExternalStore } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/explore',
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      navigate: mockNavigate,
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => useSyncExternalStore(mockAddress.subscribe, mockAddress.read),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, onPress: () => mockPush(href), ...rest }, children),
  }
})

/** Les paramètres d'une adresse « /explore?category=animals » (ou d'un objet d'Expo Router). */
const paramsOf = (href: unknown): Record<string, string> => {
  const path = pathOf(href)
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  return Object.fromEntries(new URLSearchParams(query))
}

const mockToggle = jest.fn()

// --- Les projets ---

/** Un projet d'un auteur, en élément de fil. */
const itemOf = (project: Project): FeedItem => ({
  kind: 'project',
  at: project.createdAt,
  project: summaryOf(project),
})
const nora = { id: 'u3', name: 'Nora', avatarUrl: null }
const max = { id: 'u2', name: 'Max', avatarUrl: null }
// « Récents » : un projet de Nora, un de Max, et un de Léa (le membre connecté).
const fromNora = itemOf({
  ...recipesProject,
  id: '9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52',
  author: nora,
  title: 'Le carnet de jardin',
  isMine: false,
})
const fromMax = itemOf({
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  author: max,
  title: 'Le tri des photos',
  status: 'idea',
  isMine: false,
})
const fromLea = itemOf(recipesProject)

/**
 * Un projet du carrousel : testable, avec un lien de démo. Question ouverte (rapport r3-tw3) : le
 * résumé d'un projet (`ProjectSummary`) n'a pas de `demoUrl` dans le contrat ; ces tests supposent
 * qu'il le gagne (nullable), seul moyen d'ouvrir la démo sans relire chaque projet.
 */
const testerItem = (id: string, title: string, author: typeof nora, demoUrl: string): FeedItem => ({
  kind: 'project',
  at: '2026-10-20T08:00:00.000Z',
  project: {
    ...summaryOf({ ...recipesProject, id, title, author, isMine: false }),
    demoUrl,
  } as ProjectSummary,
})
const cafes = testerItem(
  '1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5',
  'Carnet de cafés',
  { id: 'u4', name: 'Sam', avatarUrl: null },
  'https://cafes.example.com',
)
const quiz = testerItem(
  '2e3f4051-6b7c-4d8e-9fa0-b1c2d3e4f506',
  'Le quiz des capitales',
  { id: 'u5', name: 'Inès', avatarUrl: null },
  'https://quiz.example.org',
)

/** Ce que renvoie un useInfiniteQuery de React Query (comme dans HomeScreen.testkit.tsx). */
const infiniteResult = (
  items: FeedItem[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => ({
  data: {
    pages: [{ items, nextCursor: hasNextPage ? 'abc' : null } satisfies FeedPage],
    pageParams: [undefined],
  },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  error: null,
  hasNextPage,
  isFetchingNextPage,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})
type Feed = ReturnType<typeof infiniteResult>

/** Ce que l'écran demande à `useDiscoverFeed` (R6b : la catégorie s'ajoute aux testeurs). */
type DiscoverOptions = { testers?: boolean; category?: string | null }

/**
 * Les deux fils : celui des testeurs (carrousel) et celui de tous (« Récents ») ; R6b : « Récents »
 * filtré par une catégorie rend `byCategory[code]` (vide si le test n'en donne pas).
 */
const mockFeeds = ({
  testers = infiniteResult([cafes, quiz]),
  recent = infiniteResult([fromNora, fromMax, fromLea]),
  byCategory = {},
}: {
  testers?: Feed
  recent?: Feed
  byCategory?: Record<string, Feed>
} = {}) => {
  jest.mocked(useDiscoverFeed).mockImplementation((options) => {
    const { testers: wanted, category } = options as DiscoverOptions
    const feed = wanted ? testers : category ? (byCategory[category] ?? infiniteResult([])) : recent
    return feed as unknown as ReturnType<typeof useDiscoverFeed>
  })
  return { testers, recent }
}

/** R6b : la catégorie de chaque lecture de « Récents » (le fil sans les testeurs), dans l'ordre. */
const recentCategories = () =>
  jest
    .mocked(useDiscoverFeed)
    .mock.calls.map(([options]) => options as DiscoverOptions)
    .filter((options) => !options.testers)
    .map((options) => options.category ?? null)

// --- Les outils ---

/** Un outil du catalogue (R6b) : son nom, sa famille, son nombre de projets. */
const catalogueTool = (slug: string, name: string, projectCount: number): CatalogueTool => ({
  slug,
  name,
  family: 'assistant',
  aliases: [],
  projectCount,
})

/** Douze outils, du plus utilisé au moins utilisé. */
const tools: CatalogueTool[] = [
  ['claude', 'Claude', 41],
  ['chatgpt', 'ChatGPT', 30],
  ['cursor', 'Cursor', 22],
  ['python', 'Python', 18],
  ['gemini', 'Gemini', 15],
  ['mistral', 'Mistral', 12],
  ['n8n', 'n8n', 10],
  ['make', 'Make', 9],
  ['notion', 'Notion', 8],
  ['zapier', 'Zapier', 7],
  ['figma', 'Figma', 5],
  ['bolt', 'Bolt', 2],
].map(([slug, name, projectCount]) =>
  catalogueTool(String(slug), String(name), Number(projectCount)),
)

const mockTools = (list: CatalogueTool[] = tools) =>
  jest.mocked(useTools).mockReturnValue({
    data: { tools: list, others: [] } satisfies ToolList,
    status: 'success',
    isPending: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  } as unknown as ReturnType<typeof useTools>)

/** Le nom lu d'un outil avec son nombre (« Claude, 41 projets publics »), comme Tag.test.tsx. */
const toolWithCount = (label: string, count: number) =>
  fr.t(($) => $.tools.withCount, { label, projects: fr.t(($) => $.tools.projects, { count }) })

/** Un lien, ou à défaut un bouton, de ce nom (l'écran choisit le rôle le plus juste). */
const linkOrButton = (name: string | RegExp) =>
  screen.queryByRole('link', { name }) ?? screen.getByRole('button', { name })

/** Les adresses demandées au routeur, quelle que soit la méthode (push, navigate, replace). */
const visitedPaths = () =>
  [...mockPush.mock.calls, ...mockNavigate.mock.calls, ...mockReplace.mock.calls].map((call) =>
    pathOf(call[0]),
  )

// --- R6b : les catégories, par le faux réseau ---

/** Les catégories qui ont des projets visibles ; les autres (Musique…) en ont 0. */
const COUNTS = { cooking: 3, animals: 2, science: 1, other: 1 }

/** Ce que répond le faux réseau : GET /v1/categories, et les fils quand un test les sert. */
const network = {
  categories: (): Promise<unknown> => Promise.resolve(categoryList('fr', COUNTS)),
  feed: null as null | ((params: URLSearchParams) => DiscoverFeedPage),
}

/** Le nombre de lectures de GET /v1/categories. */
const categoryReads = () =>
  jest.mocked(request).mock.calls.filter(([path]) => String(path).startsWith('/v1/categories'))
    .length

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  for (const mock of [mockPush, mockReplace, mockNavigate, mockToggle, mockSetParams])
    mock.mockReset()
  // L'adresse : vide au départ ; `setParams` y ajoute ou retire des paramètres, `replace` vers
  // /explore la remplace, comme le vrai routeur.
  mockAddress.params = {}
  mockHydration.done = true
  mockSetParams.mockImplementation((next: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...mockAddress.params, ...next }))
      if (value !== undefined && value !== '') merged[key] = value
    mockAddress.set(merged)
  })
  mockReplace.mockImplementation((href: unknown) => {
    if (pathOf(href).startsWith('/explore')) mockAddress.set(paramsOf(href))
  })
  network.categories = () => Promise.resolve(categoryList('fr', COUNTS))
  network.feed = null
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      const url = new URL(path, 'https://api.example.test')
      try {
        if (url.pathname === '/v1/categories') return { ok: true, data: await network.categories() }
        if (url.pathname.startsWith('/v1/feed/discover') && network.feed)
          return { ok: true, data: network.feed(url.searchParams) }
      } catch {
        // Une panne voulue par le test.
      }
      return { ok: false, error: 'internal' }
    }) as typeof request)
  jest.mocked(useDiscoverFeed).mockReset()
  jest
    .mocked(useFeedNews)
    .mockReset()
    .mockReturnValue({ count: null, more: false, authors: [], kinds: [] })
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockFeeds()
  mockTools()
})

/** Affiche Explorer, sur téléphone (par défaut) ou sur ordinateur. */
const renderExplore = () => renderWithProviders(<ExploreScreen />)

/** Le même test sur ordinateur, la fenêtre de téléphone remise à la fin. */
const onDesktop = async (run: () => Promise<void>) => {
  const restore = setDesktopWindow()
  try {
    await run()
  } finally {
    restore()
  }
}

describe('ExploreScreen, the page', () => {
  it('is titled « Explorer »', async () => {
    await renderExplore()

    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.title) })).toBeTruthy()
  })

  it('shows the subtitle on a computer only', async () => {
    await onDesktop(async () => {
      await renderExplore()

      expect(screen.getByText(containing(fr.t(($) => $.explore.subtitle)))).toBeTruthy()
    })
  })

  it('has no subtitle on a phone', async () => {
    await renderExplore()

    // Témoin : la page est bien là.
    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.title) })).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.explore.subtitle)))).toBeNull()
  })

  it('offers on a phone a search field that is a link to the search page', async () => {
    await renderExplore()

    // Le champ du téléphone n'est pas un vrai champ : un lien vers /search, qui y prend le focus
    // (aucune lettre perdue au changement de page : relecture de l'interface, ui-5 et « À noter »).
    const field =
      screen.queryByRole('link', { name: containing(fr.t(($) => $.search.label)) }) ??
      screen.getByRole('link', { name: containing(fr.t(($) => $.search.placeholder)) })
    await fireEvent.press(field)

    expect(visitedPaths().some((path) => path.startsWith('/search'))).toBe(true)
  })

  it('leaves the search field to the top bar on a computer', async () => {
    await onDesktop(async () => {
      await renderExplore()

      // Témoin : la page est bien là ; le champ, lui, est celui de la barre du haut (non dessinée).
      expect(screen.getByRole('header', { name: fr.t(($) => $.explore.title) })).toBeTruthy()
      expect(screen.queryByText(fr.t(($) => $.search.placeholder))).toBeNull()
    })
  })
})

describe('ExploreScreen, « Ils cherchent des testeurs »', () => {
  const testName = (title: string) =>
    new RegExp(`^${fr.t(($) => $.explore.testProject, { title })}`)

  it('shows the first page of the projects looking for testers, in a carousel', async () => {
    const { testers } = mockFeeds()
    await renderExplore()

    expect(useDiscoverFeed).toHaveBeenCalledWith(expect.objectContaining({ testers: true }))
    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.testers) })).toBeTruthy()
    expect(screen.getByLabelText(fr.t(($) => $.explore.carousel))).toBeTruthy()
    expect(screen.getByRole('link', { name: testName('Carnet de cafés') })).toBeTruthy()
    expect(screen.getByRole('link', { name: testName('Le quiz des capitales') })).toBeTruthy()
    expect(screen.getByText('Sam')).toBeTruthy()
    // Le carrousel ne lit que la première page : jamais de suite chargée en défilant (jur-J7).
    expect(testers.fetchNextPage).not.toHaveBeenCalled()
  })

  it('opens the demo through the warning page of external links', async () => {
    await renderExplore()

    await fireEvent.press(screen.getByRole('link', { name: testName('Carnet de cafés') }))

    // R5a : l'identifiant du projet suit, pour que la page de sortie dise « La démo de … ».
    const hrefs = mockPush.mock.calls.map((call) => hrefOf(call[0]))
    expect(
      hrefs.some((href) => href.startsWith('/out?url=https://cafes.example.com&project=')),
    ).toBe(true)
  })

  it('opens the page of the project when its title is touched (Louis, 31/10)', async () => {
    await renderExplore()

    await fireEvent.press(screen.getByRole('link', { name: 'Le quiz des capitales' }))

    expect(visitedPaths()).toContain(`/projects/${quiz.project.id}`)
    expect(visitedPaths().some((path) => path.startsWith('/out'))).toBe(false)
  })

  it('says when no project is looking for testers', async () => {
    mockFeeds({ testers: infiniteResult([]) })
    await renderExplore()

    expect(screen.getByText(containing(fr.t(($) => $.feed.testersEmpty)))).toBeTruthy()
    // Témoin : « Récents » reste là.
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
  })
})

describe('ExploreScreen, « Outils populaires »', () => {
  it('shows the first ten tools, without their number on a phone', async () => {
    await renderExplore()

    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.popularTools) })).toBeTruthy()
    expect(useTools).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Claude' })).toBeTruthy()
    // Le dixième est là, le onzième non : « Tous les outils » mène au reste.
    expect(screen.getByRole('link', { name: 'Zapier' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Figma' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Bolt' })).toBeNull()
    expect(screen.queryByRole('link', { name: toolWithCount('Claude', 41) })).toBeNull()
  })

  it('shows their number on a computer', async () => {
    await onDesktop(async () => {
      await renderExplore()

      expect(screen.getByRole('link', { name: toolWithCount('Claude', 41) })).toBeTruthy()
      expect(screen.getByRole('link', { name: toolWithCount('Zapier', 7) })).toBeTruthy()
      expect(screen.queryByRole('link', { name: toolWithCount('Figma', 5) })).toBeNull()
    })
  })

  it('opens the page of a touched tool', async () => {
    await renderExplore()

    await fireEvent.press(screen.getByRole('link', { name: 'Cursor' }))

    expect(visitedPaths()).toContain('/tags/cursor')
  })

  it('leads to every tool', async () => {
    await renderExplore()

    await fireEvent.press(linkOrButton(fr.t(($) => $.explore.allTools)))

    expect(visitedPaths()).toContain('/tools')
  })
})

// Repris de l'ancien HomeScreen.test.tsx (« the « discover » feed on the home screen ») :
// Découvrir est devenu « Récents » (F-Nav6). Le filtre « Cherchent des testeurs » est devenu le carrousel.
describe('ExploreScreen, « Récents »', () => {
  it('shows the public projects of every member', async () => {
    await renderExplore()

    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.recent) })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(useDiscoverFeed).toHaveBeenCalledWith(expect.objectContaining({ testers: false }))
    // Plus de choix « Tous / Cherchent des testeurs » : les catégories viendront en R6 (la clé
    // est retirée, le texte est écrit ici).
    expect(screen.queryByRole('radio', { name: 'Cherchent des testeurs' })).toBeNull()
  })

  it('opens a project of the list', async () => {
    await renderExplore()

    await fireEvent.press(screen.getByRole('link', { name: 'Le tri des photos' }))

    expect(visitedPaths()).toContain(`/projects/${fromMax.project.id}`)
  })

  it('says when no project is public yet', async () => {
    mockFeeds({ recent: infiniteResult([]) })
    await renderExplore()

    expect(screen.getByText(containing(fr.t(($) => $.feed.discoverEmpty)))).toBeTruthy()
  })

  // Relecture juridique (jur-J7) : « Récents » garde son bouton, rien ne se charge en fin de liste.
  it('loads the next page only when asked', async () => {
    const { recent } = mockFeeds({
      recent: infiniteResult([fromNora, fromMax], { hasNextPage: true }),
    })
    await renderExplore()

    expect(recent.fetchNextPage).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.feed.more) }))

    expect(recent.fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('shows that the next page is on its way', async () => {
    mockFeeds({
      recent: infiniteResult([fromNora], { hasNextPage: true, isFetchingNextPage: true }),
    })
    await renderExplore()

    expect(screen.getByRole('button', { name: fr.t(($) => $.feed.more) })).toBeBusy()
  })
})

describe('ExploreScreen, following an author from a card of « Récents »', () => {
  const follow = (name: string) => fr.t(($) => $.follow.member, { name })
  const following = (name: string) => fr.t(($) => $.follow.memberFollowing, { name })

  it('offers « Suivre Nora » on the cards of other authors', async () => {
    await renderExplore()

    const chip = screen.getByRole('switch', { name: follow('Nora') })
    expect(chip).not.toBeChecked()
    expect(screen.getByRole('switch', { name: follow('Max') })).toBeTruthy()
  })

  it('never offers to follow oneself', async () => {
    await renderExplore()

    // Témoin : sa carte est là, et les pastilles des autres aussi.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: follow('Nora') })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: follow('Léa') })).toBeNull()
    expect(screen.queryByRole('switch', { name: following('Léa') })).toBeNull()
  })

  it('puts no chip on the cards of the carousel', async () => {
    await renderExplore()

    // Témoin : le carrousel est là ; ses auteurs (Sam, Inès) n'ont pas de pastille (F-Fil8 :
    // « Récents » seulement).
    expect(screen.getByText('Sam')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: follow('Sam') })).toBeNull()
    expect(screen.queryByRole('switch', { name: follow('Inès') })).toBeNull()
  })

  it('follows Nora when touched, and then says « Tu suis Nora »', async () => {
    await renderExplore()

    await fireEvent.press(screen.getByRole('switch', { name: follow('Nora') }))

    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: 'u3' })
    expect(mockToggle).toHaveBeenCalledTimes(1)
    const chip = screen.getByRole('switch', { name: following('Nora') })
    expect(chip).toBeChecked()
    expect(screen.getByText(containing(following('Nora')))).toBeTruthy()
    // Max n'est pas concerné.
    expect(screen.getByRole('switch', { name: follow('Max') })).not.toBeChecked()
  })

  // Relecture de l'interface de R3 (C2) : un compte suspendu ne suit plus personne de nouveau
  // (tranche 7c) ; la pastille lui proposait un geste que l'API refuse, suivi d'un toast. Comme sur
  // la page d'un membre et celle d'un projet, elle n'est pas proposée.
  it('offers no « Suivre » chip to a suspended member', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    await renderExplore()

    // Témoin : les cartes de Nora et de Max sont là.
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    // Le profil (et sa suspension) arrive après le premier dessin.
    await waitFor(() => expect(screen.queryByRole('switch', { name: follow('Nora') })).toBeNull())
    expect(screen.queryByRole('switch', { name: follow('Max') })).toBeNull()
    expect(screen.queryByRole('switch', { name: following('Nora') })).toBeNull()
  })
})

// Relecture de design de R3 (#3) : Explorer en panne disait deux fois « Le fil n'a pas pu se
// charger », sous deux formes de « Réessayer ». Chaque section dit ce qui lui manque, dans une
// notice compacte, et propose « Réessayer » sous la même forme ; le reste de la page reste.
describe('ExploreScreen, when the sections cannot load', () => {
  const retry = fr.t(($) => $.common.retry)
  /** Un fil qui n'a pas pu se charger (useInfiniteQuery en erreur, sans page lue). */
  const failedFeed = () =>
    ({
      data: undefined,
      status: 'error',
      isPending: false,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error('500'),
      hasNextPage: false,
      isFetchingNextPage: false,
      isRefetching: false,
      fetchNextPage: jest.fn().mockResolvedValue(undefined),
      refetch: jest.fn().mockResolvedValue(undefined),
    }) as unknown as Feed

  const failAll = () => {
    const feeds = mockFeeds({ testers: failedFeed(), recent: failedFeed() })
    const toolsRefetch = jest.fn().mockResolvedValue(undefined)
    jest.mocked(useTools).mockReturnValue({
      data: undefined,
      status: 'error',
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('500'),
      refetch: toolsRefetch,
    } as unknown as ReturnType<typeof useTools>)
    return { ...feeds, toolsRefetch }
  }

  it('says in each section what could not load, never « Le fil n’a pas pu se charger »', async () => {
    failAll()
    await renderExplore()

    expect(screen.getByText(fr.t(($) => $.explore.testersError))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.explore.toolsError))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.explore.recentError))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.feed.errorTitle))).toBeNull()
    // Les titres des sections restent : on sait où l'on est.
    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.recent) })).toBeTruthy()
  })

  it('offers « Réessayer » in one form only, each retrying its own section', async () => {
    const { testers, recent, toolsRefetch } = failAll()
    await renderExplore()

    expect(screen.queryAllByRole('button', { name: retry })).toHaveLength(0)
    const links = screen.getAllByRole('link', { name: retry })
    expect(links).toHaveLength(3)
    // Dans l'ordre de la page : les testeurs, les outils, « Récents ».
    await fireEvent.press(links[0] as never)
    expect(testers.refetch).toHaveBeenCalledTimes(1)
    await fireEvent.press(links[1] as never)
    expect(toolsRefetch).toHaveBeenCalledTimes(1)
    await fireEvent.press(links[2] as never)
    expect(recent.refetch).toHaveBeenCalledTimes(1)
  })
})

// Correction C2 de R6a (relecture de l'interface, ui-C3) : les nouveautés de « Récents » ne comptent
// jamais les projets du membre lui-même (décision de Louis du 8/11/2026, comme dans son fil). Le
// calcul (`useFeedNews`) a ses tests dans feed/api ; ici, l'écran lui donne bien l'identifiant du
// membre connecté, et ne calcule rien tant qu'il n'y a pas de membre (visiteur, session en lecture).
describe('ExploreScreen, the news of « Récents » and the member’s own projects', () => {
  /** Les appels des nouveautés de « Récents » (le fil « discover »), avec le membre donné. */
  const recentNewsViewers = () =>
    jest
      .mocked(useFeedNews)
      .mock.calls.filter(([kind]) => kind === 'discover')
      .map((call) => call[3])

  it('hands the member’s id to the news of « Récents », so her projects never count', async () => {
    await renderExplore()

    // « Récents » contient un projet de Léa (fromLea) : sans son identifiant, il compterait.
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    const viewers = recentNewsViewers()
    expect(viewers.length).toBeGreaterThan(0)
    expect(new Set(viewers)).toEqual(new Set(['u1']))
  })

  it('computes no news of « Récents » for a visitor', async () => {
    mockSession(null)
    await renderExplore()

    // Témoin : la page réservée aux membres, avec « Me connecter ».
    expect(linkOrButton(/Me connecter/)).toBeTruthy()
    expect(recentNewsViewers()).toEqual([])
  })

  it('computes no news of « Récents » while the session is being read', async () => {
    mockSession(null, true)
    await renderExplore()

    // Témoin : ni la page ni « Récents » ne sont dessinés pendant la lecture de la session.
    expect(screen.queryByText(fr.t(($) => $.explore.recent))).toBeNull()
    expect(recentNewsViewers()).toEqual([])
  })
})

// --- R6b : les catégories en filtre, au-dessus de « Récents » ---

const GROUP = fr.t(($) => $.explore.categoriesLabel)
const ALL = fr.t(($) => $.explore.allCategories)
const ANIMALS = categoryName('animals')

/** Le nom lu d'une pastille commence par celui de sa catégorie (« Cuisine », ou « Cuisine, 3 projets »). */
const pillName = (name: string) =>
  new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$)`)

/** Les noms lus des pastilles de la rangée, dans l'ordre. */
const pillNames = async () => {
  const group = await screen.findByLabelText(GROUP)
  return within(group)
    .getAllByRole('radio')
    .map((radio) => String(radio.props.accessibilityLabel))
}

/** Un projet de Nora classé « Animaux », plus ancien que tous ceux de « Récents ». */
const fromAnimals: FeedItem = {
  kind: 'project',
  at: '2026-09-01T08:00:00.000Z',
  project: summaryOf({
    ...recipesProject,
    id: '7a2d3b9f-4c5e-4d6f-8a71-8b9c0d1e2f30',
    author: nora,
    title: 'Le chat qui parle',
    primaryCategory: 'animals',
    secondaryCategory: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    isMine: false,
  }),
}

/** Vrai si le premier élément est avant le second dans l'ordre de lecture (l'arbre rendu). */
const readBefore = (first: unknown, second: unknown) => {
  type TreeNode = { children: (TreeNode | string)[] }
  const order: unknown[] = []
  const walk = (node: TreeNode) => {
    order.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as TreeNode)
  return order.indexOf(first) < order.indexOf(second)
}

/** La page hydratée, pendant le test (le pré-rendu du web est fini). */
const hydrate = () =>
  act(() => {
    mockHydration.done = true
    for (const listener of mockHydration.listeners) listener()
  })

describe('ExploreScreen, the categories above « Récents » (R6b)', () => {
  it('shows « Toutes », then each category that has a project, in the order of the publish sheet, above « Récents »', async () => {
    await renderExplore()

    const names = await pillNames()
    expect(names[0]).toBe(ALL)
    expect(names.slice(1)).toHaveLength(4)
    const expected = ['cooking', 'animals', 'science', 'other'].map((code) => categoryName(code))
    names.slice(1).forEach((name, index) => {
      expect(name).toMatch(pillName(expected[index] as string))
    })
    // Une catégorie sans projet visible (Musique) n'a pas de pastille.
    expect(screen.queryByRole('radio', { name: pillName(categoryName('music')) })).toBeNull()
    expect(screen.getByRole('radio', { name: ALL, checked: true })).toBeTruthy()
    // Au-dessus des cartes de « Récents ».
    const group = screen.getByLabelText(GROUP)
    expect(readBefore(group, screen.getByRole('link', { name: 'Le carnet de jardin' }))).toBe(true)
    // Toutes, au départ : « Récents » n'est pas filtré.
    expect(recentCategories().every((category) => category === null)).toBe(true)
  })

  it('keeps only the projects of « Animaux » once touched, and writes ?category=animals in the address', async () => {
    mockFeeds({ byCategory: { animals: infiniteResult([fromAnimals]) } })
    await renderExplore()

    await fireEvent.press(await screen.findByRole('radio', { name: pillName(ANIMALS) }))

    expect(recentCategories().at(-1)).toBe('animals')
    expect(screen.getByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Le carnet de jardin' })).toBeNull()
    expect(screen.getByRole('radio', { name: pillName(ANIMALS), checked: true })).toBeTruthy()
    // L'adresse garde le filtre, sans page de plus dans l'historique.
    expect(mockAddress.params.category).toBe('animals')
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('removes the filter with « Toutes »', async () => {
    mockAddress.params = { category: 'animals' }
    mockFeeds({ byCategory: { animals: infiniteResult([fromAnimals]) } })
    await renderExplore()
    // Témoin : la page s'ouvre filtrée par l'adresse.
    expect(await screen.findByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()

    await fireEvent.press(await screen.findByRole('radio', { name: ALL }))

    expect(mockAddress.params.category).toBeUndefined()
    expect(recentCategories().at(-1)).toBeNull()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
  })

  it('reads ?category= from the address only once hydrated', async () => {
    mockHydration.done = false
    mockAddress.params = { category: 'animals' }
    mockFeeds({ byCategory: { animals: infiniteResult([fromAnimals]) } })
    await renderExplore()

    // Pré-rendu : la page ne connaît pas encore l'adresse ; rien n'est lu filtré.
    expect(recentCategories()).not.toContain('animals')
    await hydrate()

    expect(recentCategories().at(-1)).toBe('animals')
    expect(
      await screen.findByRole('radio', { name: pillName(ANIMALS), checked: true }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()
  })

  it('ignores a malformed ?category= instead of showing an error', async () => {
    mockAddress.params = { category: 'Animaux !' }
    await renderExplore()

    expect(await screen.findByRole('radio', { name: ALL, checked: true })).toBeTruthy()
    expect(recentCategories().every((category) => category === null)).toBe(true)
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.explore.recentError))).toBeNull()
  })

  it('says « Aucun projet dans « Animaux » pour l’instant. » when the category has no project', async () => {
    mockAddress.params = { category: 'animals' }
    mockFeeds({ byCategory: { animals: infiniteResult([]) } })
    await renderExplore()

    expect(
      await screen.findByText(containing(fr.t(($) => $.explore.categoryEmpty, { name: ANIMALS }))),
    ).toBeTruthy()
    expect(screen.queryByText(containing(fr.t(($) => $.feed.discoverEmpty)))).toBeNull()
  })

  it('keeps a way to remove ?category= when the categories fail to load', async () => {
    network.categories = () => Promise.reject(new Error('500'))
    mockAddress.params = { category: 'animals' }
    mockFeeds({ byCategory: { animals: infiniteResult([fromAnimals]) } })
    await renderExplore()

    // Les catégories ne se lisent pas : la section le dit, et le filtre de l'adresse reste appliqué.
    expect(await screen.findByText(fr.t(($) => $.explore.categoriesError))).toBeTruthy()
    expect(recentCategories().at(-1)).toBe('animals')
    // Un moyen de revenir à tous les projets : « Toutes », ou « Voir tous les projets ».
    const clear = fr.t(($) => $.tool.clearFilters)
    const remover =
      screen.queryByRole('radio', { name: ALL }) ??
      screen.queryByRole('button', { name: ALL }) ??
      screen.queryByRole('link', { name: ALL }) ??
      screen.queryByRole('button', { name: clear }) ??
      screen.getByRole('link', { name: clear })
    await fireEvent.press(remover)

    expect(mockAddress.params.category).toBeUndefined()
    expect(recentCategories().at(-1)).toBeNull()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
  })

  it('reads the categories once from the API (witness of the fake network)', async () => {
    await renderExplore()

    await screen.findByLabelText(GROUP)
    expect(categoryReads()).toBe(1)
  })
})

// R6b (relecture du plan, ui-reviewer) : quand seul le filtre change, la liste change entière ;
// les nouveautés de « Récents » ne doivent pas la comparer au fil sans filtre (« 2 nouveaux
// projets » annoncés à tort). Ici, les vrais hooks des fils, sur le faux réseau : le fil sans
// filtre a deux projets plus récents que le seul projet « Animaux ».
describe('ExploreScreen, the news of « Récents » under a category filter (real feed hooks)', () => {
  const pageOf = (items: FeedItem[]): DiscoverFeedPage => ({
    items,
    nextCursor: null,
    followedAuthorIds: [],
  })

  beforeEach(() => {
    const actual = jest.requireActual('../feed/api') as typeof FeedApi
    jest.mocked(useDiscoverFeed).mockImplementation(actual.useDiscoverFeed)
    jest.mocked(useFeedNews).mockImplementation(actual.useFeedNews)
    network.feed = (params) =>
      params.get('testers') === 'true'
        ? pageOf([cafes, quiz])
        : params.get('category') === 'animals'
          ? pageOf([fromAnimals])
          : pageOf([fromNora, fromMax, fromLea])
  })

  it('announces no new items when only the category filter changes', async () => {
    await renderExplore()
    // Témoin : « Récents » sans filtre, sans nouveauté.
    expect(await screen.findByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()

    await fireEvent.press(await screen.findByRole('radio', { name: pillName(ANIMALS) }))
    expect(await screen.findByRole('link', { name: 'Le chat qui parle' })).toBeTruthy()
    // Laisse aux lectures du fil et de sa tête le temps de répondre.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(screen.queryByRole('button', { name: /nouve/ })).toBeNull()
    expect(screen.queryByText(/nouve/, { includeHiddenElements: true })).toBeNull()
  })
})
