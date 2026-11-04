// Le kit commun des tests de l'écran d'accueil (HomeScreen.*.test.tsx) : les faux fils, les
// fausses nouveautés, les proches à suivre, la remise à zéro des faux modules et les aides qui lisent
// l'écran. Il n'a pas le suffixe `.test` : Jest ne le prend donc pas pour une suite à lancer.
//
// Les `jest.mock` ne sont pas ici : Jest remonte chaque `jest.mock` en tête du fichier où il est
// écrit, avant ses imports, et ne remplace un module que pour ce fichier de test. Chaque fichier de
// test écrit donc les siens ; les fausses fonctions qu'ils prêtent (`mockPush`, `mockScreenProps`)
// vivent ici, et leur nom commence par `mock`, le seul que Jest accepte dans un `jest.mock`.
import type {
  FeedItem,
  FeedPage,
  FollowingFeedPage,
  Project,
  ProjectSummary,
  SuggestedMember,
} from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { useDiscoverFeed, useFeedNews, useFollowingFeed, useMarkFeedRead } from '../feed/api'
import { useFollow } from '../follows/api'
import { useUnreadCount } from '../notifications/api'
import { getMe } from '../profile/api'
import { useDismissSuggestion, useSuggestions } from '../suggestions/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import { HomeScreen } from './HomeScreen'

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
export const mockScreenProps: Record<string, unknown>[] = []
/** La navigation : chaque `router.push` de l'écran est noté ici. */
export const mockPush = jest.fn()

// --- De faux fils ---

/** Un élément du fil : un nouveau projet, devenu public à cette date. */
export const itemOf = (project: Project, at = project.createdAt): FeedItem => ({
  kind: 'project',
  at,
  project: summaryOf(project),
})
export const fromLea = itemOf(recipesProject)
export const fromMax = itemOf({
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  author: { id: 'u2', name: 'Max', avatarUrl: null },
  title: 'Le tri des photos',
  status: 'idea',
})
export const fromZoe = itemOf({
  ...recipesProject,
  id: '9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52',
  author: { id: 'u3', name: 'Zoé', avatarUrl: null },
  title: 'Le carnet de jardin',
})

/**
 * Ce que renvoie un useInfiniteQuery de React Query : les pages déjà reçues, et de quoi lire la
 * suite (fetchNextPage) ou tout relire depuis le début (refetch).
 */
