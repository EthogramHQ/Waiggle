// Tests du fondu des pages (tranche RF, « Les pages apparaissent en fondu ») : sur le web, le
// contenu d'une page ouverte dans l'appli apparaît en fondu, de 0 à 1 en `durations.page` ; jamais
// la première page de la visite (lien reçu, rechargement : le HTML pré-rendu n'est jamais
// invisible), jamais une page remontée pendant une visite (fin d'un chargement, passage de
// 1 100 px, `RouteErrorBoundary` : ui-1), jamais dans l'appli de téléphone (la pile y glisse).
//
// Le signal « la route devient affichée » vient de `ui/screenFocus.ts` : `useScreenShownCount()`,
// le nombre de fois où la route de ce composant est devenue affichée (0 tant qu'elle ne l'a jamais
// été, puis +1 à chaque arrivée : aller, retour). Il est propre à la route, pas au composant : un
// écran monté plus tard dans la même visite lit le même nombre. Le test le fournit lui-même par un
// faux module, dont la valeur passe par un contexte React (MockRoute) : la changer redessine tout ce
// qui la lit, comme le ferait la navigation.
//
// L'opacité vue se lit en multipliant celles de tous les ancêtres d'un élément (une page en fondu
// peut l'être par n'importe quel cadre). Reanimated, dans Jest, avance avec la fausse horloge.
//
// Ordre des tests : ScreenFade retient « une page a déjà été affichée » pour toute la visite (un
// drapeau du module). Le premier test du fichier est donc celui de la première page.
import { durations } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import type { ComponentType, ReactNode } from 'react'
import { Platform, StyleSheet } from 'react-native'
import { getAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { ScreenFade } from './ScreenFade'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La route du composant : affichée ou non (`focused`), et combien de fois elle l'est devenue
// (`shown`). `require` dans la fabrique : Jest la remonte en tête du fichier, avant les imports.
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

// Reanimated tel quel, sauf deux fonctions qu'un test choisit : « Réduire les animations », et
// withTiming, qu'un test bloque pour simuler une animation qui ne finit jamais (jur-RF5).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withTiming: jest.fn(actual.withTiming),
  }
})

const actualWithTiming =
  jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated').withTiming

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

/** La page : un texte et un bouton, dans le fondu, dans une route à l'état donné. */
const page = (route: RouteState, fade?: boolean, onPress: () => void = () => {}) => (
  <MockRoute value={route}>
    <ScreenFade {...(fade === undefined ? null : { fade })}>
      <Text>Les projets de la semaine</Text>
      <Button label="Voir le projet" onPress={onPress} />
    </ScreenFade>
  </MockRoute>
)

/** Avance la fausse horloge (les minuteurs et les images de Reanimated). */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  jest.mocked(useReducedMotion).mockReturnValue(false)
  jest.mocked(withTiming).mockImplementation(actualWithTiming)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('ScreenFade, the first page of the visit (web)', () => {
  // Doit rester le premier test du fichier (voir l'en-tête). La page ouverte par un lien reçu ou
  // un rechargement s'affiche tout de suite, même quand sa route devient affichée après le
  // montage : le HTML pré-rendu n'est jamais à l'opacité 0.
  it('shows the first page at once, without a fade', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    expect(seenOpacity(content())).toBe(1)

    await view.rerender(page({ focused: true, shown: 1 }))

    expect(seenOpacity(content())).toBe(1)
  })
})

describe('ScreenFade, a page opened in the app (web)', () => {
  it('fades the page in, from 0 to 1, when its route becomes displayed', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    // Avant le premier dessin, déjà invisible : pas d'éclair de la page pleine.
    expect(seenOpacity(content())).toBe(0)

    await view.rerender(page({ focused: true, shown: 1 }))
    await wait(durations.page / 2)
    const midway = seenOpacity(content())
    await wait(durations.page / 2 + 50)

    // Un fondu, pas un saut : à mi-chemin, ni invisible ni plein.
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
    expect(seenOpacity(content())).toBe(1)
  })

  // ui-11 : au retour sur une page restée montée (cachée dans la pile), l'opacité 0 est posée dès
  // le rendu qui la montre, avant toute image : la page pleine ne se voit pas un instant.
  it('fades a page in again when the member comes back to it, from the first frame', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 1 }))
    expect(seenOpacity(content())).toBe(1) // témoin : une page déjà là, sans fondu
    await view.rerender(page({ focused: false, shown: 1 }))

    await view.rerender(page({ focused: true, shown: 2 }))

    expect(seenOpacity(content())).toBe(0)
    await wait(durations.page + 50)
    expect(seenOpacity(content())).toBe(1)
  })

  // ui-1 : le fondu suit la route, pas le montage du composant. Un écran monté pendant une visite
  // déjà commencée (la fin d'un chargement, le passage de 1 100 px, la page d'erreur) arrive sans
  // fondu.
  it('does not fade a screen mounted while its route is already displayed', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 3 }))

    expect(seenOpacity(content())).toBe(1)
    await view.rerender(page({ focused: true, shown: 3 }))
    expect(seenOpacity(content())).toBe(1)
    // Témoin : le même écran, quitté puis retrouvé, a bien son fondu.
    await view.rerender(page({ focused: false, shown: 3 }))
    await view.rerender(page({ focused: true, shown: 4 }))
    expect(seenOpacity(content())).toBe(0)
  })

  it('shows the page at once with fade={false} (the cover that grows into the page)', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }, false))
    expect(seenOpacity(content())).toBe(1)

    await view.rerender(page({ focused: true, shown: 1 }, false))

    expect(seenOpacity(content())).toBe(1)
  })

  // « Réduire les animations » : un fondu n'est pas un déplacement, il reste.
  it('keeps the fade with reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    expect(seenOpacity(content())).toBe(0)

    await view.rerender(page({ focused: true, shown: 1 }))
    await wait(durations.page / 2)
    const midway = seenOpacity(content())

    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
  })
})

