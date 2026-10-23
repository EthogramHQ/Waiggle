import { contactEmail } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { signIn } from '../accounts/api'
import { createI18n } from '../i18n'
import { renderWithI18n } from '../testing/render'
import { containing, fr } from '../testing/text'
import { SignInScreen } from './SignInScreen'

jest.mock('../accounts/api', () => ({ signIn: jest.fn() }))
const mockReplace = jest.fn()
let mockParams: { next?: string | string[] } = {}
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}))

const signInMock = jest.mocked(signIn)

const submit = async () => {
  await fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'lea@example.com')
  await fireEvent.changeText(screen.getByLabelText('Mot de passe'), 'correct-horse-battery')
  await fireEvent.press(screen.getByRole('button', { name: 'Me connecter' }))
}

beforeEach(() => {
  signInMock.mockReset()
  mockReplace.mockReset()
  mockParams = {}
})

describe('SignInScreen', () => {
  it('goes back home once signed in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(signInMock).toHaveBeenCalledWith({
      email: 'lea@example.com',
      password: 'correct-horse-battery',
    })
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('returns to the page that asked for a sign-in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    mockParams = { next: '/members/u2' }
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(mockReplace).toHaveBeenCalledWith('/members/u2')
  })

  it('never sends the member to another site, or to the leaving page, after signing in', async () => {
    signInMock.mockResolvedValue({ ok: true })
    for (const next of [
      '//faux.example/connexion',
      'javascript:alert(1)',
      '/out?url=https://faux-waiggle.example',
      // Un paramètre répété : seul le premier compte.
      ['//faux.example', '/members/u2'],
    ]) {
      mockReplace.mockReset()
      mockParams = { next }
      const { unmount } = await renderWithI18n(<SignInScreen />)

      await submit()

      expect(mockReplace).toHaveBeenCalledWith('/')
      await unmount()
    }
  })

  it('says when the email or password is wrong', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'invalidCredentials' })
    await renderWithI18n(<SignInScreen />)

    await submit()

    expect(screen.getByText('Adresse e-mail ou mot de passe incorrect.')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('explains that the address must be verified first, in English too', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'emailNotVerified' })
    await renderWithI18n(<SignInScreen />, 'en')

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'lea@example.com')
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-horse-battery')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      screen.getByText('Your email is not verified yet: we just sent you the link again.'),
    ).toBeTruthy()
  })
})

// --- Tranche 7a : l'adresse de contact, lisible sans compte (règle 23 de la relecture du plan) ---

describe('the contact address on the sign-in page', () => {
  it('gives the contact address, in French or in English, to someone without an account', async () => {
    // Une personne photographiée ou une autorité n'a pas de compte : elle doit pouvoir écrire.
    await renderWithI18n(<SignInScreen />)

    expect(screen.getAllByText(containing(fr.t('auth.contact'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(contactEmail)).length).toBeGreaterThan(0)
  })

  it('gives it in English too', async () => {
    await renderWithI18n(<SignInScreen />, 'en')

    expect(
      screen.getAllByText(containing(createI18n('en').t('auth.contact'))).length,
    ).toBeGreaterThan(0)
  })
})
