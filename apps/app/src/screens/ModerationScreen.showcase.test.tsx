// L'onglet « Vitrine de l'accueil » de la page Modération (tranche R12, planche R12-Vitrine) : deux
// onglets en tête de la page, « Signalements » (la file, comme avant) et « Vitrine de l'accueil »,
// qui ouvre `moderation/ShowcaseTab` et le garde dans l'adresse (`?tab=showcase`). Mêmes
// simulations que ModerationScreen.focus.test.tsx ; l'onglet lit la vitrine par ses hooks simulés.
import type { ModerationShowcase } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import {
  useDecide,
  useDecisionHistory,
  useModerationQueue,
  useRemovedItems,
} from '../moderation/api'
import { useModerationShowcase, useSetShowcase } from '../moderation/showcase-api'
import { getMe } from '../profile/api'
import { adminMe } from '../testing/fixtures'
import {
  decisionHistoryPageOf,
  firstTextOf,
  moderationQueuePageOf,
  removedPageOf,
  scamCommentItem,
} from '../testing/moderation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
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
jest.mock('../moderation/showcase-api', () => ({
  useModerationShowcase: jest.fn(),
  useSetShowcase: jest.fn(),
}))

// Le routeur et l'adresse, lus par le test : `params` est changé avant le rendu.
const mockNav = {
  setParams: jest.fn(),
  params: {} as Record<string, string>,
}
jest.mock('expo-router', () => ({
  usePathname: () => '/moderation',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    setParams: mockNav.setParams,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockNav.params,
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

/** Une vitrine d'un seul projet, sans autre projet public. */
const showcase: ModerationShowcase = {
  items: [
    {
      project: {
        id: 'd1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6',
        title: 'Décollage !',
        status: 'testable',
        cover: null,
        author: { id: 'u-papi', name: 'Papi Jean' },
      },
      position: 1,
      addedAt: '2026-11-14T10:02:00.000Z',
      editedSinceAdded: false,
    },
  ],
  candidates: [],
}

const T = {
  reports: fr.t(($) => $.moderation.showcase.reportsTab),
  tab: fr.t(($) => $.moderation.showcase.tab),
  title: fr.t(($) => $.moderation.showcase.title),
  sections: fr.t(($) => $.moderation.showcase.sections),
}

beforeEach(() => {
  mockNav.params = {}
  mockNav.setParams.mockReset()
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
  jest.mocked(useModerationShowcase).mockReturnValue({
    data: showcase,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useModerationShowcase>)
  jest
    .mocked(useSetShowcase)
    .mockReturnValue({ save: jest.fn(), pending: false } as ReturnType<typeof useSetShowcase>)
})

describe('the « Vitrine de l’accueil » tab of the moderation (R12)', () => {
  it('opens on the reports, with the two tabs named as a group of their own', async () => {
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('radio', { name: T.reports, checked: true })).toBeTruthy()
    expect(screen.getByRole('radio', { name: T.tab, checked: false })).toBeTruthy()
    expect(screen.getByLabelText(T.sections).props.accessibilityRole).toBe('radiogroup')
    expect(screen.getByText(firstTextOf(scamCommentItem))).toBeTruthy()
    // Témoin d'absence : la vitrine n'est pas lue tant que son onglet est fermé.
    expect(useModerationShowcase).not.toHaveBeenCalled()
  })

  it('shows the showcase in place of the queue, and keeps it in the address', async () => {
    await renderWithProviders(<ModerationScreen />)
    await screen.findByRole('radio', { name: T.tab })

    await fireEvent.press(screen.getByRole('radio', { name: T.tab }))

    expect(await screen.findByRole('header', { name: containing(T.title) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: T.tab, checked: true })).toBeTruthy()
    expect(screen.queryByText(firstTextOf(scamCommentItem))).toBeNull()
    expect(mockNav.setParams).toHaveBeenCalledWith(expect.objectContaining({ tab: 'showcase' }))
  })

  it('opens the showcase from its address (?tab=showcase)', async () => {
    mockNav.params = { tab: 'showcase' }
    await renderWithProviders(<ModerationScreen />)

    expect(await screen.findByRole('header', { name: containing(T.title) })).toBeTruthy()
    expect(screen.getByRole('radio', { name: T.tab, checked: true })).toBeTruthy()
  })
})
