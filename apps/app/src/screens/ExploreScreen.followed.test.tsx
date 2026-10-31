// Tests d'Explorer, en plus de ExploreScreen.test.tsx (tranche R3, « Suivre l'auteur depuis une
// carte ») : la pastille « Suivre Nora » ne se pose pas sur la carte d'un auteur déjà suivi (le fil
// « Découvrir » le dit par `followedAuthorIds`), et retoucher « Tu suis Nora » arrête de suivre
// (jur-J8) : l'écran passe à `toggle` l'état qu'il affiche. Même faux modules que l'autre fichier.
import type { DiscoverFeedPage, FeedItem, Project } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ExploreScreen } from './ExploreScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../feed/api', () => ({
  feedQueryKey: ['feed'],
  useFollowingFeed: jest.fn(),
  useDiscoverFeed: jest.fn(),
  useFeedNews: jest.fn(),
}))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

const mockToggle = jest.fn()

const itemOf = (project: Project): FeedItem => ({
  kind: 'project',
  at: project.createdAt,
  project: summaryOf(project),
})
// « Récents » : un projet de Nora, un de Max (que Léa suit déjà).
const fromNora = itemOf({
  ...recipesProject,
  id: '9c4f5d1b-6e70-4f81-8c93-0d1e2f3a4b52',
  author: { id: 'u3', name: 'Nora', avatarUrl: null },
  title: 'Le carnet de jardin',
  isMine: false,
})
const fromMax = itemOf({
  ...recipesProject,
  id: '8b3e4c0a-5d6f-4e70-9b82-9c0d1e2f3a41',
  author: { id: 'u2', name: 'Max', avatarUrl: null },
  title: 'Le tri des photos',
  isMine: false,
})

/** Un fil d'une page, comme le rend useInfiniteQuery. */
const feedOf = (page: DiscoverFeedPage) => ({
  data: { pages: [page], pageParams: [undefined] },
  status: 'success',
  isPending: false,
  isSuccess: true,
  isError: false,
  error: null,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  refetch: jest.fn(),
})

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockToggle.mockReset()
  jest.mocked(useFeedNews).mockReturnValue({ count: null, more: false })
  jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  jest.mocked(useTools).mockReturnValue({
    data: { tools: [] },
    isError: false,
  } as unknown as ReturnType<typeof useTools>)
  // Le carrousel n'a aucun projet ; « Récents » a Nora et Max, et la page dit que Max est suivi.
  jest
    .mocked(useDiscoverFeed)
    .mockImplementation(
      ({ testers }) =>
        feedOf(
          testers
            ? { items: [], nextCursor: null, followedAuthorIds: [] }
            : { items: [fromNora, fromMax], nextCursor: null, followedAuthorIds: ['u2'] },
        ) as unknown as ReturnType<typeof useDiscoverFeed>,
    )
})

const follow = (name: string) => fr.t(($) => $.follow.member, { name })
const following = (name: string) => fr.t(($) => $.follow.memberFollowing, { name })

describe('ExploreScreen, the chip of an author already followed', () => {
  it('puts no chip on an author already followed', async () => {
    await renderWithProviders(<ExploreScreen />)

    // Témoin : la carte de Max est là, et Nora, qu'on ne suit pas, a sa pastille.
    expect(screen.getByRole('link', { name: 'Le tri des photos' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: follow('Nora') })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: follow('Max') })).toBeNull()
    expect(screen.queryByRole('switch', { name: following('Max') })).toBeNull()
  })

  it('stops following when « Tu suis Nora » is touched again', async () => {
    // La pastille a une garde contre la double tape (TAP_GUARD_MS) : la seconde tape vient plus
    // tard, sous une fausse horloge (RNTL et findBy… marchent sous faux minuteurs).
    jest.useFakeTimers()
    try {
      await renderWithProviders(<ExploreScreen />)
      await fireEvent.press(screen.getByRole('switch', { name: follow('Nora') }))
      jest.advanceTimersByTime(1000)
      await fireEvent.press(screen.getByRole('switch', { name: following('Nora') }))
    } finally {
      jest.useRealTimers()
    }

    // L'écran dit à chaque fois ce qu'il affichait : pas suivie, puis suivie (donc arrêter).
    expect(mockToggle.mock.calls.map((call) => call[0])).toEqual([false, true])
    expect(screen.getByRole('switch', { name: follow('Nora') })).not.toBeChecked()
  })
})
