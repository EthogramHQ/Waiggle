// Tests ajoutés à ceux de Dialog.test.tsx après les relectures de R6a (correcteur C3) :
// - ui-B2 : sur le web, le voile de la fenêtre n'est plus un arrêt de Tab sans nom (un `<div
//   tabindex=0>` grand comme l'écran, où Entrée fermait la fenêtre). Caché, hors du focus, il
//   ferme toujours au clic, sauf pendant la garde et pendant l'action ;
// - ui-C1 : `initialFocusRef` pose le focus d'ouverture sur le bouton voulu (« Continuer » de la
//   fenêtre d'abandon), au lieu que l'écran le relance à chaque image.
// Que Tab ne s'arrête plus sur le voile dans un vrai navigateur se mesure par l'essai --explore du
// correcteur (Jest n'a pas de piège à focus) ; ici, on vérifie ce que la fenêtre écrit sur le voile.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useRef } from 'react'
import { Platform } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog, TAP_GUARD_MS } from './Dialog'
import { type Focusable, focusWithoutScroll, moveReaderTo } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Où la fenêtre pose le focus : des espions qui appellent les vrais outils.
jest.mock('./focus', () => {
  const actual = jest.requireActual('./focus')
  return {
    ...actual,
    focusWithoutScroll: jest.fn(actual.focusWithoutScroll),
    moveReaderTo: jest.fn(actual.moveReaderTo),
  }
})

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }

const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]

/** Le voile : caché aux lecteurs d'écran, il se trouve par ce qui le cache (comme Dialog.test). */
const scrim = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) =>
      node.props.importantForAccessibility === 'no' && node.props.accessibilityElementsHidden,
  )
  if (!found) throw new Error('no scrim')
  return found
}

/** Un faux document du navigateur : toute méthode existe ; <html> et <body> ont un style. */
const fakeDocument = (): Record<string, unknown> => {
  const node = (): Record<string, unknown> =>
    new Proxy(
      {
        style: { setProperty: jest.fn(), removeProperty: jest.fn() },
        activeElement: null,
      } as Record<string | symbol, unknown>,
      {
        get(target, key) {
          if (key === 'then') return undefined
          if (!(key in target)) {
            target[key] =
              key === 'documentElement' || key === 'body' || key === 'head'
                ? node()
                : jest.fn(() => undefined)
          }
          return target[key]
        },
      },
    ) as Record<string, unknown>
  return node()
}

const props = {
  visible: true,
  title: 'Abandonner ce projet ?',
  message: 'Ce que tu as écrit sera perdu.',
}

const onTheWeb = () => {
  jest.replaceProperty(Platform, 'OS', 'web')
  Object.defineProperty(globalThis, 'document', { value: fakeDocument(), configurable: true })
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
  Reflect.deleteProperty(globalThis, 'document')
})

describe('Dialog, the scrim on the web (R6a, ui-B2)', () => {
  it('keeps the scrim out of the focus: hidden, no tab stop, nothing to press', async () => {
    onTheWeb()
    await renderWithProviders(
      <Dialog {...props} onDismiss={jest.fn()}>
        <Button label="Continuer" variant="secondary" onPress={jest.fn()} />
      </Dialog>,
    )

    const veil = scrim().props
    expect(veil['aria-hidden']).toBe(true)
    // Ni arrêt de Tab, ni élément focalisable : rien que Tab, Entrée ou le piège à focus du Modal
    // puisse atteindre.
    expect(veil.tabIndex).toBeUndefined()
    expect(veil.focusable).not.toBe(true)
    expect(veil.accessible).not.toBe(true)
    expect(veil.onKeyDown).toBeUndefined()
    // Témoin : le bouton de la fenêtre, lui, reste atteignable.
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy()
  })

  it('still closes on a click, but not during the guard nor while busy', async () => {
    jest.useFakeTimers()
    onTheWeb()
    const onDismiss = jest.fn()
    const window = (busy: boolean) => (
      <Dialog {...props} guardTaps busy={busy} onDismiss={onDismiss}>
        <Button label="Continuer" variant="secondary" onPress={jest.fn()} />
      </Dialog>
    )
    await renderWithProviders(window(false))

    // La seconde tape d'une double tape, juste après l'ouverture : rien.
    await fireEvent(scrim() as never, 'click')
    expect(onDismiss).not.toHaveBeenCalled()

    // Pendant l'action : rien non plus.
    await act(() => jest.advanceTimersByTime(TAP_GUARD_MS))
    await screen.rerender(window(true))
    await fireEvent(scrim() as never, 'click')
    expect(onDismiss).not.toHaveBeenCalled()

    // Après la garde, sans action en cours : le clic ferme, une fois.
    await screen.rerender(window(false))
    await fireEvent(scrim() as never, 'click')
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

/** Une fenêtre dont « Continuer » doit recevoir le focus à l'ouverture. */
function KeepFirst({ withRef }: { withRef: boolean }) {
  const keep = useRef<Focusable>(null)
  return (
    <Dialog {...props} onDismiss={jest.fn()} {...(withRef ? { initialFocusRef: keep } : null)}>
      <Button label="Abandonner" variant="danger" onPress={jest.fn()} />
      <Button ref={keep} label="Continuer" variant="secondary" onPress={jest.fn()} />
    </Dialog>
  )
}

describe('Dialog, initialFocusRef (R6a, ui-C1)', () => {
  beforeEach(() => {
    jest.mocked(focusWithoutScroll).mockClear()
    jest.mocked(moveReaderTo).mockClear()
  })

  it('moves the screen reader to the given button when it shows (phone)', async () => {
    await renderWithProviders(<KeepFirst withRef />)

    expect(jest.mocked(moveReaderTo).mock.calls.map(([node]) => labelOf(node))).toEqual([
      'Continuer',
    ])
  })

  it('focuses the given button one frame after it shows (web), and nothing without it', async () => {
    jest.useFakeTimers()
    onTheWeb()
    const focused: unknown[] = []
    jest.mocked(focusWithoutScroll).mockImplementation((node) => {
      focused.push(node)
      return true
    })
    await renderWithProviders(<KeepFirst withRef />)
    // Rien avant l'image suivante : le piège à focus du Modal retient d'abord qui avait le focus.
    expect(focused).toHaveLength(0)
    await act(() => jest.advanceTimersByTime(50))
    expect(focused.map(labelOf)).toEqual(['Continuer'])
  })

  it('leaves the focus alone without initialFocusRef (témoin)', async () => {
    jest.useFakeTimers()
    onTheWeb()
    await renderWithProviders(<KeepFirst withRef={false} />)
    await act(() => jest.advanceTimersByTime(50))

    expect(jest.mocked(focusWithoutScroll)).not.toHaveBeenCalled()
    expect(jest.mocked(moveReaderTo)).not.toHaveBeenCalled()
  })
})
