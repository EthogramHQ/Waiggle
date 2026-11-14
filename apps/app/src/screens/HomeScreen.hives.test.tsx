// Tests du Fil quand on est membre d'une ruche (R10, docs/scenarios/refonte.md, « Le Fil » :
// « Le sélecteur », « Tes ruches, sur ordinateur » ; « Recevoir une invitation » ; « Accessibilité »).
// Des pastilles « Tout · Famille · Amis du jeudi » sous l'en-tête, collées pendant le défilement ;
// aucune pour un membre sans ruche ; le Fil d'une pastille, lu par GET /v1/feed/following?hive= ;
// « Tu es à jour » de la pastille choisie ; l'invitation en tête du Fil au premier lancement ; « Tes
// ruches » en tête de la colonne de droite sur ordinateur.
//
// Ce que ces tests supposent de l'écran (plan R10, UI-D1 et UI-D2, « Ce qui change au plan » 11,
// « API au contrat » `ui/HivePills`, `ui/Screen`, `ui/HiveRow`, `ui/HiveInvitation`, `hives/api.ts` ;
// à corriger si le code en décide autrement, en le disant) :
// - les ruches et les invitations viennent de GET /v1/hives (`MyHives`) ;
// - les pastilles sont `ui/HivePills` : un `tablist` nommé `hives.pills.label`, un `tab` par
//   ruche après « Tout », `aria-controls` vers le panneau du Fil (`panelId`) que porte l'écran ;
//   sur téléphone, l'écran les donne à `Screen` par la prop `sticky` ;
// - la pastille vit dans l'adresse (`/?hive=<id>`), lue après `useHydrated()` : la toucher change
//   le paramètre `hive` (`router.setParams`, ou `replace`/`navigate` vers `/?hive=<id>`) ;
// - le Fil d'une pastille : GET /v1/feed/following?hive=<id> (`useHiveFeed`), même forme que
//   « Tout » ; `lastReadAt` y est la dernière visite de la ruche, qui pose « Tu es à jour » ;
// - au premier lancement (`followsAnyone` faux), les invitations (`ui/HiveInvitation`) passent en
//   tête du Fil, au-dessus de « Proches à suivre » ;
// - sur ordinateur, la colonne de droite (`FeedSide`) commence par « Tes ruches » (`hives.side`),
//   une ligne `ui/HiveRow compact` par ruche (un lien), qui ouvre `/hives/<id>`.
//
// Le faux serveur est celui de Hives.testkit.tsx, branché sur `fetch` : les vrais hooks de
// `feed/api.ts` et de `hives/api.ts` tournent. Ce fichier lui ajoute les réponses du Fil.
import type { FeedItem, FollowingFeedPage, MyHives, ProjectSummary } from '@ruche/contracts'
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import {
  acceptNamed,
  amis,
  amisId,
  biscotte,
  famille,
  hiveId,
  hiveServer,
  hoursAgo,
  invitationId,
  lea,
  memo,
  planDeTable,
  rowName,
} from './Hives.testkit'
import { HomeScreen } from './HomeScreen'
import { fiveSuggested } from './HomeScreen.testkit'

/** Les propriétés reçues par le cadre de page (`Screen`), notées par son faux module. */
const mockScreenProps: Record<string, unknown>[] = []

