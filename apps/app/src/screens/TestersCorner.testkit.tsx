// Outils communs aux tests du coin des testeurs (R7b) : la page du coin, le fil d'un testeur et les
// deux feuilles « Nouvel appel » et « Ton retour ». On y trouve les données d'exemple (le projet de
// Léa, ses testeurs, leurs appels et leurs fils), le faux serveur qui répond comme l'API et garde
// chaque demande, le faux routeur d'Expo Router et les textes cherchés à l'écran.
//
// Chaque fichier de test pose ses `jest.mock` lui-même (Jest les remonte en tête de fichier) et les
// branche ici par des fonctions lues à l'appel (`require('./TestersCorner.testkit')`) : ce fichier
// n'importe aucun écran, et le faux serveur reste le même objet pour le test et pour l'écran.
//
// Ce que ces tests supposent du code (plan R7b, « Écrans et modules » et « API fixée à
// l'assemblage » ; à corriger si le code en décide autrement, en le disant) :
// - le réseau passe par `api/client` (`request`, `requestWithoutBody`) : les vrais hooks de
//   `testers/corner-api.ts` et `testers/api.ts` tournent sur ce faux serveur ;
// - les adresses des pages : `/projects/<id>/testers` (`?tab=calls|feedback`),
//   `/projects/<id>/testers/threads/<testerId>`, `/projects/<id>/testers/new-call`,
//   `/projects/<id>/testers/new-feedback` ; les écrans y vont par `router.push` (une chaîne ou un
//   objet `{ pathname, params }`, lu par `pathOf`) ;
// - le focus passe par les outils de `ui/focus` (`focusWithoutScroll`, `focusAndReveal`,
//   `moveReaderTo`), que ces tests espionnent ;
// - les brouillons vivent dans `testers/drafts.ts` (en mémoire), vidés avant chaque test.
import type {
  Me,
  Project,
  TesterCall,
  TesterCorner,
  TesterListItem,
  TesterMedia,
  TesterMessage,
  TesterThreadSummary,
} from '@ruche/contracts'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ApiResult } from '../api/errors'
import type { PickedImage } from '../media/pick'
import { labelOf } from '../testing/arrivedFocus'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject } from '../testing/projects'
import { containing, fr } from '../testing/text'

// --- Les membres et le projet ---

/** Le projet de Léa (l'autrice), « Testable », avec ses 12 testeurs. */
export const project: Project = {
  ...recipesProject,
  title: 'Décollage !',
  testerCount: 12,
}
export const { id } = project
export const cornerPath = `/projects/${id}/testers`

/** Les membres du coin : Léa (u1) l'autrice, Inès et Sam testeurs, Max un autre membre. */
export const lea = { id: leaMe.id, name: leaMe.name }
export const ines = { id: 'u4', name: 'Inès Martin' }
export const sam = { id: 'u5', name: 'Sam Petit' }
export const max = { id: 'u2', name: 'Max' }

/** Une date d'exemple : `days` jours avant le 10 novembre 2026 à midi (UTC). */
export const daysAgo = (days: number, hours = 0) =>
  new Date(Date.UTC(2026, 10, 10, 12) - days * 86_400_000 - hours * 3_600_000).toISOString()

/** Un identifiant valide (UUID v4) pour la n-ième donnée d'une famille (« a » appels, « b »…). */
export const uuid = (family: string, n: number) =>
  `${family.repeat(8)}-${family.repeat(4)}-4${family.repeat(3)}-8${family.repeat(3)}-${String(n).padStart(12, '0')}`

const firstNames = [
  'Inès Martin',
  'Sam Petit',
  'Chloé Bernard',
  'Hugo Leroy',
  'Nora Diallo',
  'Paul Roux',
  'Jade Fournier',
  'Malik Benali',
  'Emma Girard',
  'Louis Morel',
  'Zoé Lambert',
  'Yanis Faure',
]

/** Les 12 testeurs de Léa, du plus récent inscrit au plus ancien (Inès en tête). */
export const testers: TesterListItem[] = firstNames.map((name, index) => ({
  id: index === 0 ? ines.id : index === 1 ? sam.id : `t${index + 1}`,
  name,
  handle: null,
  avatarUrl: null,
  since: daysAgo(8 + index),
}))

