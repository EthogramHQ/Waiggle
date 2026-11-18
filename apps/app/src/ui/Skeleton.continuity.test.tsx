// Tests de la continuité entre deux attentes (R16, scénario « Les squelettes » : « si la page arrive
// en moins de 160 ms, aucun squelette ne s'affiche ») : un `Loading` qui prend la place d'un autre,
// dans le même passage, continue la même attente au lieu d'en recommencer une.
// - L'ancien se voyait déjà : le nouveau se montre tout de suite, sans fondu. Sinon, sur un lien
//   direct, la garde de session passe la main à l'écran, dont la seconde attente repartait cachée
//   160 ms, puis rejouait son fondu : la page vide clignotait.
// - L'ancien attendait encore ses 160 ms : le nouveau se montre quand l'ancien l'aurait fait, pas
//   160 ms plus tard (l'attente se compte une fois).
// - Un premier `Loading`, seul, garde son délai de 160 ms (témoin).
//
// L'opacité vue d'un élément se lit en multipliant celles de ses ancêtres, style animé de
// Reanimated compris (comme dans Skeleton.test.tsx) ; Reanimated avance avec la fausse horloge.
import { durations } from '@ruche/brand'
import { act, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { getAnimatedStyle } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Loading, Shape, SkeletonList } from './Skeleton'
import { Text } from './Text'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

const loading = fr.t(($) => $.common.loading)
const CONTENT = 'Les projets de Mamie Jo'

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

/** Le `progressbar` de l'attente, lu ou non par un lecteur d'écran. */
const anyProgressbar = () => screen.getByRole('progressbar', { includeHiddenElements: true })
/** Le `progressbar` tel qu'un lecteur d'écran le lit : absent tant qu'il est caché. */
const readProgressbar = () => screen.queryByRole('progressbar', { name: loading })

/** Avance la fausse horloge (les minuteurs et les images de Reanimated). */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/**
 * Deux attentes différentes au même endroit : celle de la garde (`first`), puis celle de l'écran
 * (`second`), d'une autre forme. Deux composants distincts : React démonte la première et monte la
 * seconde, comme quand la garde passe la main à l'écran.
 */
function FirstWait() {
  return (
    <Loading>
      <Shape height={90} width="100%" />
    </Loading>
  )
}
function SecondWait() {
  return <SkeletonList count={2} />
}
const step = (which: 'first' | 'second' | 'content') =>
  which === 'first' ? <FirstWait /> : which === 'second' ? <SecondWait /> : <Text>{CONTENT}</Text>

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('a Loading that takes the place of another (R16)', () => {
  it('shows at once, without fading in, when the one it replaces was already shown', async () => {
    const view = await renderWithProviders(step('first'))
    await wait(durations.quick + durations.page + 100)
    expect(readProgressbar()).toBeTruthy() // témoin : la première attente se voit

    await view.rerender(step('second'))

    // Aucune image sans squelette : lu et vu dès son premier rendu, sans fondu à rejouer.
    expect(readProgressbar()).toBeTruthy()
    expect(seenOpacity(anyProgressbar())).toBe(1)
    await wait(durations.quick / 2)
    expect(seenOpacity(anyProgressbar())).toBe(1)
  })

  it('shows when the one it replaces would have, when that one was still waiting', async () => {
    const view = await renderWithProviders(step('first'))
    await wait(100)
    expect(readProgressbar()).toBeNull() // témoin : encore dans ses 160 ms

    await view.rerender(step('second'))
    expect(readProgressbar()).toBeNull()

    // 160 ms après le début de la première attente, et non 160 ms après la seconde.
    await wait(durations.quick - 100 + 20)
    expect(readProgressbar()).toBeTruthy()
  })

  it('keeps its 160 ms delay when it comes next to another one, without replacing it', async () => {
    // Une seconde zone qui se met à charger pendant que la première se voit encore (ou « Rejouer »
    // du catalogue) : rien ne part, la nouvelle est une première attente.
    const zones = (both: boolean) => (
      <>
        <FirstWait />
        {both ? <SecondWait /> : null}
      </>
    )
    const view = await renderWithProviders(zones(false))
    await wait(durations.quick + durations.page + 100)
    expect(screen.getAllByRole('progressbar', { name: loading })).toHaveLength(1) // témoin

    await view.rerender(zones(true))

    expect(screen.getAllByRole('progressbar', { name: loading })).toHaveLength(1)
    await wait(durations.quick + 40)
    expect(screen.getAllByRole('progressbar', { name: loading })).toHaveLength(2)
  })

  it('keeps its 160 ms delay when it comes alone, after the content', async () => {
    // Témoin : une attente montrée, puis le contenu, puis une nouvelle attente (une relecture) :
    // rien n'est remplacé, la nouvelle est une première attente.
    const view = await renderWithProviders(step('first'))
    await wait(durations.quick + durations.page + 100)
    await view.rerender(step('content'))
    await wait(500)
    expect(screen.getByText(CONTENT)).toBeTruthy()

    await view.rerender(step('second'))
    expect(readProgressbar()).toBeNull()
    expect(seenOpacity(anyProgressbar())).toBe(0)
    await wait(durations.quick + 40)
    expect(readProgressbar()).toBeTruthy()
  })
})