/**
 * L'adresse du Fil (`/?hive=<id>`), comme Expo Router la tient : changer un paramètre redessine
 * l'écran qui le lit (`useSyncExternalStore`). Les gestes du routeur sont notés (`mockRoute.calls`).
 */
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
// La barre du haut et la cloche ont leurs propres tests ; ici, seulement le Fil.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/NotificationBell', () => ({ NotificationBell: () => null }))
jest.mock('../ui/theme/hydration', () => ({
  ...jest.requireActual('../ui/theme/hydration'),
  useHydrated: () => true,
}))
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
jest.mock('expo-router', () => {
  const { useSyncExternalStore } = require('react') as typeof import('react')
  /** Une adresse vers le Fil (`/?hive=…`, ou `{ pathname: '/', params }`) change les paramètres. */
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

// --- Les fils ---

const itemOf = (project: ProjectSummary, hours: number): FeedItem => ({
  kind: 'project',
  at: hoursAgo(hours),
  project,
})

/** « Tout » : le jeu de mémoire de Papi Jean, qu'elle suit. */
const allPage = (changes: Partial<FollowingFeedPage> = {}): FollowingFeedPage => ({
  items: [itemOf(memo, 1)],
  nextCursor: null,
  followsAnyone: true,
  lastReadAt: null,
  ...changes,
})
/**
 * La pastille « Famille » : le plan de table (il y a 2 h) et Biscotte au parc (il y a 5 h) ; sa
 * dernière visite de la ruche date d'il y a 3 h : « Tu es à jour » se pose entre les deux.
 */
const famillePage: FollowingFeedPage = {
  items: [itemOf(planDeTable, 2), itemOf(biscotte, 5)],
  nextCursor: null,
  followsAnyone: true,
  lastReadAt: hoursAgo(3),
}

let all: FollowingFeedPage
let byHive: Map<string, FollowingFeedPage>

const ok = (body: unknown) => ({ status: 200, body })
const FOLLOWING = /^\/v1\/feed\/following$/

beforeEach(() => {
  hiveServer.reset()
  globalThis.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) =>
    hiveServer.fetch(String(input), init),
  ) as typeof fetch
  all = allPage()
  byHive = new Map([
    [hiveId, famillePage],
    [amisId, { ...famillePage, items: [], lastReadAt: null }],
  ])
  hiveServer.answer('GET', FOLLOWING, ({ query }) => {
    const hive = query.get('hive')
    if (!hive) return ok(all)
    const page = byHive.get(hive)
    return page ? ok(page) : { status: 404, body: { error: { code: 'not_found', message: '' } } }
  })
  hiveServer.answer('GET', /^\/v1\/feed\/discover$/, () => ok({ items: [], nextCursor: null }))
  hiveServer.answer('PUT', /^\/v1\/feed\/read$/, () => ({ status: 204 }))
  hiveServer.answer('GET', /^\/v1\/suggestions\/members$/, () =>
    ok({ members: fiveSuggested.slice(0, 2) }),
  )
  mockRoute.params = {}
  mockRoute.listeners.clear()
  mockRoute.calls = []
  mockScreenProps.length = 0
  mockSession({ user: { id: lea.id, name: lea.name } })
})

// --- Les aides ---

const TEXT = {
  pills: fr.t(($) => $.hives.pills.label),
  all: fr.t(($) => $.hives.pills.all),
  side: fr.t(($) => $.hives.side),
  suggestionsSide: fr.t(($) => $.feed.side.suggestions),
  suggestionsCaption: fr.t(($) => $.suggestions.caption),
  upToDate: fr.t(($) => $.feed.upToDate.title),
}

const renderHome = () =>
  renderWithProviders(
    <ToastProvider>
      <HomeScreen />
    </ToastProvider>,
  )

/** Affiche le Fil et attend sa première carte (« Tout » : Le jeu de mémoire). */
const openFeed = async () => {
  const view = await renderHome()
  await screen.findByRole('link', { name: memo.title })
  return view
}

const pill = (name: string) => screen.getByRole('tab', { name })
const isSelected = (name: string) => {
  const found = pill(name)
  return Boolean(found.props.accessibilityState?.selected ?? found.props['aria-selected'] ?? false)
}
/** Les demandes du Fil d'une ruche (GET /v1/feed/following?hive=<id>). */
const hiveFeedReads = (id: string) =>
  hiveServer.received('GET', FOLLOWING).filter((one) => one.query.get('hive') === id)

type Node = { props: Record<string, unknown>; children: (Node | string)[] }
/** L'arbre rendu, de haut en bas (l'ordre de lecture). */
const nodesInOrder = (): Node[] => {
  const nodes: Node[] = []
  const walk = (node: Node) => {
    nodes.push(node)
    for (const child of node.children) if (typeof child !== 'string') walk(child)
  }
  walk(screen.root as unknown as Node)
  return nodes
}
const comesBefore = (first: unknown, second: unknown) => {
  const nodes = nodesInOrder()
  const a = nodes.indexOf(first as Node)
  const b = nodes.indexOf(second as Node)
  expect(a).toBeGreaterThanOrEqual(0)
  expect(b).toBeGreaterThanOrEqual(0)
  return a < b
}