export const authorCorner: TesterCorner = {
  role: 'author',
  closed: false,
  testerCount: 12,
  testers,
}
export const testerCorner: TesterCorner = {
  role: 'tester',
  closed: false,
  testerCount: 12,
  testers: null,
}
export const formerCorner: TesterCorner = {
  role: 'former_tester',
  closed: false,
  testerCount: null,
  testers: null,
}

// --- Les appels, les fils et les messages ---

/** Une image du coin (photo d'appel ou capture), servie par l'API de développement. */
export const media = (n: number, description: string | null = null): TesterMedia => ({
  id: uuid('d', n),
  url: `http://localhost:3000/media/testers/${uuid('d', n)}.webp`,
  width: 1200,
  height: 900,
  thumbhash: null,
  description,
})

export const callNo = (n: number, text = `Appel numéro ${n}`): TesterCall => ({
  id: uuid('a', n),
  text,
  photo: null,
  createdAt: daysAgo(n),
  removal: null,
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
})

/** Deux appels de Léa, le plus récent en tête ; le second a une photo décrite. */
export const calls: TesterCall[] = [
  callNo(1, 'Essayez le niveau 3 ce week-end, surtout sur téléphone.'),
  {
    ...callNo(2, 'Le nouveau tableau des scores est en ligne.'),
    photo: media(1, 'Le tableau des scores, trois noms en tête'),
  },
]

export const messageOf = (n: number, changes: Partial<TesterMessage>): TesterMessage => ({
  id: uuid('c', n),
  kind: 'reply',
  sender: 'tester',
  outcome: null,
  device: null,
  text: `Message numéro ${n}`,
  capture: null,
  createdAt: daysAgo(0, 10 - n),
  settled: null,
  removal: null,
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
  mine: false,
  ...changes,
})

/**
 * Le fil d'Inès, vu par Léa, du plus ancien au plus récent : son retour « En partie » sur
 * téléphone, avec une capture ; la réponse de Léa ; puis une réponse d'Inès. L'API rend les pages
 * dans l'autre sens (le plus récent en tête) : voir `newestFirst`.
 */
export const inesThread = (reader: 'author' | 'tester'): TesterMessage[] => [
  messageOf(1, {
    kind: 'feedback',
    sender: 'tester',
    outcome: 'partly',
    device: 'phone',
    text: 'Le score repart à zéro au niveau 3.',
    capture: media(2),
    mine: reader === 'tester',
  }),
  messageOf(2, {
    sender: 'author',
    text: 'Merci Inès, je regarde ce soir.',
    mine: reader === 'author',
  }),
  messageOf(3, {
    sender: 'tester',
    text: 'Pareil sur ordinateur, au fait.',
    mine: reader === 'tester',
  }),
]
export const newestFirst = (messages: TesterMessage[]) => [...messages].reverse()

export const threadOf = (
  tester: { id: string; name: string },
  changes: Partial<TesterThreadSummary> = {},
  current = true,
): TesterThreadSummary => ({
  tester: {
    id: tester.id,
    name: tester.name,
    handle: null,
    avatarUrl: null,
    current,
    since: current ? daysAgo(8) : null,
  },
  lastAt: daysAgo(0, 2),
  lastFrom: 'tester',
  unread: false,
  state: 'open',
  excerpt: 'Pareil sur ordinateur, au fait.',
  ...changes,
})

/** Les fils de Léa : Inès (non lu), Sam, et une ancienne testeuse, Chloé. */
export const openThreads: TesterThreadSummary[] = [
  threadOf(ines, { unread: true }),
  threadOf(sam, { excerpt: 'Ça marche bien chez moi.', lastAt: daysAgo(1) }),
  threadOf({ id: 't3', name: 'Chloé Bernard' }, { lastAt: daysAgo(3), excerpt: null }, false),
]
export const settledThreads: TesterThreadSummary[] = [
  threadOf({ id: 't4', name: 'Hugo Leroy' }, { state: 'settled', lastAt: daysAgo(5) }),
]

// --- Le faux serveur ---

/** Une demande reçue : sa méthode, son chemin (sans paramètres), ses paramètres et son corps. */
export type Sent = { method: string; path: string; query: URLSearchParams; body: unknown }
type Answer = ApiResult<unknown> | Promise<ApiResult<unknown>>
type Page<T> = { items: T[]; nextCursor: string | null }

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data })
const none: ApiResult<null> = { ok: true, data: null }
const notFound: ApiResult<never> = { ok: false, error: 'notFound' }

