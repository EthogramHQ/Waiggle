// Tests du choix de la langue dans les Réglages quand l'anglais se charge à la demande (R18, « Le
// premier chargement plus léger » : « Quand un membre change de langue (Réglages), alors l'autre
// langue arrive en moins d'une seconde, pendant que le choix montre qu'il travaille ; et si elle
// n'arrive pas (réseau coupé), la langue reste celle d'avant, avec un message et Réessayer » ; plan,
// choix 6).
//
// Ce que ces tests supposent de l'écran (`SettingsSection section="language"`, LNG-2) : le choix
// passe par `ensureLanguage(i18n, language)` de `@ruche/i18n` avant de changer la langue ; pendant
// l'attente, la ligne touchée est occupée (`ListRow busy`) et l'ancienne reste cochée ; un échec
// pose une `Notice` sous le groupe, `account.language.loadFailed` avec l'action « Réessayer »
// (`common.retry`). Sous Jest, `@ruche/i18n` est l'index : on remplace son seul `ensureLanguage`.
import type { Language } from '@ruche/i18n'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { i18n as I18n } from 'i18next'
import { updateProfile } from '../../profile/api'
import { leaMe } from '../../testing/fixtures'
import { mockSession, renderWithProviders } from '../../testing/render'
import { fr } from '../../testing/text'
import { SettingsSection } from './sections'

const mockEnsure = jest.fn<Promise<void>, [I18n, Language]>()
jest.mock('@ruche/i18n', () => ({
  ...jest.requireActual('@ruche/i18n'),
  ensureLanguage: (...args: [I18n, Language]) => mockEnsure(...args),
}))
jest.mock('../../api/client', () => ({ request: jest.fn(), requestWithoutBody: jest.fn() }))
jest.mock('../../accounts/api', () => ({
  useSession: jest.fn(),
  downloadMyData: jest.fn(),
  signOut: jest.fn(),
}))
jest.mock('../../profile/api', () => ({
  ...jest.requireActual('../../profile/api'),
  getMe: jest.fn(),
  updateProfile: jest.fn(),
}))
jest.mock('expo-router', () => ({
  usePathname: () => '/settings/language',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}))

const T = {
  loadFailed: fr.t(($) => $.account.language.loadFailed),
  retry: fr.t(($) => $.common.retry),
}

/** Une promesse qu'on tient ou qu'on rompt à la main : l'anglais « en route ». */
const deferred = () => {
  let resolve = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  // Un rejet que personne n'attend encore (le code d'avant R18 n'appelle pas ensureLanguage) ne
  // doit pas faire échouer le test pour une autre raison que la sienne.
  promise.catch(() => {})
  return { promise, resolve, reject }
}

const radio = (name: string) => screen.getByRole('radio', { name })

beforeEach(() => {
  mockEnsure.mockReset().mockResolvedValue(undefined)
  jest.mocked(updateProfile).mockReset().mockResolvedValue({ ok: true, data: leaMe })
  mockSession({ user: { name: 'Léa' } })
})

describe('the language settings with English loaded on demand', () => {
  it('shows the touched language as busy while it loads, the former one still checked', async () => {
    const english = deferred()
    mockEnsure.mockReturnValue(english.promise)
    const { i18n } = await renderWithProviders(
      <SettingsSection section="language" email={leaMe.email} />,
    )

    await fireEvent.press(radio('English'))

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(radio('English')).toBeBusy()
    expect(radio('Français')).toBeChecked()
    expect(i18n.language).toBe('fr')

    await act(async () => english.resolve())

    expect(i18n.language).toBe('en')
    expect(radio('English')).toBeChecked()
    expect(radio('English')).not.toBeBusy()
  })

  it('keeps the former language with the message and Retry when English does not arrive', async () => {
    const english = deferred()
    mockEnsure.mockReturnValue(english.promise)
    const { i18n } = await renderWithProviders(
      <SettingsSection section="language" email={leaMe.email} />,
    )

    await fireEvent.press(radio('English'))
    await act(async () => english.reject(new Error('chunk missing')))

    expect(i18n.language).toBe('fr')
    expect(radio('Français')).toBeChecked()
    expect(radio('English')).not.toBeBusy()
    expect(screen.getByText(T.loadFailed)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.retry })).toBeTruthy()
    // L'écran est resté en français : le compte ne retient pas une langue qui n'a pas pu venir.
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('switches to English when Retry succeeds', async () => {
    mockEnsure.mockRejectedValueOnce(new Error('chunk missing'))
    const { i18n } = await renderWithProviders(
      <SettingsSection section="language" email={leaMe.email} />,
    )
    await fireEvent.press(radio('English'))
    expect(screen.getByText(T.loadFailed)).toBeTruthy()

    // Le réseau revient : le second essai réussit.
    await fireEvent.press(screen.getByRole('button', { name: T.retry }))

    expect(mockEnsure).toHaveBeenLastCalledWith(expect.anything(), 'en')
    expect(i18n.language).toBe('en')
    expect(radio('English')).toBeChecked()
    // Le message est parti, dans les deux langues.
    expect(screen.queryByText(T.loadFailed)).toBeNull()
    expect(screen.queryByText(i18n.t(($) => $.account.language.loadFailed))).toBeNull()
    expect(updateProfile).toHaveBeenCalledWith({ language: 'en' })
  })
})
