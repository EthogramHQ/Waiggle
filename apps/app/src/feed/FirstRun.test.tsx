// Tests du premier lancement (R4, F-Fil9) : le salut, « Proches à suivre » branché sur ses hooks
// (suivre, écarter, ouvrir), et l'encart « Publier », absent pour un compte suspendu. L'accueil
// (HomeScreen) le pose quand le membre ne suit personne ; ses propres tests le vérifient là.
import type { Me, ProjectSummary, SuggestedMember } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useSession } from '../accounts/api'
import { useFollow } from '../follows/api'
import { getMe } from '../profile/api'
import { useDismissSuggestion, useSuggestions } from '../suggestions/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { pathOf } from '../testing/navigation'
import { recipesProject, summaryOf } from '../testing/projects'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { FirstRun } from './FirstRun'

jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../suggestions/api', () => ({
  useSuggestions: jest.fn(),
  useDismissSuggestion: jest.fn(),
}))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

type ProjectAuthor = ProjectSummary['author']
const suggested = (author: ProjectAuthor, n: number, title: string): SuggestedMember => ({
  ...author,
  latestProject: summaryOf({
    ...recipesProject,
    id: `b1000000-0000-4000-8000-00000000000${n}`,
    author,
    title,
  }),
})
const nora = suggested({ id: 'u4', name: 'Nora', avatarUrl: null }, 1, 'Carnet de cafés')
const members = [
  nora,
  suggested({ id: 'u5', name: 'Sam', avatarUrl: null }, 2, 'Le quiz des capitales'),
  suggested({ id: 'u6', name: 'Hugo', avatarUrl: null }, 3, 'Le planning du club'),
  suggested({ id: 'u8', name: 'Jade', avatarUrl: null }, 4, 'La météo du potager'),
  suggested({ id: 'u10', name: 'Malo', avatarUrl: null }, 5, 'Le lexique breton'),
  suggested({ id: 'u11', name: 'Lina', avatarUrl: null }, 6, 'Le tri des photos'),
]

/** Ce que rend la lecture de la liste (un useQuery de React Query), ici réussie, vide ou en échec. */
const mockList = (state: { members?: SuggestedMember[]; error?: boolean }) => {
  const result = {
    data: state.error ? undefined : { members: state.members ?? [] },
    isError: state.error ?? false,
    isPending: false,
    refetch: jest.fn().mockResolvedValue(undefined),
  }
  jest
    .mocked(useSuggestions)
    .mockReturnValue(result as unknown as ReturnType<typeof useSuggestions>)
  return result
}

const mockToggle = jest.fn()
const mockDismiss = jest.fn()
const ines: Me = { ...leaMe, id: 'u7', name: 'Inès', handle: 'ines' }

const renderFirstRun = async (me: Me = ines) => {
  jest.mocked(getMe).mockResolvedValue(me)
  mockSession({ user: { id: me.id, name: me.name } })
  return renderWithI18n(<FirstRun name={me.name} />)
}
const dismissOf = (name: string) => fr.t(($) => $.suggestions.dismiss, { name })

beforeEach(() => {
  mockPush.mockReset()
  mockToggle.mockReset()
  jest.mocked(useSession).mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  mockDismiss.mockReset().mockResolvedValue({ ok: true, data: null })
  jest.mocked(useDismissSuggestion).mockReset().mockReturnValue({ dismiss: mockDismiss })
  mockList({ members })
})

