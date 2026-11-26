// Tests de la file de modération en temps réel (R21, docs/scenarios/refonte.md : « un signalement
// neuf paraît dans la file de l'administrateur »). La file ne se relit jamais seule, exprès : une
// carte ne vient pas remplacer, sous le doigt, celle que l'administrateur allait toucher. Le signal
// `moderation` la marque donc seulement périmée (choix 10 du plan, `refetchType: 'none'`) :
// l'arrivée est annoncée au lecteur d'écran, une fois, et la file se relit à la prochaine ouverture.
//
// Le vrai écran et les vrais hooks de la modération ; seul le client de l'API est simulé, avec la
// file que le serveur rendrait.
import { act, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { request } from '../api/client'
import { getMe } from '../profile/api'
import { adminMe } from '../testing/fixtures'
import { liveSignal } from '../testing/live'
import {
  fakeReviewsItem,
  firstTextOf,
  moderationQueuePageOf,
  scamCommentItem,
} from '../testing/moderation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ModerationScreen } from './ModerationScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// Le profil dit si le membre est administrateur.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
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
  useLocalSearchParams: () => ({}),
}))

/** La file que rend GET /v1/moderation/reports, choisie par le test. */
let serverQueue = [scamCommentItem]
let queueReads = 0

beforeEach(() => {
  serverQueue = [scamCommentItem]
  queueReads = 0
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  jest
    .mocked(request)
    .mockReset()
    .mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/moderation/reports')) {
        queueReads += 1
        return { ok: true, data: moderationQueuePageOf(serverQueue) }
      }
      return { ok: false, error: 'network' }
    })
})

const scamText = () => containing(firstTextOf(scamCommentItem).slice(0, 20))
const reviewsText = () => containing(firstTextOf(fakeReviewsItem))

/** Ouvre la file, lue une première fois. */
const openQueue = async () => {
  const rendered = await renderWithProviders(<ModerationScreen key="first" />)
  await screen.findByText(scamText())
  // Témoin : le signalement qui arrivera n'est pas encore là.
  expect(screen.queryByText(reviewsText())).toBeNull()
  return rendered
}

describe('the moderation queue in real time', () => {
  it('does not reread the queue by itself when a new report arrives', async () => {
    const { queryClient } = await openQueue()
    const before = queueReads

    serverQueue = [scamCommentItem, fakeReviewsItem]
    await liveSignal(queryClient, { topic: 'moderation', kind: 'moderation' })

    // Rien ne bouge sous le doigt : la carte affichée reste, la nouvelle n'est pas insérée.
    expect(queueReads).toBe(before)
    expect(screen.getByText(scamText())).toBeTruthy()
    expect(screen.queryByText(reviewsText())).toBeNull()
  })

  it('announces « Nouveau signalement » once to the screen reader', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    const { queryClient } = await openQueue()
    announce.mockClear()

    serverQueue = [scamCommentItem, fakeReviewsItem]
    await liveSignal(queryClient, { topic: 'moderation', kind: 'moderation' })
    await act(async () => {})

    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith(fr.t(($) => $.moderation.liveArrival))
    // Témoin : le texte de la clé (R21), lu tel quel.
    expect(fr.t(($) => $.moderation.liveArrival)).toBe('Nouveau signalement')
    announce.mockRestore()
  })

  it('shows the new report the next time the queue opens', async () => {
    const { queryClient, rerender } = await openQueue()
    // Comme dans l'appli (api/query-client.ts) : une lecture de moins d'une minute est fraîche, et
    // revenir sur la file ne la relit pas d'elle-même. Seul le signal la rend périmée.
    queryClient.setDefaultOptions({
      queries: { ...queryClient.getDefaultOptions().queries, staleTime: 60_000 },
    })

    serverQueue = [scamCommentItem, fakeReviewsItem]
    await liveSignal(queryClient, { topic: 'moderation', kind: 'moderation' })
    // L'administrateur quitte la file et y revient (un nouvel écran, le même cache).
    await rerender(<ModerationScreen key="again" />)

    expect(await screen.findByText(reviewsText())).toBeTruthy()
  })

  it('does not reread the queue on return without a signal (witness)', async () => {
    const { rerender, queryClient } = await openQueue()
    queryClient.setDefaultOptions({
      queries: { ...queryClient.getDefaultOptions().queries, staleTime: 60_000 },
    })
    const before = queueReads

    serverQueue = [scamCommentItem, fakeReviewsItem]
    await rerender(<ModerationScreen key="again" />)
    await screen.findByText(scamText())

    expect(queueReads).toBe(before)
  })
})
