// Tests d'une page à adresse par langue quand l'anglais arrive à la demande (R18, « Le premier
// chargement plus léger ») : une page `/en/…` atteinte sans rechargement, avant ses textes, garde la
// langue de l'appli (ni écran vide, ni mélange), puis passe à l'anglais à leur arrivée.
import { appName } from '@ruche/brand'
import type { Language } from '@ruche/i18n'
import { act, screen } from '@testing-library/react-native'
import type { i18n as I18n } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Text } from 'react-native'
import { mockSession, renderWithProviders } from '../testing/render'
import { PageLanguage } from './PageLanguage'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Sous Jest, `@ruche/i18n` est l'index (les deux langues tout de suite) : on remplace son seul
// `ensureLanguage`, pour tenir l'anglais en attente ou le faire échouer.
const mockEnsure = jest.fn<Promise<void>, [I18n, Language]>()
jest.mock('@ruche/i18n', () => ({
  ...jest.requireActual('@ruche/i18n'),
  ensureLanguage: (...args: [I18n, Language]) => mockEnsure(...args),
}))
// Et l'instance de la page naît sans ses textes anglais, comme dans le navigateur : son
// `hasResourceBundle` dit non jusqu'à ce que `ensureLanguage` les ait « ajoutés ».
const mockArrived = { en: false }
jest.mock('../i18n', () => {
  const actual = jest.requireActual('../i18n')
  return {
    ...actual,
    createPageI18n: (language: Language) => {
      const instance: I18n = actual.createPageI18n(language)
      const has = instance.hasResourceBundle.bind(instance)
      instance.hasResourceBundle = (lng: string, ns: string) =>
        lng === 'en' ? mockArrived.en : has(lng, ns)
      return instance
    },
  }
})

/** Une page qui écrit un texte de l'appli, dans la langue qu'elle reçoit. */
function Probe() {
  const { t } = useTranslation()
  return <Text>{t(($) => $.home.title)}</Text>
}

beforeEach(() => {
  mockArrived.en = false
  mockEnsure.mockReset()
  // La session en cours de lecture : la page suit son adresse, l'appli garde sa langue.
  mockSession(null, true)
})

describe('PageLanguage with English loaded on demand', () => {
  it('keeps the app language until the texts of the address arrive, then shows them', async () => {
    let arrive = () => {}
    mockEnsure.mockReturnValue(
      new Promise<void>((resolve) => {
        arrive = () => {
          mockArrived.en = true
          resolve()
        }
      }),
    )

    await renderWithProviders(
      <PageLanguage language="en">
        <Probe />
      </PageLanguage>,
      'fr',
    )

    expect(mockEnsure).toHaveBeenCalledWith(expect.anything(), 'en')
    expect(screen.getByText(`Bienvenue sur ${appName}`)).toBeTruthy()

    await act(async () => arrive())

    expect(screen.getByText(`Welcome to ${appName}`)).toBeTruthy()
  })

  it('stays readable in the app language when the texts do not arrive', async () => {
    mockEnsure.mockRejectedValue(new Error('chunk missing'))

    await renderWithProviders(
      <PageLanguage language="en">
        <Probe />
      </PageLanguage>,
      'fr',
    )
    await act(async () => {})

    expect(screen.getByText(`Bienvenue sur ${appName}`)).toBeTruthy()
  })
})
