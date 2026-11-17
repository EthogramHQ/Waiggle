// Tests du fondu d'un squelette vers son contenu, dans une page (R16, scénario « Quand on le voit » :
// « Quand le contenu arrive, le squelette fond vers lui (environ 180 ms) au lieu d'être échangé d'un
// coup » ; plan, choix 9 et relecture de l'interface C4).
//
// `Reveal` reçoit `loading` (vrai tant que le contenu n'est pas là), le squelette de la zone
// (`skeleton`) et le contenu (ses enfants). Les règles :
// - le fondu dure 180 ms (`durations.page`), et reste sous « Réduire les animations » : ce n'est pas
//   un déplacement (règle du projet) ;
// - un contenu arrivé avant que le squelette se montre (160 ms, `durations.quick`) s'affiche sans
//   fondu : rien n'a été vu, rien ne fond ;
// - l'arbre du contenu ne change pas à la fin du fondu : ce qu'on y a tapé reste ;
// - dès que le contenu arrive, le squelette qui s'efface n'est plus lu (plus de « Chargement… »)
//   ni touchable ; le contenu, lui, prend les touchers pendant le fondu.
//
// L'opacité vue d'un élément se lit en multipliant celles de ses ancêtres, style animé de
// Reanimated compris (comme dans ScreenFade.test.tsx) ; Reanimated avance avec la fausse horloge.
import { durations } from '@ruche/brand'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useEffect, useState } from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Button } from './Button'
import { Reveal } from './Reveal'
import { SkeletonList } from './Skeleton'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated tel quel, sauf le réglage « Réduire les animations » de l'appareil, que chaque test
// choisit (`useCalmMotion` le lit). __esModule et default : sans eux, `import Animated from …` ne
// retrouverait pas Animated.View.
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

const loading = fr.t(($) => $.common.loading)
const TITLE = 'Les projets de Mamie Jo'

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

/** Avance la fausse horloge (les minuteurs et les images de Reanimated). */
const wait = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms)
  })
}

/** Le nombre de montages du contenu : il ne doit pas être remonté à la fin du fondu. */
let mounts = 0

/** Un contenu qui garde ce qu'on y tape, et qui compte ses montages. */
function Content({ onPress = () => {} }: { onPress?: () => void }) {
  const [note, setNote] = useState('')
  useEffect(() => {
    mounts += 1
  }, [])
  return (
    <>
      <Text>{TITLE}</Text>
      <TextInput accessibilityLabel="Note" value={note} onChangeText={setNote} />
      <Button label="Voir le projet" onPress={onPress} />
    </>
  )
}

/** La zone : le squelette tant que `loading`, puis le contenu. */
const zone = (isLoading: boolean, onPress?: () => void) => (
  <Reveal loading={isLoading} skeleton={<SkeletonList count={2} />}>
    {isLoading ? null : <Content {...(onPress ? { onPress } : null)} />}
  </Reveal>
)

/** Monte la zone en attente, laisse le squelette se montrer, puis fait arriver le contenu. */
const arriveAfterSkeleton = async (onPress?: () => void) => {
  const view = await renderWithProviders(zone(true, onPress))
  await wait(durations.quick + 100)
  // Témoin : le squelette est bien montré avant que le contenu arrive.
  expect(screen.getByRole('progressbar', { name: loading })).toBeTruthy()
  await view.rerender(zone(false, onPress))
  return view
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(useReducedMotion).mockReturnValue(false)
  mounts = 0
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Reveal (R16)', () => {
  it('fades the skeleton into the content in 180 ms', async () => {
    await arriveAfterSkeleton()

    await wait(durations.page / 2)
    const midway = seenOpacity(screen.getByText(TITLE))
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
    await wait(durations.page / 2 + 40)
    expect(seenOpacity(screen.getByText(TITLE))).toBe(1)
  })

  it('keeps the 180 ms fade when motion is reduced', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    await arriveAfterSkeleton()

    await wait(durations.page / 2)
    const midway = seenOpacity(screen.getByText(TITLE))
    expect(midway).toBeGreaterThan(0)
    expect(midway).toBeLessThan(1)
    await wait(durations.page / 2 + 40)
    expect(seenOpacity(screen.getByText(TITLE))).toBe(1)
  })

  it('shows content that arrives before the skeleton appears without a fade', async () => {
    const view = await renderWithProviders(zone(true))
    await wait(durations.quick / 2)
    // Le squelette n'est pas encore montré (ni vu ni lu)…
    expect(screen.queryByRole('progressbar')).toBeNull()

    await view.rerender(zone(false))

    // … le contenu arrive plein, d'un coup, et aucun squelette ne se montre ensuite.
    expect(seenOpacity(screen.getByText(TITLE))).toBe(1)
    await wait(durations.quick + durations.page)
    expect(seenOpacity(screen.getByText(TITLE))).toBe(1)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('keeps what was typed in the content when the fade ends', async () => {
    await arriveAfterSkeleton()

    // Le membre tape pendant le fondu…
    await wait(durations.page / 3)
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Bravo Jo')
    // … le fondu finit : le contenu est le même, jamais remonté, avec ce qui a été tapé.
    await wait(durations.page + 100)
    expect(screen.getByLabelText('Note')).toHaveProp('value', 'Bravo Jo')
    expect(mounts).toBe(1)
  })

  it('stops announcing the loading as soon as the content arrives, while the skeleton fades out', async () => {
    await arriveAfterSkeleton()

    // Dès l'arrivée, au début du fondu : plus de « Chargement… » à lire, le contenu se lit.
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByLabelText(loading)).toBeNull()
    expect(screen.getByText(TITLE)).toBeTruthy()
    await wait(durations.page / 2)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('lets a tap during the fade reach the content', async () => {
    const open = jest.fn()
    await arriveAfterSkeleton(open)

    await wait(durations.page / 2)
    await fireEvent.press(screen.getByRole('button', { name: 'Voir le projet' }))

    expect(open).toHaveBeenCalledTimes(1)
  })
})
