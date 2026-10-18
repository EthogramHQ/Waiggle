import { fireEvent, screen } from '@testing-library/react-native'
import { signOut } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithI18n } from '../testing/render'
import { AccountScreen } from './AccountScreen'

// Le choix de la langue enregistre la langue sur le compte : on remplace aussi ces appels.
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  downloadMyData: jest.fn(),
}))
// Les images de l'API voyagent avec la session (api/media.ts) : ici, l'adresse suffit.
jest.mock('../api/media', () => ({
  useMediaSources: () => (url: string | null | undefined) => (url ? { uri: url } : null),
}))
const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }))

const lea = { user: { name: 'Léa', email: 'lea@example.com' } }

beforeEach(() => {
  mockSession(lea)
  jest.mocked(getMe).mockResolvedValue(leaMe)
  jest.mocked(signOut).mockReset()
  mockReplace.mockReset()
  mockPush.mockReset()
})

describe('AccountScreen', () => {
  it('shows who is signed in', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getByText('Léa')).toBeTruthy()
    expect(screen.getByText('lea@example.com')).toBeTruthy()
  })

  it('leads to the profile page', async () => {
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Modifier mon profil' }))

    expect(mockPush).toHaveBeenCalledWith('/profile')
  })

  it('offers to choose the language', async () => {
    await renderWithI18n(<AccountScreen />)

    expect(screen.getByRole('radio', { name: 'English' })).toBeTruthy()
    expect(screen.getByText('Tes e-mails te sont aussi envoyés dans cette langue.')).toBeTruthy()
  })

  it('signs out and goes back home', async () => {
    jest.mocked(signOut).mockResolvedValue(undefined)
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Me déconnecter' }))

    expect(signOut).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('lets the member choose the appearance of this device', async () => {
    await renderWithI18n(<AccountScreen />)
    expect(screen.getByRole('radio', { name: 'Automatique', checked: true })).toBeTruthy()

    await fireEvent.press(screen.getByRole('radio', { name: 'Nuit' }))

    expect(screen.getByRole('radio', { name: 'Nuit', checked: true })).toBeTruthy()
  })

  it('leads to the page that deletes the account', async () => {
    await renderWithI18n(<AccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }))

    expect(mockPush).toHaveBeenCalledWith('/account/delete')
  })
})