/** Une promesse dont le test choisit le moment de la fin. */
export const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Le champ `name` d'un envoi multipart (`kind`, `file`). */
export const formField = (body: unknown, name: string): unknown => {
  const form = body as {
    getParts?: () => { fieldName: string; string?: string }[]
    get?: (field: string) => unknown
  }
  return form.getParts?.().find((part) => part.fieldName === name)?.string ?? form.get?.(name)
}

const P = `/v1/projects/${id}`

/**
 * Le faux serveur : il répond comme l'API, d'après un état que chaque test change (le coin vu par le
 * lecteur, les pages d'appels, de fils et de messages), et garde chaque demande. `answer` impose une
 * réponse, qui passe avant les réponses ordinaires. Les écritures changent l'état : une relecture
 * après un geste rend ce que l'API rendrait.
 */
export const mockServer = {
  sent: [] as Sent[],
  me: leaMe as Me,
  project: project as Project,
  corner: authorCorner as TesterCorner | null,
  /** Les pages d'appels, par curseur (`''` : la première). */
  callPages: new Map<string, Page<TesterCall>>(),
  /** Les pages de fils, par filtre puis par curseur. */
  threadPages: { open: new Map(), settled: new Map() } as Record<
    'open' | 'settled',
    Map<string, Page<TesterThreadSummary>>
  >,
  counts: { open: 3, settled: 1 },
  /** Les pages de messages, par testeur puis par curseur (le plus récent en tête). */
  messagePages: new Map<string, Map<string, Page<TesterMessage>>>(),
  uploads: 0,
  overrides: [] as { method: string; path: RegExp; answer: (sent: Sent) => Answer }[],
  reset() {
    this.sent = []
    this.me = leaMe
    this.project = project
    this.corner = authorCorner
    this.callPages = new Map([['', { items: calls, nextCursor: null }]])
    this.threadPages = {
      open: new Map([['', { items: openThreads, nextCursor: null }]]),
      settled: new Map([['', { items: settledThreads, nextCursor: null }]]),
    }
    this.counts = { open: 3, settled: 1 }
    this.messagePages = new Map([
      [ines.id, new Map([['', { items: newestFirst(inesThread('author')), nextCursor: null }]])],
    ])
    this.uploads = 0
    this.overrides = []
  },
  /** Le fil d'un testeur en une page (le plus ancien d'abord, comme on le lit). */
  setThread(testerId: string, oldestFirst: TesterMessage[], nextCursor: string | null = null) {
    this.messagePages.set(
      testerId,
      new Map([['', { items: newestFirst(oldestFirst), nextCursor }]]),
    )
  },
  answer(method: string, path: RegExp, answer: (sent: Sent) => Answer) {
    this.overrides.push({ method, path, answer })
  },
  received(method: string, path: RegExp) {
    return this.sent.filter((one) => one.method === method && path.test(one.path))
  },
  async respond(rawPath: string, init: RequestInit = {}): Promise<ApiResult<unknown>> {
    const method = (init.method ?? 'GET').toUpperCase()
    const url = new URL(rawPath, 'http://test')
    const body =
      typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : (init.body ?? null)
    const sent: Sent = { method, path: url.pathname, query: url.searchParams, body }
    this.sent.push(sent)
    const forced = this.overrides.find((one) => one.method === method && one.path.test(sent.path))
    if (forced) return forced.answer(sent)
    const path = sent.path
    const cursor = url.searchParams.get('cursor') ?? ''
    if (method === 'GET' && path === '/v1/me') return ok(this.me)
    if (method === 'GET' && path === P) return ok(this.project)
    if (path === `${P}/testers`) {
      if (method === 'GET') return this.corner ? ok(this.corner) : notFound
      // Quitter les testeurs (R7a) : l'ancien testeur ne garde que son fil.
      if (method === 'DELETE') {
        this.corner = formerCorner
        this.project = { ...this.project, isTester: false }
        return none
      }
    }
    const removed = path.match(/^\/v1\/projects\/[^/]+\/testers\/([^/]+)$/)
    if (method === 'DELETE' && removed && removed[1] !== 'media' && this.corner?.testers) {
      const testersLeft = this.corner.testers.filter((one) => one.id !== removed[1])
      this.corner = { ...this.corner, testers: testersLeft, testerCount: testersLeft.length }
      return none
    }
    if (method === 'POST' && path === `${P}/testers/media`) {
      this.uploads += 1
      return ok(media(100 + this.uploads))
    }
    if (path === `${P}/calls`) {
      if (method === 'GET') return ok(this.callPages.get(cursor) ?? { items: [], nextCursor: null })
      if (method === 'POST') {
        const sentCall = body as { text: string; photoId: string | null }
        const call: TesterCall = {
          ...callNo(90 + this.sent.length, sentCall.text),
          createdAt: new Date().toISOString(),
          photo: sentCall.photoId ? { ...media(100), id: sentCall.photoId } : null,
        }
        const first = this.callPages.get('') ?? { items: [], nextCursor: null }
        this.callPages.set('', { ...first, items: [call, ...first.items] })
        return ok(call)
      }
    }
    if (method === 'DELETE' && /^\/v1\/projects\/[^/]+\/calls\/[^/]+$/.test(path)) {
      const callId = path.split('/').at(-1)
      for (const [key, page] of this.callPages)
        this.callPages.set(key, { ...page, items: page.items.filter((one) => one.id !== callId) })
      return none
    }
    if (method === 'GET' && path === `${P}/threads`) {
      const state = url.searchParams.get('state') === 'settled' ? 'settled' : 'open'
      const page = this.threadPages[state].get(cursor) ?? { items: [], nextCursor: null }
      return ok({ ...page, counts: this.counts })
    }
    const thread = path.match(/^\/v1\/projects\/[^/]+\/threads\/([^/]+)\/(messages|read)$/)
    if (thread) {
      const testerId = thread[1] ?? ''
      if (thread[2] === 'read' && method === 'POST') return none
      if (method === 'GET')
        return ok(this.messagePages.get(testerId)?.get(cursor) ?? { items: [], nextCursor: null })
      if (method === 'POST') {
        const sentMessage = body as {
          kind: 'feedback' | 'reply'
          text: string | null
          outcome?: TesterMessage['outcome']
          device?: TesterMessage['device']
          captureId?: string | null
        }
        const message: TesterMessage = messageOf(50 + this.sent.length, {
          kind: sentMessage.kind,
          sender: this.corner?.role === 'author' ? 'author' : 'tester',
          outcome: sentMessage.outcome ?? null,
          device: sentMessage.device ?? null,
          text: sentMessage.text,
          capture: sentMessage.captureId ? { ...media(100), id: sentMessage.captureId } : null,
          createdAt: new Date().toISOString(),
          mine: true,
        })
        const pages = this.messagePages.get(testerId) ?? new Map()
        const first = pages.get('') ?? { items: [], nextCursor: null }
        pages.set('', { ...first, items: [message, ...first.items] })
        this.messagePages.set(testerId, pages)
        return ok(message)
      }
    }
    const settled = path.match(/^\/v1\/projects\/[^/]+\/messages\/([^/]+)\/settled$/)
    if (settled) {
      this.editMessage(settled[1] ?? '', (one) => ({
        ...one,
        settled: method === 'POST' ? { at: new Date().toISOString(), update: null } : null,
      }))
      return none
    }
    const deletedMessage = path.match(/^\/v1\/projects\/[^/]+\/messages\/([^/]+)$/)
    if (method === 'DELETE' && deletedMessage) {
      for (const pages of this.messagePages.values())
        for (const [key, page] of pages)
          pages.set(key, {
            ...page,
            items: page.items.filter((one) => one.id !== deletedMessage[1]),
          })
      return none
    }
    return notFound
  },
  editMessage(messageId: string, change: (message: TesterMessage) => TesterMessage) {
    for (const pages of this.messagePages.values())
      for (const [key, page] of pages)
        pages.set(key, {
          ...page,
          items: page.items.map((one) => (one.id === messageId ? change(one) : one)),
        })
  },
}

