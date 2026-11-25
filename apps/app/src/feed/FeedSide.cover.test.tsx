// Tests de la colonne du Fil sur ordinateur comme source de la photo qui vole jusqu'à la page du
// projet (tranche R17, docs/scenarios/refonte.md, « La carte qui devient la page »). Chaque ligne
// d'« Ils cherchent des testeurs » reçoit l'identifiant de son projet (`coverId`) : son ouverture
// passe par `capture`, qui prépare le vol de la vignette, puis par la navigation de la colonne.
//
// `useCoverSource` est remplacé par un faux (comme `ui/coverSources.test.tsx`), qui note l'identifiant
// reçu et ouvre tout de suite. Les lectures (ses ruches, le fil des testeurs) sont de faux hooks.
import type { ProjectSummary } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { useCoverSource } from '../ui/coverTransition'
import { useDiscoverFeed } from './api'
import { FeedSide } from './FeedSide'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../hives/api', () => ({
  useMyHives: () => ({ isPending: false, data: { hives: [] } }),
}))
jest.mock('../suggestions/api', () => ({ useSuggestions: jest.fn() }))
// R19 : la récolte (`gamification/api`), que l'écran lit pour soi ; ces tests ne la regardent
// pas : une lecture qui n'arrive jamais, une écriture qui ne fait rien. `virtual` : le module
// n'existe pas encore quand ces lignes sont écrites (tests avant le code), Jest ne le cherche pas.
jest.mock(
  '../gamification/api',
  () => ({
    useHarvest: () => ({ data: undefined, isPending: true, isError: false, refetch: jest.fn() }),
    useGameSettings: () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false }),
  }),
  { virtual: true },
)
jest.mock('../navigation/links', () => ({ useOpenDemo: () => jest.fn() }))
jest.mock('./api', () => ({ useDiscoverFeed: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/feed',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))
const mockCapture = jest.fn((then: () => void) => then())
jest.mock('../ui/coverTransition', () => ({
  ...jest.requireActual('../ui/coverTransition'),
  useCoverSource: jest.fn(() => ({ ref: jest.fn(), capture: mockCapture, bounceStyle: {} })),
}))

/** « Quel papillon ? », un projet testable de Nora, avec sa démo. */
const papillon = {
  ...summaryOf({
    ...recipesProject,
    id: 'e2f3a4b5-6c7d-4e8f-9a01-b2c3d4e5f607',
    title: 'Quel papillon ?',
    author: { id: 'u-nora', name: 'Nora', avatarUrl: null },
    isMine: false,
  }),
  demoUrl: 'https://papillon.example.com',
} as ProjectSummary

beforeEach(() => {
  mockPush.mockReset()
  mockCapture.mockClear()
  jest.mocked(useCoverSource).mockClear()
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(useDiscoverFeed).mockReturnValue({
    data: {
      pages: [
        {
          items: [{ kind: 'project', at: '2026-10-19T12:00:00.000Z', project: papillon }],
          nextCursor: null,
          followedAuthorIds: [],
        },
      ],
      pageParams: [undefined],
    },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useDiscoverFeed>)
})

describe('the testers beside the feed as a source of the card photo (R17)', () => {
  it('opens a row through its cover, then at the project page', async () => {
    await renderWithProviders(<FeedSide withSuggestions={false} shownProjectIds={new Set()} />)

    expect(useCoverSource).toHaveBeenCalledWith(papillon.id)
    await fireEvent.press(screen.getByRole('link', { name: 'Quel papillon ?' }))

    expect(mockCapture).toHaveBeenCalledTimes(1)
    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual([`/projects/${papillon.id}`])
  })
})
