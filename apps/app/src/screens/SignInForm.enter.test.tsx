// Tests ajoutés après la relecture de design R2 : Entrée dans le dernier champ de la connexion et de
// l'inscription envoie le formulaire, comme le bouton, sans double envoi (C1) ; à la fin d'une
// attente « trop d'essais », le message s'efface en gardant sa place, et le bouton se libère (C6).
import { act, fireEvent, screen } from '@testing-library/react-native'
import { signIn } from '../accounts/api'
import { renderWithI18n } from '../testing/render'
import { fr } from '../testing/text'
import * as motion from '../ui/theme/motion'
import { SignInScreen } from './SignInScreen'
import { SignUpForm } from './SignUpForm'

jest.mock('../accounts/api', () => ({ signIn: jest.fn(), signUp: jest.fn() }))
jest.mock('expo-router', () => ({
  usePathname: () => '/sign-in',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}))

const signInMock = jest.mocked(signIn)
const tooMany = fr.t(($) => $.auth.errors.tooManyAttempts)

const fill = async () => {
  await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'correct-horse-battery')
}

beforeEach(() => signInMock.mockReset())
afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('Enter in the last field (C1)', () => {
  it('signs in when Enter is pressed in the password, only once for two presses', async () => {
    // La réponse reste en attente : la seconde Entrée arrive pendant l'envoi.
    signInMock.mockReturnValue(new Promise(() => {}))
    await renderWithI18n(<SignInScreen />)
    await fill()

    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing')
    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing')

    expect(signInMock).toHaveBeenCalledTimes(1)
    expect(signInMock).toHaveBeenCalledWith({
      email: 'lea@example.com',
      password: 'correct-horse-battery',
    })
  })

  it('checks the sign-up form when Enter is pressed in the password, like its button', async () => {
    await renderWithI18n(
      <SignUpForm draft={{ inviteCode: '', name: '', email: '' }} onDraft={jest.fn()} />,
    )

    await fireEvent(screen.getByLabelText('Mot de passe'), 'submitEditing')

    // Le formulaire vide dit ce qui manque, comme après « Créer mon compte ».
    expect(screen.getByText(fr.t(($) => $.auth.errors.emailRequired))).toBeTruthy()
    expect(screen.getByText(fr.t(($) => $.auth.errors.passwordRequired))).toBeTruthy()
  })
})

describe('the end of a « too many attempts » wait (C6)', () => {
  it('takes « Trop d’essais » away at the hour, keeps its place, and frees the button', async () => {
    // Immobile, la lumière d'ambiance ne rejoue pas une image par milliseconde (code-appli.md, U2).
    jest.spyOn(motion, 'useCalmMotion').mockReturnValue(true)
    jest.useFakeTimers()
    signInMock.mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 60 })
    await renderWithI18n(<SignInScreen />)
    await fill()
    await fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))
    expect(screen.getByText(tooMany)).toBeTruthy() // témoin

    await act(() => jest.advanceTimersByTime(60_000))

    expect(screen.queryByText(tooMany)).toBeNull()
    expect(screen.getByRole('button', { name: 'Me connecter' })).not.toBeDisabled()
    // Le message et la ligne de l'heure laissent chacun leur place, vide, jusqu'au prochain envoi.
    expect(screen.getAllByTestId('held-space', { includeHiddenElements: true })).toHaveLength(2)
  })
})