/** Ce que le faux `api/client` rend : il passe par le faux serveur, puis par le schéma du contrat. */
export const mockClient = {
  request: async (
    path: string,
    init: RequestInit | undefined,
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } },
  ) => {
    const result = await mockServer.respond(path, init ?? {})
    if (!result.ok) return result
    const parsed = schema.safeParse(result.data)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
  },
  requestWithoutBody: async (path: string, init: RequestInit) => {
    const result = await mockServer.respond(path, init)
    return result.ok ? { ok: true, data: null } : result
  },
  apiFetch: jest.fn(),
}

// --- La navigation ---

type BeforeRemove = { preventDefault: jest.Mock; data: { action: { type: string } } }

/** Le faux routeur et le faux `useNavigation()` (ses écouteurs `beforeRemove`), et l'adresse. */
export const mockNav = {
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
    canDismiss: jest.fn(() => true),
  },
  listeners: new Set<(event: BeforeRemove) => void>(),
  navigation: {
    addListener: jest.fn((_type: string, listener: (event: BeforeRemove) => void) => {
      mockNav.listeners.add(listener)
      return () => mockNav.listeners.delete(listener)
    }),
    removeListener: jest.fn(),
    dispatch: jest.fn(),
    isFocused: () => true,
    setOptions: jest.fn(),
    canGoBack: () => true,
    getParent: () => undefined,
  },
  params: {} as Record<string, string | undefined>,
  pathname: cornerPath,
}

