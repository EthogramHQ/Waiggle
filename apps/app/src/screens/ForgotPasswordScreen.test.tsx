// Tests de la page « Mot de passe oublié ? » (tranche R2, route /forgot-password).
// Scénario : docs/scenarios/refonte.md, « J'ai oublié mon mot de passe » et « Trop d'essais ».
// Le visiteur donne son adresse ; la page dit toujours la même chose, qu'un compte existe ou non
// (c'est le serveur qui décide d'envoyer l'e-mail ou non, sans le dire). Au-delà du quota, la page
// donne l'heure du prochain essai, fixe, sans décompte (décision D3), et sans « tu » : l'adresse IP
// est partagée par une famille (jur-14). La demande au serveur (requestPasswordReset) est remplacée.
import type { Translation } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { requestPasswordReset } from '../accounts/api'
import { visited } from '../testing/navigation'
import { renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ForgotPasswordScreen } from './ForgotPasswordScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), requestPasswordReset: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/forgot-password',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

const text = (key: keyof Translation['auth']['forgotPassword']) =>
  fr.t(($) => $.auth.forgotPassword[key])
const emailLabel = fr.t(($) => $.auth.fields.email) // « Adresse e-mail »
const tooMany = fr.t(($) => $.auth.errors.tooManyAttempts) // « Trop d’essais pour l’instant. »

/** Tape une adresse puis appuie sur « Envoyer le lien ». */
const send = async (email = 'lea@example.com') => {
  await fireEvent.changeText(screen.getByLabelText(emailLabel), email)
  await fireEvent.press(screen.getByRole('button', { name: text('submit') }))
}

// 19 h 37 : une heure fixe, pour lire « Nouvel essai possible à 19 h 47 » dix minutes plus tard.
const now = new Date(2026, 9, 30, 19, 37)
/** L'heure attendue à l'écran : « 19 h 47 », « 19:47 »… on vérifie les chiffres, pas la ponctuation. */
const hourAfter = (seconds: number) => {
  const then = new Date(now.getTime() + seconds * 1000)
  return new RegExp(`${then.getHours()}\\D{1,3}${String(then.getMinutes()).padStart(2, '0')}`)
}

beforeEach(() => {
  jest.mocked(requestPasswordReset).mockReset().mockResolvedValue({ ok: true })
  mockPush.mockReset()
  mockReplace.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ForgotPasswordScreen', () => {
  it('gives the page its title and asks for the email address', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)

    expect(screen.getByRole('header', { name: text('title') })).toBeTruthy()
    expect(screen.getAllByText(containing(text('intro'))).length).toBeGreaterThan(0)
    const field = screen.getByLabelText(emailLabel)
    expect(field).toHaveProp('keyboardType', 'email-address')
    expect(field).toHaveProp('autoComplete', 'email')
  })

  it('sends the request and says the same thing whether an account exists or not', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)

    await send()

    expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'lea@example.com' })
    // La seule phrase possible : le serveur ne dit jamais si l'adresse a un compte.
    expect(await screen.findByText(containing(text('sent')))).toBeTruthy()
    expect(screen.getAllByText(containing(text('sentExpires'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(text('noneReceived'))).length).toBeGreaterThan(0)
  })

  it('refuses an address that is not an email before calling the server', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)

    await send('pas-une-adresse')

    expect(screen.getByText(fr.t(($) => $.auth.errors.invalidEmail))).toBeTruthy()
    expect(requestPasswordReset).not.toHaveBeenCalled()
  })

  it('leads back to sign in', async () => {
    await renderWithProviders(<ForgotPasswordScreen />)

    await fireEvent.press(screen.getByRole('button', { name: text('back') }))

    expect(visited(mockPush, mockReplace)).toContain('/sign-in')
  })

  it('gives the title in English too', async () => {
    await renderWithProviders(<ForgotPasswordScreen />, 'en')

    expect(screen.getByRole('header', { name: 'Forgot your password?' })).toBeTruthy()
  })
})

describe('too many attempts on the forgotten password', () => {
  it('tells at what fixed time to try again, without a countdown and without « tu »', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    jest
      .mocked(requestPasswordReset)
      .mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 600 })
    await renderWithProviders(<ForgotPasswordScreen />)

    await send()

    expect(await screen.findByText(containing(tooMany))).toBeTruthy()
    // L'heure du prochain essai, fixe : « Nouvel essai possible à 19 h 47 ».
    const retry = screen.getByText(containing(fr.t(($) => $.auth.retryAt, { time: '' }).trim()))
    expect(retry).toHaveTextContent(hourAfter(600))
    // Rien qui défile (« 9:59 »), ni d'ancien « Réessaie dans quelques minutes » qui tutoie.
    expect(screen.queryByText(/\b\d{1,2}:\d{2}\b/)).toBeNull()
    expect(screen.queryByText(/Réessaie/)).toBeNull()
    // Le bouton est bloqué, et dit pourquoi (jur-13) : il reste lisible, avec son nom.
    expect(screen.getByRole('button', { name: text('submit') })).toBeDisabled()
  })

  it('unblocks the button by itself when the time comes', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    jest
      .mocked(requestPasswordReset)
      .mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 600 })
    await renderWithProviders(<ForgotPasswordScreen />)

    await send()
    expect(await screen.findByRole('button', { name: text('submit') })).toBeDisabled()

    await act(() => jest.advanceTimersByTime(601_000))

    expect(screen.getByRole('button', { name: text('submit') })).toBeEnabled()
    expect(screen.queryByText(containing(tooMany))).toBeNull()
  })
})
