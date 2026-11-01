// Tests de l'inclinaison des cartes (R4, « Le mouvement ») : sur ordinateur, quand la souris passe
// sur une carte, la carte s'incline un peu vers elle (4 degrés au plus) et le reflet de son verre
// suit le pointeur ; elle se remet à plat quand la souris part. Rien au toucher, rien au clavier,
// rien avec « Réduire les animations », rien avant que la page soit hydratée (le pointeur n'est
// connu que du navigateur), et la carte se remet à plat tout de suite avant qu'on mesure sa photo
// (la carte qui devient la page, coverTransition).
//
// Deux parties : `tiltAt`, le calcul pur (position du pointeur → angles et reflet), et `useTilt`,
// le hook qui décide quand écouter le pointeur. Le hook garde sa cible dans une valeur partagée de
// Reanimated (`tilt.value`), que ses styles animés suivent ; on lit cette cible, pas les ressorts.
import { act, renderHook } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useHydrated } from './theme/hydration'
import { tiltAt, useTilt } from './tilt'

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

// L'hydratation de la page web : en test, le module est chargé hors du web et se croit hydraté ;
// chaque test choisit.
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual<typeof import('./theme/hydration')>('./theme/hydration'),
  useHydrated: jest.fn(() => true),
}))

const reducedMotion = jest.mocked(useReducedMotion)
const hydrated = jest.mocked(useHydrated)

// Le navigateur, le peu qu'on en prête : `matchMedia` répond si le pointeur principal est fin (une
// souris, un pavé tactile) ; un écran tactile répond non.
let finePointer = true
const matchMedia = jest.fn((query: string) => ({
  matches: finePointer && query.includes('pointer: fine'),
  media: query,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
}))

// La carte : 200 × 100 points, posée à (50, 80) dans la page.
const CARD = { left: 50, top: 80, width: 200, height: 100 }

/**
 * Un mouvement du pointeur à (x, y) dans la carte, tel que react-native-web le donne : l'événement
 * du navigateur dans `nativeEvent` (position dans la page, et dans la carte), la carte dans
 * `currentTarget`.
 */
const pointerAt = (x: number, y: number, pointerType = 'mouse') => {
  const rect = {
    ...CARD,
    x: CARD.left,
    y: CARD.top,
    right: CARD.left + CARD.width,
    bottom: CARD.top + CARD.height,
  }
  const card = { getBoundingClientRect: () => rect }
  return {
    nativeEvent: {
      pointerType,
      clientX: CARD.left + x,
      clientY: CARD.top + y,
      pageX: CARD.left + x,
      pageY: CARD.top + y,
      offsetX: x,
      offsetY: y,
      locationX: x,
      locationY: y,
    },
    currentTarget: card,
    target: card,
  }
}

type Handlers = Record<string, ((event?: unknown) => void) | undefined>

/** Monte le hook, et lui donne la taille de la carte s'il la demande (onLayout). */
const mountTilt = async () => {
  const hook = await renderHook(() => useTilt())
  const handlers = hook.result.current.handlers as unknown as Handlers
  await act(async () => {
    handlers.onLayout?.({
      nativeEvent: {
        layout: { x: CARD.left, y: CARD.top, width: CARD.width, height: CARD.height },
      },
    })
  })
  return hook
}

const handlersOf = (hook: Awaited<ReturnType<typeof mountTilt>>) =>
  hook.result.current.handlers as unknown as Handlers

/** Le pointeur passe à (x, y) dans la carte. */
const move = async (
  hook: Awaited<ReturnType<typeof mountTilt>>,
  x: number,
  y: number,
  pointerType = 'mouse',
) => {
  await act(async () => {
    handlersOf(hook).onPointerMove?.(pointerAt(x, y, pointerType))
  })
}

const flat = { rotateX: 0, rotateY: 0 }

beforeEach(() => {
  finePointer = true
  reducedMotion.mockReturnValue(false)
  hydrated.mockReturnValue(true)
  matchMedia.mockClear()
  jest.replaceProperty(Platform, 'OS', 'web')
  ;(globalThis as { matchMedia?: unknown }).matchMedia = matchMedia
})

afterEach(() => {
  jest.restoreAllMocks()
  delete (globalThis as { matchMedia?: unknown }).matchMedia
})