/** Le faux module `expo-router` : `setParams` change les paramètres, comme le ferait Expo Router. */
export const mockExpoRouter = () => {
  const { useEffect } = require('react') as typeof import('react')
  return {
    useRouter: () => mockNav.router,
    usePathname: () => mockNav.pathname,
    useNavigation: () => mockNav.navigation,
    useLocalSearchParams: () => mockNav.params,
    useGlobalSearchParams: () => mockNav.params,
    useSegments: () => [],
    useIsFocused: () => true,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      useEffect(() => effect(), [effect])
    },
  }
}

/** Remet le faux serveur, le routeur et l'adresse à leur état de départ (dans `beforeEach`). */
export const resetCornerMocks = (pathname = cornerPath) => {
  mockServer.reset()
  for (const fn of Object.values(mockNav.router)) fn.mockClear()
  mockNav.router.canGoBack.mockImplementation(() => true)
  mockNav.router.setParams.mockImplementation((params: Record<string, string | undefined>) => {
    mockNav.params = { ...mockNav.params, ...params }
  })
  mockNav.listeners.clear()
  mockNav.navigation.dispatch.mockClear()
  mockNav.params = { id }
  mockNav.pathname = pathname
  mockPick.next = []
}

/** Les adresses demandées par push, navigate et replace, dans l'ordre (chemins remplis). */
export const pushed = () =>
  [mockNav.router.push, mockNav.router.navigate].flatMap((mock) =>
    mock.mock.calls.map(([href]) => pathOf(href)),
  )
export const replaced = () => mockNav.router.replace.mock.calls.map(([href]) => pathOf(href))

/** Toutes les fois où une feuille a demandé à partir (retour, remplacement, autre page). */
export const departures = () =>
  (['push', 'replace', 'navigate', 'back', 'dismiss', 'dismissTo'] as const).reduce(
    (count, name) => count + mockNav.router[name].mock.calls.length,
    0,
  )

/** Rejoue un `beforeRemove` (le retour du navigateur, le geste de retour) ; rend l'événement. */
export const navigatorRemoves = async (): Promise<BeforeRemove> => {
  const event: BeforeRemove = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } }
  await act(async () => {
    for (const listener of mockNav.listeners) listener(event)
  })
  return event
}

// --- La galerie de l'appareil ---

/** Le faux choix de photos : le test pose les images avec `next`, la galerie les rend. */
export const mockPick = {
  next: [] as PickedImage[],
  take(): PickedImage[] {
    const images = mockPick.next
    mockPick.next = []
    return images
  },
}
export const picked = (name: string): PickedImage => ({
  uri: `file:///${name}.jpg`,
  width: 2048,
  height: 1536,
})

/** Le faux module `media/pick` : `pickImage` et `pickVisuals` rendent les images posées. */
export const mockMediaPick = () => {
  const actual = jest.requireActual('../media/pick') as typeof import('../media/pick')
  return {
    ...actual,
    pickImage: async (_shape?: unknown, onChosen?: () => void) => {
      const [image] = mockPick.take()
      if (image) onChosen?.()
      return image ?? null
    },
    pickVisuals: async (
      _slot: string,
      _remaining: number,
      onChosen?: (images: PickedImage[]) => void,
    ) => {
      const images = mockPick.take()
      if (images.length > 0) onChosen?.(images)
      return images
    },
    appendImage: async (form: FormData, field: string, image: { uri: string }) => {
      form.append(field, image.uri)
    },
  }
}

// --- Le focus ---

