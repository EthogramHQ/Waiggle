// Tests de « Changer mon mot de passe » (tranche R2, rubrique Sécurité des réglages).
// Scénario : docs/scenarios/refonte.md, « Changer mon mot de passe » et « Trop d'essais ».
// L'actuel faux : le champ le dit, rien ne change. Les deux bons : un toast « Mot de passe changé »,
// les autres appareils sont déconnectés et celui-ci reste connecté (dit avant le geste, jur-3).
import { PASSWORD_MIN_LENGTH } from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { changePassword } from '../accounts/api'
import { getMe } from '../profile/api'
import { leaMe } from '../testing/fixtures'
import { visited } from '../testing/navigation'
import { mockSession, renderWithProviders } from '../testing/render'
import { containing, fr } from '../testing/text'
import { ToastProvider } from '../ui/theme/toast'
import { ChangePasswordScreen } from './ChangePasswordScreen'

jest.mock('../accounts/api', () => ({ useSession: jest.fn(), changePassword: jest.fn() }))
// La barre du haut et les états partagés lisent le profil : on le remplace aussi.
jest.mock('../profile/api', () => ({ getMe: jest.fn() }))
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/security/password',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    // R2 : après le succès, l'écran revient à la rubrique Sécurité par `dismissTo` (relecture de
    // l'interface, B2) ; le faux routeur doit l'avoir.
    dismissTo: jest.fn(),
    canGoBack: () => true,
    setParams: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
}))

const text = (key: keyof Translation['settings']['changePassword']) =>
  fr.t(($) => $.settings.changePassword[key])
const current = 'ancien-mot-de-passe-de-lea'
const fresh = 'nouveau-mot-de-passe-de-lea'

// Le toast vit dans son fournisseur, comme dans l'appli : le test le lit à l'écran, par son texte.
const renderScreen = () =>
  renderWithProviders(
    <ToastProvider>
      <ChangePasswordScreen />
    </ToastProvider>,
  )

/** Remplit les deux champs (ce qui n'est pas donné reste vide), puis appuie sur le bouton. */
const change = async ({ old = '', next = '' }: { old?: string; next?: string }) => {
  if (old) await fireEvent.changeText(screen.getByLabelText(text('current')), old)
  if (next) await fireEvent.changeText(screen.getByLabelText(text('new')), next)
  await fireEvent.press(screen.getByRole('button', { name: text('submit') }))
}

const now = new Date(2026, 9, 30, 19, 37)
const hourAfter = (seconds: number) => {
  const then = new Date(now.getTime() + seconds * 1000)
  return new RegExp(`${then.getHours()}\\D{1,3}${String(then.getMinutes()).padStart(2, '0')}`)
}

beforeEach(() => {
  mockSession({ user: { name: 'Léa', email: 'lea@example.com' } })
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  jest.mocked(changePassword).mockReset().mockResolvedValue({ ok: true })
  mockPush.mockReset()
  mockReplace.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ChangePasswordScreen', () => {
  it('gives the page its title and asks for the current and the new password', async () => {
    await renderScreen()

    expect(screen.getByRole('header', { name: text('screenTitle') })).toBeTruthy()
    expect(screen.getAllByText(containing(text('intro'))).length).toBeGreaterThan(0)
    const oldField = screen.getByLabelText(text('current'))
    expect(oldField).toHaveProp('secureTextEntry', true)
    expect(oldField).toHaveProp('autoComplete', 'current-password')
    const newField = screen.getByLabelText(text('new'))
    expect(newField).toHaveProp('secureTextEntry', true)
    expect(newField).toHaveProp('autoComplete', 'new-password')
  })

  it('says before the gesture that the other devices will be signed out, this one not (jur-3)', async () => {
    await renderScreen()

    expect(screen.getAllByText(containing(text('consequencesTitle'))).length).toBeGreaterThan(0)
    expect(screen.getAllByText(containing(text('consequences'))).length).toBeGreaterThan(0)
  })

  it('offers « Mot de passe oublié ? » for a member who no longer knows the current one', async () => {
    await renderScreen()

    await fireEvent.press(
      screen.getByRole('button', { name: fr.t(($) => $.auth.signIn.forgotPassword) }),
    )

    expect(visited(mockPush, mockReplace)).toContain('/forgot-password')
  })

  it('refuses a new password shorter than 12 characters before calling the server', async () => {
    await renderScreen()

    await change({ old: current, next: 'court' })

    expect(
      screen.getByText(fr.t(($) => $.auth.errors.passwordTooShort, { min: PASSWORD_MIN_LENGTH })),
    ).toBeTruthy()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('says in its field that the current password is wrong, and changes nothing', async () => {
    jest.mocked(changePassword).mockResolvedValue({ ok: false, error: 'wrongPassword' })
    await renderScreen()

    await change({ old: 'pas-le-bon-mot-de-passe', next: fresh })

    expect(await screen.findByText(text('wrongCurrent'))).toBeTruthy()
    expect(screen.queryByText(text('done'))).toBeNull()
    expect(visited(mockPush, mockReplace)).toEqual([])
    // Le formulaire reste là, avec le nouveau mot de passe tapé : on corrige l'actuel, rien de plus.
    expect(screen.getByLabelText(text('new'))).toHaveProp('value', fresh)
  })

  it('changes the password and shows the toast « Mot de passe changé »', async () => {
    await renderScreen()

    await change({ old: current, next: fresh })

    expect(changePassword).toHaveBeenCalledWith({ currentPassword: current, newPassword: fresh })
    expect(await screen.findByText(text('done'))).toBeTruthy()
  })

  it('tells at what fixed time to try again when the quota is reached', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(now)
    jest
      .mocked(changePassword)
      .mockResolvedValue({ ok: false, error: 'tooManyAttempts', retryAfterSeconds: 900 })
    await renderScreen()

    await change({ old: current, next: fresh })

    expect(
      await screen.findByText(containing(fr.t(($) => $.auth.errors.tooManyAttempts))),
    ).toBeTruthy()
    const retry = screen.getByText(containing(fr.t(($) => $.auth.retryAt, { time: '' }).trim()))
    expect(retry).toHaveTextContent(hourAfter(900))
    expect(screen.getByRole('button', { name: text('submit') })).toBeDisabled()

    await act(() => jest.advanceTimersByTime(901_000))

    expect(screen.getByRole('button', { name: text('submit') })).toBeEnabled()
  })

  it('shows nothing of the form to someone who is not signed in', async () => {
    mockSession(null)
    await renderScreen()

    expect(screen.queryByLabelText(text('current'))).toBeNull()
    expect(screen.queryByLabelText(text('new'))).toBeNull()
    // Témoin : la page dit qu'elle est réservée aux membres.
    expect(screen.getByText(fr.t(($) => $.states.signedOutTitle))).toBeTruthy()
  })
})
