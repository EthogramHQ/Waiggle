// Le focus au retour (R4, « la carte qui devient la page », relecture design C1) : après « Retour »
// sur un projet ouvert depuis une carte, le focus du clavier revient au lien de cette carte, sans
// faire défiler le fil. Sinon il tombait sur la page entière (`BODY`), et le Tab suivant repartait
// du haut : au clavier, on perdait sa place dans le fil. Une page ouverte par son adresse, elle, ne
// rend le focus à aucune carte.
import { act, render } from '@testing-library/react-native'
import { Platform, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
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
function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return (
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
  )
}

/** La page du projet : sa photo, et le bouton « Retour », qui appelle `leave`. */
function Page() {
  target = useCoverTarget('p1')
  return (
    <CoverArrival id="p1">
      <View testID="page-photo" />
    </CoverArrival>
  )
}

function Stage({ page }: { page: boolean }) {
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? <Page /> : null}
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
