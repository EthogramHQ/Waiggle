// Tests de `DelayedShapes` (R16, « Quand on le voit » : une page qui arrive en moins de 160 ms ne
// montre aucun squelette) : des formes posées hors du « Chargement… » de la page attendent avec lui,
// cachées à la vue et aux lecteurs d'écran, puis se montrent et le disent à leur zone (`Reveal`).
// Reanimated avance avec la fausse horloge.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { getAnimatedStyle } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { DelayedShapes } from './DelayedShapes'
import { LoadingShownContext } from './Skeleton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// La page est-elle hydratée ? Sur téléphone, toujours ; sur le web, pas avant que l'appli démarre.
let mockHydrated = true
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: () => mockHydrated,
}))

type Node = { parent: Node | null; props: Record<string, unknown> }

/** L'opacité vue d'un élément : la sienne et celles de ses ancêtres (styles animés compris). */
const seenOpacity = (element: unknown): number => {
  let opacity = 1
  for (let node = element as Node | null; node; node = node.parent) {
    const fixed = StyleSheet.flatten(node.props.style as never) as { opacity?: number } | undefined
    const animated = node.props.jestAnimatedStyle
      ? (getAnimatedStyle(node as never) as { opacity?: number }).opacity
      : undefined
    opacity *= Number(animated ?? fixed?.opacity ?? 1)
  }
  return opacity
}

const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

const SHAPE = 'a-shape'

beforeEach(() => {
  jest.useFakeTimers()
  mockHydrated = true
})

describe('DelayedShapes, empty shapes that wait like the loading zone (R16)', () => {
  it('keeps its shapes out of sight and away from screen readers for 160 ms, then shows them', async () => {
    const shown = jest.fn()
    await renderWithProviders(
      <LoadingShownContext.Provider value={shown}>
        <DelayedShapes>
          <View testID={SHAPE} />
        </DelayedShapes>
      </LoadingShownContext.Provider>,
    )

    // Leur place est posée, mais rien ne se voit ni ne se lit encore.
    expect(seenOpacity(screen.getByTestId(SHAPE, { includeHiddenElements: true }))).toBe(0)
    expect(screen.queryByTestId(SHAPE)).toBeNull()
    expect(shown).not.toHaveBeenCalled()

    await wait(durations.quick - 20)
    expect(screen.queryByTestId(SHAPE)).toBeNull()

    // Passé 160 ms : elles se montrent en fondu, et le disent à leur zone.
    await wait(40)
    expect(screen.getByTestId(SHAPE)).toBeTruthy()
    expect(shown).toHaveBeenCalled()
    await wait(durations.page + 100)
    expect(seenOpacity(screen.getByTestId(SHAPE))).toBe(1)
  })

  it('shows them at once in the prerendered web page, which cannot wait', async () => {
    mockHydrated = false
    await renderWithProviders(
      <DelayedShapes>
        <View testID={SHAPE} />
      </DelayedShapes>,
    )

    expect(seenOpacity(screen.getByTestId(SHAPE))).toBe(1)
  })
})
