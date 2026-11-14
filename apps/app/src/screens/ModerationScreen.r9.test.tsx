// Tests de la page « Modération » refaite en R9 (planches `R9-Moderation-Desktop`,
// `R9-Moderation-Telephone` et `R9-Moderation-Detail-Telephone`). Sur un écran large, trois
// colonnes : la file (« À traiter (3) », « Retirés »), le détail de l'élément choisi, l'historique
// récent. Sur téléphone, la file, puis le détail en page, et un bouton « Historique ».
//
// L'élément choisi vit dans l'adresse (`?item=`), une clé par cible **et** par partie : le projet
// entier et sa 2e photo sont deux éléments de la file, jamais confondus (relecture du plan, ui-P2).
// Un élément décidé garde son résultat dans le détail jusqu'au choix suivant ; une clé inconnue dit
// que l'élément n'est plus dans la file, avec un chemin de retour.
//
// Les tests ne supposent pas la forme de la clé : ils touchent un élément de la file, lisent
// l'adresse que l'écran demande (`setParams`, `push`, `replace` ou `navigate`, tous suivis ici),
// puis redessinent l'écran avec cette adresse, comme le ferait Expo Router.
//
// Les données sont propres à ce fichier : celles de `testing/moderation.ts` sont partagées.
import type {
  DecisionHistoryItem,
  DecisionHistoryPage,
  ModerationQueueItem,
  ModerationQueuePage,
  RemovedPage,
} from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import type { ReactElement } from 'react'
import { Platform } from 'react-native'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { getMe } from '../profile/api'
import { passTapGuard } from '../testing/dialog'
import { adminMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders, setDesktopWindow } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ModerationScreen } from './ModerationScreen'

// Sur le web, l'écran prend la langue de l'appareil : le français, comme sur ce PC (charte).
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le profil dit si le membre est administrateur.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../moderation/api', () => ({
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  useDecisionHistory: jest.fn(),
}))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockSetParams = jest.fn()
const mockBack = jest.fn()
/** Vrai si une page précède celle-ci dans l'historique (faux : arrivé par une adresse). */
let mockCanGoBack = true
/** Les paramètres de l'adresse : les gestes de l'écran les changent, comme Expo Router. */
let mockParams: Record<string, string | undefined> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  // Un routeur neuf à chaque appel (charte : un effet qui dépend du routeur ne boucle pas).
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    setParams: mockSetParams,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}))

// --- Les données : trois contenus signalés, dont un projet signalé deux fois (entier et photo) ---

const decollageId = '0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f'
const meteoId = '1c2d3e4f-5061-4728-939a-4b5c6d7e8f90'
const meteoPhotoId = '2d3e4f50-6172-4839-a4ab-5c6d7e8f9a01'

/** Le commentaire de « Gains Rapides » sous « Décollage ! », signalé par deux membres. */
const scamComment: ModerationQueueItem = {
  target: { kind: 'comment', id: '3e4f5061-7283-494a-b5bc-6d7e8f9a0b12' },
  part: null,
  context: { projectId: decollageId, title: 'Décollage !', image: null },
  contentCreatedAt: '2026-11-12T14:51:00.000Z',
  projectId: decollageId,
  snapshot: [
    {
      field: 'body',
      value: 'Gagne 500 € par jour avec mon robot de trading, lien dans mon profil.',
    },
  ],
  images: [],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'scam_spam', count: 2 }],
  details: [
    'Il pousse les enfants à aller sur son profil pour gagner de l’argent.',
    'Le lien de son profil mène à un site de trading douteux.',
  ],
  count: 2,
  firstReportedAt: '2026-11-12T16:48:00.000Z',
  lastReportedAt: '2026-11-12T16:56:00.000Z',
  authorRecord: {
    memberId: 'u21',
    name: 'Gains Rapides',
    handle: 'gains_rapides',
    // Inscrit il y a 3 jours, quel que soit le jour où le test tourne : « Compte récent ».
    joinedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    projectCount: 0,
    commentCount: 4,
    removals: 1,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: true,
  },
}

/** Inès Haddad : son autoportrait au balcon, la 2e photo de « Météo », signalé une fois. */
const meteoAuthor = {
  memberId: 'u3',
  name: 'Inès Haddad',
  handle: 'ines_haddad',
  joinedAt: '2026-09-02T08:00:00.000Z',
  projectCount: 3,
  commentCount: 18,
  removals: 2,
  suspensions: 1,
  suspendedNow: false,
  canSuspend: true,
}

