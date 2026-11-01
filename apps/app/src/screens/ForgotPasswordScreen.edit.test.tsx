// Ménage R4 (M4) : après un envoi, corriger l'adresse efface « C'est envoyé » (qui parlait de
// l'ancienne) et libère l'envoi pour la nouvelle, sans attendre la minute du « Renvoyer ».
import { fireEvent, screen } from '@testing-library/react-native'
import { requestPasswordReset } from '../accounts/api'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), requestPasswordReset: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/forgot-password',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

const emailLabel = fr.t(($) => $.auth.fields.email)
const submitLabel = fr.t(($) => $.auth.forgotPassword.submit)
const resendLabel = fr.t(($) => $.auth.forgotPassword.resend)
const sentTitle = fr.t(($) => $.auth.forgotPassword.sentTitle)

beforeEach(() => {
  jest.mocked(requestPasswordReset).mockReset().mockResolvedValue({ ok: true })
})

describe('correcting the address after sending (M4)', () => {
  it('takes « C’est envoyé » away when the address changes, and frees the send button', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)
    await fireEvent.changeText(screen.getByLabelText(emailLabel), 'lea@exmaple.com')
    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))
    // Témoin : l'envoi est parti, la page dit « C'est envoyé » et « Renvoyer » est bloqué.
    expect(await screen.findByText(sentTitle)).toBeTruthy()
    expect(screen.getByRole('button', { name: resendLabel })).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText(emailLabel), 'lea@example.com')

    expect(screen.queryByText(sentTitle)).toBeNull()
    expect(screen.queryByRole('button', { name: resendLabel })).toBeNull()
    const send = screen.getByRole('button', { name: submitLabel })
    expect(send.props['aria-disabled']).toBeFalsy()
  })

  it('sends the corrected address at once, and says « C’est envoyé » for it', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)
    await fireEvent.changeText(screen.getByLabelText(emailLabel), 'lea@exmaple.com')
    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))
    await screen.findByText(sentTitle)

    await fireEvent.changeText(screen.getByLabelText(emailLabel), 'lea@example.com')
    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(requestPasswordReset).toHaveBeenCalledTimes(2)
    expect(requestPasswordReset).toHaveBeenLastCalledWith({ email: 'lea@example.com' })
    expect(await screen.findByText(sentTitle)).toBeTruthy()
  })

  it('keeps « C’est envoyé » when the address is only retyped the same', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)
    await fireEvent.changeText(screen.getByLabelText(emailLabel), 'lea@example.com')
    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))
    await screen.findByText(sentTitle)

    // Des espaces autour ne changent pas l'adresse.
    await fireEvent.changeText(screen.getByLabelText(emailLabel), ' lea@example.com ')

    expect(screen.getByText(sentTitle)).toBeTruthy()
  })
})
