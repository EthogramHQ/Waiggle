// Tests de la page « Modération » pour la tranche R7b (« Le coin des testeurs ») : la file montre la
// capture d'un message ou la photo d'un appel tant qu'un signalement ouvert les vise (`url` de
// `SnapshotImage`), et les sortes « appel » et « message » se lisent avec leur libellé dans la file,
// les retirés et l'historique. Sans `url`, la carte garde son état seul (« toujours affichée »).
import type { ModerationQueueItem, RemovedItem } from '@ruche/contracts'
import { fireEvent, screen, within } from '@testing-library/react-native'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { getMe } from '../profile/api'
import { adminMe } from '../testing/fixtures'
import {
  decisionHistoryPageOf,
  firstTextOf,
  goneTargetDecision,
  meteoProjectId,
  moderationQueuePageOf,
  removedPageOf,
} from '../testing/moderation'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ModerationScreen } from './ModerationScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../moderation/api', () => ({
  useModerationQueue: jest.fn(),
  useRemovedItems: jest.fn(),
  useDecide: jest.fn(),
  useDecisionHistory: jest.fn(),
}))
/** Les paramètres de l'adresse : `cardOf` y pose l'élément ouvert, comme Expo Router. */
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  // R9 : l'élément de la file montré dans le détail vit dans l'adresse (`?item=`).
  useLocalSearchParams: () => mockParams,
}))

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
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn().mockResolvedValue(undefined),
})

const CAPTURE_URI = 'https://api.waiggle.test/v1/testers/captures/k9'
const PHOTO_URI = 'https://api.waiggle.test/v1/testers/call-photos/p4'

