// Tests de la carte qui devient la page sur le web, avec l'API View Transitions (R17, scénario « La
// carte qui devient la page ») : le navigateur fait voler la photo. La carte ne mesure plus rien :
// elle confie sa photo au moteur des passages (`shareCover`) et ouvre tout de suite ; la page du
// projet se pose aussitôt (elle n'a plus à faire grandir la photo elle-même) et donne le focus à son
// titre à la fin du passage ; son « Retour » part tout de suite, la photo confiée au moteur.
// Sans l'API, sous « Réduire les animations », et sur iOS et Android, rien ne change (les tests de
// coverTransition*.test.tsx restent ceux d'aujourd'hui).
//
// Le moteur est le vrai `ui/pageTransition.web`, sur un faux `document` qui a (ou non) l'API ; son
// `shareCover` est espionné.
import { act, render, screen } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { Platform, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import {
  CoverArrival,
  CoverTransitionProvider,
  useCoverSource,
  useCoverTarget,
} from './coverTransition'
import type { Focusable } from './focus'
import * as engine from './pageTransition'

type Engine = typeof import('./pageTransition.web')

jest.mock('./pageTransition', () => {
  const actual = jest.requireActual<Engine>('./pageTransition.web')
  return { ...actual, shareCover: jest.fn(actual.shareCover) }
})
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

const web = engine as unknown as Engine
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** Un faux `document`, avec l'API si `api` ; `finish()` termine le passage en cours. */
const fakeDocument = (api: boolean) => {
  const dataset: Record<string, string | undefined> = {}
  const key = (name: string) => name.replace(/^data-/, '')
  let finish: () => void = () => {}
  const startViewTransition = jest.fn((arg: (() => unknown) | { update: () => unknown }) => {
    const update = typeof arg === 'function' ? arg : arg.update
    const end = new Promise<void>((resolve) => {
      finish = resolve
    })
    const done = Promise.resolve().then(() => update())
    return {
      updateCallbackDone: done.then(() => {}),
      ready: done.then(() => {}),
      finished: done.then(() => end),
      skipTransition: () => finish(),
    }
  })
  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  return {
    doc: {
      documentElement: {
        dataset,
        setAttribute: (name: string, value: string) => {
          dataset[key(name)] = String(value)
        },
        removeAttribute: (name: string) => {
          delete dataset[key(name)]
        },
        getAttribute: (name: string) => dataset[key(name)] ?? null,
        hasAttribute: (name: string) => dataset[key(name)] !== undefined,
        style: {},
      },
      querySelector: () => null,
      matchMedia,
      defaultView: { matchMedia, innerHeight: 844, innerWidth: 390 },
      ...(api ? { startViewTransition } : {}),
    },
    finish: () => finish(),
  }
}

// La photo de la carte : un élément du navigateur, qui saurait aussi se mesurer (l'ancienne voie).
const photo = {
  measureInWindow: jest.fn(),
  getBoundingClientRect: () => ({
    top: 300,
    bottom: 520,
    left: 16,
    right: 374,
    width: 358,
    height: 220,
  }),
  style: { viewTransitionName: '' },
}

let source: ReturnType<typeof useCoverSource> | undefined
let target: ReturnType<typeof useCoverTarget> | undefined

function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return <View ref={(view) => cover.ref(view ? (photo as never) : null)} />
}

function Leave() {
  target = useCoverTarget('p1')
  return null
}

function Stage({ page, title }: { page: boolean; title?: RefObject<Focusable | null> }) {
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? (
        <CoverArrival id="p1" {...(title ? { focusOnArrival: title } : null)}>
          <Leave />
          <View testID="page-photo" accessible accessibilityLabel="Décollage !" />
        </CoverArrival>
      ) : null}
    </CoverTransitionProvider>
  )
}

const shareCover = jest.mocked(engine.shareCover)

/** Le moteur sur ce document, la page hydratée et la première page de la visite posée. */
const useDocument = (api: boolean) => {
  const fake = fakeDocument(api)
  web.setPassageDocument(fake.doc as unknown as Parameters<Engine['setPassageDocument']>[0])
  web.passageArrived()
  return fake
}

beforeEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false)
  shareCover.mockClear()
  photo.measureInWindow.mockClear()
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

describe('coverTransition with the View Transitions API (web)', () => {
  it('hands the card photo to the passage, without measuring, and opens at once', async () => {
    useDocument(true)
    await render(<Stage page={false} />)
    const then = jest.fn()

    await act(async () => source?.capture(then))

    expect(photo.measureInWindow).not.toHaveBeenCalled()
    expect(shareCover).toHaveBeenCalledWith(expect.objectContaining({ from: photo, id: 'p1' }))
    expect(then).toHaveBeenCalledTimes(1)
  })

  it('lays the project page down at once, readable, and focuses its title at the end', async () => {
    const fake = useDocument(true)
    const focus = jest.fn()
    const title = { current: { focus } } as unknown as RefObject<Focusable | null>
    const view = await render(<Stage page={false} title={title} />)

    await act(async () => source?.capture(() => web.runPassage('deeper', () => {})))
    await view.rerender(<Stage page title={title} />)
    await act(async () => {
      web.passageArrived()
      await flush()
    })

    // Pas de vol à attendre : la photo est là, lue par le lecteur d'écran.
    expect(screen.getByLabelText('Décollage !')).toBeTruthy()
    expect(focus).not.toHaveBeenCalled()

    await act(async () => {
      fake.finish()
      await flush()
    })
    expect(focus).toHaveBeenCalled()
  })

  it('leaves at once by the page Back, the photo handed to the passage', async () => {
    useDocument(true)
    const view = await render(<Stage page={false} />)
    await act(async () => source?.capture(() => {}))
    await view.rerender(<Stage page />)
    shareCover.mockClear()
    const then = jest.fn()

    await act(async () => target?.leave(then))

    expect(then).toHaveBeenCalledTimes(1)
    expect(shareCover).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })
})

describe('coverTransition without the API, or with reduced motion (web)', () => {
  it('still measures the card photo without the API (témoin)', async () => {
    useDocument(false)
    await render(<Stage page={false} />)

    await act(async () => source?.capture(() => {}))

    expect(photo.measureInWindow).toHaveBeenCalled()
    expect(shareCover).not.toHaveBeenCalled()
  })

  it('hands nothing to the passage with reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    useDocument(true)
    await render(<Stage page={false} />)
    const then = jest.fn()

    await act(async () => source?.capture(then))

    expect(then).toHaveBeenCalledTimes(1)
    expect(shareCover).not.toHaveBeenCalled()
  })
})
