// Tests de l'en-tête de la page d'un projet (R5a, ProjectHeader) : la ligne de dates et la ligne de
// l'auteur, dont la pastille « Suivre » dit d'emblée si le membre qui regarde suit déjà l'auteur.
// `Project.author` ne le dit pas : l'en-tête le lit par la page du membre (`useMember`, le même
// hook que MemberScreen, sans changer l'API). Tant que la lecture n'a pas répondu, aucune pastille
// (question de TW-3, tranchée par la session le 2/11 : pas de « Suivre » qui bascule).
import type { Member } from '@ruche/contracts'
import { fireEvent, screen } from '@testing-library/react-native'
import { useFollow } from '../follows/api'
import { useMember } from '../members/api'
import { getMe } from '../profile/api'
import { leaMe, suspendedMe } from '../testing/fixtures'
import { recipesProject } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProjectHeader } from './ProjectHeader'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
// La page du membre : un faux hook, dont chaque test choisit la réponse (chargement, lue, échec).
jest.mock('../members/api', () => ({ useMember: jest.fn() }))
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}))

const mockToggle = jest.fn()
/** Le projet de Léa (u1), vu par Max (u2). */
const seenByMax = { ...recipesProject, isMine: false }

/** La réponse du faux `useMember` : seuls `data` et `isError` comptent pour l'en-tête. */
type MemberQuery = ReturnType<typeof useMember>
const loading = { data: undefined, isError: false, isPending: true } as unknown as MemberQuery
const failed = { data: undefined, isError: true, isPending: false } as unknown as MemberQuery
const read = (isFollowed: boolean) =>
  ({
    data: { id: 'u1', name: 'Léa', handle: 'lea', isFollowed } as Member,
    isError: false,
    isPending: false,
  }) as unknown as MemberQuery

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockToggle.mockReset()
  mockPush.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
  jest.mocked(useMember).mockReset().mockReturnValue(loading)
})

describe('following the author from the header', () => {
  it('says « Tu suis Léa » at opening when the member already follows her', async () => {
    jest.mocked(useMember).mockReturnValue(read(true))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    expect(await screen.findByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
    expect(screen.queryByRole('switch', { name: 'Suivre Léa' })).toBeNull()
    expect(useMember).toHaveBeenCalledWith('u1')
  })

  it('shows no chip while the page of the author is loading', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    // Témoin : la ligne de l'auteur est là, sans la pastille.
    expect(await screen.findByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Suivre')).toBeNull()
  })

  it('offers « Suivre » once read, then says « Tu suis Léa » after the tap', async () => {
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    const chip = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(chip).not.toBeChecked()
    expect(screen.getByText('@lea')).toBeTruthy()
    await fireEvent.press(chip)

    // L'état affiché part avec le toucher : retoucher plus tard demandera l'inverse.
    expect(mockToggle).toHaveBeenCalledWith(false)
    expect(await screen.findByRole('switch', { name: 'Tu suis Léa' })).toBeChecked()
  })

  it('offers « Suivre » when the page of the author could not be read', async () => {
    jest.mocked(useMember).mockReturnValue(failed)
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    expect(await screen.findByRole('switch', { name: 'Suivre Léa' })).not.toBeChecked()
  })

  it('offers no chip next to one’s own name', async () => {
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={recipesProject} />)

    expect(await screen.findByRole('link', { name: 'Voir la page de Léa' })).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shows no failure of a chip that was not touched', async () => {
    // Le faux hook dit « échec » dès le départ (comme quand Suivre ce projet a échoué) : la ligne
    // de l'auteur ne le reprend pas, faute d'un geste fait chez elle.
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    jest.mocked(useMember).mockReturnValue(read(false))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    expect(await screen.findByRole('switch', { name: 'Suivre Léa' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lets a suspended member stop following, but not follow', async () => {
    jest.mocked(getMe).mockResolvedValue(suspendedMe)
    jest.mocked(useMember).mockReturnValue(read(true))
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    // Témoin du profil lu : la pastille reste pour ne plus suivre.
    const chip = await screen.findByRole('switch', { name: 'Tu suis Léa' })
    await fireEvent.press(chip)
    expect(mockToggle).toHaveBeenCalledWith(true)

    // Retirée pendant la visite : à sa place, inactive.
    const again = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(again).toBeDisabled()
  })

  it('leads to the page of the author', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Voir la page de Léa' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/members/[id]', params: { id: 'u1' } })
  })
})

describe('the dates under the title', () => {
  const now = new Date('2026-10-20T10:00:00.000Z')

  it('says « Publié le 12 oct. » and reads the full date', async () => {
    await renderWithProviders(<ProjectHeader project={seenByMax} now={now} />)

    expect(await screen.findByText('Publié le 12 oct.')).toBeTruthy()
    expect(screen.queryByText(/Mis à jour/)).toBeNull()
  })

  it('adds « Mis à jour » after a later change', async () => {
    await renderWithProviders(
      <ProjectHeader project={{ ...seenByMax, updatedAt: '2026-10-19T09:00:00.000Z' }} now={now} />,
    )

    expect(await screen.findByText('Publié le 12 oct.')).toBeTruthy()
    expect(screen.getByText('Mis à jour hier')).toBeTruthy()
  })

  it('says « Créé » for a private project', async () => {
    await renderWithProviders(
      <ProjectHeader project={{ ...recipesProject, visibility: 'private' }} now={now} />,
    )

    expect(await screen.findByText('Créé le 12 oct.')).toBeTruthy()
    expect(screen.queryByText(/Publié/)).toBeNull()
  })
})