describe('FirstRun', () => {
  it('greets the member by name, with the title as a heading, and explains', async () => {
    await renderFirstRun()

    expect(screen.getByText(fr.t(($) => $.feed.firstRun.hello, { name: 'Inès' }))).toBeTruthy()
    expect(screen.getByRole('header', { name: fr.t(($) => $.feed.firstRun.title) })).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.feed.firstRun.body))).toBeTruthy()
  })

  it('shows five people to follow, never a sixth', async () => {
    await renderFirstRun()

    expect(screen.getByRole('header', { name: fr.t(($) => $.suggestions.title) })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Ne plus suggérer/ })).toHaveLength(5)
    expect(screen.queryByRole('button', { name: dismissOf('Lina') })).toBeNull()
  })

  it('follows a member through her own useFollow, and says « Tu suis » on the same row', async () => {
    const list = mockList({ members })
    await renderFirstRun()

    await fireEvent.press(screen.getAllByRole('switch', { name: /^Suivre/ })[0] as never)

    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: nora.id })
    // L'état affiché part avec le geste : « pas suivie », donc suivre.
    expect(mockToggle).toHaveBeenCalledWith(false)
    expect(await screen.findByRole('switch', { name: /^Tu suis/ })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Ne plus suggérer/ })).toHaveLength(5)
    expect(list.refetch).not.toHaveBeenCalled()
  })

  it('takes a follow back when the API refuses it', async () => {
    await renderFirstRun()
    await fireEvent.press(screen.getAllByRole('switch', { name: /^Suivre/ })[0] as never)
    expect(await screen.findByRole('switch', { name: /^Tu suis/ })).toBeTruthy()

    // L'abonnement à Nora, seul, échoue.
    jest.mocked(useFollow).mockImplementation(({ id }) => ({
      toggle: mockToggle,
      error: id === nora.id,
      expired: false,
    }))
    mockList({ members })
    await screen.rerender(<FirstRun name="Inès" />)

    expect(screen.queryByRole('switch', { name: /^Tu suis/ })).toBeNull()
    expect(screen.getAllByRole('switch', { name: /^Suivre/ })).toHaveLength(5)
  })

  it('sends a dismissal only when the page is left, with the member id', async () => {
    const { unmount } = await renderFirstRun()

    await fireEvent.press(screen.getByRole('button', { name: dismissOf('Nora') }))

    expect(screen.queryByRole('button', { name: dismissOf('Nora') })).toBeNull()
    expect(mockDismiss).not.toHaveBeenCalled()
    await unmount()
    expect(mockDismiss).toHaveBeenCalledWith(nora.id)
  })

  it('opens the page of a suggested member, and her latest project', async () => {
    await renderFirstRun()

    const name =
      screen.queryByRole('link', { name: 'Nora' }) ?? screen.getByRole('button', { name: 'Nora' })
    await fireEvent.press(name)
    // Le projet d'une autre ligne : chaque ligne a sa garde contre la double tape (600 ms), qui
    // couvre ensemble le nom et la vignette d'un même membre.
    await fireEvent.press(screen.getByRole('link', { name: 'Le quiz des capitales' }))

    const paths = mockPush.mock.calls.map(([href]) => pathOf(href))
    expect(paths).toEqual([`/members/${nora.id}`, `/projects/${members[1]?.latestProject.id}`])
  })

  it('offers « Publier », which opens a new project', async () => {
    await renderFirstRun()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.publishPrompt.action) }))

    expect(mockPush.mock.calls.map(([href]) => pathOf(href))).toEqual(['/projects/new'])
  })

  it('hides « Publier » from a suspended member, and keeps « Suivre » in place but disabled', async () => {
    await renderFirstRun({ ...suspendedMe, id: 'u7', name: 'Inès', handle: 'ines' })

    // Le profil lu dit la suspension : « Publier » part.
    await screen.findByText(containing(fr.t(($) => $.feed.firstRun.title)))
    await screen.findAllByRole('switch', { name: /^Suivre/ })
    const follows = screen.getAllByRole('switch', { name: /^Suivre/ })
    expect(follows).toHaveLength(5)
    for (const button of follows) expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: fr.t(($) => $.publishPrompt.action) })).toBeNull()
  })

  it('says when the list cannot be read, and keeps « Réessayer » while it is read again', async () => {
    const list = mockList({ error: true })
    // Relire une lecture en échec, sans données, efface l'erreur pendant la relecture (React
    // Query v5) : la relecture attend ici, pour que le test voie ce moment-là.
    list.refetch.mockReturnValue(new Promise(() => {}))
    await renderFirstRun()

    expect(screen.getByText(fr.t(($) => $.suggestions.loadError))).toBeTruthy()
    await fireEvent.press(screen.getByRole('link', { name: fr.t(($) => $.common.retry) }))
    mockList({})
    await screen.rerender(<FirstRun name="Inès" />)

    expect(list.refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: fr.t(($) => $.common.retry) })).toBeTruthy()
    // Témoin : « Publier » reste sous le message.
    expect(screen.getByRole('button', { name: fr.t(($) => $.publishPrompt.action) })).toBeTruthy()
  })

  it('draws no empty « Proches à suivre » when there is nobody to suggest', async () => {
    mockList({ members: [] })
    await renderFirstRun()

    // Témoin : le salut est là.
    expect(screen.getByText(fr.t(($) => $.feed.firstRun.body))).toBeTruthy()
    expect(screen.queryByRole('header', { name: fr.t(($) => $.suggestions.title) })).toBeNull()
  })
})
