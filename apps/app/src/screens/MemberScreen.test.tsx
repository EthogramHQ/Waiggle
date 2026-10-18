// Tests de la page d'un membre. L'API (members/api) est remplacée par de faux appels.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { getMember } from '../members/api'
import { draftProject, leaPage, projectWithPhotos, summaryOf } from '../testing/projects'
import { mockSession, renderWithProviders } from '../testing/render'
import { MemberScreen } from './MemberScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
// La barre de navigation (ordinateur) lit le profil pour l'avatar : on remplace l'appel.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('../members/api', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  const getMember = jest.fn()
  return {
    getMember,
    useMember: (id: string, enabled = true) =>
      useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled }),
  }
})
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}))

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  jest.mocked(getMember).mockReset().mockResolvedValue(leaPage)
  mockPush.mockReset()
  mockReplace.mockReset()
})

describe('MemberScreen', () => {
  it('shows the member, her favourite tools and her projects', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('Je bricole des agents pour la maison.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Python' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Mon agent de recettes' })).toBeTruthy()
    // La page d'un autre : pas de bouton pour modifier son profil.
    expect(screen.queryByRole('button', { name: 'Modifier mon profil' })).toBeNull()
  })

  it('opens a project, and the page of a favourite tool', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Mon agent de recettes' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/projects/[id]',
      params: { id: projectWithPhotos.id },
    })

    await fireEvent.press(screen.getByRole('link', { name: 'Python' }))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/tags/[slug]', params: { slug: 'python' } })
  })

  it('shows her own private projects to the member, marked as such, and lets her edit her profile', async () => {
    jest.mocked(getMember).mockResolvedValue({
      ...leaPage,
      isMe: true,
      projects: [summaryOf(draftProject), summaryOf(projectWithPhotos)],
    })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('link', { name: 'Mon brouillon' })).toBeTruthy()
    expect(screen.getByText('Privé')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Modifier mon profil' }))
    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('says when there is no project yet', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, projects: [] })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('Pas encore de projet public.')).toBeTruthy()
  })

  it('says « not found » for an unknown or deleted member', async () => {
    jest.mocked(getMember).mockRejectedValue(new ApiError('notFound'))
    await renderWithProviders(<MemberScreen id="nobody" />)

    expect(await screen.findByRole('header', { name: 'Ce membre est introuvable' })).toBeTruthy()
  })

  it('asks a visitor to sign in, without calling the API', async () => {
    mockSession(null)
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Me connecter' }))
    expect(getMember).not.toHaveBeenCalled()
    // Une fois connecté, il reviendra sur cette page.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sign-in',
      params: { next: '/page/actuelle' },
    })
  })

  it('also offers a visitor to create an account', async () => {
    mockSession(null)
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Créer un compte' }))

    expect(mockPush).toHaveBeenCalledWith('/sign-up')
  })

  it('offers to sign in again when the session expired on the way', async () => {
    jest.mocked(getMember).mockRejectedValue(new ApiError('unauthorized'))
    await renderWithProviders(<MemberScreen id="u2" />)

    expect(await screen.findByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(screen.getByText('Ta session a expiré. Reconnecte-toi pour continuer.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Me connecter' })).toBeTruthy()
  })

  it('shows that it is trying again until the new answer arrives', async () => {
    jest.mocked(getMember).mockRejectedValueOnce(new Error('réseau coupé'))
    // La deuxième demande reste en attente : on regarde le bouton pendant ce temps.
    jest.mocked(getMember).mockReturnValueOnce(new Promise(() => {}))
    await renderWithProviders(<MemberScreen id="u2" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    // Sans donnée déjà reçue, la nouvelle tentative remet la page en chargement : le membre voit
    // que sa demande est partie.
    expect(await screen.findByText('Chargement…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull()
  })

  it('offers to try again when the page could not load', async () => {
    jest.mocked(getMember).mockRejectedValueOnce(new Error('réseau coupé'))
    jest.mocked(getMember).mockResolvedValueOnce(leaPage)
    await renderWithProviders(<MemberScreen id="u2" />)

    await fireEvent.press(await screen.findByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByRole('header', { name: leaPage.name })).toBeTruthy()
  })

  it('offers to go back when the page takes long to load', async () => {
    // De fausses horloges : le test avance le temps lui-même, sans attendre 4 vraies secondes.
    jest.useFakeTimers()
    try {
      jest.mocked(getMember).mockReturnValue(new Promise(() => {}))
      await renderWithProviders(<MemberScreen id="u2" />)
      expect(screen.queryByRole('button', { name: 'Revenir' })).toBeNull()

      await act(() => jest.advanceTimersByTime(4000))

      expect(screen.getByRole('button', { name: 'Revenir' })).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })
})
