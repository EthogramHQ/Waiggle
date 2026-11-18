// Tests de `DelayedShapes` et de la continuité des attentes (R16, « Les squelettes ») : des formes
// posées hors du « Chargement… » de la page suivent la même règle que lui. Quand le `Loading` qui
// les accompagne continue une attente déjà montrée (il prend, dans le même passage, la place d'un
// autre qui se voyait : la garde de session qui passe la main à la page d'un membre), elles se
// montrent tout de suite avec lui, au lieu de paraître 160 ms après. Montées seules à côté d'un
// `Loading` qui se voit, sans rien remplacer, elles gardent leurs 160 ms (témoin).
//
// L'opacité vue se lit en multipliant celles des ancêtres, style animé de Reanimated compris ;
// Reanimated avance avec la fausse horloge.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { StyleSheet, View } from 'react-native'
import { getAnimatedStyle } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { DelayedShapes } from './DelayedShapes'
import { Loading, Shape, SkeletonList } from './Skeleton'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

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
const shape = () => screen.getByTestId(SHAPE, { includeHiddenElements: true })

/** L'attente de la garde de session : un `Loading` seul. */
function GateWait() {
  return (
    <Loading>
      <Shape height={90} width="100%" />
    </Loading>
  )
}
/**
 * L'attente de la page qui prend sa place : son `Loading` et, à côté, les formes de son en-tête,
 * hors de lui (`DelayedShapes`). Un autre composant que `GateWait` : React démonte l'un et monte
 * l'autre dans le même passage.
 */
function PageWait() {
  return (
    <>
      <DelayedShapes>
        <View testID={SHAPE} />
      </DelayedShapes>
      <SkeletonList count={2} />
    </>
  )
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('DelayedShapes next to a Loading that continues a wait (R16)', () => {
  it('shows its shapes at once, without fading in, when the wait it continues was already shown', async () => {
    const view = await renderWithProviders(<GateWait />)
    await wait(durations.quick + durations.page + 100)

    await view.rerender(<PageWait />)

    // Vues dès leur premier rendu, comme le `Loading` qui continue : aucun fondu à rejouer.
    expect(seenOpacity(shape())).toBe(1)
    expect(screen.getByTestId(SHAPE)).toBeTruthy()
    await wait(durations.quick / 2)
    expect(seenOpacity(shape())).toBe(1)
  })

  it('shows them when the continued wait would have, when it was still waiting', async () => {
    const view = await renderWithProviders(<GateWait />)
    await wait(100)

    await view.rerender(<PageWait />)
    expect(screen.queryByTestId(SHAPE)).toBeNull()

    // 160 ms après le début de la première attente, et non 160 ms après leur montage.
    await wait(durations.quick - 100 + 20)
    expect(screen.getByTestId(SHAPE)).toBeTruthy()
  })

  it('keeps its 160 ms when it comes next to a shown Loading, without replacing anything', async () => {
    const zones = (both: boolean) => (
      <>
        <GateWait />
        {both ? (
          <DelayedShapes>
            <View testID={SHAPE} />
          </DelayedShapes>
        ) : null}
      </>
    )
    const view = await renderWithProviders(zones(false))
    await wait(durations.quick + durations.page + 100)

    await view.rerender(zones(true))

    // Une seconde zone qui se met à attendre : une première attente, cachée 160 ms. (Son opacité
    // se lit après une image : la supposition du premier rendu, corrigée avant le dessin, passe
    // par la valeur animée, que le faux Reanimated des tests n'applique qu'à l'image suivante.)
    expect(screen.queryByTestId(SHAPE)).toBeNull()
    await wait(16)
    expect(seenOpacity(shape())).toBe(0)
    await wait(durations.quick)
    expect(screen.getByTestId(SHAPE)).toBeTruthy()
  })
})
