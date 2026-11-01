// Ménage R4 (M3) : envoyer la connexion avec l'adresse vide dit « Indique ton adresse e‑mail. »
// (et non « pas valide »), et le focus du clavier va au champ de l'adresse, pas au bouton.
import { fireEvent, screen } from '@testing-library/react-native'
import { signIn } from '../accounts/api'
import { renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from '../ui/focus'
import { SignInForm } from './SignInForm'

jest.mock('../accounts/api', () => ({ signIn: jest.fn() }))
jest.mock('../ui/focus', () => ({
  ...jest.requireActual('../ui/focus'),
  focusWithoutScroll: jest.fn(() => true),
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}))

const submitLabel = fr.t(($) => $.auth.signIn.submit)

beforeEach(() => {
  jest.mocked(signIn).mockReset()
  jest.mocked(focusWithoutScroll).mockClear()
})

describe('signing in with an empty address (M3)', () => {
  it('asks for the address instead of calling it invalid, without calling the server', async () => {
    await renderWithI18n(
      <SignInForm draft={{ inviteCode: '', name: '', email: '' }} onDraft={jest.fn()} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(screen.getByText(fr.t(($) => $.auth.errors.emailRequired))).toBeTruthy()
    expect(screen.queryByText(fr.t(($) => $.auth.errors.invalidEmail))).toBeNull()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('puts the keyboard focus on the address field', async () => {
    await renderWithI18n(
      <SignInForm draft={{ inviteCode: '', name: '', email: '' }} onDraft={jest.fn()} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
    const focused = jest.mocked(focusWithoutScroll).mock.calls[0]?.[0] as unknown as {
      props: { accessibilityLabel?: string }
    }
    expect(focused.props.accessibilityLabel).toBe(fr.t(($) => $.auth.fields.email))
  })

  it('still says « pas valide » for an address that is typed but wrong', async () => {
    await renderWithI18n(
      <SignInForm draft={{ inviteCode: '', name: '', email: 'lea' }} onDraft={jest.fn()} />,
    )

    await fireEvent.press(screen.getByRole('button', { name: submitLabel }))

    expect(screen.getByText(fr.t(($) => $.auth.errors.invalidEmail))).toBeTruthy()
  })
})
