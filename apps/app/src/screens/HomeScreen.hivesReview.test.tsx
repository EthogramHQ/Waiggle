// Tests du Fil des ruches ajoutés après les relectures de R10 (interface 1 et 2, design 4, et les
// nouveautés sous une pastille, notées au plan) :
// - les ruches lues après le Fil ne le démontent pas et ne font pas descendre ses cartes : le Fil
//   attend ses ruches (son squelette), puis se montre avec ses pastilles ; une lecture ratée ne le
//   retient pas ;
// - sur ordinateur, la colonne de droite attend aussi : « Tes ruches » ne pousse plus les proches
//   à suivre vers le bas en arrivant ;
// - au premier lancement, une invitation du Fil se signale comme depuis l'onglet Ruches, et une
//   seule carte a « Rejoindre » en miel (une seule action miel par écran).
//
// Le faux serveur est celui de Hives.testkit.tsx, branché sur `fetch` : les vrais hooks de
// `feed/api.ts` et de `hives/api.ts` tournent, comme dans HomeScreen.hives.test.tsx.
import { palettes } from '@ruche/brand'
import type { FeedItem, FollowingFeedPage, ProjectSummary } from '@ruche/contracts'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import {
  acceptNamed,
  atelierId,
  biscotte,
  heldReply,
  hiveId,
  hiveServer,
  hoursAgo,
  invitation,
  invitationMore,
  invitationReport,
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

/** La règle « une seule action miel », pas la couleur d'une variante. */
const honey = (element: ReturnType<typeof screen.getByRole>) =>
  StyleSheet.flatten(element.props.style)?.backgroundColor === palettes.day.honey

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

describe('the invitations of the first run (R10, review)', () => {
  it('reports the hive from the invitation of the feed, as from the Hives tab', async () => {
    all = { ...all, items: [], followsAnyone: false }
    await renderHome()

    await fireEvent.press(await screen.findByRole('button', { name: invitationMore('Atelier IA') }))
    await fireEvent.press(
      await screen.findByRole('menuitem', { name: invitationReport('Atelier IA') }),
    )

    const report = mockRoute.calls.find(
      ({ href }) => (href as { pathname?: string }).pathname === '/report',
    )
    expect(report?.href).toEqual({
      pathname: '/report',
      params: { kind: 'hive', id: atelierId },
    })
  })

  it('has one « Rejoindre » in honey when two invitations are shown', async () => {
    all = { ...all, items: [], followsAnyone: false }
    hiveServer.mine = {
      ...myHives,
      invitations: [
        invitation,
        {
          ...invitation,
          id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c99',
          hive: { ...invitation.hive, id: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c98', name: 'Voisins' },
        },
      ],
    }
    await renderHome()

    const first = await screen.findByRole('button', { name: acceptNamed('Atelier IA') })
    const second = screen.getByRole('button', { name: acceptNamed('Voisins') })
    expect(honey(first)).toBe(true)
    expect(honey(second)).toBe(false)
  })
})

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

// --- Les nouveautés sous une pastille de ruche ---

/** Les lectures de ses ruches (GET /v1/hives). */
const minesRead = () => hiveServer.received('GET', MINE).length
/** Les lectures du Fil de « Famille ». */
const familleReads = () =>
  hiveServer.received('GET', FOLLOWING).filter((one) => one.query.get('hive') === hiveId).length
const newsOf = (count: number) => fr.t(($) => $.feed.newMixed, { count })

describe('the news button under a hive pill (R10, review)', () => {
  it('reads the hives again once the first page of the hive feed is read', async () => {
    mockRoute.params = { hive: hiveId }
    await renderHome()
    await screen.findByRole('link', { name: planDeTable.title })

    // La première page a posé la date de visite : « Tes ruches » et le bouton relisent les ruches.
    await waitFor(() => expect(minesRead()).toBeGreaterThanOrEqual(2))
  })

  it('shows the news of the chosen hive, read after its feed, and reads its feed again on press', async () => {
    mockRoute.params = { hive: hiveId }
    // Deux projets publiés dans Famille juste après la lecture de son Fil : les ruches relues disent 2.
    await renderHome()
    await screen.findByRole('link', { name: planDeTable.title })

    const button = await screen.findByRole('button', { name: newsOf(2) })
    const before = familleReads()
    await fireEvent.press(button)

    await waitFor(() => expect(familleReads()).toBeGreaterThan(before))
  })

  it('shows no news once the visit of the hive has been counted', async () => {
    mockRoute.params = { hive: hiveId }
    // Le serveur, comme le vrai : lire le Fil de Famille remet ses nouveautés à zéro.
    hiveServer.answer('GET', FOLLOWING, ({ query }) => {
      if (query.get('hive') !== hiveId) return ok(all)
      hiveServer.mine = {
        ...myHives,
        hives: myHives.hives.map((one) => (one.id === hiveId ? { ...one, news: 0 } : one)),
      }
      return ok(famille)
    })
    await renderHome()
    await screen.findByRole('link', { name: planDeTable.title })
    await waitFor(() => expect(minesRead()).toBeGreaterThanOrEqual(2))
    await act(async () => {})

    expect(screen.queryByRole('button', { name: newsOf(2) })).toBeNull()
    // R11 (« Moins de mots ») : plus de phrase de la ruche à la place du bouton (elle est dans les
    // Règles) ; écrite en clair, sa clé disparaîtra. Témoin : le fil de la ruche est toujours là.
    expect(
      screen.queryByText(/Les nouveaux projets et les mises à jour des membres de la ruche/),
    ).toBeNull()
    expect(screen.getByRole('link', { name: planDeTable.title })).toBeTruthy()
  })
})
