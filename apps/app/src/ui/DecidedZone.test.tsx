// Tests de la zone des décisions des cartes d'administration (tranche R6b) : le résultat prend la
// place des boutons sans rien faire remonter (au moins leur hauteur), et reçoit le focus du clavier
// seulement quand celui-ci est tombé avec le bouton touché.
import { layout } from '@ruche/brand'
import { fireEvent, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { DecidedZone } from './DecidedZone'
import { focusWithoutScroll } from './focus'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// Le focus se pose par focusWithoutScroll : on le remplace pour savoir s'il a été appelé.
jest.mock('./focus', () => ({ ...jest.requireActual('./focus'), focusWithoutScroll: jest.fn() }))

const RESULT = 'Ajouté au catalogue.'
const ACTIONS = 'Les boutons'

/** La hauteur minimale posée sur le premier ancêtre du résultat qui en a une. */
const heldHeight = () => {
  let node = screen.getByText(RESULT).parent
  while (node) {
    const style = [node.props.style].flat() as { minHeight?: number }[]
    const held = style.find((part) => part?.minHeight !== undefined)?.minHeight
    if (held !== undefined) return held
    node = node.parent
  }
  return undefined
}

const zone = (result: string | null) => (
  <DecidedZone result={result} actions={<Text>{ACTIONS}</Text>} />
)

/** Une page web prêtée : `document.activeElement` vaut `active` (la page entière par défaut). */
const lendDocument = (active?: unknown) => {
  const body = {}
  const page = { body, activeElement: active ?? body }
  Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
  return () => {
    Reflect.deleteProperty(globalThis, 'document')
  }
}

beforeEach(() => jest.mocked(focusWithoutScroll).mockClear())

describe('DecidedZone', () => {
  it('keeps at least the height its buttons had once decided', async () => {
    const view = await renderWithProviders(zone(null))
    // Les boutons tenaient sur trois lignes (téléphone, texte agrandi) : 132 points.
    await fireEvent(screen.getByText(ACTIONS), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 132 } },
    })

    await view.rerender(zone(RESULT))

    expect(screen.queryByText(ACTIONS)).toBeNull()
    expect(heldHeight()).toBe(132)
  })

  it('never holds less than a touch target', async () => {
    await renderWithProviders(zone(RESULT))

    expect(heldHeight()).toBe(layout.touchTarget)
  })

  it('gives the focus to the result when it fell with the pressed button', async () => {
    const restore = lendDocument()
    try {
      const view = await renderWithProviders(zone(null))
      await view.rerender(zone(RESULT))

      expect(focusWithoutScroll).toHaveBeenCalledTimes(1)
      expect(jest.mocked(focusWithoutScroll).mock.calls[0]?.[0]).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('leaves the focus where it is when it is elsewhere (a sheet still open)', async () => {
    const restore = lendDocument({ inSheet: true })
    try {
      const view = await renderWithProviders(zone(null))
      await view.rerender(zone(RESULT))

      expect(screen.getByText(RESULT)).toBeTruthy() // témoin
      expect(focusWithoutScroll).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('does not take the focus for a card already decided when the page opens', async () => {
    const restore = lendDocument()
    try {
      await renderWithProviders(zone(RESULT))

      expect(screen.getByText(RESULT)).toBeTruthy() // témoin
      expect(focusWithoutScroll).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })
})