export const infiniteResult = <Page,>(
  pages: Page[],
  { hasNextPage = false, isFetchingNextPage = false } = {},
) => ({
  data: { pages, pageParams: pages.map(() => undefined) },
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

export const mockFollowing = (
  page: Partial<FollowingFeedPage> = {},
  options?: { hasNextPage?: boolean; isFetchingNextPage?: boolean },
) => {
  const result = infiniteResult<FollowingFeedPage>(
    [
      {
        items: [fromLea, fromMax],
        nextCursor: null,
        followsAnyone: true,
        lastReadAt: null,
        ...page,
      },
    ],
    options,
  )
  jest
    .mocked(useFollowingFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useFollowingFeed>)
  return result
}

export const mockDiscover = (
  page: Partial<FeedPage> = {},
  options?: { hasNextPage?: boolean; isFetchingNextPage?: boolean },
) => {
  const result = infiniteResult<FeedPage>(
    [{ items: [fromZoe, fromMax, fromLea], nextCursor: null, ...page }],
    options,
  )
  jest
    .mocked(useDiscoverFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useDiscoverFeed>)
  return result
}

/**
 * Les nouveautés (R4, F-Fil4) : leur nombre, s'il y en a plus qu'une page, les photos de leurs
 * auteurs (trois au plus) et leurs sortes, qui choisissent le texte du bouton.
 */
export type News = ReturnType<typeof useFeedNews>
export const mockNews = (news: Pick<News, 'count'> & Partial<News>) =>
  jest.mocked(useFeedNews).mockReturnValue({ more: false, authors: [], kinds: [], ...news })

// --- R4 : les proches à suivre ---

/** L'auteur d'un projet tel que le contrat le donne (photo, nom), sans type exporté à part. */
export type ProjectAuthor = ProjectSummary['author']

export const nora: ProjectAuthor = {
  id: 'u4',
  name: 'Nora',
  avatarUrl: 'https://media.example.com/nora.jpg',
}
export const sam: ProjectAuthor = {
  id: 'u5',
  name: 'Sam',
  avatarUrl: 'https://media.example.com/sam.jpg',
}

/** Un membre suggéré, avec son dernier projet public. */
export const suggested = (
  author: ProjectAuthor,
  projectId: string,
  title: string,
): SuggestedMember => ({
  ...author,
  latestProject: summaryOf({ ...recipesProject, id: projectId, author, title }),
})
export const fiveSuggested: SuggestedMember[] = [
  suggested(nora, 'b1000000-0000-4000-8000-000000000001', 'Carnet de cafés'),
  suggested(sam, 'b1000000-0000-4000-8000-000000000002', 'Le quiz des capitales'),
  suggested(
    { id: 'u6', name: 'Hugo', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000003',
    'Le planning du club',
  ),
  suggested(
    { id: 'u8', name: 'Jade', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000004',
    'La météo du potager',
  ),
  suggested(
    { id: 'u10', name: 'Malo', avatarUrl: null },
    'b1000000-0000-4000-8000-000000000005',
    'Le lexique breton',
  ),
]

/** Ce que renvoie un useQuery réussi de React Query, ici pour la liste des proches à suivre. */
export const mockSuggestions = (members: SuggestedMember[]) => {
  const result = {
    data: { members },
    status: 'success',
    isPending: false,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  }
  jest
    .mocked(useSuggestions)
    .mockReturnValue(result as unknown as ReturnType<typeof useSuggestions>)
  return result
}
export const mockToggle = jest.fn()
export const mockDismiss = jest.fn()

/**
 * Remet les faux modules dans leur état de départ : un visiteur, un fil de deux projets (Léa,
 * Max), rien de neuf, cinq proches à suivre. Chaque fichier l'appelle dans son `beforeEach`.
 */
export const resetHomeMocks = () => {
  mockSession(null)
  mockPush.mockReset()
  mockScreenProps.length = 0
  jest.mocked(useFollowingFeed).mockReset()
  jest.mocked(useDiscoverFeed).mockReset()
  jest.mocked(useFeedNews).mockReset()
  jest.mocked(useMarkFeedRead).mockReset()
  jest.mocked(useUnreadCount).mockReset().mockReturnValue(0)
  // Tranche 7c : le profil, lu pour savoir si le compte est suspendu ; Léa ne l'est pas.
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockFollowing()
  mockDiscover()
  mockNews({ count: null })
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockDismiss.mockReset().mockResolvedValue({ ok: true, data: null })
  jest.mocked(useDismissSuggestion).mockReset().mockReturnValue({ dismiss: mockDismiss })
  jest.mocked(useSuggestions).mockReset()
  mockSuggestions(fiveSuggested)
}

/** Affiche l'accueil d'un membre connecté, Léa. */
export const renderMemberHome = async () => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  return renderWithI18n(<HomeScreen />)
}

// --- Tranche R4 : le fil et les cartes (docs/scenarios/refonte.md, R4) ---

/** Le texte tel que l'écran le montre : les espaces insécables de fr.ts lus comme des espaces. */
export const shown = (text: string) => text.replace(/\s+/g, ' ')

/** Une date d'octobre 2026, à midi. */
export const october = (day: string) => `2026-10-${day}T12:00:00.000Z`

/** Un nouveau projet du fil, devenu public à cette date, avec ou sans lien de démo. */
export const projectItem = (
  id: string,
  title: string,
  author: ProjectAuthor,
  at: string,
  demoUrl: string | null = null,
): FeedItem => ({
  kind: 'project',
  at,
  project: summaryOf({ ...recipesProject, id, title, author, demoUrl, createdAt: at }),
})

// Quatre projets, du plus récent au plus ancien. La dernière lecture du fil date du 15 octobre à
// midi : le tri des photos, publié à cette heure exacte, est le premier élément déjà vu (`at ≤
// lastReadAt`).
export const LAST_READ = october('15')
export const cafes = projectItem(
  'c1000000-0000-4000-8000-000000000001',
  'Carnet de cafés',
  nora,
  october('20'),
)
export const quiz = projectItem(
  'c1000000-0000-4000-8000-000000000002',
  'Le quiz des capitales',
  sam,
  october('18'),
)
export const photos = projectItem(
  'c1000000-0000-4000-8000-000000000003',
  'Le tri des photos',
  { id: 'u2', name: 'Max', avatarUrl: null },
  LAST_READ,
)
export const garden = projectItem(
  'c1000000-0000-4000-8000-000000000004',
  'Le carnet de jardin',
  { id: 'u3', name: 'Zoé', avatarUrl: null },
  october('10'),
)

/** Plusieurs pages du fil déjà reçues (« Afficher la suite » touché). */
export const mockFollowingPages = (
  pages: Partial<FollowingFeedPage>[],
  options?: { hasNextPage?: boolean },
) => {
  const result = infiniteResult<FollowingFeedPage>(
    pages.map((page) => ({
      items: [],
      nextCursor: null,
      followsAnyone: true,
      lastReadAt: null,
      ...page,
    })),
    options,
  )
  jest
    .mocked(useFollowingFeed)
    .mockReturnValue(result as unknown as ReturnType<typeof useFollowingFeed>)
  return result
}

/** Le titre de la sphère « Tu es à jour ». */
export const upToDate = () =>
  screen.getByRole('header', { name: fr.t(($) => $.feed.upToDate.title) })
export const queryUpToDate = () =>
  screen.queryByRole('header', { name: fr.t(($) => $.feed.upToDate.title) })
/** Le lien d'une carte du fil, nommé par le titre du projet. */
export const card = (title: string) => screen.getByRole('link', { name: title })
/**
 * La liste qui contient cette carte, en remontant depuis son lien. `getByRole('list')` ne trouve
 * qu'un conteneur `accessible`, que la charte interdit (VoiceOver n'atteindrait plus les cartes).
 */
export type Element = ReturnType<typeof screen.getByRole>
export const listAround = (start: Element): Element | null => {
  let node: Element | null = start
  while (node && node.props.accessibilityRole !== 'list' && node.props.role !== 'list') {
    node = node.parent
  }
  return node
}

// L'ordre de lecture : l'arbre rendu, parcouru de haut en bas (RNTL 14 n'a plus `findAll`).
export type Node = { props: Record<string, unknown>; children: (Node | string)[] }
export const nodesInOrder = (): Node[] => {
  const nodes: Node[] = []
  const walk = (node: Node) => {
    nodes.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as Node)
  return nodes
}
/** Vrai si `first` vient avant `second` dans la page (les deux doivent y être). */
export const comesBefore = (first: unknown, second: unknown) => {
  const nodes = nodesInOrder()
  const a = nodes.indexOf(first as Node)
  const b = nodes.indexOf(second as Node)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}
