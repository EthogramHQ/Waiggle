// Tests des outils d'un projet (R6b) : un outil du catalogue est un lien vers sa page ; un « Autre »
// (nom tapé par le membre, pas encore au catalogue) est un texte simple, sans lien, lu en entier.
import { fireEvent, screen } from '@testing-library/react-native'
import { getProject } from '../projects/api'
import { recipesProject } from '../testing/projects'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ProjectScreen } from './ProjectScreen'
import { id, mockPush, resetProjectScreenMocks } from './ProjectScreen.testkit'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/client', () => {
  const actual: typeof import('../api/client') = jest.requireActual('../api/client')
  const { categoryList }: typeof import('../testing/categories') =
    jest.requireActual('../testing/categories')
  return {
    ...actual,
    request: jest.fn((...args: Parameters<typeof actual.request>) =>
      String(args[0]).startsWith('/v1/categories')
        ? Promise.resolve({ ok: true, data: categoryList('fr') })
        : actual.request(...args),
    ),
  }
})
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../projects/api', () => ({ getProject: jest.fn(), deleteProject: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
jest.mock('../members/api', () => ({
  useMember: () => ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed: false },
    isError: false,
    isPending: false,
  }),
}))
jest.mock('../notes/api', () => ({ usePublishNote: jest.fn(), useDeleteNote: jest.fn() }))
jest.mock('../reactions/api', () => ({ useReaction: jest.fn() }))
jest.mock('../comments/api', () => ({
  useComments: jest.fn(),
  usePostComment: jest.fn(),
  useEditComment: jest.fn(),
  useDeleteComment: jest.fn(),
  useHideComment: jest.fn(),
}))
jest.mock('../mentions/api', () => ({ useMentionable: () => [] }))
jest.mock('../ui/clipboard', () => ({ copyText: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}))

beforeEach(() => {
  resetProjectScreenMocks()
  jest.mocked(getProject).mockResolvedValue({
    ...recipesProject,
    tools: [
      { label: 'Claude Code', slug: 'claude-code', inCatalogue: true },
      { label: 'Teachable Machine', slug: 'teachable-machine', inCatalogue: false },
    ],
  })
})

describe('ProjectScreen tools', () => {
  it('opens the page of a catalogue tool', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Claude Code' }))

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/tags/[slug]',
      params: { slug: 'claude-code' },
    })
  })

  it('shows an « Autre » as plain text: no link, read with its full name', async () => {
    await renderWithProviders(<ProjectScreen id={id} />)

    const spoken = fr.t(($) => $.tool.otherSpoken, { name: 'Teachable Machine' })
    expect(await screen.findByLabelText(spoken)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Teachable Machine/ })).toBeNull()

    mockPush.mockClear()
    await fireEvent.press(screen.getByText('Teachable Machine'))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
