// Le reflet de l'inclinaison suit le pointeur (R4, « Le mouvement », relecture design A3). Sur le web,
// la carte ne donne pas sa taille par `onLayout` : les gestionnaires ne sont posés qu'une fois la
// page hydratée et la souris reconnue, quand la carte est déjà dessinée. Le reflet, déplacé en
// points d'après cette taille, restait alors au centre. On l'essaie donc sans aucun `onLayout`.
import { act, render, screen } from '@testing-library/react-native'
import { Platform } from 'react-native'
import Animated, { getAnimatedStyle } from 'react-native-reanimated'
import { useTilt } from './tilt'

jest.mock('./theme/hydration', () => ({
  ...jest.requireActual<typeof import('./theme/hydration')>('./theme/hydration'),
  useHydrated: () => true,
}))

// La carte : 200 × 100 points, posée à (50, 80) dans la page, sans transformation.
const CARD = { left: 50, top: 80, width: 200, height: 100 }
const card = {
  getBoundingClientRect: () => CARD,
  offsetWidth: CARD.width,
  offsetHeight: CARD.height,
}

type Handlers = Record<string, ((event?: unknown) => void) | undefined>
let handlers: Handlers = {}

function Card() {
  const tilt = useTilt()
  handlers = tilt.handlers as unknown as Handlers
  return <Animated.View testID="glare" style={tilt.glareStyle} />
}

/** Le décalage du reflet, en points, une fois le ressort arrivé. */
const glareShift = () => {
  const { transform } = getAnimatedStyle(screen.getByTestId('glare')) as {
    transform: [{ translateX: number }, { translateY: number }]
  }
  return { x: transform[0].translateX, y: transform[1].translateY }
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { matchMedia?: unknown }).matchMedia = (query: string) => ({
    matches: query.includes('pointer: fine'),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
  delete (globalThis as { matchMedia?: unknown }).matchMedia
})

describe('useTilt reflection', () => {
  it('moves the reflection towards the pointer, without any layout event', async () => {
    await render(<Card />)
    // Témoin : la souris est écoutée.
    expect(handlers.onPointerMove).toBeDefined()

    // Le pointeur au coin en bas à droite de la carte.
    await act(async () => {
      handlers.onPointerMove?.({
        nativeEvent: { pointerType: 'mouse', clientX: 250, clientY: 180 },
        currentTarget: card,
      })
    })
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    // Le reflet, centré sur la carte, va jusqu'au pointeur : une demi-carte à droite et en bas.
    const shift = glareShift()
    expect(shift.x).toBeCloseTo(CARD.width / 2, 0)
    expect(shift.y).toBeCloseTo(CARD.height / 2, 0)
  })
})
