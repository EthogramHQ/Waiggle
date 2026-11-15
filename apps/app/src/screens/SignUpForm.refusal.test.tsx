// Tranche R11 : l'inscription refusée par l'API faute de l'un des deux accords (une case décochée
// par un autre chemin que l'écran, ou une version de l'appli qui ne les envoyait pas). Le message
// vient des erreurs de l'API (`errors.*`), pas de celles du compte (`auth.errors.*`) : ce test garde
// le choix de la section. Mêmes faux modules que SignUpForm.rules.test.tsx.
import { fireEvent, screen } from '@testing-library/react-native'
import { signUp } from '../accounts/api'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { SignUpScreen } from './SignUpScreen'

jest.mock('../accounts/api', () => ({ signUp: jest.fn(), signIn: jest.fn() }))
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'fr-FR' }] }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/sign-up',
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
  Link: () => null,
}))

const signUpMock = jest.mocked(signUp)

/** Remplit tout et coche les deux cases, puis envoie. */
const fillAndSend = async () => {
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.auth.fields.inviteCode)),
    'miel-2026-noel',
  )
  await fireEvent.changeText(screen.getByLabelText(fr.t(($) => $.auth.fields.name)), 'Max')
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.auth.fields.email)),
    'max@example.com',
  )
  await fireEvent.changeText(
    screen.getByLabelText(fr.t(($) => $.auth.fields.password)),
    'correct-horse-battery',
  )
  await fireEvent.press(screen.getByRole('checkbox', { name: fr.t(($) => $.rules.accept) }))
  await fireEvent.press(screen.getByRole('checkbox', { name: fr.t(($) => $.rules.age) }))
  await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.auth.signUp.submit) }))
}

beforeEach(() => {
  signUpMock.mockReset()
  mockPush.mockReset()
})

describe('SignUpForm, an accord refused by the API (R11)', () => {
  it('says the rules must be accepted when the API refuses with RULES_NOT_ACCEPTED', async () => {
    signUpMock.mockResolvedValue({ ok: false, error: 'rulesNotAccepted' })
    await renderWithProviders(<SignUpScreen />)

    await fillAndSend()

    expect(signUpMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText(fr.t(($) => $.errors.rulesNotAccepted))).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('says the age when the API refuses with AGE_NOT_DECLARED', async () => {
    signUpMock.mockResolvedValue({ ok: false, error: 'ageNotDeclared' })
    await renderWithProviders(<SignUpScreen />)

    await fillAndSend()

    expect(screen.getByText(fr.t(($) => $.errors.ageNotDeclared))).toBeTruthy()
    // Témoin : un refus du compte garde son message (auth.errors).
    expect(screen.queryByText(fr.t(($) => $.auth.errors.generic))).toBeNull()
  })
})
