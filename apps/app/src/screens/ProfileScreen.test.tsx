// Tests de l'écran « Mon profil ». L'API (profile/api) est remplacée par de faux appels.
import { fireEvent, screen } from '@testing-library/react-native'
import { getMe, pickAvatar, updateProfile, uploadAvatar } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { ProfileScreen } from './ProfileScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
jest.mock('../profile/api', () => ({
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
  pickAvatar: jest.fn(),
}))
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, canGoBack: () => false }),
}))

let session: ReturnType<typeof mockSession>

beforeEach(() => {
  session = mockSession({ user: { name: 'Léa' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(updateProfile).mockReset()
  jest.mocked(uploadAvatar).mockReset()
  jest.mocked(pickAvatar).mockReset()
  mockReplace.mockReset()
})

describe('ProfileScreen', () => {
  it('shows the current profile', async () => {
    await renderWithProviders(<ProfileScreen />)

    // findBy… attend que l'élément apparaisse (le profil arrive de l'API de façon asynchrone).
    expect(await screen.findByDisplayValue('Léa')).toBeTruthy()
    expect(screen.getByDisplayValue('Je bricole des agents IA le week-end.')).toBeTruthy()
    // Les outils favoris sont des pastilles, chacune avec son bouton pour la retirer.
    expect(screen.getByText('Claude')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retirer Cursor' })).toBeTruthy()
  })

  it('saves the edited profile', async () => {
    jest
      .mocked(updateProfile)
      .mockResolvedValue({ ok: true, data: { ...leaMe, bio: 'Nouvelle bio' } })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'Nouvelle bio')
    await fireEvent.press(screen.getByRole('button', { name: 'Retirer Cursor' }))
    await fireEvent.changeText(screen.getByLabelText('Outils favoris'), ' Midjourney , ')
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Léa',
      bio: 'Nouvelle bio',
      favoriteTools: ['Claude', 'Midjourney'],
    })
    expect(await screen.findByText('Profil enregistré.')).toBeTruthy()
    // Le nom est aussi dans la session (affiché sur l'accueil) : elle doit être relue.
    expect(session.refetch).toHaveBeenCalled()
  })

  it('explains the problem and sends nothing when the bio is too long', async () => {
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.changeText(screen.getByLabelText('Bio'), 'a'.repeat(281))
    await fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('La bio doit faire au plus 280 caractères.')).toBeTruthy()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('changes the avatar with a picture chosen on the device', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///photo.jpg' })
    jest.mocked(uploadAvatar).mockResolvedValue({
      ok: true,
      data: { ...leaMe, avatarUrl: 'http://localhost:3000/media/avatars/a.webp' },
    })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(uploadAvatar).toHaveBeenCalledWith({ uri: 'file:///photo.jpg' })
    expect(await screen.findByText('Photo mise à jour.')).toBeTruthy()
  })

  it('says when the picture is refused', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///document.pdf' })
    jest.mocked(uploadAvatar).mockResolvedValue({ ok: false, error: 'unsupportedMediaType' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(await screen.findByText('Choisis une image JPEG, PNG ou WebP.')).toBeTruthy()
  })

  it('says when the picture is too heavy', async () => {
    jest.mocked(pickAvatar).mockResolvedValue({ uri: 'file:///huge.jpg' })
    jest.mocked(uploadAvatar).mockResolvedValue({ ok: false, error: 'payloadTooLarge' })
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(await screen.findByText('L’image dépasse 5 Mo.')).toBeTruthy()
  })

  it('offers to go back to the account when the profile cannot load', async () => {
    jest.mocked(getMe).mockRejectedValue(new Error('réseau coupé'))
    await renderWithProviders(<ProfileScreen />)

    // Arrivé directement sur la page, sans page précédente : « Revenir » mène au compte.
    await fireEvent.press(await screen.findByRole('button', { name: 'Revenir' }))

    expect(mockReplace).toHaveBeenCalledWith('/account')
  })

  it('asks a visitor to sign in', async () => {
    mockSession(null)
    await renderWithProviders(<ProfileScreen />)

    expect(screen.getByRole('header', { name: 'Réservé aux membres' })).toBeTruthy()
    expect(getMe).not.toHaveBeenCalled()
  })

  it('does nothing when the member cancels the picture choice', async () => {
    jest.mocked(pickAvatar).mockResolvedValue(null)
    await renderWithProviders(<ProfileScreen />)
    await screen.findByDisplayValue('Léa')

    await fireEvent.press(screen.getByRole('button', { name: 'Changer la photo' }))

    expect(uploadAvatar).not.toHaveBeenCalled()
  })
})