/** Le texte (ou le nom) des vues qui ont reçu le focus par les outils de `ui/focus`, dans l'ordre. */
// Les trois outils de `ui/focus` n'ont pas la même signature : on les reçoit tels quels, ce sont
// des fausses fonctions de Jest (`jest.fn`, voir le `jest.mock` de chaque fichier).
export const focusedLabels = (...spied: unknown[]): string[] =>
  spied
    .flatMap((fn) => {
      const { calls, invocationCallOrder } = (fn as jest.Mock).mock
      return calls.map(([node], index) => ({ node, order: invocationCallOrder[index] ?? 0 }))
    })
    // Dans l'ordre des appels, quel que soit l'outil : le dernier est le focus du moment.
    .sort((a, b) => a.order - b.order)
    .map(({ node }) => labelOf(node) ?? '')

// --- Les textes ---

export const T = {
  corner: fr.t(($) => $.project.testers.corner),
  cornerMenu: fr.t(($) => $.project.testers.cornerMenu),
  cornerLoadError: fr.t(($) => $.project.testers.cornerLoadError),
  calls: fr.t(($) => $.project.testers.tabs.calls),
  feedback: fr.t(($) => $.project.testers.tabs.feedback),
  quit: fr.t(($) => $.project.testers.quit),
  quitTitle: fr.t(($) => $.project.testers.quitTitle, { title: project.title }),
  quitConfirm: fr.t(($) => $.project.testers.quitConfirm),
  remove: fr.t(($) => $.project.testers.remove),
  removeConfirm: fr.t(($) => $.project.testers.removeConfirm),
  closedAuthor: fr.t(($) => $.project.testers.closedAuthor),
  formerTester: fr.t(($) => $.project.testers.formerTester, { name: lea.name }),
  launch: fr.t(($) => $.project.testers.calls.launch),
  callSheet: fr.t(($) => $.project.testers.calls.sheetTitle),
  callSend: fr.t(($) => $.project.testers.calls.send),
  callCancel: fr.t(($) => $.project.testers.calls.cancel),
  callField: fr.t(($) => $.project.testers.calls.field),
  callRequired: fr.t(($) => $.project.testers.calls.required),
  callPhotoName: fr.t(($) => $.project.testers.calls.photoName),
  callLimited: fr.t(($) => $.project.testers.calls.limited, { max: 5 }),
  callError: fr.t(($) => $.project.testers.calls.error),
  callInvalidPhoto: fr.t(($) => $.project.testers.calls.invalidPhoto),
  callEmpty: fr.t(($) => $.project.testers.calls.empty),
  callEmptyAuthor: fr.t(($) => $.project.testers.calls.emptyAuthor),
  callMore: fr.t(($) => $.project.testers.calls.more),
  callDelete: fr.t(($) => $.project.testers.calls.delete),
  callDeleteTitle: fr.t(($) => $.project.testers.calls.deleteTitle),
  callDeleteConfirm: fr.t(($) => $.project.testers.calls.deleteConfirm),
  sendFeedback: fr.t(($) => $.project.testers.feedback.send),
  feedbackSheet: fr.t(($) => $.project.testers.feedback.sheetTitle),
  feedbackSubmit: fr.t(($) => $.project.testers.feedback.submit),
  feedbackCancel: fr.t(($) => $.project.testers.feedback.cancel),
  clearDraft: fr.t(($) => $.project.testers.feedback.clearDraft),
  outcome: fr.t(($) => $.project.testers.feedback.outcome),
  outcomeRequired: fr.t(($) => $.project.testers.feedback.outcomeRequired),
  device: fr.t(($) => $.project.testers.feedback.device),
  clearDevice: fr.t(($) => $.project.testers.feedback.clearDevice),
  feedbackText: fr.t(($) => $.project.testers.feedback.text),
  captureHint: fr.t(($) => $.project.testers.feedback.captureHint),
  captureNameMine: fr.t(($) => $.project.testers.feedback.captureNameMine),
  feedbackError: fr.t(($) => $.project.testers.feedback.error),
  feedbackLimited: fr.t(($) => $.project.testers.feedback.limited, { max: 30 }),
  invalidCapture: fr.t(($) => $.project.testers.feedback.invalidCapture),
  showEarlier: fr.t(($) => $.project.testers.thread.showEarlier),
  reply: fr.t(($) => $.project.testers.thread.reply),
  replyLabel: fr.t(($) => $.project.testers.thread.replyLabel),
  replyError: fr.t(($) => $.project.testers.thread.replyError),
  closedCorner: fr.t(($) => $.project.testers.thread.closedCorner),
  settle: fr.t(($) => $.project.testers.thread.settle),
  unsettle: fr.t(($) => $.project.testers.thread.unsettle),
  settled: fr.t(($) => $.project.testers.thread.settled),
  messageDelete: fr.t(($) => $.project.testers.thread.delete),
  messageDeleteTitle: fr.t(($) => $.project.testers.thread.deleteTitle),
  messageDeleteConfirm: fr.t(($) => $.project.testers.thread.deleteConfirm),
  report: fr.t(($) => $.project.testers.thread.report),
  former: fr.t(($) => $.project.testers.thread.former),
  emptyOpen: fr.t(($) => $.project.testers.thread.emptyOpen),
  listLoadError: fr.t(($) => $.project.testers.thread.listLoadError),
  notFound: fr.t(($) => $.project.page.notFoundTitle),
  notMine: fr.t(($) => $.states.notMineTitle),
  retry: fr.t(($) => $.common.retry),
}
export const outcomeName = (code: 'yes' | 'partly' | 'no') =>
  fr.t(($) => $.project.testers.feedback.outcomes[code])
