// Le focus d'ouverture de la fenêtre « Retirer » de la modération (R6a, correction C8, H3, puis C9).
// C8 l'ouvrait sur « Annuler ». La contre-visite du design (S1) a montré que cela ne protège de
// rien ici : « Retirer » reste inactif tant que le fondement et l'explication manquent, et
// « Annuler » coûtait un Tab de plus, entendu avant le formulaire. Une fenêtre à champs obligatoires
// s'ouvre donc sur son premier champ : le groupe « Fondement », par son premier choix. Mêmes
// simulations que ModerationScreen.test.tsx, en plus court.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native'
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
  moderationQueuePageOf,
  removedPageOf,
  scamCommentItem,
} from '../testing/moderation'
import { watchOpeningFocus } from '../testing/openingFocus'
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
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/** Ce que rend un useInfiniteQuery, pour une page déjà reçue. */
const infinite = <Page,>(page: Page) => ({
  data: { pages: [page], pageParams: [undefined] },
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

beforeEach(() => {
  mockSession({ user: { id: adminMe.id, name: adminMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(adminMe)
  jest
    .mocked(useModerationQueue)
    .mockReturnValue(
      infinite(moderationQueuePageOf()) as unknown as ReturnType<typeof useModerationQueue>,
    )
  jest
    .mocked(useRemovedItems)
    .mockReturnValue(infinite(removedPageOf()) as unknown as ReturnType<typeof useRemovedItems>)
  jest
    .mocked(useDecisionHistory)
    .mockReturnValue(
      infinite(decisionHistoryPageOf()) as unknown as ReturnType<typeof useDecisionHistory>,
    )
  jest
    .mocked(useDecide)
    .mockReturnValue({ decide: jest.fn() } as unknown as ReturnType<typeof useDecide>)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('the « Retirer » window opening focus', () => {
  it('opens on the first choice of « Fondement », not on « Annuler » or « Retirer »', async () => {
    await renderWithProviders(<ModerationScreen />)
    await screen.findByText(firstTextOf(scamCommentItem))
    const focused = watchOpeningFocus()

    let card = screen.getByText(firstTextOf(scamCommentItem)).parent
    while (card && within(card).queryAllByRole('link').length === 0) card = card.parent
    if (!card) throw new Error('no card')
    await fireEvent.press(within(card).getByRole('button', { name: 'Retirer' }))

    await waitFor(() => expect(focused()).toBe(fr.t(($) => $.moderation.grounds.illegal)))
  })
})