// jur-RF5 : quoi qu'il arrive à l'animation, la page est pleine 400 ms après le début au plus tard.
describe('ScreenFade, its guards (web)', () => {
  it('is fully shown 400 ms after the start, even if the animation never ends', async () => {
    // withTiming bloqué : l'animation reste où elle est, à 0.
    jest.mocked(withTiming).mockImplementation(((value: number) => 0 * value) as never)
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    await view.rerender(page({ focused: true, shown: 1 }))

    // Témoin : bien après la durée du fondu, l'animation bloquée laisse la page invisible.
    await wait(durations.page + 20)
    expect(seenOpacity(content())).toBeLessThan(1)

    await wait(400 - durations.page - 20)
    expect(seenOpacity(content())).toBe(1)
  })

  it('is fully shown 400 ms after mounting, even if its route never says it is displayed', async () => {
    await renderWithProviders(page({ focused: true, shown: 0 }))
    expect(seenOpacity(content())).toBe(0) // témoin : la page attendait son arrivée

    await wait(400)

    expect(seenOpacity(content())).toBe(1)
  })

  // S1 (a) : un contenu à demi visible ne prend pas les clics ; un lien piégé ne peut pas se cacher
  // sous une page qui apparaît.
  it('ignores taps while the page is fading in, then takes them', async () => {
    const press = jest.fn()
    const view = await renderWithProviders(page({ focused: true, shown: 0 }, undefined, press))
    await view.rerender(page({ focused: true, shown: 1 }, undefined, press))

    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))
    expect(press).not.toHaveBeenCalled()

    await wait(400)
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))
    expect(press).toHaveBeenCalledTimes(1)
  })

  // S1 (a), sur le web pour de vrai (relecture RF, sécurité A1) : `pointerEvents="none"` n'y
  // atteint que les enfants directs, et les cartes (`box-none`) rouvrent les clics plus bas. Un
  // bouclier posé par-dessus le contenu prend donc les clics pendant le fondu : il est là, muet et
  // hors de la touche Tab, puis retiré quand la page est pleine. (Jest applique la règle de React
  // Native, pas le CSS : le vrai clic se mesure dans le navigateur.)
  it('lays a shield over the content while it fades in, and removes it once it is full', async () => {
    const view = await renderWithProviders(page({ focused: true, shown: 0 }))
    await view.rerender(page({ focused: true, shown: 1 }))

    const shield = screen.getByTestId('fade-shield', { includeHiddenElements: true })
    expect(shield.props.pointerEvents).toBe('auto')
    expect(shield.props['aria-hidden']).toBe(true)
    expect(shield.props.tabIndex).toBeUndefined()
    expect(shield.props.focusable).toBeFalsy()
    // Par-dessus le contenu : après lui dans l'arbre, toute la couche, au-dessus de sa pile.
    const style = StyleSheet.flatten(shield.props.style) as Record<string, unknown>
    expect(style).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 })
    expect(style.zIndex).toBe(1)

    await wait(400)
    expect(screen.queryByTestId('fade-shield', { includeHiddenElements: true })).toBeNull()
    expect(seenOpacity(content())).toBe(1) // témoin : la page est pleine
  })

  it('lays no shield over a page shown at once (témoin)', async () => {
    await renderWithProviders(page({ focused: true, shown: 3 }))

    expect(content()).toBeTruthy()
    expect(screen.queryByTestId('fade-shield', { includeHiddenElements: true })).toBeNull()
  })
})

// Dans l'appli de téléphone, la pile garde son glissement natif : ScreenFade ne fait rien.
describe('ScreenFade on iOS and Android', () => {
  it.each(['ios', 'android'] as const)('shows the page at once on %s', async (os) => {
    jest.replaceProperty(Platform, 'OS', os)
    const press = jest.fn()
    const view = await renderWithProviders(page({ focused: true, shown: 0 }, undefined, press))
    await view.rerender(page({ focused: true, shown: 1 }, undefined, press))

    expect(seenOpacity(content())).toBe(1)
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))
    expect(press).toHaveBeenCalledTimes(1)
  })
})