const meteoPhoto: ModerationQueueItem = {
  target: { kind: 'project', id: meteoId },
  part: { field: 'photo', mediaId: meteoPhotoId, position: 2 },
  context: { projectId: meteoId, title: 'Météo', image: null },
  contentCreatedAt: '2026-10-02T10:00:00.000Z',
  projectId: meteoId,
  snapshot: [],
  images: [{ field: 'photo', state: 'present' }],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'privacy', count: 1 }],
  details: ['On me reconnaît sur mon balcon. Je n’ai jamais donné mon accord.'],
  count: 1,
  firstReportedAt: '2026-11-12T16:00:00.000Z',
  lastReportedAt: '2026-11-12T16:00:00.000Z',
  authorRecord: meteoAuthor,
}

/** Le même projet « Météo », signalé en entier par un autre membre, pour un autre motif. */
const meteoWhole: ModerationQueueItem = {
  ...meteoPhoto,
  part: null,
  snapshot: [
    { field: 'title', value: 'Météo' },
    { field: 'pitch', value: 'Le ciel de ce soir, photo par photo.' },
  ],
  images: [],
  reasons: [{ reason: 'harassment', count: 1 }],
  details: [],
  firstReportedAt: '2026-11-12T16:30:00.000Z',
  lastReportedAt: '2026-11-12T16:30:00.000Z',
}

/** La bio de Louis lui-même : il ne peut pas en décider (« Te concerne »). */
const ownBio: ModerationQueueItem = {
  target: { kind: 'member', id: adminMe.id },
  part: { field: 'bio', mediaId: null, position: null },
  context: null,
  contentCreatedAt: '2026-09-01T08:00:00.000Z',
  projectId: null,
  snapshot: [{ field: 'bio', value: 'Je construis Waiggle le soir, avec ma famille.' }],
  images: [],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: true,
  reasons: [{ reason: 'other', count: 1 }],
  details: [],
  count: 1,
  firstReportedAt: '2026-11-11T18:00:00.000Z',
  lastReportedAt: '2026-11-11T18:00:00.000Z',
  authorRecord: {
    memberId: adminMe.id,
    name: adminMe.name,
    handle: 'louis',
    joinedAt: '2026-09-01T08:00:00.000Z',
    projectCount: 2,
    commentCount: 40,
    removals: 0,
    suspensions: 0,
    suspendedNow: false,
    canSuspend: false,
  },
}

const queue = [scamComment, meteoPhoto, meteoWhole, ownBio]

/** Une décision récente de Louis : le retrait d'un commentaire. */
const recentRemoval: DecisionHistoryItem = {
  id: '4f506172-8394-4a5b-86cd-7e8f9a0b1c23',
  action: 'remove',
  at: '2026-11-12T17:02:00.000Z',
  admin: { id: adminMe.id, name: adminMe.name, handle: 'louis' },
  target: { kind: 'comment', id: '50617283-94a5-4b6c-97de-8f9a0b1c2d34' },
  part: null,
  projectId: decollageId,
  member: { id: 'u22', name: 'Promo Express', handle: 'promo_express' },
  ground: 'rules',
  explanation: 'Les liens d’arnaque ne sont pas permis ici.',
  duration: null,
  liftCause: null,
  afterReport: true,
}

// --- Les faux hooks de la modération ---

/** Ce que rend un useInfiniteQuery de React Query : les pages reçues, et de quoi lire la suite. */
const infinite = <Page,>(pages: Page[]) => ({
  data: { pages, pageParams: pages.map(() => undefined) },
  status: 'success',
  isPending: false,
  isLoading: false,
  isSuccess: true,
  isError: false,
  isFetchNextPageError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  isRefetching: false,
  isFetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const mockQueue = (items: ModerationQueueItem[]) => {
  const page: ModerationQueuePage = { items, nextCursor: null }
  jest
    .mocked(useModerationQueue)
    .mockReturnValue(infinite([page]) as unknown as ReturnType<typeof useModerationQueue>)
}

const mockDecide = jest.fn()
const decided = { ok: true, data: { id: '6172839a-a5b6-4c7d-a8ef-9a0b1c2d3e45' } }

let restoreWindow: (() => void) | null = null

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  mockQueue(queue)
  const removed: RemovedPage = { items: [], nextCursor: null }
  jest
    .mocked(useRemovedItems)
    .mockReturnValue(infinite([removed]) as unknown as ReturnType<typeof useRemovedItems>)
  const history: DecisionHistoryPage = { items: [recentRemoval], nextCursor: null }
  jest
    .mocked(useDecisionHistory)
    .mockReturnValue(infinite([history]) as unknown as ReturnType<typeof useDecisionHistory>)
  mockDecide.mockReset().mockResolvedValue(decided)
  jest
    .mocked(useDecide)
    .mockReset()
    .mockReturnValue({ decide: mockDecide } as unknown as ReturnType<typeof useDecide>)
  mockParams = {}
  mockCanGoBack = true
  mockBack.mockReset()
  // setParams mêle les nouveaux paramètres à l'adresse ; push, replace et navigate vers
  // /moderation la remplacent. L'écran les relit au rendu suivant.
  mockSetParams.mockReset().mockImplementation((params: Record<string, string | undefined>) => {
    mockParams = { ...mockParams, ...params }
  })
  for (const mock of [mockPush, mockReplace, mockNavigate]) {
    mock.mockReset().mockImplementation((href: unknown) => {
      const path = pathOf(href)
      if (path === '/moderation' || path.startsWith('/moderation?')) {
        mockParams = Object.fromEntries(new URLSearchParams(path.slice('/moderation'.length)))
      }
    })
  }
})

