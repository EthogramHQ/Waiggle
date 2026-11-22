// Tests de la langue enregistrée sur le compte quand l'anglais arrive à la demande (R18, « Le
// premier chargement plus léger ») : l'écran attend les textes avant de changer de langue, et garde
// la sienne s'ils n'arrivent pas.
import type { Language } from '@ruche/i18n'
import { act } from '@testing-library/react-native'
import type { i18n as I18n } from 'i18next'
import { leaMe } from '../testing/fixtures'
import { mockSession, renderWithProviders } from '../testing/render'
import { getMe } from './api'
import { LanguageSync } from './LanguageSync'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// Sous Jest, `@ruche/i18n` est l'index (les deux langues tout de suite) : on remplace son seul
// `ensureLanguage`, pour tenir l'anglais en attente ou le faire échouer.
const mockEnsure = jest.fn<Promise<void>, [I18n, Language]>()
jest.mock('@ruche/i18n', () => ({
  ...jest.requireActual('@ruche/i18n'),
  ensureLanguage: (...args: [I18n, Language]) => mockEnsure(...args),
}))

beforeEach(() => {
  mockSession({ user: { name: 'Léa' } })
  jest
    .mocked(getMe)
    .mockReset()
    .mockResolvedValue({ ...leaMe, language: 'en' })
  mockEnsure.mockReset()
})

describe('LanguageSync with English loaded on demand', () => {
  it('keeps the screen language until the texts of the saved language arrive', async () => {
    let arrive = () => {}
    mockEnsure.mockReturnValue(
      new Promise<void>((resolve) => {
        arrive = resolve
      }),
    )

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')
    await act(async () => {})

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(i18n.language).toBe('fr')

    await act(async () => arrive())

    expect(i18n.language).toBe('en')
  })

  it('keeps the screen language when the texts do not arrive', async () => {
    mockEnsure.mockRejectedValue(new Error('chunk missing'))

    const { i18n } = await renderWithProviders(<LanguageSync />, 'fr')
    await act(async () => {})

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(i18n.language).toBe('fr')
  })
})
