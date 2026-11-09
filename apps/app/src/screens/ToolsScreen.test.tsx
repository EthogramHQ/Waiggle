// Tests de « Tous les outils » (refonte : R3, puis le catalogue normé de R6b ; docs/scenarios/
// refonte.md, « Tous les outils », planche `R3-Outils`). La page « Outils » dit ce qu'est le
// catalogue, offre un champ « Chercher un outil » et des pastilles de familles (« Tous », puis chaque
// famille) ; puis « Les plus utilisés » (les dix outils qui comptent le plus de projets) et « De A à
// Z » (tout le catalogue, dans l'ordre alphabétique du français), chaque outil avec sa famille et son
// nombre de projets, qui mène à sa page (/tags/<slug>). Le champ et les pastilles filtrent les deux
// listes. En bas, « Pas encore dans le catalogue » : les « Autre » des projets visibles, en texte
// simple, sans lien.
//
// GET /v1/tools est un faux hook (`tools/api.ts`, `useTools`), qui rend la forme `ToolList` du
// contrat : `{ tools: CatalogueTool[], others: { name }[] }`.
import type { CatalogueTool, ToolList } from '@ruche/contracts'
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
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

/**
 * Le catalogue, dans l'ordre de l'API : du plus utilisé au moins utilisé. Douze outils de toutes
 * les familles : les dix premiers font « Les plus utilisés ». Les noms sont choisis pour qu'un tri
 * naïf (par code des caractères) se trompe : « cursor » en minuscule et « Écrivain » accentué se
 * rangent, en français, entre les autres. « HASS » est un autre nom (alias) de Home Assistant.
 */
const tools: CatalogueTool[] = [
  { slug: 'claude', name: 'Claude', family: 'assistant', aliases: [], projectCount: 41 },
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    family: 'assistant',
    aliases: ['Chat GPT'],
    projectCount: 20,
  },
  { slug: 'midjourney', name: 'Midjourney', family: 'creation', aliases: [], projectCount: 15 },
  { slug: 'python', name: 'Python', family: 'development', aliases: [], projectCount: 12 },
  { slug: 'lovable', name: 'Lovable', family: 'no-code', aliases: [], projectCount: 9 },
  { slug: 'cursor', name: 'cursor', family: 'development', aliases: [], projectCount: 7 },
  {
    slug: 'home-assistant',
    name: 'Home Assistant',
    family: 'smart-home',
    aliases: ['HASS'],
    projectCount: 6,
  },
  { slug: 'make', name: 'Make', family: 'automation', aliases: ['Make.com'], projectCount: 5 },
  { slug: 'claude-code', name: 'Claude Code', family: 'development', aliases: [], projectCount: 4 },
  { slug: 'arduino', name: 'Arduino', family: 'hardware', aliases: [], projectCount: 3 },
  { slug: 'ecrivain', name: 'Écrivain', family: 'creation', aliases: [], projectCount: 1 },
  { slug: 'zapier', name: 'Zapier', family: 'automation', aliases: [], projectCount: 0 },
]

