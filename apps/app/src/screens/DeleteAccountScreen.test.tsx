// Tests de la page de suppression du compte : on ne supprime qu'avec le bon mot de passe, et on
// peut d'abord télécharger ses données.
import { fireEvent, screen } from '@testing-library/react-native'
import { deleteAccount, downloadMyData } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { DeleteAccountScreen } from './DeleteAccountScreen'

jest.mock('../accounts/api', () => ({
  useSession: jest.fn(),
  deleteAccount: jest.fn(),
  downloadMyData: jest.fn(),
}))
const mockReplace = jest.fn()
// Les états partagés (screens/states.tsx) importent la barre de navigation, qui importe le module du
// profil : on le remplace aussi, comme dans les autres tests d'écran.
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

  it('says that the reactions and comments of the member go with the account', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Tes réactions et tes commentaires')).toBeTruthy()
  })

  it('says that the handle becomes free at once (slice 6a)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getByText('Ton pseudo')).toBeTruthy()
  })

  it('says that the notifications and mentions of the member go too (slice 6b)', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      screen.getByText('Tes notifications, et les liens vers toi dans les commentaires des autres'),
    ).toBeTruthy()
    // Le pseudo reste écrit dans le texte des autres : l'écran le dit, sans rien promettre de plus.
    expect(
      screen.getByText(/Ton pseudo y reste écrit, en texte simple, sans lien vers toi\./),
    ).toBeTruthy()
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

  it('names the handle that becomes free (slice 6a)', async () => {
    jest.mocked(getMe).mockResolvedValue(leaMe)
    await renderWithI18n(<DeleteAccountScreen />)

    expect(
      await screen.findByText(
        '@lea, et l’ancien s’il t’est réservé : ils redeviennent libres aussitôt',
      ),
    ).toBeTruthy()
  })
})

// --- Tranche 6d : ce qui reste après la suppression (règle 24 de la relecture du plan) ---

describe('what remains after deleting the account', () => {
  it('says that the reports of the member and a trace of the removals stay one year', async () => {
    await renderWithI18n(<DeleteAccountScreen />)

    expect(screen.getAllByText(containing(fr.t('account.delete.remains.title'))).length).toBe(1)
    // « Tes signalements restent, sans ton nom, un an »
    expect(
      screen.getAllByText(containing(fr.t('account.delete.remains.reports'))).length,
    ).toBeGreaterThan(0)
    // « Une trace des retraits de tes contenus reste un an »
    expect(
      screen.getAllByText(containing(fr.t('account.delete.remains.removals'))).length,
    ).toBeGreaterThan(0)
  })
})
