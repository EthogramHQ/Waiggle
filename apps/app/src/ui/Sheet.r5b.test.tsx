// Tests ajoutés en R5b pour la feuille, à côté de ceux de Sheet.test.tsx :
// - sur le web, un champ de react-native-web arrête la touche enfoncée avant la feuille
//   (`stopPropagation`) : quand la liste des mentions s'y ferme sur Échap, la feuille ne voit que
//   la touche relâchée, par le Modal. Elle relit alors la touche enfoncée, écoutée sur le document,
//   et ne se ferme pas si quelqu'un l'a déjà prise (ui-B1) ;
// - sur téléphone, le champ attendu (`initialFocusRef`) reçoit le focus quand la feuille a paru
//   (`onShow` du Modal), pour que le clavier s'ouvre avec elle.
import { act, screen } from '@testing-library/react-native'
import { useRef } from 'react'
import { Platform, TextInput } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))

type Host = { props: Record<string, unknown>; children: ReadonlyArray<Host | string> }
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** La couche du Modal : l'élément qui reçoit onRequestClose (Échap relâchée, retour Android). */
const layer = () => {
  const found = hostsOf(screen.root as unknown as Host).find(
    (node) => typeof node.props.onRequestClose === 'function',
  )
  if (!found) throw new Error('no Modal layer')
  return found as Host & { props: { onRequestClose: () => void; onShow?: () => void } }
}

type Listener = (event: { key?: string; defaultPrevented?: boolean }) => void

/**
 * Un faux document : il garde les écouteurs posés à la descente (`capture`), et toute autre
 * propriété existe et ne fait rien (ThemeProvider écrit dans <html> et <body>).
 */
const fakeDocument = (captured: Map<string, Listener[]>): object => {
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
  return node({
    activeElement: null,
    addEventListener: (type: string, listener: Listener, capture?: boolean) => {
      if (capture === true) captured.set(type, [...(captured.get(type) ?? []), listener])
    },
    removeEventListener: (type: string, listener: Listener) => {
      captured.set(
        type,
        (captured.get(type) ?? []).filter((kept) => kept !== listener),
      )
    },
  })
}

describe('Escape released after a field kept it (web, R5b)', () => {
  const captured = new Map<string, Listener[]>()
  beforeEach(() => {
    captured.clear()
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(captured),
      configurable: true,
    })
  })
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  /** La touche enfoncée, vue par le document à la descente, puis gardée (ou non) par un champ. */
  const pressEscape = (keptByAField: boolean) => {
    const event = { key: 'Escape', defaultPrevented: false }
    for (const listener of captured.get('keydown') ?? []) listener(event)
    // Le champ la prend ensuite (la liste des mentions se ferme) : le navigateur le note.
    event.defaultPrevented = keptByAField
  }

  it('stays open when the Escape released was kept by a field inside it', async () => {
    const onClose = jest.fn()
    await renderWithProviders(
      <Sheet open title="Commentaires" onClose={onClose}>
        <Text>Super idée, je teste ce soir.</Text>
      </Sheet>,
    )

    pressEscape(true)
    await act(() => layer().props.onRequestClose())

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on an Escape released that nobody kept (témoin)', async () => {
    const onClose = jest.fn()
    await renderWithProviders(
      <Sheet open title="Commentaires" onClose={onClose}>
        <Text>Super idée, je teste ce soir.</Text>
      </Sheet>,
    )

    pressEscape(false)
    await act(() => layer().props.onRequestClose())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the next Escape once a kept one has been released', async () => {
    const onClose = jest.fn()
    await renderWithProviders(
      <Sheet open title="Commentaires" onClose={onClose}>
        <Text>Super idée, je teste ce soir.</Text>
      </Sheet>,
    )

    pressEscape(true)
    await act(() => layer().props.onRequestClose())
    // La liste est fermée : la seconde Échap est pour la feuille.
    pressEscape(false)
    await act(() => layer().props.onRequestClose())

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('the field expected at the opening, on a phone (R5b)', () => {
  function WriteSheet() {
    const field = useRef<TextInput>(null)
    return (
      <Sheet
        open
        title="Commentaires"
        initialFocusRef={field}
        onClose={() => {}}
        footer={<TextInput ref={field} accessibilityLabel="Écrire un commentaire" />}
      >
        <Text>Aucun commentaire pour l’instant.</Text>
      </Sheet>
    )
  }

  it('gives the focus to the expected field once the sheet has appeared', async () => {
    const focus = jest.spyOn(TextInput.prototype, 'focus')
    focus.mockClear()
    await renderWithProviders(<WriteSheet />)
    expect(focus).not.toHaveBeenCalled() // pas avant que la feuille ait paru

    await act(() => layer().props.onShow?.())

    expect(focus).toHaveBeenCalledTimes(1)
    const reached = focus.mock.contexts[0] as unknown as Host
    expect(reached.props.accessibilityLabel).toBe('Écrire un commentaire')
    focus.mockRestore()
  })
})
