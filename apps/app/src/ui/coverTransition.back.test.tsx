// Le focus au retour (R4, « la carte qui devient la page », relecture design C1) : après « Retour »
// sur un projet ouvert depuis une carte, le focus du clavier revient au lien de cette carte, sans
// faire défiler le fil. Sinon il tombait sur la page entière (`BODY`), et le Tab suivant repartait
// du haut : au clavier, on perdait sa place dans le fil. Une page ouverte par son adresse, elle, ne
// rend le focus à aucune carte.
import { act, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated'
import {
  CoverArrival,
  CoverTransitionProvider,
  useCoverSource,
  useCoverTarget,
} from './coverTransition'

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

// Le lien de la carte, tel que le navigateur le donne : un élément qu'on peut focaliser.
const link = { focus: jest.fn(), label: 'Un résumé des réunions' }

let source: ReturnType<typeof useCoverSource> | undefined
let target: ReturnType<typeof useCoverTarget> | undefined

/**
 * Une carte dont la photo se mesure dans la fenêtre ; sur le web, la vue de la photo est un élément
 * de la page, dont on remonte au lien qui l'entoure (`closest`).
 */
//
// R14 : la carte porte le style de son rebond (`bounceStyle` de `useCoverSource`, une échelle
// animée), qu'elle joue au retour par le Retour du navigateur.
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
                  closest: (selector: string) => (selector.includes('link') ? link : null),
                }
              : null,
          )
        }
      />
    </Animated.View>
  )
}

/**
 * La page du projet : sa photo, et le bouton « Retour », qui appelle `leave`. R14 : `preview`, la
 * page ne connaît encore que ce que la carte savait (une photo) ; puis le projet complet remplace
 * l'aperçu, dans le même `CoverArrival` (la même photo, d'autres morceaux autour).
 */
function Page({ preview = false }: { preview?: boolean }) {
  target = useCoverTarget('p1')
  return (
    <CoverArrival id="p1">
      <View testID="page-photo" />
      {preview ? null : <View testID="page-gallery-rest" />}
    </CoverArrival>
  )
}

function Stage({ page, preview = false }: { page: boolean; preview?: boolean }) {
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? <Page preview={preview} /> : null}
    </CoverTransitionProvider>
  )
}

/** Ouvre la page depuis la carte (ou par son adresse), attend l'arrivée, puis touche « Retour ». */
const openThenBack = async (fromCard: boolean) => {
  const view = await render(<Stage page={false} />)
  if (fromCard) {
    await act(async () => {
      source?.capture(() => {})
    })
  }
  await view.rerender(<Stage page />)
  await act(async () => {
    jest.advanceTimersByTime(3000)
  })
  link.focus.mockClear()
  const then = jest.fn()
  await act(async () => {
    target?.leave(then)
  })
  await act(async () => {
    jest.advanceTimersByTime(3000)
  })
  return then
}

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  link.focus.mockClear()
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('coverTransition, back to the feed', () => {
  it('gives the focus back to the card that opened the page, without scrolling', async () => {
    const then = await openThenBack(true)

    // Témoin : la page est bien quittée.
    expect(then).toHaveBeenCalledTimes(1)
    expect(link.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('gives the focus back to the card with reduce motion too', async () => {
    reducedMotion.mockReturnValue(true)
    const then = await openThenBack(true)

    expect(then).toHaveBeenCalledTimes(1)
    expect(link.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('focuses no card when the page was opened by its address', async () => {
    const then = await openThenBack(false)

    expect(then).toHaveBeenCalledTimes(1)
    expect(link.focus).not.toHaveBeenCalled()
  })
})

// --- R14 : le Retour du navigateur, et l'aperçu remplacé par le projet complet -------------------
//
// Scénario « Entrer dans un projet et en sortir » : par le Retour du navigateur, la page du projet
// disparaît sans passer par `leave` (aucun repli de la photo) ; la page du membre revient tout de
// suite, et sa carte le marque d'un léger rebond (échelle 0,96 → 1, ressort `honey`), sauf sous
// « Réduire les animations ». Le focus revient à la carte, sans défilement, dans les deux cas.

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

/** Ouvre la page depuis la carte, attend l'arrivée, puis le Retour du navigateur. */
const openThenBrowserBack = async () => {
  const view = await render(<Stage page={false} />)
  await act(async () => {
    source?.capture(() => {})
  })
  await view.rerender(<Stage page />)
  await act(async () => {
    jest.advanceTimersByTime(3000)
  })
  link.focus.mockClear()
  // Le navigateur revient en arrière : la page du projet est retirée de la pile, sans `leave`.
  await view.rerender(<Stage page={false} />)
  return lowestScale(1000)
}

describe('coverTransition, back to the page of the member (R14)', () => {
  it('makes the card bounce after the browser Back', async () => {
    const lowest = await openThenBrowserBack()

    expect(lowest).toBeLessThan(0.99)
    expect(lowest).toBeGreaterThanOrEqual(0.95)
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(cardScale()).toBe(1)
  })

  it('does not make the card bounce after the browser Back with reduce motion', async () => {
    reducedMotion.mockReturnValue(true)
    const lowest = await openThenBrowserBack()

    // Témoin : la carte a bien de quoi rebondir (son style), il reste à plat.
    expect(source?.bounceStyle).toBeDefined()
    expect(lowest).toBe(1)
  })

  it('gives the focus back to the card after the browser Back, without scrolling', async () => {
    await openThenBrowserBack()

    expect(link.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('gives the focus back to the card after the browser Back with reduce motion too', async () => {
    reducedMotion.mockReturnValue(true)
    await openThenBrowserBack()

    expect(link.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('gives the focus back to the card on Back after the preview was replaced by the full project', async () => {
    const view = await render(<Stage page={false} />)
    await act(async () => {
      source?.capture(() => {})
    })
    // L'aperçu d'abord (le projet n'est pas encore lu), puis le projet complet.
    await view.rerender(<Stage page preview />)
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    await view.rerender(<Stage page />)
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })
    link.focus.mockClear()
    const then = jest.fn()
    await act(async () => {
      target?.leave(then)
    })
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })
    await view.rerender(<Stage page={false} />)
    const lowest = await lowestScale(1000)

    expect(then).toHaveBeenCalledTimes(1)
    expect(link.focus).toHaveBeenCalledWith({ preventScroll: true })
    // Le bouton Retour de la page replie la photo dans sa carte : pas de rebond en plus (le
    // remplacement de l'aperçu n'est pas pris pour un Retour du navigateur).
    expect(source?.bounceStyle).toBeDefined()
    expect(lowest).toBe(1)
  })
})
