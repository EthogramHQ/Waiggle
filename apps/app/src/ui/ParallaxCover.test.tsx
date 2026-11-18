// Tests de l'enveloppe qui fait défiler la photo d'un projet moins vite que la page (R17, scénario
// « La photo d'un projet qui défile moins vite ») : dans un Screen, la photo descend de 45 % du
// défilement, à partir du moment où le haut de son cadre atteint le haut de la zone visible ; hors
// d'un Screen, ou sous « Réduire les animations », aucune transformation. L'enveloppe ne change rien
// à ce que lit le lecteur d'écran : la photo garde son rôle et son nom.
import { act, render, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { scrolledPast, visibleStart } from './coverParallax'
import { ParallaxCover } from './ParallaxCover'
import { ScreenScrollContext, type ScrollEvent, useScreenScrollChannel } from './scrollLight'

// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » de
// l'appareil (que lit useCalmMotion) choisi par chaque test. __esModule et default : sans eux,
// `import Animated from …` ne retrouverait pas Animated.View.
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return { ...actual, __esModule: true, default: actual.default, useReducedMotion: jest.fn() }
})

const reducedMotion = jest.mocked(useReducedMotion)

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL n'exporte pas ce type). */
type Node = { props: Record<string, unknown>; children: (Node | string)[] }

const everyNode = (node: Node | string): Node[] =>
  typeof node === 'string' ? [] : [node, ...node.children.flatMap(everyNode)]

/** Le style d'un nœud, le fixe et celui que Reanimated lui donne en ce moment. */
const styleOf = (node: Node) => ({
  ...((StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>),
  ...((node.props.jestAnimatedStyle as { value?: Record<string, unknown> } | undefined)?.value ??
    {}),
})

type Shift = { translateY?: number; scale?: number }

/** Les transformations posées dans l'arbre rendu, toutes vues confondues. */
const transforms = (): Shift[] =>
  everyNode(screen.root as unknown as Node).flatMap(
    (node) => (styleOf(node).transform as Shift[] | undefined) ?? [],
  )

const translated = () => transforms().reduce((sum, part) => sum + (part.translateY ?? 0), 0)

// Le défilement de l'écran, envoyé par le test comme Screen l'enverrait.
let scrollTo: (y: number) => void = () => {}

/** Un écran minimal : le canal de défilement de Screen, autour de ce qu'on teste. */
function FakeScreen({ children }: { children: ReactNode }) {
  const scroll = useScreenScrollChannel()
  scrollTo = (y) =>
    scroll.handleScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as unknown as ScrollEvent)
  return (
    <ScreenScrollContext.Provider value={scroll.channel}>{children}</ScreenScrollContext.Provider>
  )
}

const photo = (
  <ParallaxCover style={StyleSheet.absoluteFill}>
    <View accessible accessibilityRole="image" accessibilityLabel="Le ciel de ce soir" />
  </ParallaxCover>
)

/** Fait défiler l'écran de `y` points, puis laisse Reanimated recalculer le style de la photo. */
const scroll = async (y: number) => {
  await act(async () => {
    scrollTo(y)
    jest.advanceTimersByTime(32)
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  reducedMotion.mockReturnValue(false)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('ParallaxCover', () => {
  it('keeps the photo readable by its role and name', async () => {
    await render(<FakeScreen>{photo}</FakeScreen>)

    expect(screen.getByRole('image', { name: 'Le ciel de ce soir' })).toBeOnTheScreen()
  })

  it('moves the photo down at 45 % of the page scroll inside a screen', async () => {
    await render(<FakeScreen>{photo}</FakeScreen>)
    await scroll(100)

    expect(translated()).toBeCloseTo(45)
  })

  it('leaves the photo in place outside a screen', async () => {
    await render(photo)

    expect(transforms()).toEqual([])
  })

  it('sets no transform at all with reduced motion', async () => {
    reducedMotion.mockReturnValue(true)
    await render(<FakeScreen>{photo}</FakeScreen>)
    await scroll(100)

    expect(transforms()).toEqual([])
    expect(screen.getByRole('image', { name: 'Le ciel de ce soir' })).toBeOnTheScreen()
  })
})

describe('where the shift starts', () => {
  it('waits until the top of the frame reaches the top of the visible area', () => {
    // Le cadre est à 120 points du haut de la fenêtre, sous une barre fixe de 80 : il atteint le
    // haut de la zone visible après 40 points de défilement.
    const start = visibleStart(120, 0, 80)

    expect(start).toBe(40)
    expect(scrolledPast(30, start)).toBe(0)
    expect(scrolledPast(140, start)).toBe(100)
  })

  it('counts the scroll already done when the frame is measured', () => {
    // Mesuré après 50 points de défilement, à 70 du haut : sa place dans le contenu est 120.
    expect(visibleStart(70, 50, 80)).toBe(40)
  })

  it('starts at once for a photo that rises under the status bar', () => {
    expect(visibleStart(-60, 0, 0)).toBe(0)
  })

  it('lets a pull above the top through, to grow the photo', () => {
    expect(scrolledPast(-30, 40)).toBe(-30)
  })
})
