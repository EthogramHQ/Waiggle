// Tests ajoutés par l'interface (R6b) au filtre par catégorie de la recherche, en plus de ceux de
// SearchScreen.test.tsx : ce que l'écran fait de plus que la commande, chaque branchement prouvé en
// cassant sa ligne. Le focus rendu au bouton quand la feuille se ferme ; un code mal formé dans
// l'adresse, ignoré ; une catégorie choisie qui ne trouve rien, qu'on peut toujours retirer ; et
// l'onglet « Projets » vidé par le filtre, qui le dit. Mêmes faux que SearchScreen.test.tsx : le
// hook de l'API remplacé, GET /v1/categories servi par un faux réseau, une adresse « vivante ».
import type { CatalogueTool, SearchMember, SearchProject, SearchResults } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { useSearch } from '../search/api'
import { categoryList, categoryName } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { focusWithoutScroll } from '../ui/focus'
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
// Le vrai `focusWithoutScroll`, espionné : on lit à qui l'écran rend le focus.
jest.mock('../ui/focus', () => {
  const actual = jest.requireActual('../ui/focus')
  return { ...actual, focusWithoutScroll: jest.fn(actual.focusWithoutScroll) }
})
const mockSetParams = jest.fn()
const mockPush = jest.fn()
let mockParams: Record<string, string> = {}
const mockListeners = new Set<() => void>()
jest.mock('expo-router', () => {
  const { useSyncExternalStore } = require('react')
  return {
    usePathname: () => '/search',
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      navigate: jest.fn(),
      dismissTo: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
      setParams: mockSetParams,
    }),
    useLocalSearchParams: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockListeners.add(listener)
          return () => {
            mockListeners.delete(listener)
          }
        },
        () => mockParams,
      ),
  }
})

const cafes: SearchProject = {
  ...summaryOf({ ...recipesProject, id: '1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5', title: 'Carnet' }),
  excerpt: null,
}
const camille: SearchMember = {
  id: 'u7',
  name: 'Camille Carnot',
  handle: 'camille_ot',
  avatarUrl: null,
  followerCount: 12,
}
const carnivore: CatalogueTool = {
  slug: 'carnivore-ai',
  name: 'Carnivore AI',
  family: 'assistant',
  aliases: [],
  projectCount: 7,
}
const carnResults: SearchResults = {
  projects: { items: [cafes], more: false },
  members: { items: [camille], more: false },
  tools: { items: [carnivore], more: false },
}
const nothing: SearchResults = {
  projects: { items: [], more: false },
  members: { items: [], more: false },
  tools: { items: [], more: false },
}

const result = (data: SearchResults | undefined) =>
  ({
    data,
    status: data ? 'success' : 'pending',
    isPending: !data,
    isSuccess: Boolean(data),
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
  }) as unknown as ReturnType<typeof useSearch>

/** Le faux hook : sous 2 caractères, rien ; sinon `answer(catégorie)`. */
const answerWith = (answer: (category: string | undefined) => SearchResults) =>
  jest
    .mocked(useSearch)
    .mockImplementation((q: string, category?: string) =>
      q.trim().length >= 2 ? result(answer(category)) : result(undefined),
    )

const ALL = fr.t(($) => $.search.allCategories)
const COOKING = categoryName('cooking')
const chosen = (name: string) => fr.t(($) => $.search.categoryChosen, { name })
const pillName = (name: string) => new RegExp(`^${name}(,|$)`)
/** Le nom lu du dernier élément qui a reçu le focus (natif : les props de la vue). */
const lastFocused = () => {
  const node = jest.mocked(focusWithoutScroll).mock.calls.at(-1)?.[0] as
    | { props?: { accessibilityLabel?: string } }
    | undefined
  return node?.props?.accessibilityLabel
}

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockPush.mockReset()
  mockParams = { q: 'carn' }
  mockSetParams.mockReset().mockImplementation((next: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...mockParams, ...next }))
      if (typeof value === 'string' && value !== '') merged[key] = value
    mockParams = merged
    for (const listener of mockListeners) listener()
  })
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) =>
      path.startsWith('/v1/categories')
        ? { ok: true, data: categoryList('fr', { cooking: 3, animals: 1 }) }
        : { ok: false, error: 'internal' }) as typeof request)
  jest.mocked(useSearch).mockReset()
  answerWith(() => carnResults)
  jest.mocked(focusWithoutScroll).mockClear()
})

describe('SearchScreen, the category filter, beyond the order (R6b)', () => {
  it('gives the focus back to the filter button once a category is chosen', async () => {
    await renderWithProviders(<SearchScreen />)

    await fireEvent.press(await screen.findByRole('button', { name: ALL }))
    jest.mocked(focusWithoutScroll).mockClear()
    await fireEvent.press(await screen.findByRole('radio', { name: pillName(COOKING) }))

    await waitFor(() => expect(lastFocused()).toBe(chosen(COOKING)))
  })

  it('ignores a malformed ?category= instead of filtering on it', async () => {
    mockParams = { q: 'carn', category: 'Cuisine!' }
    await renderWithProviders(<SearchScreen />)

    expect(await screen.findByRole('button', { name: ALL })).toBeTruthy()
    // Jamais de second argument : la recherche part sans filtre.
    for (const call of jest.mocked(useSearch).mock.calls) expect(call).toHaveLength(1)
  })

  it('keeps the filter button when a chosen category finds nothing, to remove it', async () => {
    mockParams = { q: 'carn', category: 'cooking' }
    answerWith((category) => (category === 'cooking' ? nothing : carnResults))
    await renderWithProviders(<SearchScreen />)

    // Témoin : « Aucun résultat » est là.
    expect(
      await screen.findByText(containing(fr.t(($) => $.search.emptyTitle, { q: 'carn' }))),
    ).toBeTruthy()
    await fireEvent.press(await screen.findByRole('button', { name: chosen(COOKING) }))
    await fireEvent.press(await screen.findByRole('radio', { name: pillName(ALL) }))

    expect(mockParams).toEqual({ q: 'carn' })
    expect(await screen.findByText('Carnet')).toBeTruthy()
  })

  it('says so when the filter empties the « Projets » tab, and offers to see all the projects', async () => {
    mockParams = { q: 'carn', category: 'cooking' }
    answerWith((category) =>
      category === 'cooking'
        ? { ...carnResults, projects: { items: [], more: false } }
        : carnResults,
    )
    await renderWithProviders(<SearchScreen />)

    await fireEvent.press(await screen.findByRole('radio', { name: /^Projets/ }))
    expect(screen.getByText(fr.t(($) => $.tool.emptyFiltered))).toBeTruthy()
    jest.mocked(focusWithoutScroll).mockClear()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.tool.clearFilters) }))

    expect(mockParams).toEqual({ q: 'carn' })
    expect(await screen.findByText('Carnet')).toBeTruthy()
    // Le message disparaît avec le bouton touché : le focus va au bouton du filtre.
    expect(lastFocused()).toBe(ALL)
  })
})