afterEach(() => {
  restoreWindow?.()
  restoreWindow = null
})

// --- Les aides ---

const T = {
  scam: fr.t(($) => $.report.reasons.scamSpam),
  privacy: fr.t(($) => $.report.reasons.privacy),
  harassment: fr.t(($) => $.report.reasons.harassment),
  other: fr.t(($) => $.report.reasons.other),
  dismiss: fr.t(($) => $.moderation.dismiss),
  dismissed: fr.t(($) => $.moderation.dismissed),
  unknown: fr.t(($) => $.moderation.detail.unknown),
  backToQueue: fr.t(($) => $.moderation.detail.backToQueue),
  history: fr.t(($) => $.moderation.recent.title),
}

/** Le titre du détail d'un commentaire : « Un commentaire sur Décollage ! ». */
const commentOnDecollage = containing(
  fr.t(($) => $.moderation.detail.commentOn, { title: 'Décollage !' }),
)
/** Le titre du détail de la photo : « la photo 2 de Météo » ou « La 2e photo de Météo ». */
const photoOfMeteo = /(photo 2|2e photo) de Météo/i

/** L'élément de la file dont le motif (son titre) est donné : un lien. */
const queueLink = (reason: string) => screen.getByRole('link', { name: containing(reason) })

/** Ouvre la page, en attendant le profil (qui dit si le membre est administrateur). */
const openModeration = async () => {
  const view = await renderWithProviders(<ModerationScreen />)
  await screen.findByRole('link', { name: containing(T.scam) })
  return view
}

/**
 * Touche l'élément de la file qui porte ce motif, vérifie que l'adresse a changé, puis redessine
 * l'écran avec elle (un nouvel élément à chaque fois : le même objet ne redessine pas). Rend la clé.
 */
const choose = async (
  rerender: (element: ReactElement) => Promise<void> | void,
  reason: string,
) => {
  await passTapGuard()
  await fireEvent.press(queueLink(reason))
  const key = mockParams.item
  expect(key).toEqual(expect.any(String))
  await rerender(<ModerationScreen />)
  return key as string
}

/** Tout le texte d'un élément et de ce qu'il contient, noms et indices lus compris. */
const allTextOf = (element: { props: Record<string, unknown>; children: unknown[] }): string => {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      parts.push(node)
      return
    }
    const instance = node as { props: Record<string, unknown>; children: unknown[] }
    for (const key of ['accessibilityLabel', 'accessibilityHint', 'aria-label']) {
      const value = instance.props[key]
      if (typeof value === 'string') parts.push(value)
    }
    for (const child of instance.children) walk(child)
  }
  walk(element)
  return parts.join(' ').replace(/\s+/g, ' ')
}

/** La place de chaque élément dans l'ordre de l'arbre, celui où le lecteur d'écran lit. */
const readingOrder = (...elements: unknown[]) => {
  const order: unknown[] = []
  const walk = (node: unknown) => {
    order.push(node)
    for (const child of (node as { children: unknown[] }).children) {
      if (typeof child !== 'string') walk(child)
    }
  }
  walk(screen.root)
  return elements.map((element) => order.indexOf(element))
}

// --- Sur un écran large : trois colonnes ---