/** Un test sur ordinateur, la fenêtre de téléphone remise à la fin. */
const onComputer = async (test: () => Promise<void>) => {
  const restore = setDesktopWindow()
  try {
    await test()
  } finally {
    restore()
  }
}

const noHives: MyHives = { hives: [], invitations: [], createdCount: 0 }

// --- Le sélecteur ---

describe('the hive pills of the feed (R10)', () => {
  it('shows « Tout », then one pill per hive, under the header, « Tout » chosen', async () => {
    await openFeed()

    const list = await screen.findByRole('tablist', { name: TEXT.pills })
    const names = within(list)
      .getAllByRole('tab')
      .map((one) => one.props.accessibilityLabel ?? one.props['aria-label'])
    expect(names).toEqual([TEXT.all, 'Famille', 'Amis du jeudi'])
    expect(isSelected(TEXT.all)).toBe(true)
    expect(isSelected('Famille')).toBe(false)
    // Sur téléphone, les pastilles restent collées sous l'en-tête pendant le défilement.
    expect(mockScreenProps.at(-1)?.sticky).toBeTruthy()
  })

  it('shows no pills to a member without any hive', async () => {
    hiveServer.mine = noHives
    await openFeed()

    // Témoin : les ruches ont été lues, et le Fil est là.
    await waitFor(() =>
      expect(hiveServer.received('GET', /^\/v1\/hives$/).length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('link', { name: memo.title })).toBeTruthy()
    expect(screen.queryByRole('tablist', { name: TEXT.pills })).toBeNull()
    expect(screen.queryByRole('tab', { name: TEXT.all })).toBeNull()
  })

  it('shows the feed of a hive under its pill, read from GET /v1/feed/following?hive=', async () => {
    await openFeed()
    expect(hiveFeedReads(hiveId)).toHaveLength(0)

    await fireEvent.press(await screen.findByRole('tab', { name: 'Famille' }))

    expect(await screen.findByRole('link', { name: planDeTable.title })).toBeTruthy()
    expect(screen.getByRole('link', { name: biscotte.title })).toBeTruthy()
    expect(hiveFeedReads(hiveId).length).toBeGreaterThan(0)
    // Le Fil « Tout » n'est plus montré sous la pastille.
    expect(screen.queryByRole('link', { name: memo.title })).toBeNull()
    await waitFor(() => expect(isSelected('Famille')).toBe(true))
    expect(isSelected(TEXT.all)).toBe(false)
  })

  it('keeps the chosen pill in the address of the feed', async () => {
    await openFeed()

    await fireEvent.press(await screen.findByRole('tab', { name: 'Famille' }))

    await waitFor(() => expect(mockRoute.params.hive).toBe(hiveId))
    // Jamais une autre page : l'adresse reste celle du Fil.
    for (const { method, href } of mockRoute.calls) {
      if (method !== 'setParams') expect(pathOf(href).split('?')[0]).toBe('/')
    }
  })

  it('opens the pill given by the address', async () => {
    mockRoute.params = { hive: amisId }
    byHive.set(amisId, { ...famillePage, items: [itemOf(biscotte, 4)], lastReadAt: null })
    await renderHome()

    expect(await screen.findByRole('link', { name: biscotte.title })).toBeTruthy()
    expect(isSelected('Amis du jeudi')).toBe(true)
    expect(hiveFeedReads(amisId).length).toBeGreaterThan(0)
  })

  it('comes back to the feed of the people she follows on « Tout »', async () => {
    mockRoute.params = { hive: hiveId }
    await renderHome()
    await screen.findByRole('link', { name: planDeTable.title })

    await fireEvent.press(pill(TEXT.all))

    expect(await screen.findByRole('link', { name: memo.title })).toBeTruthy()
    expect(screen.queryByRole('link', { name: planDeTable.title })).toBeNull()
    await waitFor(() => expect(mockRoute.params.hive).toBeUndefined())
  })

  it('puts « Tu es à jour » of the chosen pill before the first item seen since the last visit', async () => {
    mockRoute.params = { hive: hiveId }
    await renderHome()

    const newer = await screen.findByRole('link', { name: planDeTable.title })
    const older = screen.getByRole('link', { name: biscotte.title })
    const upToDate = await screen.findByRole('header', { name: TEXT.upToDate })
    // « Famille » a été visitée il y a 3 h : le plan de table (2 h) est neuf, Biscotte (5 h) déjà vue.
    expect(comesBefore(newer, upToDate)).toBe(true)
    expect(comesBefore(upToDate, older)).toBe(true)
  })

  it('links each hive tab to the feed panel it controls', async () => {
    await openFeed()

    const tabs = within(await screen.findByRole('tablist', { name: TEXT.pills })).getAllByRole(
      'tab',
    )
    const panelIds = new Set(tabs.map((one) => one.props['aria-controls']))
    expect(panelIds.size).toBe(1)
    const [panelId] = [...panelIds]
    expect(typeof panelId).toBe('string')
    // Le panneau existe, et c'est lui qui porte les cartes du Fil.
    const panel = nodesInOrder().find(
      (node) => node.props.nativeID === panelId || node.props.id === panelId,
    )
    expect(panel).toBeTruthy()
    expect(
      within(panel as unknown as Parameters<typeof within>[0]).getByRole('link', {
        name: memo.title,
      }),
    ).toBeTruthy()
  })
})

// --- L'invitation au premier lancement ---

describe('an invitation on the first run of the feed (R10, F-Fil9)', () => {
  it('shows the invitation at the head of the feed, above the people to follow', async () => {
    all = allPage({ items: [], followsAnyone: false })
    await renderHome()

    const accept = await screen.findByRole('button', { name: acceptNamed('Atelier IA') })
    const caption = await screen.findByText(containing(TEXT.suggestionsCaption))
    expect(comesBefore(accept, caption)).toBe(true)
  })

  it('joins the hive from the invitation of the feed', async () => {
    all = allPage({ items: [], followsAnyone: false })
    await renderHome()

    await fireEvent.press(await screen.findByRole('button', { name: acceptNamed('Atelier IA') }))

    const ACCEPT = new RegExp(`^/v1/hive-invitations/${invitationId}/accept$`)
    await waitFor(() => expect(hiveServer.received('POST', ACCEPT)).toHaveLength(1))
  })

  it('keeps the invitation out of the feed of a member who follows someone', async () => {
    await openFeed()

    // Témoin : les invitations ont été lues (l'onglet Ruches les montre).
    await waitFor(() =>
      expect(hiveServer.received('GET', /^\/v1\/hives$/).length).toBeGreaterThan(0),
    )
    expect(screen.queryByRole('button', { name: acceptNamed('Atelier IA') })).toBeNull()
  })
})

// --- « Tes ruches », sur ordinateur ---

describe('« Tes ruches » in the right column on a computer (R10, F-Fil11)', () => {
  it('starts the right column with « Tes ruches », before the people to follow', () =>
    onComputer(async () => {
      await openFeed()

      const side = await screen.findByRole('header', { name: TEXT.side })
      const suggestions = await screen.findByRole('header', { name: TEXT.suggestionsSide })
      expect(comesBefore(side, suggestions)).toBe(true)
    }))

  it('lists each hive with its name and news, and opens its page', () =>
    onComputer(async () => {
      await openFeed()

      const row = await screen.findByRole('link', { name: rowName(famille) })
      expect(screen.getByRole('link', { name: rowName(amis) })).toBeTruthy()
      await fireEvent.press(row)

      expect(mockRoute.calls.map(({ href }) => pathOf(href))).toContain(`/hives/${hiveId}`)
    }))

  it('has no « Tes ruches » for a member without any hive', () =>
    onComputer(async () => {
      hiveServer.mine = noHives
      await openFeed()

      // Témoin : la colonne de droite est là.
      expect(await screen.findByRole('header', { name: TEXT.suggestionsSide })).toBeTruthy()
      expect(screen.queryByRole('header', { name: TEXT.side })).toBeNull()
    }))

  it('has no « Tes ruches » on a phone', async () => {
    await openFeed()

    // Témoin : les pastilles sont là ; la colonne, non.
    expect(await screen.findByRole('tablist', { name: TEXT.pills })).toBeTruthy()
    expect(screen.queryByRole('header', { name: TEXT.side })).toBeNull()
  })
})
