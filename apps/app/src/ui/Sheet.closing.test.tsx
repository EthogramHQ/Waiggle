// Le focus d'une feuille qui se ferme, sur le web (correction U2 d'après la relecture du design de
// R6b, des-C5). « Rattacher » confirmé dans la fenêtre posée sur la feuille : les deux couches se
// ferment ensemble, et la feuille pose le focus sur le résultat de la carte (`returnFocusTo`). Mais
// pendant leurs fondus de sortie, les pièges à focus de react-native-web sont encore actifs, celui
// de la fenêtre le premier : il ramenait le focus chez lui (« Rattacher », puis « Annuler »), et le
// résultat ne l'avait qu'à la fin du fondu. Au clavier, le lecteur d'écran lisait « Annuler » entre
// les deux. La feuille cache donc aux pièges (écoute à la descente sur `window`, avant eux) le focus
// qu'elle vient de poser elle-même, jusqu'à la fin de son fondu.
//
// Jest n'a pas de navigateur : on prête à la page le peu que la feuille en lit (l'élément actif, les
// écouteurs de `window`), comme `Sheet.layers.test.tsx`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Un faux document : toute propriété existe ; l'élément actif est la page elle-même. */
const fakeDocument = (): { activeElement: unknown; body: unknown } => {
  const node = (extra: Record<string, unknown> = {}): object =>
    new Proxy(
      {
        style: { setProperty: jest.fn(), removeProperty: jest.fn() },
        visibilityState: 'visible',
        hidden: false,
        ...extra,
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
    )
  const page = node({ activeElement: null, querySelectorAll: () => [] }) as {
    activeElement: unknown
    body: unknown
  }
  page.activeElement = page.body
  return page
}

type FocusEvent = { target: unknown; stopImmediatePropagation: jest.Mock }
type Listener = (event: FocusEvent) => void

// Les écouteurs posés sur `window` (ici `globalThis`), à la descente seulement.
const captured = new Map<string, Listener[]>()
beforeAll(() => {
  Object.defineProperty(globalThis, 'addEventListener', {
    value: (type: string, listener: Listener, capture?: boolean) => {
      if (capture === true) captured.set(type, [...(captured.get(type) ?? []), listener])
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'removeEventListener', {
    value: (type: string, listener: Listener) => {
      captured.set(
        type,
        (captured.get(type) ?? []).filter((kept) => kept !== listener),
      )
    },
    configurable: true,
  })
})
afterAll(() => {
  Reflect.deleteProperty(globalThis, 'addEventListener')
  Reflect.deleteProperty(globalThis, 'removeEventListener')
})

/** Envoie aux écouteurs de `window` un focus posé sur `target`. */
const focusOn = (target: unknown): FocusEvent => {
  const event = { target, stopImmediatePropagation: jest.fn() }
  for (const listener of captured.get('focus') ?? []) listener(event)
  return event
}

/** Le résultat d'une carte, hors de toute couche : là où l'écran veut le focus à la fermeture. */
const result = { tagName: 'DIV', isConnected: true }
/** Un élément de la fenêtre qui se ferme par-dessus (« Annuler »), où son piège ramènerait le focus. */
const cancelOfDialog = { tagName: 'DIV', isConnected: true }

const Page = () => {
  const [open, setOpen] = useState(true)
  return (
    <Sheet
      open={open}
      title="Rattacher « Make.com »"
      onClose={() => setOpen(false)}
      returnFocusTo={() => result}
    >
      <Text>Contenu</Text>
    </Sheet>
  )
}

/** La fin du fondu de sortie : le Modal de react-native-web appelle `onDismiss`. */
const fadeEnd = (): (() => void) => {
  // Le Modal simulé porte `onDismiss` : on remonte de « Fermer » jusqu'à lui.
  let node = screen.getByRole('button', { name: fr.t(($) => $.common.close) }).parent
  while (node && typeof node.props.onDismiss !== 'function') node = node.parent
  if (!node) throw new Error('no layer with onDismiss')
  return node.props.onDismiss as () => void
}

describe('Sheet closing on the web, the focus it gives (U2)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', { value: fakeDocument(), configurable: true })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('hides from the focus traps of the closing layers the focus it gave to the chosen place', async () => {
    await renderWithProviders(<Page />)
    const onDismiss = fadeEnd()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))

    // Pendant le fondu : le focus posé sur le résultat n'atteint pas les pièges.
    expect(focusOn(result).stopImmediatePropagation).toHaveBeenCalled()
    // Témoin : un autre focus (dans la fenêtre qui se ferme) passe, rien n'est arrêté.
    expect(focusOn(cancelOfDialog).stopImmediatePropagation).not.toHaveBeenCalled()

    // Le fondu fini, la feuille n'écoute plus.
    await act(async () => onDismiss())
    expect(focusOn(result).stopImmediatePropagation).not.toHaveBeenCalled()
  })

  it('stops nothing while it is open (witness)', async () => {
    await renderWithProviders(<Page />)

    expect(focusOn(result).stopImmediatePropagation).not.toHaveBeenCalled()
  })
})