export const deviceName = (code: 'phone' | 'computer' | 'tablet') =>
  fr.t(($) => $.project.testers.feedback.devices[code])
export const testerCount = (count: number) => fr.t(($) => $.project.testers.count, { count })
export const showMore = (count: number) => fr.t(($) => $.project.testers.list.showMore, { count })
export const testerMenu = (name: string) => fr.t(($) => $.project.testers.list.menu, { name })
export const removeTitle = (name: string) => fr.t(($) => $.project.testers.removeTitle, { name })
export const removeBody = (name: string) => fr.t(($) => $.project.testers.removeBody, { name })
export const callMenu = (excerpt: string) => fr.t(($) => $.project.testers.calls.menu, { excerpt })
export const messageMenu = (excerpt: string) =>
  fr.t(($) => $.project.testers.thread.menu, { excerpt })
export const filterName = (code: 'open' | 'settled', count: number) =>
  fr.t(($) => $.project.testers.thread.filterSpoken, {
    label: fr.t(($) => $.project.testers.thread.filters[code]),
    count,
  })
export const replyTo = (name: string) =>
  fr.t(($) => $.project.testers.thread.replyPlaceholder, { name })
export const closedFormer = (name: string) =>
  fr.t(($) => $.project.testers.thread.closedFormer, { name })
export const settledIn = (version: string) =>
  fr.t(($) => $.project.testers.thread.settledIn, { version })
export const audience = (count: number) => fr.t(($) => $.project.testers.calls.audience, { count })

/** Vrai si l'écran montre ce texte (blancs de la typographie française compris), ou le lit. */
export const shown = (text: string) =>
  screen.queryAllByText(containing(text)).length > 0 ||
  screen.queryAllByLabelText(containing(text)).length > 0

/**
 * Une feuille ouverte par qui n'y a pas droit : elle dit « introuvable » ou « pas à toi », ou elle
 * repart aussitôt (vers le coin ou le projet). Le test attend l'un des trois : un écran vide ne
 * suffit pas (témoin, charte du code).
 */
export const refusedSheet = () => shown(T.notFound) || shown(T.notMine) || departures() > 0

/** Un bouton ou un lien de ce nom (exact), ou null. */
export const control = (name: string | RegExp) =>
  screen.queryByRole('link', { name }) ?? screen.queryByRole('button', { name })

/** Le bouton ou le lien de ce nom ; lève une erreur lisible s'il manque. */
export const getControl = (name: string | RegExp) => {
  const found = control(name)
  if (!found) throw new Error(`no button or link named ${String(name)}`)
  return found
}

// --- Les sorties d'une feuille ---

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const textOf = (node: Host | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('')

/** Échap relâchée (web) ou retour d'Android : la couche du Modal de la feuille titrée `title`. */
export const pressEscape = async (title: string) => {
  const layers = hostsOf(screen.root as unknown as Host).filter(
    (node) => typeof node.props.onRequestClose === 'function' && textOf(node).includes(title),
  )
  const layer = layers.at(-1) as (Host & { props: { onRequestClose: () => void } }) | undefined
  if (!layer) throw new Error('no layer around the sheet')
  await act(() => layer.props.onRequestClose())
}

/** Le voile de la feuille : caché aux lecteurs d'écran, il se trouve par ce qui le cache. */
export const pressScrim = async () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  await fireEvent.press(found as never)
}