const MOST_USED = tools.slice(0, 10).map((tool) => tool.name)
const A_TO_Z = [
  'Arduino',
  'ChatGPT',
  'Claude',
  'Claude Code',
  'cursor',
  'Écrivain',
  'Home Assistant',
  'Lovable',
  'Make',
  'Midjourney',
  'Python',
  'Zapier',
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

const mockTools = (list: CatalogueTool[], others: ToolList['others'] = []) =>
  jest.mocked(useTools).mockReturnValue(
    query({
      data: { tools: list, others } satisfies ToolList,
      status: 'success',
      isPending: false,
      isSuccess: true,
    }),
  )

/** Le nom lu d'une vue, qu'il soit écrit pour le natif ou pour le web. */
const nameOf = (props: Record<string, unknown>) =>
  String(props.accessibilityLabel ?? props['aria-label'] ?? '')

/**
 * Les outils des liens de la page, dans l'ordre de lecture : un lien d'outil est nommé « Claude,
 * 41 projets » (son nom, puis son nombre). « Claude Code, … » ne se confond pas avec « Claude, … ».
 */
const listedTools = () =>
  screen
    .queryAllByRole('link')
    .map((link) => nameOf(link.props))
    .map((name) => tools.find((tool) => name.startsWith(`${tool.name}, `))?.name)
    .filter((name): name is string => name !== undefined)

/** Les outils montrés, chacun une fois (le filtre vaut pour les deux listes). */
const shownTools = () => [...new Set(listedTools())].sort()

const SEARCH = fr.t(($) => $.tools.search)

beforeEach(() => {
  mockSession({ user: { id: 'u1', name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockPush.mockReset()
  mockNavigate.mockReset()
  jest.mocked(useTools).mockReset()
  mockTools(tools)
})

describe('ToolsScreen', () => {
  it('is titled « Outils » and says what the catalogue holds', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.title) })).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.subtitle)))).toBeTruthy()
  })

  it('lists the ten most used tools first, then the whole catalogue from A to Z, in French', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.mostUsed) })).toBeTruthy()
    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.aToZ) })).toBeTruthy()
    expect(listedTools()).toEqual([...MOST_USED, ...A_TO_Z])
  })

  it('shows the family and the number of projects of each tool, and « Aucun projet pour l’instant » without project', async () => {
    await renderWithProviders(<ToolsScreen />)

    const claudeDetail = fr.t(($) => $.tools.detail, {
      family: fr.t(($) => $.tools.family.assistant),
      projects: fr.t(($) => $.tools.projects, { count: 41 }),
    })
    expect(screen.getAllByText(containing(claudeDetail)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(fr.t(($) => $.tools.noProjects))).length).toBe(1)
    // Le singulier pour un seul projet.
    expect(fr.t(($) => $.tools.projects, { count: 1 })).toBe('1 projet')
  })

  it('opens the page of a tool', async () => {
    await renderWithProviders(<ToolsScreen />)

    const link = screen
      .getAllByRole('link')
      .find((one) => nameOf(one.props).startsWith('Home Assistant, '))
    if (!link) throw new Error('no link to Home Assistant')
    await fireEvent.press(link)

    const paths = [...mockPush.mock.calls, ...mockNavigate.mock.calls].map((call) =>
      pathOf(call[0]),
    )
    expect(paths).toEqual(['/tags/home-assistant'])
  })

  it('filters both lists with the search field, accents, case and other names aside', async () => {
    await renderWithProviders(<ToolsScreen />)

    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'clau')
    expect(shownTools()).toEqual(['Claude', 'Claude Code'])
    // « Claude » est dans les deux listes ; « Claude Code » seulement… s'il fait partie des dix :
    // ici oui. Les deux listes restent filtrées par le même texte.
    expect(listedTools().filter((name) => name === 'Claude')).toHaveLength(2)

    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'ECRI')
    expect(shownTools()).toEqual(['Écrivain'])

    // Un autre nom (alias) trouve l'outil : « hass » pour Home Assistant.
    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'hass')
    expect(shownTools()).toEqual(['Home Assistant'])
  })

  it('filters both lists by family with the pills, « Tous » first and checked', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByLabelText(fr.t(($) => $.tools.familiesLabel))).toBeTruthy()
    expect(
      screen.getByRole('radio', { name: fr.t(($) => $.tools.all), checked: true }),
    ).toBeTruthy()
    await fireEvent.press(
      screen.getByRole('radio', {
        name: new RegExp(`^${fr.t(($) => $.tools.familyPill.creation)}`),
      }),
    )

    expect(shownTools()).toEqual(['Midjourney', 'Écrivain'].sort())
    await fireEvent.press(screen.getByRole('radio', { name: fr.t(($) => $.tools.all) }))
    expect(shownTools()).toHaveLength(tools.length)
  })

  it('says « Aucun outil ne correspond. » when nothing matches', async () => {
    await renderWithProviders(<ToolsScreen />)

    await fireEvent.changeText(screen.getByLabelText(SEARCH), 'zzz')

    expect(shownTools()).toEqual([])
    expect(screen.getByText(containing(fr.t(($) => $.tools.noMatch)))).toBeTruthy()
  })

  it('lists the other tools as plain text, never as links, under « Pas encore dans le catalogue »', async () => {
    mockTools(tools, [{ name: 'Teachable Machine' }, { name: 'Ma boîte à musique' }])
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.others) })).toBeTruthy()
    expect(screen.getByText(containing(fr.t(($) => $.tools.othersHint)))).toBeTruthy()
    expect(screen.getByText(containing('Teachable Machine'))).toBeTruthy()
    expect(screen.getByText(containing('Ma boîte à musique'))).toBeTruthy()
    const links = screen.queryAllByRole('link').map((link) => nameOf(link.props))
    expect(links.some((name) => name.includes('Teachable Machine'))).toBe(false)
  })

  it('shows no « Pas encore dans le catalogue » when no other tool is listed (witness)', async () => {
    await renderWithProviders(<ToolsScreen />)

    expect(screen.getByRole('header', { name: fr.t(($) => $.tools.aToZ) })).toBeTruthy()
    expect(screen.queryByRole('header', { name: fr.t(($) => $.tools.others) })).toBeNull()
  })

  it('says when the catalogue is empty', async () => {
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
