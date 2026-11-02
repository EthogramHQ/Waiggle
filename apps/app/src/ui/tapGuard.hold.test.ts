// Tests de `holdPageTaps` (R5a) : après la fermeture d'une couche sous le doigt (« Copier le
// lien »), la page web ignore les tapes, Entrée et Espace pendant la garde, puis les reçoit de
// nouveau. La position où tombe la tape se mesure dans le navigateur ; ici, la règle du temps.
import { holdPageTaps, TAP_GUARD_MS } from './tapGuard'

type Listener = (event: object) => void

/** Un faux document qui garde ses écouteurs, et peut leur envoyer un événement. */
const fakeDocument = () => {
  const listeners = new Map<string, Set<Listener>>()
  return {
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener)
    },
    /** Envoie un événement ; rend vrai s'il a été arrêté. */
    dispatch: (type: string, extra: object = {}) => {
      const event = { type, stopPropagation: jest.fn(), preventDefault: jest.fn(), ...extra }
      for (const listener of listeners.get(type) ?? []) listener(event)
      return event.stopPropagation.mock.calls.length > 0
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  }
}

let doc: ReturnType<typeof fakeDocument>

beforeEach(() => {
  jest.useFakeTimers()
  doc = fakeDocument()
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
})

afterEach(() => {
  jest.useRealTimers()
  Reflect.deleteProperty(globalThis, 'document')
})

describe('holdPageTaps', () => {
  it('stops the second tap of a double tap, then lets taps through after the guard', () => {
    holdPageTaps()

    expect(doc.dispatch('click')).toBe(true)
    expect(doc.dispatch('pointerdown')).toBe(true)
    // Une autre touche que celles qui activent un bouton passe (Tab, Échap).
    expect(doc.dispatch('keydown', { key: 'Tab' })).toBe(false)
    expect(doc.dispatch('keydown', { key: 'Enter' })).toBe(true)

    jest.advanceTimersByTime(TAP_GUARD_MS)

    expect(doc.dispatch('click')).toBe(false)
    expect(doc.count()).toBe(0) // les écouteurs sont retirés
  })

  it('does nothing without a web document', () => {
    Reflect.deleteProperty(globalThis, 'document')

    expect(() => holdPageTaps()).not.toThrow()
    expect(doc.count()).toBe(0)
  })
})
