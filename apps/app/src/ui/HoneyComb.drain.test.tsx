// Tests du rayon qui se vide au passage de niveau (R19, planche R19-Niveau, relecture d'interface
// UI-1) : `drain={{ from }}` dessine d'abord les alvéoles d'avant (le rayon plein), puis les vide
// de droite à gauche, une seule fois. Le lecteur d'écran, lui, lit tout de suite la vraie valeur :
// le mouvement n'est que du dessin. « Réduire les animations » : un fondu, sans rien qui bouge.
import { act, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { HoneyComb } from './HoneyComb'

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

const reducedMotion = jest.mocked(useReducedMotion)

beforeEach(() => {
  jest.useFakeTimers()
  reducedMotion.mockReturnValue(false)
})
afterEach(() => {
  jest.useRealTimers()
})

const comb = (drain?: { from: number }) => (
  <HoneyComb
    cells={1}
    label="Mon rayon"
    valueText="1 alvéole sur 10 vers le niveau 6"
    tint="honey"
    pattern="smooth"
    size="regular"
    {...(drain ? { drain } : null)}
  />
)

type Node = { props: Record<string, unknown>; children: ReadonlyArray<Node | string> }
const nodesOf = (node: Node): Node[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : nodesOf(child))),
]
const styleOf = (node: Node) => ({
  ...((StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>),
  ...((node.props.jestAnimatedStyle as { value?: Record<string, unknown> } | undefined)?.value ??
    {}),
})
/** Les alvéoles qui se vident : la couche posée par-dessus le rayon, une vue par alvéole. */
const draining = () => screen.queryAllByTestId(/^comb-drain-/, { includeHiddenElements: true })
const opacities = () => draining().map((node) => styleOf(node as unknown as Node).opacity)

describe('HoneyComb drain', () => {
  it('reads the real value at once, whatever the drawing shows', async () => {
    await renderWithProviders(comb({ from: 10 }))
    const bar = screen.getByRole('progressbar', { name: 'Mon rayon' })
    expect(bar.props['aria-valuenow']).toBe(1)
  })

  it('draws the cells that were full, then empties them', async () => {
    await renderWithProviders(comb({ from: 10 }))
    // Les alvéoles 2 à 10 étaient pleines : neuf alvéoles à vider, visibles au départ.
    expect(draining()).toHaveLength(9)
    expect(opacities().every((value) => value === 1)).toBe(true)
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(opacities().every((value) => value === 0)).toBe(true)
  })

  it('draws nothing more without a drain', async () => {
    await renderWithProviders(comb())
    expect(draining()).toHaveLength(0)
  })

  it('never moves anything with reduced motion, only fades', async () => {
    reducedMotion.mockReturnValue(true)
    const view = await renderWithProviders(comb({ from: 10 }))
    for (const ms of [0, 200, 400, 800, 1600]) {
      await act(async () => {
        jest.advanceTimersByTime(ms)
      })
      const moved = nodesOf(view.toJSON() as unknown as Node).some((node) => {
        const transform = styleOf(node).transform
        return Array.isArray(transform) && transform.length > 0
      })
      expect(moved).toBe(false)
    }
    expect(draining()).toHaveLength(9)
    expect(opacities().every((value) => value === 0)).toBe(true)
  })

  it('plays once: a redraw with the same drain does not refill the comb', async () => {
    const view = await renderWithProviders(comb({ from: 10 }))
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    await view.rerender(comb({ from: 10 }))
    await act(async () => {
      jest.advanceTimersByTime(50)
    })
    expect(draining()).toHaveLength(9)
    expect(opacities().every((value) => value === 0)).toBe(true)
  })
})
