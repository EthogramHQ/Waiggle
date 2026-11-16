// Tests de la pastille « Exemple » dans les résultats de projet de la recherche (tranche R12b,
// « Les exemples ») : la ligne d'un projet d'un compte d'exemples porte « Exemple » sous sa
// pastille de statut, et son nom lu (qui cache les textes de la ligne) la dit après le statut :
// « Le carnet des plantes, Testable, Exemple ». Un projet ordinaire n'a rien de plus. Les faux
// (le hook de recherche, le réseau des catégories, le routeur) sont ceux de SearchScreen.test.tsx.
import type { SearchProject, SearchResults } from '@ruche/contracts'
import { screen } from '@testing-library/react-native'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { useSearch } from '../search/api'
import { categoryList } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { exampleProject, recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SearchScreen } from './SearchScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../search/api', () => ({ useSearch: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/search',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({ q: 'carn' }),
}))

const EXAMPLE = fr.t(($) => $.common.example)
const TESTABLE = fr.t(($) => $.project.status.testable)

const hit = (project: typeof recipesProject, title: string): SearchProject => ({
  ...summaryOf({ ...project, isMine: false, status: 'testable', title }),
  excerpt: null,
})
const plants = hit(exampleProject, 'Le carnet des plantes')
const cafes = hit(recipesProject, 'Carnet de cafés')

const answered = (projects: SearchProject[]) =>
  ({
    data: {
      projects: { items: projects, more: false },
      members: { items: [], more: false },
      tools: { items: [], more: false },
    } satisfies SearchResults,
    status: 'success',
    fetchStatus: 'idle',
    isPending: false,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  }) as unknown as ReturnType<typeof useSearch>

/** Les éléments de l'arbre, dans l'ordre de lecture (en profondeur d'abord). */
type TreeNode = { props: Record<string, unknown>; children: (TreeNode | string)[] }
const nodesOf = (node: TreeNode): TreeNode[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]

let projects: SearchProject[] = []

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) =>
      path.startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr', {}) }
        : { ok: false, error: 'internal' }) as typeof request)
  jest
    .mocked(useSearch)
    .mockReset()
    .mockImplementation(() => answered(projects))
})

describe('the project results of the search, by the examples account (R12b)', () => {
  it('shows « Exemple » after the status of its row', async () => {
    projects = [plants, cafes]
    await renderWithProviders(<SearchScreen />)

    await screen.findByText(plants.title)
    // Une seule ligne d'exemples : une seule pastille.
    expect(screen.getAllByText(EXAMPLE)).toHaveLength(1)
    const order = nodesOf(screen.root as unknown as TreeNode)
    const at = (node: unknown) => order.indexOf(node as TreeNode)
    const [status] = screen.getAllByText(TESTABLE)
    expect(at(status)).toBeGreaterThanOrEqual(0)
    expect(at(screen.getByText(EXAMPLE))).toBeGreaterThan(at(status))
  })

  it('says « Exemple » in the name of its row, after the status', async () => {
    projects = [plants, cafes]
    await renderWithProviders(<SearchScreen />)

    await screen.findByText(plants.title)
    expect(
      screen.getByRole('link', { name: `${plants.title}, ${TESTABLE}, ${EXAMPLE}` }),
    ).toBeTruthy()
    // La ligne ordinaire garde son nom d'avant.
    expect(screen.getByRole('link', { name: `${cafes.title}, ${TESTABLE}` })).toBeTruthy()
  })

  it('shows no « Exemple » for an ordinary member', async () => {
    projects = [cafes]
    await renderWithProviders(<SearchScreen />)

    // Témoin : la ligne est là.
    expect(await screen.findByText(cafes.title)).toBeTruthy()
    expect(screen.queryAllByText(EXAMPLE)).toHaveLength(0)
  })
})
