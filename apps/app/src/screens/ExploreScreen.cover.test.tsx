// Tests d'Explorer comme source de la photo qui vole jusqu'à la page du projet (tranche R17,
// docs/scenarios/refonte.md, « La carte qui devient la page » : « un carrousel d'Explorer »). Une
// carte d'« À la une » et une ligne d'« Ils cherchent des testeurs » (le panneau des grands écrans)
// reçoivent l'identifiant de leur projet (`coverId`) : leur ouverture passe par `capture`, qui
// prépare le vol, puis par la navigation de l'écran, inchangée.
//
// `useCoverSource` est remplacé par un faux (comme `ui/coverSources.test.tsx`), qui note l'identifiant
// reçu et ouvre tout de suite. Sans `coverId`, la carte ouvrirait sans passer par lui : c'est ce
// qui rend ces tests rouges si l'écran l'oublie.
import type { DiscoverFeedPage, FeedItem, ProjectSummary, ShowcaseItem } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { useDiscoverFeed, useFeedNews } from '../feed/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing } from '../testing/text'
import { useTools } from '../tools/api'
import { useCoverSource } from '../ui/coverTransition'
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
jest.mock('../showcase/api', () => ({
  useMemberShowcase: () => ({ data: { items: mockFeatured }, isPending: false }),
}))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/explore',
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))
const mockCapture = jest.fn((then: () => void) => then())
jest.mock('../ui/coverTransition', () => ({
  ...jest.requireActual('../ui/coverTransition'),
  useCoverSource: jest.fn(() => ({ ref: jest.fn(), capture: mockCapture, bounceStyle: {} })),
}))

// --- Les données ---

/** « À la une » : un projet de la vitrine (contrat `ShowcaseItem`). */
const decollage: ShowcaseItem = {
  id: 'd1e2c3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6',
  title: 'Décollage !',
  pitch: 'Un quiz sur l’espace.',
  status: 'testable',
  cover: null,
  author: { name: 'Papi Jean', avatarUrl: null },
}
const mockFeatured: ShowcaseItem[] = [decollage]

/** Un projet d'un autre membre, en élément de fil ; avec une démo, il entre chez les testeurs. */
const itemOf = (n: number, title: string, demoUrl: string | null = null): FeedItem => ({
  kind: 'project',
  at: `2026-10-${String(20 - n).padStart(2, '0')}T12:00:00.000Z`,
  project: {
    ...summaryOf({
      ...recipesProject,
      id: `e2000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      title,
      author: { id: `u${10 + n}`, name: 'Nora', avatarUrl: null },
      isMine: false,
    }),
    demoUrl,
  } as ProjectSummary,
})
const recent = [itemOf(1, 'Arrosage malin')]
const papillon = itemOf(7, 'Quel papillon ?', 'https://papillon.example.com')
const papillonId = papillon.kind === 'project' ? papillon.project.id : ''

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
  mockPush.mockReset()
  mockCapture.mockClear()
  jest.mocked(useCoverSource).mockClear()
  mockSession({ user: { id: leaMe.id, name: leaMe.name } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(useFeedNews).mockReturnValue({ count: null, more: false, authors: [], kinds: [] })
  jest.mocked(useFollow).mockReturnValue({ toggle: jest.fn(), error: false, expired: false })
  jest.mocked(useTools).mockReturnValue({
    data: { tools: [], others: [] },
    isError: false,
  } as unknown as ReturnType<typeof useTools>)
  jest.mocked(useDiscoverFeed).mockImplementation(
    ({ testers: wanted }) =>
      feedOf({
        items: wanted ? [papillon] : recent,
        nextCursor: null,
        followedAuthorIds: [],
      }) as unknown as ReturnType<typeof useDiscoverFeed>,
  )
})

/** Le temps d'un test, une fenêtre de cette taille ; le téléphone est remis à la fin. */
const atWindow = async (width: number, height: number, run: () => Promise<void>) => {
  const window = { width, height, scale: 2, fontScale: 1 }
  const phone = { width: 390, height: 844, scale: 3, fontScale: 1 }
  Dimensions.set({ window, screen: window })
  try {
    await run()
  } finally {
    Dimensions.set({ window: phone, screen: phone })
  }
}

const pushed = () => mockPush.mock.calls.map(([href]) => pathOf(href))

describe('Explore as a source of the card photo that becomes the page (R17)', () => {
  it('opens a card of « À la une » through its cover, then at the project page', async () => {
    await renderWithProviders(<ExploreScreen />)

    expect(useCoverSource).toHaveBeenCalledWith(decollage.id)
    const card = screen.getAllByRole('link', { name: containing(decollage.title) })[0]
    if (!card) throw new Error('no card « Décollage ! »')
    await fireEvent.press(card)

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(pushed()).toEqual([`/projects/${decollage.id}`])
  })

  it('opens a row of the testers panel through its cover, on a wide screen', () =>
    atWindow(1920, 1080, async () => {
      await renderWithProviders(<ExploreScreen />)

      expect(useCoverSource).toHaveBeenCalledWith(papillonId)
      await fireEvent.press(screen.getByRole('link', { name: 'Quel papillon ?' }))

      expect(mockCapture).toHaveBeenCalledTimes(1)
      expect(pushed()).toEqual([`/projects/${papillonId}`])
    }))
})
