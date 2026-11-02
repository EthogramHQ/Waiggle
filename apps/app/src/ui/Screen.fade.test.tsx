// Tests du fondu des pages dans Screen (tranche RF, A3 et A4) : Screen pose ScreenFade autour du
// contenu de l'écran seulement. La barre fixe et la place flottante, qui ne changent pas d'une page à
// l'autre, ne s'effacent pas ; la prop `fade` (vraie par défaut) coupe le fondu (la page d'un projet
// ouverte depuis une carte, qui a son propre passage) ; « Réduire les animations » le garde ; le
// téléphone (iOS, Android) n'en a pas.
//
// Comme dans ScreenFade.test.tsx, la route de l'écran (`useScreenFocused`, `useScreenShownCount` de
// ui/screenFocus.ts) vient d'un faux module piloté par un contexte, et l'opacité vue d'un élément
// est le produit de celles de ses ancêtres. Le premier test du fichier est celui de la première
// page de la visite (ScreenFade la retient pour la suite).
import { durations } from '@ruche/brand'
import { act, fireEvent, isHiddenFromAccessibility, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Screen } from './Screen'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La route de l'écran (voir l'en-tête). `require` dans la fabrique : Jest la remonte en tête.
jest.mock('./screenFocus', () => {
  const { createContext, useContext } = require('react')
  const Route = createContext({ focused: true, shown: 1 })
  return {
    MockRoute: Route.Provider,
    useScreenFocused: () => useContext(Route).focused,
    useScreenShownCount: () => useContext(Route).shown,
  }
})
type RouteState = { focused: boolean; shown: number }
const { MockRoute } = jest.requireMock<{
  MockRoute: ComponentType<{ value: RouteState; children: ReactNode }>
}>('./screenFocus')

jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

/** Un nœud de l'arbre rendu, le peu qu'on en lit. */
type Node = { parent: Node | null; props: Record<string, unknown> }

/** L'opacité propre d'un nœud : son style animé (Reanimated) s'il en a un, sinon son style. */
const ownOpacity = (node: Node): number => {
  const fixed = StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
  const animated = node.props.jestAnimatedStyle
    ? (getAnimatedStyle(node as never) as { opacity?: number }).opacity
    : undefined
  return Number(animated ?? fixed?.opacity ?? 1)
}

/** L'opacité vue d'un élément : le produit de la sienne et de celles de tous ses ancêtres. */
const seenOpacity = (element: unknown): number => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) opacity *= ownOpacity(node)
  return opacity
}

const content = () => screen.getByText('Les projets de la semaine')

/** Un écran avec une barre fixe, un contenu et une place flottante, dans sa route. */
const page = (route: RouteState, fade?: boolean, onPress: () => void = () => {}) => (
  <MockRoute value={route}>
    <Screen
      title="Explorer"
      stickyHeader
      header={<Text>Barre du haut</Text>}
      floating={<Button label="Réagir" onPress={() => {}} />}
      {...(fade === undefined ? null : { fade })}
    >
      <Text>Les projets de la semaine</Text>
      <Button label="Voir le projet" onPress={onPress} />
    </Screen>
  </MockRoute>
)

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('Screen, the first page of the visit (web)', () => {
  // Doit rester le premier test du fichier : la page ouverte par un lien reçu, ou rechargée,
  // s'affiche tout de suite (le HTML pré-rendu n'est jamais invisible).
  it('shows the first page at once', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    expect(seenOpacity(content())).toBe(1)

    await view.rerender(page({ focused: true, shown: 1 }))

    expect(seenOpacity(content())).toBe(1)
  })
})

describe('Screen, a page opened in the app (web)', () => {
  it('fades its content in, from 0 to 1', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    expect(seenOpacity(content())).toBe(0)

    await view.rerender(page({ focused: true, shown: 1 }))
    await wait(durations.page + 50)

    expect(seenOpacity(content())).toBe(1)
  })

  // Seul le contenu change : la barre et la place flottante restent en place, pleines.
  it('never fades the pinned bar nor the floating place', async () => {
    await renderWithProviders(page({ focused: true, shown: 0 }))

    expect(seenOpacity(content())).toBe(0) // témoin : le contenu est en fondu
    expect(seenOpacity(screen.getByText('Barre du haut'))).toBe(1)
    expect(seenOpacity(screen.getByRole('button', { name: 'Réagir' }))).toBe(1)
  })

  // Le focus du clavier et du lecteur d'écran arrive comme avant : pendant le fondu, le contenu est
  // là et accessible, seule son opacité change.
  it('keeps the content in the accessibility tree while it fades in', async () => {
    await renderWithProviders(page({ focused: true, shown: 0 }))

    expect(seenOpacity(content())).toBe(0) // témoin : le contenu est en fondu
    const button = screen.getByRole('button', { name: 'Voir le projet' })
    expect(isHiddenFromAccessibility(button)).toBe(false)
  })

  it('fades its content in again when the member comes back', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 1 }))
    await view.rerender(page({ focused: false, shown: 1 }))

    await view.rerender(page({ focused: true, shown: 2 }))

    expect(seenOpacity(content())).toBe(0)
    await wait(durations.page + 50)
    expect(seenOpacity(content())).toBe(1)
  })

  // ui-1 : un écran monté pendant une visite déjà commencée (fin de chargement, 1 100 px, page
  // d'erreur) arrive sans fondu.
  it('does not fade a screen mounted while its route is already displayed', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 2 }))

    expect(seenOpacity(content())).toBe(1)
    // Témoin : le même écran, quitté puis retrouvé, a bien son fondu.
    await view.rerender(page({ focused: false, shown: 2 }))
    await view.rerender(page({ focused: true, shown: 3 }))
    expect(seenOpacity(content())).toBe(0)
  })

  it('shows its content at once with fade={false}', async () => {
    await renderWithProviders(page({ focused: true, shown: 0 }, false))

    expect(seenOpacity(content())).toBe(1)
  })

  it('keeps the fade with reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    await renderWithProviders(page({ focused: true, shown: 0 }))

    expect(seenOpacity(content())).toBe(0)
  })

  // S1 (a), au niveau de l'écran : pas de clic sur un contenu à demi visible.
  it('ignores taps on its content while it fades in', async () => {
    const press = jest.fn()
    const view = await renderWithProviders(page({ focused: true, shown: 0 }, undefined, press))
    await view.rerender(page({ focused: true, shown: 1 }, undefined, press))

    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))
    expect(press).not.toHaveBeenCalled()

    await wait(400)
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))
    expect(press).toHaveBeenCalledTimes(1)
  })
})

describe('Screen on iOS and Android', () => {
  it('shows its content at once: the native stack slides instead', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await renderWithProviders(page({ focused: true, shown: 0 }))

    expect(seenOpacity(content())).toBe(1)
  })
})
