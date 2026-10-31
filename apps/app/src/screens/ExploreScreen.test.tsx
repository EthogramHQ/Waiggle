// Tests de l'onglet Explorer (refonte, tranche R3, docs/scenarios/refonte.md, « Explorer ») : le
// titre, le champ qui ouvre la recherche, « Ils cherchent des testeurs » (un carrousel), « Outils
// populaires » et « Récents », qui reprend l'ancien fil « Découvrir » de l'accueil (ses tests
// viennent de HomeScreen.test.tsx). Les fils, les outils et le suivi sont de faux hooks, choisis
// par chaque test ; la barre du haut (TopNav) a ses propres tests et n'est pas dessinée ici.
import type {
  FeedItem,
  FeedPage,
  Project,
  ProjectSummary,
  ToolCount,
  ToolList,
} from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { hrefOf, pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
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
jest.mock('../feed/api', () => ({
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
// `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports. Un `Link`
// d'Expo Router devient un texte au rôle de lien, qui passe son adresse au faux `push`.
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

/** Ce que renvoie un useInfiniteQuery de React Query (comme dans HomeScreen.test.tsx). */
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

/** Les deux fils : celui des testeurs (carrousel) et celui de tous (« Récents »). */
const mockFeeds = ({
  testers = infiniteResult([cafes, quiz]),
  recent = infiniteResult([fromNora, fromMax, fromLea]),
}: {
  testers?: Feed
  recent?: Feed
} = {}) => {
  jest
    .mocked(useDiscoverFeed)
    .mockImplementation(
      ({ testers: wanted }) =>
        (wanted ? testers : recent) as unknown as ReturnType<typeof useDiscoverFeed>,
    )
  return { testers, recent }
}

// --- Les outils ---

/** Douze outils, du plus utilisé au moins utilisé (l'ordre de GET /v1/tools). */
const tools: ToolCount[] = [
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
].map(([slug, label, projectCount]) => ({
  slug: String(slug),
  label: String(label),
  projectCount: Number(projectCount),
}))

const mockTools = (list: ToolCount[] = tools) =>
  jest.mocked(useTools).mockReturnValue({
    data: { tools: list } satisfies ToolList,
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

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  for (const mock of [mockPush, mockReplace, mockNavigate, mockToggle]) mock.mockReset()
  jest.mocked(useDiscoverFeed).mockReset()
  jest.mocked(useFeedNews).mockReset().mockReturnValue({ count: null, more: false })
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

    expect(mockPush.mock.calls.map((call) => hrefOf(call[0]))).toContain(
      '/out?url=https://cafes.example.com',
    )
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

// Repris de HomeScreen.test.tsx (« the « discover » feed on the home screen ») : Découvrir est
// devenu « Récents » (F-Nav6). Le filtre « Cherchent des testeurs » est devenu le carrousel.
describe('ExploreScreen, « Récents »', () => {
  it('shows the public projects of every member', async () => {
    await renderExplore()

    expect(screen.getByRole('header', { name: fr.t(($) => $.explore.recent) })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    expect(useDiscoverFeed).toHaveBeenCalledWith(expect.objectContaining({ testers: false }))
    // Plus de choix « Tous / Cherchent des testeurs » : les catégories viendront en R6.
    expect(screen.queryByRole('radio', { name: fr.t(($) => $.feed.filter.testers) })).toBeNull()
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
})
