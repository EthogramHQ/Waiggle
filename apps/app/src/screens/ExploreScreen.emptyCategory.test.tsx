// Tests d'Explorer quand la catégorie choisie n'a aucun projet (R6b, relecture de design C4) : sous
// « Aucun projet dans « Animaux » pour l'instant. », un bouton « Voir tous les projets » retire le
// filtre, comme sur la page d'un outil : on ne reste jamais coincé dans une catégorie vide. Le
// bouton disparaît avec le filtre : le focus va au titre « Récents », juste au-dessus de la liste
// revenue, au lieu de se perdre.
//
// Fichier à part d'ExploreScreen.test.tsx (correction KC) : les mêmes faux modules, réduits à ce
// que cette page vide lit.
import type { FeedItem, FeedPage, ToolList } from '@ruche/contracts'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { request } from '../api/client'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { categoryList, categoryName } from '../testing/categories'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))
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
const mockSetParams = jest.fn()
const mockReplace = jest.fn()
/** L'adresse de la page : `setParams` et `replace` la changent, l'écran se redessine. */
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
jest.mock('expo-router', () => {
  const { createElement, useSyncExternalStore } = require('react')
  const { Text } = require('react-native')
  return {
    usePathname: () => '/explore',
    useRouter: () => ({
      push: jest.fn(),
      replace: mockReplace,
      navigate: jest.fn(),
      setParams: mockSetParams,
      back: jest.fn(),
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => useSyncExternalStore(mockAddress.subscribe, mockAddress.read),
    Link: ({ href, children, ...rest }: { href: string; children: unknown }) =>
      createElement(Text, { role: 'link', href, ...rest }, children),
  }
})

const ANIMALS = categoryName('animals')
const SEE_ALL = fr.t(($) => $.explore.seeAllProjects)
const RECENT = fr.t(($) => $.explore.recent)

/** Ce que renvoie un useInfiniteQuery de React Query (comme dans ExploreScreen.test.tsx). */
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

const fromNora: FeedItem = {
  kind: 'project',
  at: recipesProject.createdAt,
  project: summaryOf({
    ...recipesProject,
    id: '9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52',
    author: { id: 'u3', name: 'Nora', avatarUrl: null },
    title: 'Le carnet de jardin',
    isMine: false,
  }),
}

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockAddress.params = { category: 'animals' }
  mockSetParams.mockReset().mockImplementation((next: Record<string, string | undefined>) => {
    const merged: Record<string, string> = {}
    for (const [key, value] of Object.entries({ ...mockAddress.params, ...next }))
      if (value !== undefined && value !== '') merged[key] = value
    mockAddress.set(merged)
  })
  mockReplace.mockReset().mockImplementation((href: unknown) => {
    const path = pathOf(href)
    if (path.startsWith('/explore')) {
      const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
      mockAddress.set(Object.fromEntries(new URLSearchParams(query)))
    }
  })
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation((async (path: string) => {
      const url = new URL(path, 'https://api.example.test')
      if (url.pathname === '/v1/categories')
        return { ok: true, data: categoryList('fr', { cooking: 3, animals: 0 }) }
      return { ok: false, error: 'internal' }
    }) as typeof request)
  // « Récents » filtré sur Animaux : vide ; sans filtre : le projet de Nora ; les testeurs : rien.
  jest
    .mocked(useDiscoverFeed)
    .mockReset()
    .mockImplementation((options) => {
      const { testers, category } = options as { testers?: boolean; category?: string | null }
      const items = testers || category ? [] : [fromNora]
      return infiniteResult(items) as unknown as ReturnType<typeof useDiscoverFeed>
    })
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

describe('ExploreScreen, a category without any project', () => {
  it('offers « Voir tous les projets » under the empty message', async () => {
    await renderWithProviders(<ExploreScreen />)

    expect(
      await screen.findByText(containing(fr.t(($) => $.explore.categoryEmpty, { name: ANIMALS }))),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: SEE_ALL })).toBeTruthy()
  })

  it('removes the filter, shows every project again and moves the focus to « Récents »', async () => {
    await renderWithProviders(<ExploreScreen />)
    const button = await screen.findByRole('button', { name: SEE_ALL })
    const announce = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    announce.mockClear()
    try {
      await fireEvent.press(button)

      expect(mockAddress.params.category).toBeUndefined()
      expect(await screen.findByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy()
      await waitFor(() => expect(screen.queryByRole('button', { name: SEE_ALL })).toBeNull())
      // Le bouton parti, le lecteur d'écran est posé sur le titre de la section.
      const focused = announce.mock.calls
        .filter(([, event]) => event === 'focus')
        .map(([node]) => (node as unknown as { props: { children?: unknown } }).props.children)
      expect(focused.at(-1)).toBe(RECENT)
    } finally {
      announce.mockRestore()
    }
  })

  it('shows no such button without a filter', async () => {
    mockAddress.params = {}
    await renderWithProviders(<ExploreScreen />)

    expect(await screen.findByRole('link', { name: 'Le carnet de jardin' })).toBeTruthy() // témoin
    expect(screen.queryByRole('button', { name: SEE_ALL })).toBeNull()
  })
})
