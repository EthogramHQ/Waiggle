// Après un changement de mot de passe réussi, l'écran revient à la rubrique Sécurité en lui
// demandant de l'annoncer (`?announce=passwordChanged`, relecture de l'interface R2, B2) : la
// rubrique le dit elle-même, le toast n'est plus la seule trace. dismissTo revient à la rubrique
// déjà ouverte dans l'historique au lieu d'en empiler une seconde.
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { changePassword } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { ChangePasswordScreen } from './ChangePasswordScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), changePassword: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
const mockDismissTo = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/security/password',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: mockBack,
    dismissTo: mockDismissTo,
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(changePassword).mockReset().mockResolvedValue({ ok: true })
})

it('goes back to the Security section and asks it to say the password changed', async () => {
  await renderWithProviders(
    <ToastProvider>
      <ChangePasswordScreen />
    </ToastProvider>,
  )

  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.settings.changePassword.current)),
    'ancien-mot-de-passe-de-lea',
  )
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.settings.changePassword.new)),
    'nouveau-mot-de-passe-de-lea',
  )
  await fireEvent.press(
    screen.getByRole('button', { name: fr.t(($) => $.settings.changePassword.submit) }),
  )

  await waitFor(() =>
    expect(mockDismissTo).toHaveBeenCalledWith('/settings/security?announce=passwordChanged'),
  )
  expect(mockBack).not.toHaveBeenCalled()
})
