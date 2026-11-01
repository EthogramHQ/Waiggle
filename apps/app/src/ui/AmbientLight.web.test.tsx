// Tests de la lumière vivante du web (R1) : ses gardes, plus que son dessin. Sans WebGL, elle prend
// la version allégée ; un résumé d'image illisible donne la lumière miel ; « Réduire les
// animations » l'immobilise (J5) ; et une rafale d'impulsions n'en joue qu'une (J11). Le shader se
// regarde dans un navigateur : Jest n'a ni carte graphique ni pixels.
//
// Jest n'a pas de navigateur non plus. Le composant reçoit donc, au lieu d'un vrai <canvas>,
// l'élément de test qui le représente ; on lui prête, le temps d'un test, ce qu'un canvas sait
// faire (getContext, les écouteurs). Et l'on prête au monde ce qu'un navigateur fournit (document,
// window.addEventListener), seulement s'il manque.
import { act, isHiddenFromAccessibility, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import {
  useReducedMotion,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { renderWithProviders } from '../testing/render'
import { AmbientLight } from './AmbientLight.web'
import { AmbientProvider, sourcePalette, useAmbient } from './theme/ambient'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

// Reanimated, tel que le prépare jest.setup.ts : le réglage « Réduire les animations » est choisi
// par chaque test, et chaque fonction qui lance une animation note ses appels (jest.fn(réel) garde
// le vrai comportement).
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  // __esModule et default : sans eux, `import Animated from …` ne retrouverait pas Animated.View.
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
    withSpring: jest.fn(actual.withSpring),
    withTiming: jest.fn(actual.withTiming),
    withSequence: jest.fn(actual.withSequence),
    withDelay: jest.fn(actual.withDelay),
  }
})

const reducedMotion = jest.mocked(useReducedMotion)
const starters = [withRepeat, withSpring, withTiming, withSequence, withDelay].map((fn) =>
  jest.mocked(fn),
)
/** Le nombre d'animations lancées jusqu'ici, toutes sortes confondues. */
const animationsStarted = () => starters.reduce((sum, fn) => sum + fn.mock.calls.length, 0)

/** Une fenêtre d'ordinateur (la lumière WebGL) ou de téléphone (la version allégée). */
const setWindow = (width: number, height: number) => {
  const size = { width, height, scale: 1, fontScale: 1 }
  Dimensions.set({ window: size, screen: size })
}

/**
 * Un faux contexte WebGL : chaque méthode existe et ne fait rien, la compilation du shader réussit
 * (getShaderParameter, getProgramParameter), et le contexte n'est pas perdu. Un Proxy (un objet
 * qui fabrique ses propriétés à la demande) évite de lister la centaine de fonctions de WebGL.
 */
const fakeWebGL = (): object =>
  new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'then') return undefined // pas une promesse
      if (!(key in target)) {
        target[key] =
          key === 'getShaderParameter' || key === 'getProgramParameter'
            ? jest.fn(() => true)
            : key === 'isContextLost'
              ? jest.fn(() => false)
              : typeof key === 'string' && /^[A-Z0-9_]+$/.test(key)
                ? 1 // une constante (gl.VERTEX_SHADER…)
                : typeof key === 'string' && /^drawingBuffer/.test(key)
                  ? 1
                  : jest.fn(() => ({}))
      }
      return target[key]
    },
  })

/** Ce qu'on prête au monde de Jest pour ressembler à un navigateur, et comment le reprendre. */
const browserShims: (() => void)[] = []
const lend = (owner: object, key: string, value: unknown) => {
  if (key in owner) return
  Object.defineProperty(owner, key, { value, configurable: true, writable: true })
  browserShims.push(() => {
    delete (owner as Record<string, unknown>)[key]
  })
}

/**
 * La lumière n'est montée qu'après un premier dessin : on prête d'abord à l'élément qui tiendra
 * lieu de <canvas> (un élément de test, comme screen.container) ce qu'un canvas sait faire, avec
 * le contexte donné (null : WebGL refusé). Un seul rendu : la lumière paraît par un état.
 */
const showLight = async (webgl: object | null, light = <AmbientLight />) => {
  let show: () => void = () => {}
  function Later() {
    const [shown, setShown] = useState(false)
    show = () => setShown(true)
    return <AmbientProvider>{shown ? light : null}</AmbientProvider>
  }
  await renderWithProviders(<Later />)
  const element = Object.getPrototypeOf(screen.container) as object
  const getContext = jest.fn(() => webgl)
  for (const [key, value] of Object.entries({
    getContext,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }),
    clientWidth: 1440,
    clientHeight: 900,
  })) {
    lend(element, key, value)
  }
  await act(async () => show())
  return { getContext }
}

