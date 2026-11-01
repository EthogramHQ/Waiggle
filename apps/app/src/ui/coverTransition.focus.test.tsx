// Le focus à l'arrivée de la page (R4, « la carte qui devient la page ») : il va au titre seulement
// quand la page vient d'une carte touchée. Une page ouverte par son adresse (un lien, un
// rechargement) le laisse en haut, comme toute page qui se charge : sinon l'anneau de focus
// s'afficherait sur le titre sans aucun geste du membre.
import { act, render } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { Platform, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { CoverArrival, CoverTransitionProvider, useCoverSource } from './coverTransition'
import type { Focusable } from './focus'

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

let source: ReturnType<typeof useCoverSource> | undefined

/** Une carte dont la photo se mesure dans la fenêtre. */
function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return (
    <View
      ref={(view) =>
        cover.ref(view ? { measureInWindow: (callback) => callback(16, 240, 358, 220) } : null)
      }
    />
  )
}

function Stage({ page, title }: { page: boolean; title: RefObject<Focusable | null> }) {
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? (
        <CoverArrival id="p1" focusOnArrival={title}>
          <View testID="page-photo" />
        </CoverArrival>
      ) : null}
    </CoverTransitionProvider>
  )
}

beforeEach(() => {
  reducedMotion.mockReturnValue(false)
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('coverTransition focus', () => {
  it('leaves the focus alone on a page opened by its address', async () => {
    const focus = jest.fn()
    const title = { current: { focus } } as unknown as RefObject<Focusable | null>
    const view = await render(<Stage page={false} title={title} />)

    // Aucune carte touchée : la page arrive par son adresse.
    await view.rerender(<Stage page title={title} />)
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    expect(focus).not.toHaveBeenCalled()
  })

  it('moves the focus to the title of a page opened from a card (witness)', async () => {
    const focus = jest.fn()
    const title = { current: { focus } } as unknown as RefObject<Focusable | null>
    const view = await render(<Stage page={false} title={title} />)
    await act(async () => {
      source?.capture(() => {})
    })

    await view.rerender(<Stage page title={title} />)
    await act(async () => {
      jest.advanceTimersByTime(3000)
    })

    expect(focus).toHaveBeenCalled()
  })
})
