// Tests de l'écran d'inscription. On remplace (« mock ») le module qui parle à l'API par de faux
// appels : on teste l'écran seul, sans réseau, et on décide nous-mêmes de la réponse de l'API.
import { fireEvent, screen } from '@testing-library/react-native'
import { signUp } from '../accounts/api'
import { renderWithI18n } from '../testing/render'
import { SignUpScreen } from './SignUpScreen'

jest.mock('../accounts/api', () => ({ signUp: jest.fn() }))
const mockPush = jest.fn()
const mockSetParams = jest.fn()
// Les paramètres de l'adresse de la page (/sign-up?code=…), modifiables test par test.
let mockParams: Record<string, string> = {}
jest.mock('expo-router', () => ({
  usePathname: () => '/page/actuelle',
  useRouter: () => ({ push: mockPush, replace: jest.fn(), setParams: mockSetParams }),
  useLocalSearchParams: () => mockParams,
}))

// jest.mocked donne le bon type au faux appel pour lui dicter sa réponse.
const signUpMock = jest.mocked(signUp)

const fillForm = async (password = 'correct-horse-battery', inviteCode = 'miel-2026-noel') => {
  await fireEvent.changeText(screen.getByLabelText('Code d’invitation'), inviteCode)
  await fireEvent.changeText(screen.getByLabelText('Prénom ou pseudo'), 'Léa')
  await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), password)
  await fireEvent.press(screen.getByRole('button', { name: 'Créer un compte' }))
}

beforeEach(() => {
  signUpMock.mockReset()
  mockPush.mockReset()
  mockSetParams.mockReset()
  mockParams = {}
})

describe('SignUpScreen', () => {
  it('counts down the characters the password still needs, once typing has started', async () => {
    await renderWithI18n(<SignUpScreen />)
    // Avant la première lettre : une simple consigne, pas encore un décompte.
    expect(screen.getByLabelText('Au moins 12 caractères.')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'a')
    expect(screen.getByLabelText('Encore 11 caractères')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'abeilles-d')
    expect(screen.getByLabelText('Encore 2 caractères')).toBeTruthy()

    await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'abeilles-dor')
    expect(screen.getByLabelText('C’est bon, ton mot de passe est assez long.')).toBeTruthy()
  })

  it('shows the password on request, then hides it again', async () => {
    await renderWithI18n(<SignUpScreen />)
    const field = screen.getByLabelText('Mot de passe')
    expect(field.props.secureTextEntry).toBe(true)

    await fireEvent.press(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    const shown = screen.getByLabelText('Mot de passe')
    expect(shown.props.secureTextEntry).toBe(false)
    // Même affiché, il ne part ni au correcteur orthographique ni au dictionnaire du clavier.
    expect(shown.props.autoCorrect).toBe(false)
    expect(shown.props.spellCheck).toBe(false)

    await fireEvent.press(screen.getByRole('button', { name: 'Masquer le mot de passe' }))
    expect(screen.getByLabelText('Mot de passe').props.secureTextEntry).toBe(true)
  })

  it('explains the problem and sends nothing when the password is too short', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fillForm('short')

    expect(screen.getByText('Le mot de passe doit faire au moins 12 caractères.')).toBeTruthy()
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('creates the account in the member language, then asks to check the inbox', async () => {
    signUpMock.mockResolvedValue({ ok: true })
    await renderWithI18n(<SignUpScreen />)

    await fillForm()

    expect(signUpMock).toHaveBeenCalledWith({
      name: 'Léa',
      email: 'lea@example.com',
      password: 'correct-horse-battery',
      inviteCode: 'miel-2026-noel',
      language: 'fr',
    })
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/check-email',
      params: { email: 'lea@example.com' },
    })
  })

  it('tells the visitor to wait after too many attempts', async () => {
    signUpMock.mockResolvedValue({ ok: false, error: 'tooManyAttempts' })
    await renderWithI18n(<SignUpScreen />)

    await fillForm()

    expect(screen.getByText('Trop de tentatives. Réessaie dans quelques minutes.')).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('asks for the invite code before sending anything', async () => {
    await renderWithI18n(<SignUpScreen />)

    await fillForm('correct-horse-battery', '   ')

    expect(screen.getByText('Indique le code d’invitation que tu as reçu.')).toBeTruthy()
    expect(signUpMock).not.toHaveBeenCalled()
  })

  it('explains that the invite code was refused', async () => {
    signUpMock.mockResolvedValue({ ok: false, error: 'inviteInvalid' })
    await renderWithI18n(<SignUpScreen />)

    await fillForm()

    expect(
      screen.getByText(
        'Ce code d’invitation n’est pas valide. Demande-le à la personne qui t’a invité·e.',
      ),
    ).toBeTruthy()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('fills in the code from an invitation link', async () => {
    mockParams = { code: 'Miel-2026-Noel' }
    await renderWithI18n(<SignUpScreen />)

    expect(screen.getByLabelText('Code d’invitation').props.value).toBe('Miel-2026-Noel')
    // Le code ne reste pas dans l'adresse de la page.
    expect(mockSetParams).toHaveBeenCalledWith({ code: undefined })
  })

  it('ignores a code in the link that could not be a real one', async () => {
    mockParams = { code: 'a'.repeat(101) }
    await renderWithI18n(<SignUpScreen />)

    expect(screen.getByLabelText('Code d’invitation').props.value).toBe('')
  })
})
