// Tests du Fil des ruches ajoutés après les relectures de R10 (interface 1 et 2, design 4, et les
// nouveautés sous une pastille, notées au plan) :
// - les ruches lues après le Fil ne le démontent pas et ne font pas descendre ses cartes : le Fil
//   attend ses ruches (son squelette), puis se montre avec ses pastilles ; une lecture ratée ne le
//   retient pas ;
// - sur ordinateur, la colonne de droite attend aussi : « Tes ruches » ne pousse plus les proches
//   à suivre vers le bas en arrivant.
//
// Le faux serveur est celui de Hives.testkit.tsx, branché sur `fetch` : les vrais hooks de
// `feed/api.ts` et de `hives/api.ts` tournent, comme dans HomeScreen.hives.test.tsx.
import type { FeedItem, FollowingFeedPage, ProjectSummary } from '@ruche/contracts'
import { act, screen, waitFor } from '@testing-library/react-native'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import {
  biscotte,
  heldReply,
  hiveId,
  hiveServer,
  hoursAgo,
  lea,
  memo,
  myHives,
  planDeTable,
} from './Hives.testkit'
import { HomeScreen } from './HomeScreen'
import { fiveSuggested } from './HomeScreen.testkit'

/** L'adresse du Fil (`/?hive=<id>`) et les gestes du routeur, comme dans HomeScreen.hives.test. */
const mockRoute = {
  params: {} as Record<string, string | undefined>,
  listeners: new Set<() => void>(),
  calls: [] as { method: string; href: unknown }[],
  set(next: Record<string, string | undefined>) {
    this.params = next
    for (const listener of this.listeners) listener()
  },
}

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/NotificationBell', () => ({ NotificationBell: () => null }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))
jest.mock('expo-router', () => {
  const { useSyncExternalStore } = require('react') as typeof import('react')
  const go = (method: string) => (href: unknown) => {
    mockRoute.calls.push({ method, href })
    if (typeof href === 'string') {
      const url = new URL(href, 'https://app.example')
      if (url.pathname === '/') mockRoute.set(Object.fromEntries(url.searchParams))
      return
    }
    const { pathname, params = {} } = href as { pathname: string; params?: Record<string, string> }
    if (pathname === '/') mockRoute.set({ ...params })
  }
  const router = {
    push: go('push'),
    replace: go('replace'),
    navigate: go('navigate'),
    back: () => {},
    dismiss: () => {},
    canGoBack: () => true,
    setParams: (next: Record<string, string | undefined>) => {
      mockRoute.calls.push({ method: 'setParams', href: next })
      mockRoute.set({ ...mockRoute.params, ...next })
    },
  }
  const subscribe = (listener: () => void) => {
    mockRoute.listeners.add(listener)
    return () => mockRoute.listeners.delete(listener)
  }
  const useParams = () => useSyncExternalStore(subscribe, () => mockRoute.params)
  return {
    useRouter: () => router,
    usePathname: () => '/',
    useLocalSearchParams: useParams,
    useGlobalSearchParams: useParams,
    useSegments: () => [],
    useNavigation: () => ({
      addListener: () => () => {},
      removeListener: () => {},
      isFocused: () => true,
      setOptions: () => {},
      getParent: () => undefined,
    }),
    useFocusEffect: () => {},
  }
})

const itemOf = (project: ProjectSummary, hours: number): FeedItem => ({
  kind: 'project',
  at: hoursAgo(hours),
  project,
})

const ok = (body: unknown) => ({ status: 200, body })
const FOLLOWING = /^\/v1\/feed\/following$/
const MINE = /^\/v1\/hives$/

let all: FollowingFeedPage
let famille: FollowingFeedPage

beforeEach(() => {
  hiveServer.reset()
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    hiveServer.fetch(String(input), init),
  ) as typeof fetch
  all = { items: [itemOf(memo, 1)], nextCursor: null, followsAnyone: true, lastReadAt: null }
  famille = {
    items: [itemOf(planDeTable, 2), itemOf(biscotte, 5)],
    nextCursor: null,
    followsAnyone: true,
    lastReadAt: hoursAgo(3),
  }
  hiveServer.answer('GET', FOLLOWING, ({ query }) => {
    const hive = query.get('hive')
    if (!hive) return ok(all)
    return hive === hiveId ? ok(famille) : ok({ ...famille, items: [], lastReadAt: null })
  })
  hiveServer.answer('GET', /^\/v1\/feed\/discover$/, () => ok({ items: [], nextCursor: null }))
  hiveServer.answer('PUT', /^\/v1\/feed\/read$/, () => ({ status: 204 }))
  hiveServer.answer('GET', /^\/v1\/suggestions\/members$/, () =>
    ok({ members: fiveSuggested.slice(0, 2) }),
  )
  mockRoute.params = {}
  mockRoute.listeners.clear()
  mockRoute.calls = []
  mockSession({ user: { id: lea.id, name: lea.name } })
})

const TEXT = {
  pills: fr.t(($) => $.hives.pills.label),
  side: fr.t(($) => $.hives.side),
  suggestionsSide: fr.t(($) => $.feed.side.suggestions),
}

const renderHome = () =>
  renderWithProviders(
    <ToastProvider>
      <HomeScreen />
    </ToastProvider>,
  )

/** Le Fil « Tout » a été lu (sa réponse est partie). */
const feedRead = () =>
  waitFor(() =>
    expect(
      hiveServer.received('GET', FOLLOWING).filter((one) => !one.query.get('hive')).length,
    ).toBeGreaterThan(0),
  )

describe('the hives read after the feed (R10, review)', () => {
  it('shows the skeleton of the feed until the hives are read, then the cards under the pills', async () => {
    const held = heldReply()
    hiveServer.answer('GET', MINE, () => held.reply)
    await renderHome()
    await feedRead()

    // Le Fil est lu, mais pas ses ruches : aucune carte encore, qui descendrait sous les pastilles.
    await act(async () => {})
    expect(screen.queryByRole('link', { name: memo.title })).toBeNull()

    await held.release(ok(myHives))

    expect(await screen.findByRole('link', { name: memo.title })).toBeTruthy()
    expect(screen.getByLabelText(TEXT.pills)).toBeTruthy()
  })

  it('shows the feed without pills when the hives cannot be read', async () => {
    hiveServer.answer('GET', MINE, () => ({
      status: 500,
      body: { error: { code: 'internal', message: '' } },
    }))
    await renderHome()

    expect(await screen.findByRole('link', { name: memo.title })).toBeTruthy()
    expect(screen.queryByLabelText(TEXT.pills)).toBeNull()
  })

  it('holds the right column until the hives are read, on a computer', async () => {
    const restore = setDesktopWindow()
    try {
      const held = heldReply()
      hiveServer.answer('GET', MINE, () => held.reply)
      await renderHome()
      await feedRead()
      await act(async () => {})

      // Les proches à suivre ne se montrent pas avant « Tes ruches », qui les pousserait.
      expect(screen.queryByRole('header', { name: TEXT.suggestionsSide })).toBeNull()

      await held.release(ok(myHives))

      expect(await screen.findByRole('header', { name: TEXT.side })).toBeTruthy()
      expect(await screen.findByRole('header', { name: TEXT.suggestionsSide })).toBeTruthy()
    } finally {
      await act(async () => restore())
    }
  })
})
