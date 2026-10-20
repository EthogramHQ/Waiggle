// Tests de la page d'un membre. L'API (members/api) est remplacée par de faux appels.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { ApiError } from '../api/errors'
import { useFollow } from '../follows/api'
import { getMember } from '../members/api'
import { visited } from '../testing/navigation'
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
// Suivre : un faux hook, dont le test lit les appels (toggle) et choisit l'erreur.
jest.mock('../follows/api', () => ({ useFollow: jest.fn() }))
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

const mockToggle = jest.fn()

beforeEach(() => {
  mockSession({ user: { id: 'u2', name: 'Max' } })
  mockToggle.mockReset()
  jest
    .mocked(useFollow)
    .mockReset()
    .mockReturnValue({ toggle: mockToggle, error: false, expired: false })
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

  it('shows her handle under her name (slice 6a)', async () => {
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('header', { name: 'Léa' })).toBeTruthy()
    expect(screen.getByText('@lea')).toBeTruthy()
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

describe('following a member from her page', () => {
  it('offers to follow another member, and says how many follow her', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: false, followerCount: 12 })
    await renderWithProviders(<MemberScreen id="u1" />)

    const button = await screen.findByRole('switch', { name: 'Suivre Léa' })
    expect(button).not.toBeChecked()
    expect(screen.getByText('Suivre')).toBeTruthy()
    expect(screen.getByText('12 abonnés')).toBeTruthy()
    expect(useFollow).toHaveBeenCalledWith({ kind: 'member', id: 'u1' })

    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('shows that she is followed, and touching again stops following her', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isFollowed: true, followerCount: 13 })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Une fois suivie, le nom lu reprend le texte affiché (« Suivi »), pour la commande vocale.
    const button = await screen.findByRole('switch', { name: 'Suivi : Léa' })
    expect(button).toBeChecked()
    expect(screen.getByText('Suivi')).toBeTruthy()
    expect(screen.getByText('13 abonnés')).toBeTruthy()

    await fireEvent.press(button)

    expect(mockToggle).toHaveBeenCalledTimes(1)
  })

  it('writes « abonné » in the singular for 0 and 1', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, followerCount: 1 })
    const { unmount } = await renderWithProviders(<MemberScreen id="u1" />)
    expect(await screen.findByText('1 abonné')).toBeTruthy()
    await unmount()

    jest.mocked(getMember).mockResolvedValue({ ...leaPage, followerCount: 0 })
    await renderWithProviders(<MemberScreen id="u1" />)
    expect(await screen.findByText('0 abonné')).toBeTruthy()
  })

  it('offers no follow button on one’s own page, but still shows the count', async () => {
    jest.mocked(getMember).mockResolvedValue({ ...leaPage, isMe: true, followerCount: 3 })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByText('3 abonnés')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('says so when the follow could not be saved', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'L’abonnement n’a pas pu être enregistré. Réessaie.',
    )
  })

  it('says to sign in again, not to retry, when the session expired', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta session a expiré. Reconnecte-toi pour continuer.',
    )
  })

  // Tranche 6c : à côté du message, un lien mène à la connexion, qui ramène ensuite sur cette page.
  it('offers a link to sign in again, back to this page, when the session expired', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: true })
    await renderWithProviders(<MemberScreen id="u1" />)

    await fireEvent.press(await screen.findByRole('link', { name: 'Me reconnecter' }))

    expect(visited(mockPush)).toEqual(['/sign-in?next=/page/actuelle'])
  })

  it('offers no sign-in link when the follow failed for another reason', async () => {
    jest.mocked(useFollow).mockReturnValue({ toggle: mockToggle, error: true, expired: false })
    await renderWithProviders(<MemberScreen id="u1" />)

    // Témoin : le message d'erreur est bien là.
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Me reconnecter' })).toBeNull()
  })
})