describe('tiltAt', () => {
  // Les positions se donnent en part de la carte : (0,5 ; 0,5) au centre, (1 ; 0,5) au bord droit.
  it('lies flat with the pointer at the centre, the reflection in the middle', () => {
    const centre = tiltAt(0.5, 0.5)
    expect(centre.rotateX).toBeCloseTo(0)
    expect(centre.rotateY).toBeCloseTo(0)
    expect(centre.glareX).toBeCloseTo(0.5)
    expect(centre.glareY).toBeCloseTo(0.5)
  })

  it('leans towards the pointer, opposite ways on opposite sides', () => {
    const right = tiltAt(1, 0.5)
    const left = tiltAt(0, 0.5)
    const bottom = tiltAt(0.5, 1)
    const top = tiltAt(0.5, 0)
    // Un pointeur à droite fait tourner la carte autour de son axe vertical, pas de l'autre.
    expect(Math.abs(right.rotateY)).toBeGreaterThan(2)
    expect(right.rotateX).toBeCloseTo(0)
    expect(left.rotateY).toBeCloseTo(-right.rotateY)
    // En bas, autour de l'axe horizontal.
    expect(Math.abs(bottom.rotateX)).toBeGreaterThan(2)
    expect(bottom.rotateY).toBeCloseTo(0)
    expect(top.rotateX).toBeCloseTo(-bottom.rotateX)
  })

  it('never leans more than 4 degrees, even past the edge', () => {
    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
      [3, -2],
      [-5, 0.5],
    ] as const) {
      const tilt = tiltAt(x, y)
      expect(Math.abs(tilt.rotateX)).toBeLessThanOrEqual(4)
      expect(Math.abs(tilt.rotateY)).toBeLessThanOrEqual(4)
    }
  })

  it('moves the reflection with the pointer, inside the card', () => {
    expect(tiltAt(0.25, 0.8)).toMatchObject({ glareX: 0.25, glareY: 0.8 })
    // Hors de la carte, le reflet reste sur son bord.
    expect(tiltAt(3, -2)).toMatchObject({ glareX: 1, glareY: 0 })
  })
})

describe('useTilt', () => {
  it('tilts towards a mouse on the web, within 4 degrees', async () => {
    const hook = await mountTilt()

    // La question posée au navigateur : le pointeur principal est-il fin ?
    expect(matchMedia).toHaveBeenCalledWith(expect.stringContaining('pointer: fine'))
    expect(handlersOf(hook).onPointerMove).toBeDefined()
    // Au bord droit, au milieu de la hauteur.
    await move(hook, CARD.width, CARD.height / 2)

    const tilt = hook.result.current.tilt.value
    expect(Math.abs(tilt.rotateY)).toBeGreaterThan(0)
    expect(Math.abs(tilt.rotateY)).toBeLessThanOrEqual(4)
    expect(tilt.rotateX).toBeCloseTo(0)
    expect(tilt.glareX).toBeCloseTo(1)
    expect(tilt.glareY).toBeCloseTo(0.5)
  })

  it('lies flat again when the mouse leaves', async () => {
    const hook = await mountTilt()
    await move(hook, 0, 0)
    // Témoin : la carte était inclinée.
    expect(hook.result.current.tilt.value.rotateX).not.toBeCloseTo(0)

    await act(async () => {
      handlersOf(hook).onPointerLeave?.()
    })

    expect(hook.result.current.tilt.value).toMatchObject(flat)
  })

  it('lies flat at once when asked, before its photo is measured', async () => {
    const hook = await mountTilt()
    await move(hook, CARD.width, CARD.height)
    expect(hook.result.current.tilt.value.rotateY).not.toBeCloseTo(0)

    // La carte touchée va mesurer sa photo (coverTransition) : à plat d'abord, sans ressort.
    await act(async () => {
      hook.result.current.flatten()
    })

    expect(hook.result.current.tilt.value).toMatchObject(flat)
  })

  it('stays flat for a finger on a device that also has a mouse', async () => {
    const hook = await mountTilt()
    // Témoin : la souris est écoutée.
    expect(handlersOf(hook).onPointerMove).toBeDefined()

    await move(hook, CARD.width, CARD.height, 'touch')

    expect(hook.result.current.tilt.value).toMatchObject(flat)
    // Témoin : la souris, elle, incline la carte.
    await move(hook, CARD.width, CARD.height)
    expect(hook.result.current.tilt.value.rotateY).not.toBeCloseTo(0)
  })

  it('listens to nothing on a touch screen', async () => {
    finePointer = false
    const hook = await mountTilt()

    expect(handlersOf(hook).onPointerMove).toBeUndefined()
    expect(hook.result.current.tilt.value).toMatchObject(flat)
  })

  it('offers nothing to the keyboard', async () => {
    const hook = await mountTilt()
    // Témoin : la souris est écoutée…
    expect(handlersOf(hook).onPointerMove).toBeDefined()
    // … mais ni le focus, ni les touches : une carte atteinte par Tab ne bouge pas.
    const keyboard = Object.keys(handlersOf(hook)).filter((name) =>
      /^on(Focus|Blur|Key|Press)/.test(name),
    )
    expect(keyboard).toEqual([])
  })

  it('stays flat with reduce motion', async () => {
    reducedMotion.mockReturnValue(true)
    const hook = await mountTilt()

    expect(handlersOf(hook).onPointerMove).toBeUndefined()
    expect(hook.result.current.tilt.value).toMatchObject(flat)
  })

  it('waits for the page to be hydrated before asking the browser', async () => {
    // Pendant l'hydratation, la page doit rester celle du serveur, qui ne connaît pas le pointeur.
    hydrated.mockReturnValue(false)
    const hook = await mountTilt()

    expect(matchMedia).not.toHaveBeenCalled()
    expect(handlersOf(hook).onPointerMove).toBeUndefined()
  })

  it('stays flat on a phone', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    const hook = await mountTilt()

    expect(handlersOf(hook).onPointerMove).toBeUndefined()
    expect(hook.result.current.tilt.value).toMatchObject(flat)
  })
})
