// Tests de la page de suppression du compte : on ne supprime qu'avec le bon mot de passe, et on
// peut d'abord télécharger ses données.
import { fireEvent, screen } from '@testing-library/react-native'
import { deleteAccount, downloadMyData } from '../accounts/api'
import { mockSession, renderWithI18n } from '../testing/render'
import { DeleteAccountScreen } from './DeleteAccountScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  deleteAccount: jest.fn(),
  downloadMyData: jest.fn(),
}))
const mockReplace = jest.fn()
// La barre de navigation des états (chargement, erreur) lit le profil : on le remplace aussi.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => true }),
}))

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(deleteAccount).mockReset()
  jest.mocked(downloadMyData).mockReset()
  mockReplace.mockReset()
})

describe('DeleteAccountScreen', () => {
  it('says what disappears with the account', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Ton profil et ta photo')).toBeTruthy()
    expect(screen.getByText('Tes projets')).toBeTruthy()
    expect(screen.getByText('C’est immédiat et sans retour.')).toBeTruthy()
  })

  it('lets the member download their data first', async () => {
    jest.mocked(downloadMyData).mockResolvedValue({ ok: true })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'Télécharger mes données' }))

    expect(await screen.findByText('Tes données ont été téléchargées.')).toBeTruthy()
    expect(deleteAccount).not.toHaveBeenCalled()
  })

  it('cannot delete without typing the password first', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByRole('button', { name: 'Supprimer définitivement' })).toBeDisabled()
  })

  it('keeps the account and says so when the password is wrong', async () => {
    jest.mocked(deleteAccount).mockResolvedValue({ ok: false, error: 'wrongPassword' })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.changeText(screen.getByLabelText('Confirme avec ton mot de passe'), 'nope')
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(deleteAccount).toHaveBeenCalledWith('nope')
    expect(screen.getByText('Mot de passe incorrect.')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('deletes the account once the password is confirmed, then goes home', async () => {
    jest.mocked(deleteAccount).mockResolvedValue({ ok: true })
    await renderWithI18n(<DeleteAccountScreen />)

    await fireEvent.changeText(
      screen.getByLabelText('Confirme avec ton mot de passe'),
      'correct-horse-battery',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