/** Les types de tous les éléments dessinés (« canvas », « View »…). */
const drawnTypes = (): string[] => {
  const types: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const element = node as { type?: unknown; children?: unknown[] }
    if (typeof element.type === 'string') types.push(element.type)
    for (const child of element.children ?? []) walk(child)
  }
  walk(screen.container)
  return types
}

/**
 * Un faux document (ou un de ses éléments, <html>, <body>) : la page est visible, chaque élément a
 * un style, et toute méthode existe et ne fait rien (setAttribute, addEventListener…).
 */
const fakeDocumentNode = (): object =>
  new Proxy(
    {
      style: { setProperty: jest.fn(), removeProperty: jest.fn() },
      visibilityState: 'visible',
      hidden: false,
    } as Record<string | symbol, unknown>,
    {
      get(target, key) {
        if (key === 'then') return undefined
        if (!(key in target)) {
          target[key] =
            key === 'documentElement' || key === 'body' || key === 'head'
              ? fakeDocumentNode()
              : jest.fn(() => undefined)
        }
        return target[key]
      },
    },
  )

let frame: jest.SpyInstance

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'web')
  reducedMotion.mockReturnValue(false)
  for (const fn of starters) fn.mockClear()
  // ThemeProvider pose aussi la couleur de la page sur le web : il lui faut <html> et <body>.
  lend(globalThis, 'document', fakeDocumentNode())
  lend(globalThis, 'addEventListener', jest.fn())
  lend(globalThis, 'removeEventListener', jest.fn())
  lend(globalThis, 'devicePixelRatio', 1)
  frame = jest.spyOn(globalThis, 'requestAnimationFrame')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
  for (const undo of browserShims.splice(0)) undo()
  setWindow(390, 844)
})

describe('AmbientLight on a computer (web)', () => {
  // Témoin des deux tests suivants : avec WebGL, la lumière se dessine sur un canvas, muet pour
  // les lecteurs d'écran, image après image.
  it('draws on a canvas hidden from screen readers when WebGL is available', async () => {
    setWindow(1440, 900)
    await showLight(fakeWebGL())

    expect(drawnTypes()).toContain('canvas')
    const canvas = screen.container.queryAll((node) => node.type === 'canvas')[0]
    expect(canvas !== undefined && isHiddenFromAccessibility(canvas)).toBe(true)
    expect(frame).toHaveBeenCalled()
  })

  // Gardes du canvas (S5) : WebGL est demandé sans accepter une carte graphique lente ; refusé, la
  // lumière prend sa version allégée, sans canvas.
  it('falls back to the light version when WebGL is refused (getContext gives null)', async () => {
    setWindow(1440, 900)
    const { getContext } = await showLight(null)

    expect(getContext).toHaveBeenCalledWith(
      'webgl',
      expect.objectContaining({ failIfMajorPerformanceCaveat: true }),
    )
    expect(drawnTypes()).not.toContain('canvas')
    expect(frame).not.toHaveBeenCalled()
  })

  // J5 (WCAG 2.2.2) : « Réduire les animations » immobilise la lumière : aucune image après image,
  // aucune boucle.
  it('stands still with reduced motion: no animation frame, no loop', async () => {
    setWindow(1440, 900)
    reducedMotion.mockReturnValue(true)
    await showLight(fakeWebGL())

    expect(frame).not.toHaveBeenCalled()
    expect(jest.mocked(withRepeat)).not.toHaveBeenCalled()
  })
})

/**
 * Un faux IntersectionObserver : le test dit lui-même quand la lumière entre dans l'écran ou en
 * sort (seeLight(false) : la page est cachée dans la pile de navigation).
 */
