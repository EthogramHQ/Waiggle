// Tests de « la carte qui devient la page » (R4, « Le mouvement ») : quand le membre touche une
// carte, sa photo s'agrandit jusqu'à devenir le haut de la page du projet ; au retour, la page se
// replie dans sa carte ; avec « Réduire les animations », la page apparaît en fondu.
//
// On teste le contrat du contexte, pas le dessin des ressorts :
// - `CoverTransitionProvider`, posé au-dessus des pages (la racine de la navigation) ;
// - `useCoverSource(id)`, pour la carte : `ref` à poser sur sa photo, et `capture(then)` au toucher,
//   qui mesure la photo (`measureInWindow`), confie son cadre au contexte, puis ouvre la page ;
// - `useCoverTarget(id)`, pour la page : `arrival` (grandir depuis le cadre de la carte, ou fondu)
//   et `departure()` (se replier vers le cadre gardé, ou fondu si la carte n'est plus là) ;
// - `CoverArrival`, autour de la photo de la page : la photo qui vole est cachée au lecteur d'écran
//   et ne prend pas le doigt, et le focus va au titre de la page à l'arrivée.
import { act, render, screen } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import {
  CoverArrival,
  CoverTransitionProvider,
  useCoverSource,
  useCoverTarget,
} from './coverTransition'
import type { Focusable } from './focus'

// Reanimated tel que le prépare jest.setup.ts, avec le réglage « Réduire les animations » choisi
// par chaque test (useCalmMotion le lit).
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

type Frame = { x: number; y: number; width: number; height: number }

// Le cadre de la photo de la carte dans la fenêtre, tel que measureInWindow le répond.
const cardFrame: Frame = { x: 16, y: 240, width: 358, height: 220 }

// Les mesures demandées à la photo de la carte.
const measured = jest.fn()

/** La fausse photo d'une carte : sa mesure dans la fenêtre répond `frame`. */
const photoOf = (frame: Frame) => ({
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => {
    measured()
    callback(frame.x, frame.y, frame.width, frame.height)
  },
})

// Ce que les hooks rendent, gardé au dernier affichage pour que le test s'en serve.
let source: ReturnType<typeof useCoverSource> | undefined
let target: ReturnType<typeof useCoverTarget> | undefined
// Les pages montées à la fois, par projet.
let targets: Record<string, ReturnType<typeof useCoverTarget>> = {}

/** La carte du fil : sa photo (une fausse vue mesurable) branchée sur `useCoverSource`. */
function Card({ id }: { id: string }) {
  const cover = useCoverSource(id)
  source = cover
  return <View ref={(view) => cover.ref(view ? photoOf(cardFrame) : null)} />
}

/** La page du projet, réduite à ce qu'elle demande au contexte. */
function Page({ id }: { id: string }) {
  target = useCoverTarget(id)
  targets[id] = target
  return null
}

/** La page du projet avec sa photo enveloppée par `CoverArrival`, et son titre. */
function PageWithPhoto({ id, title }: { id: string; title: RefObject<Focusable | null> }) {
  return (
    <CoverArrival id={id} focusOnArrival={title}>
      <View testID="page-photo" />
    </CoverArrival>
  )
}

/** La scène : le fil (une carte) et, par-dessus, la page ouverte ou non. */
function Stage({
  card = true,
  page,
  photo,
  title,
}: {
  card?: boolean
  page?: string | string[]
  photo?: string
  title?: RefObject<Focusable | null>
}) {
  return (
    <CoverTransitionProvider>
      {card ? <Card id="p1" /> : null}
      {[page ?? []].flat().map((id) => (
        <Page key={id} id={id} />
      ))}
      {photo && title ? <PageWithPhoto id={photo} title={title} /> : null}
    </CoverTransitionProvider>
  )
}

/** Le membre touche la carte : elle confie sa photo au contexte, puis ouvre la page (`opened`). */
const touchCard = async (opened = jest.fn()) => {
  await act(async () => {
    source?.capture(opened)
  })
  return opened
}

