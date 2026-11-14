// Test de la mise en page racine sur le web (tranche RF, U4) : la pile d'Expo Router peint ses
// cadres du `background` de son thème de navigation (un gris clair par défaut, rgb(242, 242, 242)).
// Ce gris couvrait la lumière d'ambiance et le fond de l'hôte, derrière des pages pourtant
// transparentes. `hostedNavigationTheme` le rend transparent ; ici on vérifie le **branchement** :
// que `app/_layout.tsx` donne bien ce thème à la navigation, et un fond transparent à la pile.
// (Un test d'application dans `src/` : Expo Router ferait une page d'un test posé dans `app/`.)
import { screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { lendWebPage } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Ce que la navigation et la pile ont reçu (le préfixe « mock » permet à la fabrique de s'en servir).
const mockNavigation = jest.fn()
const mockStack = jest.fn()

jest.mock('expo-router', () => {
  const { createElement } = require('react')
  return {
    // Le thème par défaut d'Expo Router : le même gris clair que celui de @react-navigation.
    DefaultTheme: {
      dark: false,
      colors: {
        primary: 'rgb(0, 122, 255)',
        background: 'rgb(242, 242, 242)',
        card: 'rgb(255, 255, 255)',
        text: 'rgb(28, 28, 30)',
        border: 'rgb(216, 216, 216)',
        notification: 'rgb(255, 59, 48)',
      },
    },
    ThemeProvider: ({ value, children }: { value: unknown; children: ReactNode }) => {
      mockNavigation(value)
      return children
    },
    Stack: (props: unknown) => {
      mockStack(props)
      return createElement('Stack')
    },
  }
})
jest.mock('expo-font', () => ({ useFonts: () => [true] }))
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))
jest.mock('../navigation/AppTabBar', () => ({ AppTabBar: () => null }))
jest.mock('../profile/LanguageSync', () => ({ LanguageSync: () => null }))
// R9 : la feuille du pseudo provisoire lit la session ; elle n'est pas le sujet de ce test.
jest.mock('../profile/ProvisionalNameGate', () => ({ ProvisionalNameGate: () => null }))
// Ni lumière dessinée (WebGL), ni thème qui touche au navigateur : l'hôte donne seulement sa place.
jest.mock('../ui/AmbientLight', () => ({ AmbientLight: () => null }))

type Theme = { colors: { background: string; card: string } }
type StackProps = { screenOptions: { contentStyle: { backgroundColor: string } } }

describe('the root layout on the web', () => {
  let restorePage = () => {}
  // `isWeb` se lit au chargement du module : la plateforme passe en « web » avant le premier
  // chargement (`require` à ce moment-là, pas un `import` en tête de fichier). Le module reste en
  // mémoire pour le second test : même React, même plateforme.
  const mount = async () => {
    // La plateforme « web », et une page prêtée (la mise en page pose `lang` sur le document).
    restorePage = lendWebPage()
    const { default: RootLayout } = require('../../app/_layout') as { default: () => ReactNode }
    await renderWithProviders(<RootLayout />)
  }

  beforeEach(() => {
    mockNavigation.mockClear()
    mockStack.mockClear()
  })
  afterEach(() => {
    restorePage()
    jest.restoreAllMocks()
  })

  it('gives the navigation a transparent background, so the ambient light shows through', async () => {
    await mount()

    // Témoin : la pile est bien montée, dans le thème de navigation.
    expect(mockStack).toHaveBeenCalled()
    expect(mockNavigation).toHaveBeenCalled()
    const theme = mockNavigation.mock.calls.at(-1)?.[0] as Theme
    // Le gris par défaut ne doit plus couvrir la lumière…
    expect(theme.colors.background).toBe('transparent')
    // …et le reste du thème reste celui d'Expo Router.
    expect(theme.colors.card).toBe('rgb(255, 255, 255)')
  })

  it('keeps the pages of the stack transparent too', async () => {
    await mount()

    const props = mockStack.mock.calls.at(-1)?.[0] as StackProps
    expect(props.screenOptions.contentStyle.backgroundColor).toBe('transparent')
    expect(screen.toJSON()).not.toBeNull()
  })
})