describe('on a wide window, three columns', () => {
  beforeEach(() => {
    restoreWindow = setDesktopWindow()
  })

  it('gives the subtitle, the « Réservé aux administrateurs » pill and « À traiter (4) »', async () => {
    await openModeration()

    expect(screen.getByText(containing(fr.t(($) => $.moderation.subtitle)))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.adminOnly)))).toBeTruthy()
    const pending = fr.t(($) => $.moderation.pendingCount, { count: 4 })
    expect(screen.getByRole('radio', { name: containing(pending), checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Retirés', checked: false })).toBeTruthy()
  })

  it('gives the name and handle of the author in each queue item, never the reporter', async () => {
    await openModeration()

    for (const item of queue) {
      const reason = item.reasons[0]?.reason
      const label = {
        scam_spam: T.scam,
        privacy: T.privacy,
        harassment: T.harassment,
        other: T.other,
      }[reason as 'scam_spam' | 'privacy' | 'harassment' | 'other']
      const text = allTextOf(queueLink(label))
      expect(text).toContain(item.authorRecord?.name)
      expect(text).toContain(`@${item.authorRecord?.handle}`)
    }
    // La file n'a aucun champ pour qui signale (contrat strict) ; ni nom, ni pseudo d'un autre.
    expect(screen.queryByText(/Malik|@malik/)).toBeNull()
  })

  it('says « Signalé 2 fois » on an item that several members reported, and only there', async () => {
    await openModeration()

    expect(allTextOf(queueLink(T.scam))).toContain(
      fr.t(($) => $.moderation.reportedTimes, { count: 2 }),
    )
    expect(allTextOf(queueLink(T.privacy))).not.toMatch(/Signalé \d+ fois/)
  })

  it('keeps apart two queue items of the same project, the whole project and its 2nd photo', async () => {
    const { rerender } = await openModeration()

    // Deux éléments dans la file, un par partie.
    expect(queueLink(T.privacy)).toBeTruthy()
    expect(queueLink(T.harassment)).toBeTruthy()

    const photoKey = await choose(rerender, T.privacy)
    expect(screen.getByText(photoOfMeteo)).toBeTruthy()
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.dismiss }))

    const wholeKey = await choose(rerender, T.harassment)
    expect(wholeKey).not.toBe(photoKey)
    // Le détail du projet entier ne parle pas de sa photo.
    expect(screen.queryByText(photoOfMeteo)).toBeNull()
    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.dismiss }))

    // Classer la photo garde ouverts les signalements du projet entier, et inversement.
    expect(mockDecide.mock.calls.map(([input]) => input)).toEqual([
      {
        action: 'dismiss',
        target: meteoPhoto.target,
        part: { field: 'photo', mediaId: meteoPhotoId },
      },
      { action: 'dismiss', target: meteoWhole.target },
    ])
  })

  it('marks the item shown in the detail as current, and it alone', async () => {
    const { rerender } = await openModeration()

    await choose(rerender, T.privacy)

    const current = (element: { props: Record<string, unknown> }) => {
      const state = element.props.accessibilityState as { selected?: boolean } | undefined
      return Boolean(element.props['aria-current'] ?? state?.selected)
    }
    expect(current(queueLink(T.privacy))).toBe(true)
    expect(current(queueLink(T.harassment))).toBe(false)
    expect(current(queueLink(T.scam))).toBe(false)
  })

  it('shows in the detail what is reported and where, the copy, the precisions without names, and the actions', async () => {
    const { rerender } = await openModeration()

    await choose(rerender, T.scam)

    expect(screen.getByText(commentOnDecollage)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: fr.t(($) => $.moderation.detail.seeInContext) }),
    ).toBeTruthy()
    expect(screen.getByText(containing(scamComment.snapshot[0]?.value ?? ''))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.moderation.detailsLabel)))).toBeTruthy()
    for (const detail of scamComment.details) {
      expect(screen.getByText(containing(detail))).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: fr.t(($) => $.moderation.remove) })).toBeTruthy()
    expect(screen.getByRole('button', { name: T.dismiss })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Suspendre/ })).toBeTruthy()
  })

  it('shows the author card in the detail: name, handle, « Compte récent », what was decided', async () => {
    const { rerender } = await openModeration()

    await choose(rerender, T.scam)

    // Le nom paraît aussi dans la file : on le cherche au moins deux fois (file, fiche).
    expect(screen.getAllByText(containing('Gains Rapides')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(containing('@gains_rapides')).length).toBeGreaterThanOrEqual(1)
    // Inscrit il y a 3 jours : moins de 14.
    expect(
      screen.getAllByText(containing(fr.t(($) => $.moderation.authorCard.recent))).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('keeps the decided item and its result in the detail until another one is chosen', async () => {
    const { rerender } = await openModeration()
    await choose(rerender, T.scam)

    await passTapGuard()
    await fireEvent.press(screen.getByRole('button', { name: T.dismiss }))
    expect(mockDecide).toHaveBeenCalledWith({ action: 'dismiss', target: scamComment.target })
    // La file relue n'a plus le commentaire ; l'adresse le désigne toujours.
    mockQueue([meteoPhoto, meteoWhole, ownBio])
    await rerender(<ModerationScreen />)

    // Le détail le garde, avec son résultat à la place des boutons, et pas l'état « inconnu ».
    expect(await screen.findByText(containing(T.dismissed))).toBeTruthy()
    expect(screen.getByText(commentOnDecollage)).toBeTruthy()
    expect(screen.queryByRole('button', { name: T.dismiss })).toBeNull()
    expect(screen.queryByText(containing(T.unknown))).toBeNull()

    // Un autre choix : le détail passe à la photo, le résultat d'avant s'en va.
    await choose(rerender, T.privacy)
    expect(screen.getByText(photoOfMeteo)).toBeTruthy()
    expect(screen.queryByText(commentOnDecollage)).toBeNull()
    expect(screen.queryByText(containing(T.dismissed))).toBeNull()
  })

  it('shows a state with a way back for an unknown item in the address', async () => {
    // Une adresse gardée, ou fabriquée : rien dans la file ne lui correspond.
    mockParams = { item: 'comment:7283949a-b6c7-4d8e-b9f0-0b1c2d3e4f56' }
    mockCanGoBack = false
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByText(containing(T.unknown))).toBeTruthy()
    // Témoin : la file reste là, à côté.
    expect(queueLink(T.scam)).toBeTruthy()
    const back =
      screen.queryByRole('link', { name: T.backToQueue }) ??
      screen.getByRole('button', { name: T.backToQueue })
    await fireEvent.press(back)

    expect(mockParams.item).toBeUndefined()
  })

  it('reads the queue, then the detail, then the history', async () => {
    const { rerender } = await openModeration()
    await choose(rerender, T.scam)

    const [queueAt, detailAt, historyAt] = readingOrder(
      queueLink(T.scam),
      screen.getByText(commentOnDecollage),
      screen.getByRole('header', { name: T.history }),
    )
    expect(queueAt).toBeGreaterThanOrEqual(0)
    expect(queueAt).toBeLessThan(detailAt ?? -1)
    expect(detailAt).toBeLessThan(historyAt ?? -1)
  })

  it('shows the recent decisions beside, with a way to the whole history', async () => {
    await openModeration()

    expect(screen.getByRole('header', { name: T.history })).toBeTruthy()
    const removal = fr.t(($) => $.moderation.recent.remove, {
      what: fr.t(($) => $.moderation.recent.what.comment),
    })
    expect(screen.getByText(containing(removal))).toBeTruthy()
    expect(screen.getByRole('link', { name: fr.t(($) => $.moderation.recent.all) })).toBeTruthy()
  })
})

// --- Sur téléphone : la file, puis le détail en page ---

describe('on a phone, the queue then the detail', () => {
  it('shows the queue and a « Historique » button, without a detail', async () => {
    await openModeration()

    expect(screen.getByRole('button', { name: T.history })).toBeTruthy()
    expect(queueLink(T.privacy)).toBeTruthy()
    expect(screen.queryByText(commentOnDecollage)).toBeNull()
    expect(screen.queryByRole('button', { name: T.dismiss })).toBeNull()
  })

  it('opens the detail of an item as a page, without the queue', async () => {
    const { rerender } = await openModeration()

    await choose(rerender, T.scam)

    expect(screen.getByText(commentOnDecollage)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.dismiss })).toBeTruthy()
    // La file n'est plus à l'écran : l'autre élément n'y est plus.
    expect(screen.queryByRole('link', { name: containing(T.privacy) })).toBeNull()
  })

  it('shows a state with a way back to the queue for an unknown item', async () => {
    mockParams = { item: 'project:83949aab-c7d8-4e9f-8a01-1c2d3e4f5067' }
    mockCanGoBack = false
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByText(containing(T.unknown))).toBeTruthy()
    const back =
      screen.queryByRole('link', { name: T.backToQueue }) ??
      screen.getByRole('button', { name: T.backToQueue })
    await fireEvent.press(back)

    expect(mockParams.item).toBeUndefined()
  })

  it('opens a queue item with Enter on the web, its address carried by the link', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    try {
      await openModeration()

      const link = queueLink(T.privacy)
      expect(String(link.props.href)).toContain('item=')
      await fireEvent(link, 'keyDown', { key: 'Enter', preventDefault: () => {} })

      expect(mockParams.item).toEqual(expect.any(String))
    } finally {
      jest.restoreAllMocks()
    }
  })
})