const messageItem: ModerationQueueItem = {
  target: { kind: 'message', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c01' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  context: null,
  contentCreatedAt: '2026-10-20T07:00:00.000Z',
  projectId: meteoProjectId,
  snapshot: [{ field: 'body', value: 'Mon retour : le bouton ne répond pas.' }],
  images: [{ field: 'photo', state: 'present', url: CAPTURE_URI }],
  snapshotsDiffer: false,
  state: 'present',
  concernsMe: false,
  reasons: [{ reason: 'scam_spam', count: 1 }],
  details: [],
  count: 1,
  firstReportedAt: '2026-10-20T08:00:00.000Z',
  lastReportedAt: '2026-10-20T08:00:00.000Z',
  authorRecord: null,
}
const callItem: ModerationQueueItem = {
  ...messageItem,
  target: { kind: 'call', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c02' },
  snapshot: [{ field: 'body', value: 'Venez tester la nouvelle carte.' }],
  images: [{ field: 'photo', state: 'present', url: PHOTO_URI }],
}
/** Une capture déjà partie : pas d'adresse, seulement l'état. */
const goneItem: ModerationQueueItem = {
  ...messageItem,
  target: { kind: 'message', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c03' },
  snapshot: [{ field: 'body', value: 'Un message dont la capture a disparu.' }],
  images: [{ field: 'photo', state: 'gone' }],
}
/** Une photo publique : l'API ne donne pas d'adresse, la file n'en montre pas. */
const publicPhotoItem: ModerationQueueItem = {
  ...messageItem,
  target: { kind: 'project', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c04' },
  snapshot: [{ field: 'title', value: 'Un projet à photo publique.' }],
  images: [{ field: 'photo', state: 'present' }],
}

const removedMessage: RemovedItem = {
  target: { kind: 'message', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c05' },
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  part: null,
  projectId: meteoProjectId,
  text: 'Un message retiré du fil.',
  ground: 'rules',
  explanation: 'Les liens d’arnaque ne sont pas permis ici.',
  removedAt: '2026-10-21T09:00:00.000Z',
  concernsMe: false,
}
const removedCall: RemovedItem = {
  ...removedMessage,
  target: { kind: 'call', id: 'a1b2c3d4-0000-4a26-8b37-48596a7b8c06' },
  text: 'Un appel retiré.',
}

/** Les éléments du rendu qui dessinent l'image de cette adresse (expo-image). */
type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
const imagesOf = (uri: string) =>
  hostsOf(screen.root as unknown as Host).filter((node) =>
    JSON.stringify(node.props.source ?? null).includes(uri),
  )

/** Redessine la page ouverte (Expo Router le fait quand l'adresse change). */
let rerenderScreen: () => Promise<void> = async () => {}

/**
 * La carte d'un signalement. R9 (test adapté à l'écran refait) : la file ne montre qu'une ligne par
 * élément, un lien vers son détail ; la carte complète (la copie, ses images) est dans ce détail. On
 * revient à la file, on suit l'adresse du lien dont la ligne commence par ce texte, puis, dans le
 * détail, on remonte depuis le texte jusqu'à l'ensemble qui porte un lien, comme avant.
 */
const cardOf = async (text: string) => {
  mockParams = {}
  await rerenderScreen()
  const link = screen
    .getAllByRole('link')
    .find(
      (candidate) =>
        String(candidate.props.href ?? '').includes('item=') &&
        within(candidate).queryAllByText(text.slice(0, 20), { exact: false }).length > 0,
    )
  if (!link) throw new Error(`no queue item for ${text}`)
  const href = String(link.props.href)
  mockParams = Object.fromEntries(new URLSearchParams(href.slice(href.indexOf('?'))))
  await rerenderScreen()
  let node = screen.getByText(text).parent
  while (node && within(node).queryAllByRole('link').length === 0) node = node.parent
  if (!node) throw new Error(`no card around ${text}`)
  return within(node)
}

const open = async (queue: ModerationQueueItem[], removed: RemovedItem[] = []) => {
  jest
    .mocked(useModerationQueue)
    .mockReturnValue(
      infinite([moderationQueuePageOf(queue)]) as unknown as ReturnType<typeof useModerationQueue>,
    )
  jest
    .mocked(useRemovedItems)
    .mockReturnValue(
      infinite([removedPageOf(removed)]) as unknown as ReturnType<typeof useRemovedItems>,
    )
  mockParams = {}
  const { rerender } = await renderWithProviders(<ModerationScreen />)
  rerenderScreen = async () => {
    await rerender(<ModerationScreen />)
  }
  await screen.findByText(queue[0]?.snapshot[0]?.value ?? '')
}

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  jest
    .mocked(useDecide)
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
  jest
    .mocked(useDecisionHistory)
    .mockReturnValue(
      infinite([decisionHistoryPageOf()]) as unknown as ReturnType<typeof useDecisionHistory>,
    )
})

describe('the picture of a tester call or message', () => {
  it('draws the capture or the photo when the queue gives its address', async () => {
    await open([messageItem, callItem])

    await cardOf(firstTextOf(messageItem))
    expect(imagesOf(CAPTURE_URI).length).toBeGreaterThan(0)
    await cardOf(firstTextOf(callItem))
    expect(imagesOf(PHOTO_URI).length).toBeGreaterThan(0)
  })

  it('loads it in memory only, never in the disk cache', async () => {
    await open([messageItem, callItem])

    for (const [item, uri] of [
      [messageItem, CAPTURE_URI],
      [callItem, PHOTO_URI],
    ] as const) {
      await cardOf(firstTextOf(item))
      const images = imagesOf(uri)
      // Témoin : l'image est dessinée.
      expect({ uri, drawn: images.length > 0 }).toEqual({ uri, drawn: true })
      expect({ uri, policies: images.map((node) => node.props.cachePolicy) }).toEqual({
        uri,
        policies: images.map(() => 'memory'),
      })
    }
  })

  it('names the picture by its field, inside the card of its target', async () => {
    await open([messageItem])

    const card = await cardOf('Mon retour : le bouton ne répond pas.')
    expect(card.getByRole('image', { name: fr.t(($) => $.moderation.images.photo) })).toBeTruthy()
  })

  it('keeps the state line next to the picture', async () => {
    await open([messageItem])

    const card = await cardOf('Mon retour : le bouton ne répond pas.')
    expect(
      card.getByText(
        fr.t(($) => $.moderation.images.present, {
          image: fr.t(($) => $.moderation.images.photo),
        }),
      ),
    ).toBeTruthy()
  })

  it('draws nothing for an image without address, and keeps its state', async () => {
    await open([goneItem, publicPhotoItem])

    const gone = await cardOf('Un message dont la capture a disparu.')
    expect(
      gone.getByText(
        fr.t(($) => $.moderation.images.gone, { image: fr.t(($) => $.moderation.images.photo) }),
      ),
    ).toBeTruthy()
    expect(gone.queryByRole('image')).toBeNull()
    const publicPhoto = await cardOf('Un projet à photo publique.')
    expect(
      publicPhoto.getByText(
        fr.t(($) => $.moderation.images.present, { image: fr.t(($) => $.moderation.images.photo) }),
      ),
    ).toBeTruthy() // témoin
    expect(publicPhoto.queryByRole('image')).toBeNull()
  })
})

describe('the kinds « call » and « message »', () => {
  it('reads them in the queue', async () => {
    await open([messageItem, callItem])

    expect(
      (await cardOf('Mon retour : le bouton ne répond pas.')).getByText(
        fr.t(($) => $.moderation.kinds.message),
      ),
    ).toBeTruthy()
    expect(
      (await cardOf('Venez tester la nouvelle carte.')).getByText(
        fr.t(($) => $.moderation.kinds.call),
      ),
    ).toBeTruthy()
  })

  it('reads them among the removed contents', async () => {
    await open([messageItem], [removedMessage, removedCall])
    await fireEvent.press(screen.getByRole('radio', { name: 'Retirés' }))

    expect(
      (await cardOf(removedMessage.text)).getByText(fr.t(($) => $.moderation.kinds.message)),
    ).toBeTruthy()
    expect(
      (await cardOf(removedCall.text)).getByText(fr.t(($) => $.moderation.kinds.call)),
    ).toBeTruthy()
  })

  it('reads them in the history', async () => {
    const decision = (kind: 'call' | 'message', id: string) => ({
      ...goneTargetDecision,
      id,
      target: { kind, id: `${id}-t` },
      projectId: meteoProjectId,
    })
    jest
      .mocked(useDecisionHistory)
      .mockReturnValue(
        infinite([
          decisionHistoryPageOf([
            decision('call', '4e5f6071-8293-4eaf-8ab1-3c4d5e6f7001'),
            decision('message', '4e5f6071-8293-4eaf-8ab1-3c4d5e6f7002'),
          ]),
        ]) as unknown as ReturnType<typeof useDecisionHistory>,
      )
    await open([messageItem])
    // R9 : sur téléphone, l'historique complet s'ouvre par le bouton « Historique » de la file.
    await fireEvent.press(screen.getByRole('button', { name: 'Historique' }))

    expect(screen.getAllByText(fr.t(($) => $.moderation.kinds.call)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(fr.t(($) => $.moderation.kinds.message)).length).toBeGreaterThan(0)
  })
})
