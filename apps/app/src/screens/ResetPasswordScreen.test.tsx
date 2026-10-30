// Tests de la page ouverte par le lien de l'e-mail « Choisis un nouveau mot de passe » (tranche R2,
// route /reset-password?token=…). Scénario : docs/scenarios/refonte.md, « Choisir un nouveau mot de
// passe ». Le jeton vient de l'adresse (useLocalSearchParams), les règles et la jauge sont celles de
// l'inscription, le succès ramène sur « Se connecter » avec le message ; un lien expiré, déjà utilisé
// ou abîmé reçoit un seul et même texte (jur-16) et « Demander un nouveau lien ».
import { PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useLocalSearchParams } from 'expo-router'
import { resetPassword } from '../accounts/api'
import { pathOf, visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ResetPasswordScreen } from './ResetPasswordScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), resetPassword: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSetParams = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/reset-password',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
    setParams: mockSetParams,
  }),
  useLocalSearchParams: jest.fn(),
}))

const text = (key: keyof Translation['auth']['resetPassword']) =>
  fr.t(($) => $.auth.resetPassword[key])
const token = 'tok-7f3c9a-valide'
const newPassword = 'nouveau-mot-de-passe-long'

/** Tape le nouveau mot de passe, puis appuie sur « Enregistrer le mot de passe ». */
const save = async (password = newPassword) => {
  await fireEvent.changeText(screen.getByLabelText(text('newPassword')), password)
  await fireEvent.press(screen.getByRole('button', { name: text('submit') }))
}

const now = new Date(2026, 9, 30, 19, 37)
const hourAfter = (seconds: number) => {
  const then = new Date(now.getTime() + seconds * 1000)
  return new RegExp(`${then.getHours()}\\D{1,3}${String(then.getMinutes()).padStart(2, '0')}`)
}

beforeEach(() => {
  jest.mocked(useLocalSearchParams).mockReturnValue({ token })
  jest.mocked(resetPassword).mockReset().mockResolvedValue({ ok: true })
  for (const mock of [mockPush, mockReplace, mockSetParams]) mock.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ResetPasswordScreen', () => {
  it('asks for a new password with the rules of the sign-up', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    expect(screen.getByRole('header', { name: text('title') })).toBeTruthy()
    const field = screen.getByLabelText(text('newPassword'))
    expect(field).toHaveProp('secureTextEntry', true)
    // Les gestionnaires de mots de passe proposent d'en générer un, comme à l'inscription.
    expect(field).toHaveProp('autoComplete', 'new-password')
    // La règle (« Au moins 12 caractères. ») est dite avant de taper.
    expect(
      screen.getAllByText(
        containing(fr.t(($) => $.auth.fields.passwordHint, { min: PASSWORD_MIN_LENGTH })),
      ).length,
    ).toBeGreaterThan(0)
  })

  it('says before the gesture that every device will be signed out (jur-3)', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    expect(screen.getAllByText(containing(text('consequences'))).length).toBeGreaterThan(0)
  })

  it('shows the honey meter of the sign-up while typing', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    await fireEvent.changeText(screen.getByLabelText(text('newPassword')), 'abcde')

    // 12 exigés, 5 tapés : « Encore 7 caractères ».
    expect(screen.getByText(fr.t(($) => $.auth.passwordMeter.remaining, { count: 7 }))).toBeTruthy()
  })

  it('refuses a password shorter than 12 characters before calling the server', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    await save('court')

    expect(
      screen.getByText(fr.t(($) => $.auth.errors.passwordTooShort, { min: PASSWORD_MIN_LENGTH })),
    ).toBeTruthy()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('changes the password with the token of the link, then goes to sign in with the message', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    await save()

    expect(resetPassword).toHaveBeenCalledWith({ token, newPassword })
    // replace, pas push : « retour » ne ramène pas sur une page dont le lien a déjà servi.
    const [destination] = visited(mockReplace)
    expect(destination).toBeDefined()
    expect(pathOf(mockReplace.mock.calls[0]?.[0]).startsWith('/sign-in')).toBe(true)
  })

  it('never shows the token on screen and removes it from the address once read', async () => {
    await renderWithProviders(<ResetPasswordScreen />)

    expect(screen.queryByText(containing(token))).toBeNull()
    // Comme le code d'invitation à l'inscription : le jeton quitte l'adresse (ni historique du
    // navigateur, ni partage d'écran), tout en restant en mémoire pour l'envoi.
    expect(mockSetParams).toHaveBeenCalledWith(expect.objectContaining({ token: undefined }))
  })

  it('says one same thing for an expired, used or broken link, and offers a new one (jur-16)', async () => {
    jest.mocked(resetPassword).mockResolvedValue({ ok: false, error: 'invalidToken' })
    await renderWithProviders(<ResetPasswordScreen />)

    await save()

    expect(await screen.findByText(containing(text('invalidTitle')))).toBeTruthy()
    // Un seul texte : il ne dit pas laquelle des causes s'applique.
    expect(screen.getAllByText(containing(text('invalidBody'))).length).toBe(1)
    expect(screen.queryByLabelText(text('newPassword'))).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: text('requestNew') }))

    expect(visited(mockPush, mockReplace)).toContain('/forgot-password')
  })

  it('treats a link without a token as a broken link', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({})
    await renderWithProviders(<ResetPasswordScreen />)

    expect(screen.getByText(containing(text('invalidTitle')))).toBeTruthy()
    expect(screen.getByRole('button', { name: text('requestNew') })).toBeTruthy()
    expect(screen.queryByLabelText(text('newPassword'))).toBeNull()
  })

  it('tells at what fixed time to try again when the quota is reached', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    jest
      .mocked(resetPassword)
      .mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 900 })
    await renderWithProviders(<ResetPasswordScreen />)

    await save()

    expect(
      await screen.findByText(containing(fr.t(($) => $.auth.errors.tooManyAttempts))),
    ).toBeTruthy()
    const retry = screen.getByText(containing(fr.t(($) => $.auth.retryAt, { time: '' }).trim()))
    expect(retry).toHaveTextContent(hourAfter(900))
    expect(screen.getByRole('button', { name: text('submit') })).toBeDisabled()

    await act(() => jest.advanceTimersByTime(901_000))

    expect(screen.getByRole('button', { name: text('submit') })).toBeEnabled()
  })
})