/** Le premier ancêtre (lui compris) qui ne prend pas le doigt, s'il y en a un. */
const ignoresTouch = (node: unknown) => {
  type Node = { props: Record<string, unknown>; parent: Node | null }
  for (let at = node as Node | null; at; at = at.parent) {
    const style = (StyleSheet.flatten(at.props.style as never) ?? {}) as Record<string, unknown>
    if (at.props.pointerEvents === 'none' || style.pointerEvents === 'none') return true
  }
  return false
}

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  measured.mockClear()
  source = undefined
  target = undefined
  targets = {}
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('coverTransition', () => {
  it('measures the card photo when touched, then opens the page once', async () => {
    await render(<Stage />)

    const opened = await touchCard()

    expect(measured).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('grows the page photo from the frame the card gave', async () => {
    const view = await render(<Stage />)
    await touchCard()

    await view.rerender(<Stage page="p1" />)

    expect(target?.arrival).toEqual({ kind: 'grow', from: cardFrame })
  })

  it('fades in a page that no touched card opened', async () => {
    // Une adresse ouverte directement, ou un lien venu d'ailleurs : aucune carte n'a confié de
    // cadre pour ce projet (celui de p1 n'est pas celui de p2).
    const view = await render(<Stage />)
    await touchCard()

    await view.rerender(<Stage page={['p1', 'p2']} />)

    // Témoin : la page du projet touché, elle, grandit.
    expect(targets.p1?.arrival).toEqual({ kind: 'grow', from: cardFrame })
    expect(targets.p2?.arrival).toEqual({ kind: 'fade' })
  })

  it('folds back into the kept frame while the card is still there', async () => {
    const view = await render(<Stage />)
    await touchCard()
    await view.rerender(<Stage page="p1" />)

    expect(target?.departure()).toEqual({ kind: 'shrink', to: cardFrame })
  })

  it('fades back when the card is no longer there', async () => {
    const view = await render(<Stage />)
    await touchCard()
    await view.rerender(<Stage page="p1" />)
    // Témoin : tant que la carte est là, la page se replie dans son cadre.
    expect(target?.departure()).toEqual({ kind: 'shrink', to: cardFrame })
    // Le fil s'est rechargé pendant la visite : la carte a disparu.
    await view.rerender(<Stage card={false} page="p1" />)

    expect(target?.departure()).toEqual({ kind: 'fade' })
  })

  it('fades with reduce motion, both ways', async () => {
    reducedMotion.mockReturnValue(true)
    const view = await render(<Stage />)
    const opened = await touchCard()
    // La page s'ouvre quand même.
    expect(opened).toHaveBeenCalledTimes(1)

    await view.rerender(<Stage page="p1" />)

    expect(target?.arrival).toEqual({ kind: 'fade' })
    expect(target?.departure()).toEqual({ kind: 'fade' })
  })

  it('opens and fades without a provider, as plain navigation', async () => {
    // Une carte montrée hors de l'appli (le catalogue, un test d'écran) : rien ne casse.
    await render(
      <>
        <Card id="p1" />
        <Page id="p1" />
      </>,
    )

    const opened = await touchCard()

    expect(opened).toHaveBeenCalledTimes(1)
    expect(target?.arrival).toEqual({ kind: 'fade' })
    expect(target?.departure()).toEqual({ kind: 'fade' })
  })

  it('hides the growing photo from screen readers and from the finger', async () => {
    // Horloge simulée : l'animation reste en vol tant qu'on ne fait pas avancer le temps.
    jest.useFakeTimers()
    const title = { current: null } as RefObject<Focusable | null>
    const view = await render(<Stage />)
    await touchCard()

    await view.rerender(<Stage photo="p1" title={title} />)

    // La photo est là, mais le lecteur d'écran ne la voit pas pendant qu'elle vole…
    expect(screen.queryByTestId('page-photo')).toBeNull()
    const photo = screen.getByTestId('page-photo', { includeHiddenElements: true })
    // … et un doigt posé dessus pendant le vol ne touche rien.
    expect(ignoresTouch(photo)).toBe(true)
  })

  it('moves the focus to the page title once the photo has landed', async () => {
    jest.useFakeTimers()
    jest.replaceProperty(Platform, 'OS', 'web')
    // Le titre de la page sur le web : un élément qu'on peut focaliser.
    const focus = jest.fn()
    const title = { current: { focus } } as unknown as RefObject<Focusable | null>
    const view = await render(<Stage />)
    await touchCard()

    await view.rerender(<Stage photo="p1" title={title} />)
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    expect(focus).toHaveBeenCalled()
  })

  it('moves the focus to the page title after a fade too', async () => {
    reducedMotion.mockReturnValue(true)
    jest.useFakeTimers()
    jest.replaceProperty(Platform, 'OS', 'web')
    const focus = jest.fn()
    const title = { current: { focus } } as unknown as RefObject<Focusable | null>
    const view = await render(<Stage />)
    await touchCard()

    await view.rerender(<Stage photo="p1" title={title} />)
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    expect(focus).toHaveBeenCalled()
  })
})
