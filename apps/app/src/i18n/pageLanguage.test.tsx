// Tests de la langue des pages publiques à adresse par langue (tranche R12, scénario « Les adresses
// par langue », « La langue de la page » ; relecture de l'interface du plan, B1, décision 8) : une
// page sous `/en/…` s'affiche en anglais pour un visiteur, dès le premier rendu (le HTML pré-rendu
// dans cette langue) et après l'hydratation, même si le navigateur est réglé en français ; `<html
// lang>` vaut la langue de l'adresse ; les deux langues sont pré-rendues (`generateStaticParams`).
//
// L'interface attendue (plan R12, choix 7, UI-A1) : `app/[lang]/_layout.tsx`, qui lit `lang` dans les
// paramètres de l'adresse, exporte `generateStaticParams()` (fr, en), et rend la page (`Slot` ou
// `Stack`) dans cette langue ; `useBrowserLanguage` (src/i18n.ts, appelé par chaque écran) ne
// remplace pas la langue de l'adresse pour un visiteur. Une langue inconnue : pas de page.
// (Un test d'application dans `src/` : Expo Router ferait une page d'un test posé dans `app/`.)
import { appName } from '@ruche/brand'
import { screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'
import { mockSession, renderWithProviders } from '../testing/render'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('../profile/api', () => ({ getMe: jest.fn(), updateProfile: jest.fn() }))
// Le navigateur du visiteur est réglé en français.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'fr-FR', languageCode: 'fr' }],
}))
// Ce que chaque rendu de la page a écrit, dans l'ordre (le premier : le HTML pré-rendu).
const mockRenders: string[] = []
const mockParams: { lang?: string } = {}
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  // La page sous la mise en page : un écran qui appelle `useBrowserLanguage`, comme `Screen`.
  const Page = () => createElement(require('./pageLanguage.probe').Probe)
  const Stack = Object.assign(() => createElement(Page), { Screen: () => null })
  return {
    Slot: Page,
    Stack,
    Redirect: () => null,
    Unmatched: () => null,
    useLocalSearchParams: () => mockParams,
    useGlobalSearchParams: () => mockParams,
    usePathname: () => `/${mockParams.lang ?? ''}/`,
    useSegments: () => ['[lang]'],
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn() }),
  }
})
jest.mock(
  './pageLanguage.probe',
  () => {
    const { createElement } = require('react')
    const { Text: RNText } = require('react-native')
    const { useTranslation: useT } = require('react-i18next')
    const { useBrowserLanguage: useBrowser } = require('../i18n')
    return {
      Probe: () => {
        const { t } = useT()
        useBrowser()
        const text = t(($: { home: { title: string } }) => $.home.title)
        mockRenders.push(text)
        return createElement(RNText, null, text)
      },
    }
  },
  { virtual: true },
)

type Layout = { default: () => ReactNode; generateStaticParams?: () => unknown }
const loadLayout = (): Layout => require('../../app/[lang]/_layout') as Layout

/** Un objet qui accepte tout (`document.body.style.x = …`, `setAttribute(…)`) sans rien garder. */
const loose = (): unknown =>
  new Proxy(() => loose(), {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => '' : loose()),
    set: () => true,
  })

/**
 * Une page web prêtée : `document.documentElement.lang` se lit et s'écrit ; le reste du document
 * (thème, styles) accepte tout, comme `lendWebPage` (testing/arrivedFocus.tsx).
 */
const lendDocument = () => {
  const html: Record<string | symbol, unknown> = { lang: 'fr' }
  const documentElement = new Proxy(html, {
    get: (target, key) => (key in target ? target[key] : loose()),
    set: (target, key, value) => {
      target[key] = value
      return true
    },
  })
  ;(globalThis as { document?: unknown }).document = new Proxy(
    { documentElement, activeElement: null } as Record<string | symbol, unknown>,
    { get: (target, key) => (key in target ? target[key] : loose()), set: () => true },
  )
  return html
}

beforeEach(() => {
  mockRenders.length = 0
  mockParams.lang = 'en'
  mockSession(null)
})
afterEach(() => {
  delete (globalThis as { document?: unknown }).document
  jest.restoreAllMocks()
})

describe('the language of a page at a language address (R12, B1)', () => {
  it('pre-renders both languages', () => {
    const { generateStaticParams } = loadLayout()

    expect(generateStaticParams?.()).toEqual([{ lang: 'fr' }, { lang: 'en' }])
  })

  it('renders /en/ in English before and after hydration with a French browser', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    lendDocument()
    const { default: LangLayout } = loadLayout()
    // L'appli est créée en français, comme le pré-rendu de la racine.
    await renderWithProviders(<LangLayout />, 'fr')

    expect(screen.getByText(`Welcome to ${appName}`)).toBeTruthy()
    expect(mockRenders.length).toBeGreaterThan(0)
    // Chaque rendu, le premier compris (le HTML reçu), est en anglais : jamais de passage par le
    // français, ni de retour au français une fois la langue du navigateur lue.
    expect(mockRenders.every((text) => text === `Welcome to ${appName}`)).toBe(true)
  })

  it('renders /fr/ in French for a browser set in English', async () => {
    mockParams.lang = 'fr'
    jest.replaceProperty(Platform, 'OS', 'web')
    lendDocument()
    const { default: LangLayout } = loadLayout()
    await renderWithProviders(<LangLayout />, 'en')

    expect(screen.getByText(`Bienvenue sur ${appName}`)).toBeTruthy()
    expect(mockRenders.every((text) => text === `Bienvenue sur ${appName}`)).toBe(true)
  })

  it('sets the document lang to the address language', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const html = lendDocument()
    const { default: LangLayout } = loadLayout()
    const { i18n } = await renderWithProviders(<LangLayout />, 'fr')

    await screen.findByText(`Welcome to ${appName}`)
    // Soit la mise en page l'écrit elle-même, soit elle change la langue de l'appli, et la racine
    // (app/_layout.tsx) l'écrit à chaque changement.
    expect(html.lang === 'en' || i18n.language === 'en').toBe(true)
  })

  it('shows no page for a language it does not know', async () => {
    mockParams.lang = 'de'
    const { default: LangLayout } = loadLayout()
    await renderWithProviders(<LangLayout />, 'fr')

    expect(mockRenders).toHaveLength(0)
  })
})
