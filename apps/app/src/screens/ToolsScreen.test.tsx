// Tests de « Tous les outils » (refonte, tranche R3, docs/scenarios/refonte.md, « Les outils ») : les
// outils des projets publics par ordre alphabétique, chacun avec son nombre de projets publics, et
// qui mène à sa page (/tags/<slug>). GET /v1/tools est un faux hook (tools/api.ts, useTools).
import type { ToolCount, ToolList } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { useTools } from '../tools/api'
import { ToolsScreen } from './ToolsScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// La barre du haut a ses tests (TopNav.test.tsx) ; ici elle ne dessine rien.
jest.mock('../navigation/TopNav', () => ({ TopNav: () => null }))
jest.mock('../notifications/api', () => ({ useUnreadCount: () => 0 }))
jest.mock('../tools/api', () => ({ useTools: jest.fn() }))
const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/tools',
  useRouter: () => ({
    push: mockPush,
    navigate: mockNavigate,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/**
 * L'ordre de l'API : du plus utilisé au moins utilisé. Les noms sont choisis pour qu'un tri naïf
 * (par code des caractères) se trompe : « cursor » en minuscule et « Écrivain » accentué se rangent,
 * en français, entre les autres.
 */
const tools: ToolCount[] = [
  { slug: 'claude', label: 'Claude', projectCount: 41 },
  { slug: 'chatgpt', label: 'ChatGPT', projectCount: 20 },
  { slug: 'python', label: 'Python', projectCount: 12 },
  { slug: 'cursor', label: 'cursor', projectCount: 7 },
  { slug: 'ecrivain', label: 'Écrivain', projectCount: 1 },
]

const query = (overrides: Record<string, unknown>) =>
  ({
    data: undefined,
    status: 'pending',
    isPending: true,
    isSuccess: false,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ReturnType<typeof useTools>

const mockTools = (list: ToolCount[]) =>
  jest.mocked(useTools).mockReturnValue(
    query({
      data: { tools: list } satisfies ToolList,
      status: 'success',
      isPending: false,
      isSuccess: true,
    }),
  )

/** Le nom lu d'une ligne : « Claude, 41 projets publics » (comme Tag.test.tsx). */
const rowName = (label: string, count: number) =>
  fr.t(($) => $.tools.withCount, { label, projects: fr.t(($) => $.tools.projects, { count }) })

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockPush.mockReset()
  mockNavigate.mockReset()
  jest.mocked(useTools).mockReset()
  mockTools(tools)
})

describe('ToolsScreen', () => {
  it('is titled « Tous les outils »', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.title) })).toBeTruthy()
  })

  it('lists the tools in alphabetical order, in French', async () => {
    await renderWithProviders(<ToolsScreen />)

    const names = screen
      .getAllByRole('link')
      .map((link) => String(link.props.accessibilityLabel ?? link.props['aria-label'] ?? ''))
      .filter((name) => tools.some((tool) => name === rowName(tool.label, tool.projectCount)))
    expect(names).toEqual([
      rowName('ChatGPT', 20),
      rowName('Claude', 41),
      rowName('cursor', 7),
      rowName('Écrivain', 1),
      rowName('Python', 12),
    ])
  })

  it('says « 7 projets publics » on each line, in the singular for one', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByText(containing(fr.t(($) => $.tools.projects, { count: 7 })))).toBeTruthy()
    expect(fr.t(($) => $.tools.projects, { count: 1 })).toBe('1 projet public')
    expect(screen.getByText(containing('1 projet public'))).toBeTruthy()
  })

  it('opens the page of a tool', async () => {
    await renderWithProviders(<ToolsScreen />)

    await fireEvent.press(screen.getByRole('link', { name: rowName('Écrivain', 1) }))

    const paths = [...mockPush.mock.calls, ...mockNavigate.mock.calls].map((call) =>
      pathOf(call[0]),
    )
    expect(paths).toEqual(['/tags/ecrivain'])
  })

  it('says when no public project names a tool yet', async () => {
    mockTools([])
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByText(containing(fr.t(($) => $.tools.emptyTitle)))).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.empty)))).toBeTruthy()
  })

  it('says when the tools could not load, and offers to retry', async () => {
    const failed = query({
      status: 'error',
      isPending: false,
      isError: true,
      error: new ApiError('internal'),
    })
    jest.mocked(useTools).mockReturnValue(failed)
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByText(containing(fr.t(($) => $.tools.errorTitle)))).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.retry) }))
    expect(failed.refetch).toHaveBeenCalledTimes(1)
  })
})
