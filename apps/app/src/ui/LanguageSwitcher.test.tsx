import { layout } from '@ruche/brand'
import type { Language } from '@ruche/i18n'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import type { i18n as I18n } from 'i18next'
import { StyleSheet, type ViewStyle } from 'react-native'
import { getMe, updateProfile } from '../profile/api'
import { LanguageSync } from '../profile/LanguageSync'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { LanguageSwitcher } from './LanguageSwitcher'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// R18 (« Le premier chargement plus léger », plan choix 6) : sur le web, l'anglais arrive à la
// demande par `ensureLanguage` de `@ruche/i18n`. Sous Jest, `@ruche/i18n` est l'index (les deux
// langues tout de suite) : on remplace son seul `ensureLanguage`, tenu par défaut, pour tenir
// l'anglais en attente ou le faire échouer dans les tests qui le demandent.
const mockEnsure = jest.fn<Promise<void>, [I18n, Language]>()
jest.mock('@ruche/i18n', () => ({
  ...jest.requireActual('@ruche/i18n'),
  ensureLanguage: (...args: [I18n, Language]) => mockEnsure(...args),
}))

beforeEach(() => {
  jest.mocked(updateProfile).mockReset()
  jest.mocked(getMe).mockReset().mockResolvedValue(leaMe)
  mockEnsure.mockReset().mockResolvedValue(undefined)
})

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

const T = {
  loadFailed: fr.t(($) => $.account.language.loadFailed),
  retry: fr.t(($) => $.common.retry),
}

// Ce que ces tests supposent du sélecteur (LNG-2) : il passe par `ensureLanguage` avant de changer
// la langue ; pendant l'attente, l'option touchée est occupée (`Segmented busy`) et l'option cochée
// reste celle d'avant ; un échec pose sous le contrôle le message `account.language.loadFailed` et
// l'action « Réessayer » (`common.retry`).
describe('LanguageSwitcher while English loads on demand', () => {
  it('announces English as busy while it loads and keeps French checked', async () => {
    mockSession(null)
    const english = deferred()
    mockEnsure.mockReturnValue(english.promise)
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(screen.getByRole('radio', { name: 'English' })).toBeBusy()
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked()
    expect(i18n.language).toBe('fr')

    await act(async () => english.resolve())

    expect(i18n.language).toBe('en')
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeBusy()
  })

  it('keeps French with the message and Retry when English does not arrive', async () => {
    mockSession({ user: { name: 'Léa' } })
    mockEnsure.mockRejectedValue(new Error('chunk missing'))
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: { ...leaMe, language: 'en' } })
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(i18n.language).toBe('fr')
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeBusy()
    expect(screen.getByText(T.loadFailed)).toBeTruthy()
    expect(screen.getByRole('button', { name: T.retry })).toBeTruthy()
    // L'écran est resté en français : le compte ne retient pas une langue qui n'a pas pu venir.
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('keeps the failure message of the compact switcher within the width of a form', async () => {
    // Relecture de design R18 : posé seul au bout d'une rangée large (la connexion à 1 440 points),
    // le sélecteur compact prenait toute la rangée et son message un bandeau de 1 254 points, loin
    // du « FR / EN ». Le message se lit près du sélecteur, dans la largeur d'un formulaire.
    mockSession(null)
    mockEnsure.mockRejectedValue(new Error('chunk missing'))
    await renderWithProviders(<LanguageSwitcher compact visitor />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    const message = screen.getByText(T.loadFailed) as unknown as {
      props: Record<string, unknown>
      parent: unknown
    }
    type Node = typeof message | null
    const widths: unknown[] = []
    for (let node: Node = message; node; node = node.parent as Node) {
      widths.push(StyleSheet.flatten(node.props.style as ViewStyle)?.maxWidth)
    }
    expect(widths).toContain(layout.formWidth)
  })

  it('switches to English when Retry succeeds', async () => {
    mockSession(null)
    mockEnsure.mockRejectedValueOnce(new Error('chunk missing'))
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
    expect(screen.getByText(T.loadFailed)).toBeTruthy()

    await fireEvent.press(screen.getByRole('button', { name: T.retry }))

    expect(mockEnsure).toHaveBeenLastCalledWith(expect.anything(), 'en')
    expect(i18n.language).toBe('en')
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked()
    expect(screen.queryByText(T.loadFailed)).toBeNull()
    expect(screen.queryByText(i18n.t(($) => $.account.language.loadFailed))).toBeNull()
  })
})

describe('LanguageSwitcher', () => {
  it('saves the choice on the account of a signed-in member', async () => {
    mockSession({ user: { name: 'Léa' } })
    jest.mocked(updateProfile).mockResolvedValue({ ok: true, data: { ...leaMe, language: 'en' } })
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(i18n.language).toBe('en')
    expect(updateProfile).toHaveBeenCalledWith({ language: 'en' })
  })

  it('only changes the screen language for a visitor', async () => {
    mockSession(null)
    const { i18n } = await renderWithProviders(<LanguageSwitcher />)

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))

    expect(i18n.language).toBe('en')
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

describe('LanguageSync', () => {
  it('uses the language saved on the account, on any device', async () => {
    mockSession({ user: { name: 'Léa' } })
    jest.mocked(getMe).mockResolvedValue({ ...leaMe, language: 'en' })

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')

    await waitFor(() => expect(i18n.language).toBe('en'))
  })

  it('leaves the device language alone for a visitor', async () => {
    mockSession(null)

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')

    expect(i18n.language).toBe('fr')
    expect(getMe).not.toHaveBeenCalled()
  })
})