const watchVisibility = () => {
  const watchers: ((entries: { isIntersecting: boolean }[]) => void)[] = []
  lend(
    globalThis,
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        watchers.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  return async (isIntersecting: boolean) => {
    await act(async () => {
      for (const watcher of watchers) watcher([{ isIntersecting }])
    })
  }
}

/** Un faux contexte WebGL dont on peut savoir s'il a été rendu au navigateur (loseContext). */
const releasableWebGL = () => {
  const loseContext = jest.fn()
  const webgl = fakeWebGL() as { getExtension: jest.Mock }
  webgl.getExtension.mockReturnValue({ loseContext })
  return { webgl, loseContext }
}

/** Le dernier écouteur « contexte perdu » posé sur le canvas (l'élément de test prêté). */
const loseLastContext = async () => {
  const element = Object.getPrototypeOf(screen.container) as { addEventListener: jest.Mock }
  const calls = element.addEventListener.mock.calls.filter(([type]) => type === 'webglcontextlost')
  const listener = calls[calls.length - 1]?.[1] as ((event: object) => void) | undefined
  await act(async () => listener?.({ preventDefault: jest.fn() }))
}

describe('AmbientLight in a stack of pages (web, review C4)', () => {
  // Expo Router garde montées les pages quittées : sans garde, chacune gardait son contexte WebGL
  // et sa boucle ; au-delà de 16, Chrome retirait les plus anciens, et la lumière d'une page où
  // l'on revenait restait figée.
  it('removes its canvas and gives back its WebGL context while its page is hidden', async () => {
    setWindow(1440, 900)
    const seeLight = watchVisibility()
    const { webgl, loseContext } = releasableWebGL()
    await showLight(webgl)
    expect(drawnTypes()).toContain('canvas') // témoin

    await seeLight(false)

    expect(drawnTypes()).not.toContain('canvas')
    expect(loseContext).toHaveBeenCalledTimes(1)
  })

  it('draws again on a new context when its page comes back', async () => {
    setWindow(1440, 900)
    const seeLight = watchVisibility()
    const { getContext } = await showLight(releasableWebGL().webgl)
    await seeLight(false)

    await seeLight(true)

    expect(drawnTypes()).toContain('canvas')
    expect(getContext).toHaveBeenCalledTimes(2)
  })

  // Un contexte retiré par le navigateur ne revient pas : un canvas neuf le remplace.
  it('replaces a lost WebGL context with a new canvas', async () => {
    setWindow(1440, 900)
    const { getContext } = await showLight(fakeWebGL())

    await loseLastContext()

    expect(getContext).toHaveBeenCalledTimes(2)
    expect(drawnTypes()).toContain('canvas')
  })

  it('falls back to the still light after losing its context again and again', async () => {
    setWindow(1440, 900)
    const { getContext } = await showLight(fakeWebGL())

    for (let loss = 0; loss < 4; loss++) await loseLastContext()

    expect(getContext).toHaveBeenCalledTimes(4) // le premier canvas, puis trois remplaçants
    expect(drawnTypes()).not.toContain('canvas')
  })
})

describe('AmbientLight on a phone (web)', () => {
  // Témoin : sans réglage, la version allégée respire, en boucle.
  it('breathes in a loop', async () => {
    await showLight(fakeWebGL())

    expect(jest.mocked(withRepeat)).toHaveBeenCalled()
  })

  it('stands still with reduced motion: no animation frame, no loop (J5)', async () => {
    reducedMotion.mockReturnValue(true)
    await showLight(fakeWebGL())

    expect(frame).not.toHaveBeenCalled()
    expect(jest.mocked(withRepeat)).not.toHaveBeenCalled()
  })

  // J11 : deux impulsions à moins de 350 ms fusionnent. Dix impulsions en 100 ms lancent autant
  // d'animations qu'une seule (mesurées sur la même durée de 100 ms).
  it('merges ten pulses within 100 ms into a single one', async () => {
    jest.useFakeTimers()
    let pulse: (force?: number) => void = () => {}
    function Pulser() {
      pulse = useAmbient().pulse
      return null
    }
    await showLight(
      fakeWebGL(),
      <>
        <Pulser />
        <AmbientLight />
      </>,
    )
    const during100ms = async (pulses: number) => {
      const before = animationsStarted()
      for (let tick = 0; tick < 10; tick++) {
        await act(async () => {
          if (tick < pulses) pulse(1)
          jest.advanceTimersByTime(10)
        })
      }
      return animationsStarted() - before
    }

    const one = await during100ms(1)
    await act(async () => {
      jest.advanceTimersByTime(1000)
    })
    const ten = await during100ms(10)

    expect(one).toBeGreaterThan(0)
    expect(ten).toBe(one)
  })
})

describe('sourcePalette', () => {
  // Le résumé flou d'une image (thumbhash) vient de l'API : illisible ou trop court, il ne casse
  // rien et donne la lumière miel, comme sans image.
  it.each(['pas un résumé !', 'AAAA', ''])(
    'gives the honey light for a thumbhash it cannot read (« %s »)',
    (thumbhash) => {
      expect(sourcePalette({ thumbhash })).toEqual(sourcePalette(null))
    },
  )

  // Témoin : un vrai résumé (une image verte et bleue) donne d'autres couleurs que le miel.
  it('takes its colours from a thumbhash it can read', () => {
    expect(sourcePalette({ thumbhash: '2DUBFwJzgnB4eHh3iHiHh4d493h4gIcI' })).not.toEqual(
      sourcePalette(null),
    )
  })

  it('takes a palette as it is given', () => {
    const palette = ['#2a6f4e', '#1e5ac8', '#f0c419'] as const
    expect(sourcePalette({ palette })).toEqual(palette)
  })
})
