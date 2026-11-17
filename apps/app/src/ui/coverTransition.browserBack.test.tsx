// Le Retour du navigateur (R14, « Entrer dans un projet et en sortir ») : la carte d'origine rebondit
// et reprend le focus quand la page du projet disparaît sans son bouton « Retour ». Ces tests gardent
// ce qui ne doit pas être pris pour ce Retour : une page ouverte par son adresse (aucune carte
// d'origine), une photo retirée puis remontée dans le même affichage (passage en colonnes), et
// l'appli de téléphone (le geste ou la touche du système ont déjà le glissement de la pile).
import { act, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import { CoverArrival, CoverTransitionProvider, useCoverSource } from './coverTransition'

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

// Le lien de la carte, tel que le navigateur le donne.
const link = { focus: jest.fn() }

let source: ReturnType<typeof useCoverSource> | undefined

/** La carte, qui porte son rebond, et la vue de sa photo (mesurable, dans son lien). */
function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return (
    <Animated.View testID="card" style={cover.bounceStyle}>
      <View
        ref={(view) =>
          cover.ref(
            view
              ? {
                  measureInWindow: (callback) => callback(16, 240, 358, 220),
                  closest: () => link,
                }
              : null,
          )
        }
      />
    </Animated.View>
  )
}

/** La page du projet : sa photo, seule ou dans une colonne (`columns`), ou pas de page. */
function Stage({ page, columns = false }: { page: boolean; columns?: boolean }) {
  const photo = (
    <CoverArrival id="p1">
      <View />
    </CoverArrival>
  )
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? columns ? <View>{photo}</View> : photo : null}
    </CoverTransitionProvider>
  )
}

/** L'échelle de la carte, lue sur son style animé (1 sans rebond). */
const cardScale = (): number => {
  const node = screen.getByTestId('card') as unknown as { props: Record<string, unknown> }
  const style = (
    node.props.jestAnimatedStyle
      ? getAnimatedStyle(node as never)
      : (StyleSheet.flatten(node.props.style as never) ?? {})
  ) as { transform?: Record<string, number>[] }
  const scale = (style.transform ?? []).find((step) => 'scale' in step)?.scale
  return typeof scale === 'number' ? scale : 1
}

/** La plus petite échelle de la carte pendant `ms` millisecondes, image par image. */
const lowestScale = async (ms: number) => {
  let lowest = cardScale()
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    await act(async () => {
      jest.advanceTimersByTime(16)
    })
    lowest = Math.min(lowest, cardScale())
  }
  return lowest
}

const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(3000)
  })
}

beforeEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
  link.focus.mockClear()
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('coverTransition, what is not the browser Back from a card (R14)', () => {
  it('neither bounces nor focuses the card when the page was opened by its address', async () => {
    const view = await render(<Stage page={false} />)
    // Pas de toucher sur la carte : la page est ouverte par son adresse.
    await view.rerender(<Stage page />)
    await settle()

    await view.rerender(<Stage page={false} />)
    const lowest = await lowestScale(1000)

    expect(lowest).toBe(1)
    expect(link.focus).not.toHaveBeenCalled()
  })

  it('does not take a photo moved to another column for the browser Back', async () => {
    const view = await render(<Stage page={false} />)
    await act(async () => {
      source?.capture(() => {})
    })
    await view.rerender(<Stage page />)
    await settle()
    link.focus.mockClear()

    // La photo est retirée puis remontée dans le même affichage : la page est toujours là.
    await view.rerender(<Stage page columns />)
    const lowest = await lowestScale(1000)

    expect(lowest).toBe(1)
    expect(link.focus).not.toHaveBeenCalled()
    // Témoin : la page qui disparaît ensuite, elle, fait rebondir la carte.
    await view.rerender(<Stage page={false} />)
    expect(await lowestScale(1000)).toBeLessThan(0.99)
  })

  it.each(['ios', 'android'] as const)('leaves the card still on %s', async (os) => {
    jest.replaceProperty(Platform, 'OS', os)
    const view = await render(<Stage page={false} />)
    await act(async () => {
      source?.capture(() => {})
    })
    await view.rerender(<Stage page />)
    await settle()

    await view.rerender(<Stage page={false} />)

    expect(await lowestScale(1000)).toBe(1)
  })
})
