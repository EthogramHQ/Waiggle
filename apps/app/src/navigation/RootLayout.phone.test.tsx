// Test de la mise en page racine sur téléphone (tranche R13, « Le premier chargement » ; relecture du
// plan, décision 4). Sur le web, Geist Mono se charge après l'hydratation, par un second chargement
// réservé au web ; sur téléphone, rien n'est pré-rendu, et l'écran du lancement attend toujours les
// huit polices, Geist Mono comprise : sinon une étiquette s'afficherait d'abord dans une autre
// police, puis changerait de largeur.
// (Un fichier à part de RootLayout.test.tsx : `isWeb` se lit au chargement de app/_layout.tsx, que
// ce fichier-là charge « web » ; ici, il se charge comme Jest, sur iOS.)
import { screen } from '@testing-library/react-native'
import RootLayout from '../../app/_layout'
import { createI18n } from '../i18n'
import { renderWithProviders } from '../testing/render'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Ce que la pile a reçu : montée, l'appli est ouverte.
const mockStack = jest.fn()
jest.mock('expo-router', () => {
  const { createElement } = require('react')
  return {
    DefaultTheme: { dark: false, colors: {} },
    ThemeProvider: ({ children }: { children: unknown }) => children,
    Stack: Object.assign(
      (props: unknown) => {
        mockStack(props)
        return createElement('Stack')
      },
      { Screen: () => null },
    ),
  }
})
// Les polices : Geist Mono en retard tant que `mockMonoLoaded` est faux, les autres prêtes. Une
// police est reconnue à son nom (src/ui/theme/fonts.ts), qu'elle passe par `useFonts` ou `loadAsync`.
let mockMonoLoaded = true
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: (map: Record<string, unknown>) => [
    mockMonoLoaded || !Object.keys(map).some((name) => name.startsWith('GeistMono')),
    null,
  ],
  loadAsync: () => (mockMonoLoaded ? Promise.resolve() : new Promise(() => {})),
  isLoaded: (name: string) => mockMonoLoaded || !name.startsWith('GeistMono'),
}))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('../navigation/AppTabBar', () => ({ AppTabBar: () => null }))
jest.mock('../profile/LanguageSync', () => ({ LanguageSync: () => null }))
jest.mock('../profile/ProvisionalNameGate', () => ({ ProvisionalNameGate: () => null }))
jest.mock('../rules/RulesGate', () => ({ RulesGate: () => null }))
jest.mock('../accounts/memberMarker', () => ({ useMemberMarkerSync: () => {} }))
jest.mock('../navigation/chunks/preload', () => ({ EditorPreload: () => null }))
jest.mock('../ui/AmbientLight', () => ({ AmbientLight: () => null }))
// R20 : la Goutte des Éclaireuses a ses propres tests (scout/ScoutDrop.test.tsx).
jest.mock('../scout/ScoutDrop', () => ({ ScoutDrop: () => null }))

// L'écran du lancement, nommé dans la langue de l'appareil (celle de Jest : l'anglais), qu'on ne
// suppose pas ici : son nom dans l'une ou l'autre langue.
const launchNames = (['fr', 'en'] as const).map((language) =>
  createI18n(language).t(($) => $.common.loadingApp),
)
const launchScreen = () =>
  launchNames
    .map((name) => screen.queryByLabelText(name, { includeHiddenElements: true }))
    .find((found) => found !== null) ?? null

beforeEach(() => {
  mockStack.mockClear()
  mockMonoLoaded = true
})

describe('the root layout on a phone', () => {
  it('keeps the launch screen until Geist Mono is loaded on a phone', async () => {
    mockMonoLoaded = false
    await renderWithProviders(<RootLayout />)

    expect(launchScreen()).not.toBeNull()
    expect(mockStack).not.toHaveBeenCalled()
  })

  it('opens the app once all the fonts are loaded on a phone', async () => {
    // Témoin : les huit polices prêtes, la navigation est montée, sans écran du lancement.
    await renderWithProviders(<RootLayout />)

    expect(mockStack).toHaveBeenCalled()
    expect(launchScreen()).toBeNull()
  })
})
