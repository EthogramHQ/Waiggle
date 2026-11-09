// Le focus d'ouverture d'une fenêtre ouverte par-dessus une feuille (R6a, correction C9, N1 de la
// contre-visite du design) : sur le web, le piège à focus de la feuille pouvait reprendre le focus
// posé sur « Annuler » pendant le fondu d'ouverture ; puis celui de la fenêtre, devenu actif,
// l'envoyait sur son premier bouton (« Supprimer »). La fenêtre :
// - s'inscrit dans la pile des couches ouvertes (`modalLayers`), pour que la feuille dessous lui
//   laisse son focus ;
// - repose le focus sur `initialFocusRef` quand son ouverture est finie (`onShow` du Modal).
import { act, screen } from '@testing-library/react-native'
import { useRef } from 'react'
import { Platform } from 'react-native'
import { labelOf } from '../testing/arrivedFocus'
import { renderWithProviders } from '../testing/render'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { type Focusable, focusWithoutScroll } from './focus'
import * as layers from './modalLayers'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

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
  return found as Host & { props: { onShow?: () => void } }
}

function Confirm({ visible }: { visible: boolean }) {
  const cancelRef = useRef<Focusable>(null)
  return (
    <Dialog
      visible={visible}
      title="Supprimer « Mon agent » ?"
      message="C’est définitif."
      onDismiss={() => {}}
      initialFocusRef={cancelRef}
    >
      <Button label="Supprimer" variant="danger" onPress={() => {}} />
      <Button ref={cancelRef} label="Annuler" variant="secondary" onPress={() => {}} />
    </Dialog>
  )
}

describe('Dialog opened above another layer (web, N1)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    jest.mocked(focusWithoutScroll).mockClear()
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sets the focus again on its expected button once its opening is over', async () => {
    await renderWithProviders(<Confirm visible />)
    // Le premier focus, posé à l'image qui suit le montage (`FocusOnShow`), est passé.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    jest.mocked(focusWithoutScroll).mockClear()

    // Le fondu d'ouverture est fini : le Modal appelle `onShow`.
    await act(() => layer().props.onShow?.())

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => labelOf(call[0]))
    expect(focused).toEqual(['Annuler'])
  })

  it('enters the stack of open layers while visible, and leaves it when hidden', async () => {
    const closeLayer = jest.fn()
    const open = jest.spyOn(layers, 'openModalLayer').mockReturnValue(closeLayer)
    const view = await renderWithProviders(<Confirm visible={false} />)
    // Le témoin : fermée, la fenêtre n'est pas une couche ouverte.
    expect(open).not.toHaveBeenCalled()

    await view.rerender(<Confirm visible />)
    expect(open).toHaveBeenCalledTimes(1)
    expect(closeLayer).not.toHaveBeenCalled()

    await view.rerender(<Confirm visible={false} />)
    expect(closeLayer).toHaveBeenCalledTimes(1)
  })
})
