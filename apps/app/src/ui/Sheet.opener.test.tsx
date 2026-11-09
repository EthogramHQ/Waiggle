// Le focus rendu à l'ouvreur d'une feuille (R6a, correction C1, design-C1) : sur téléphone, le « + »
// de la barre d'onglets est redessiné pendant que la feuille est ouverte. L'élément retenu à
// l'ouverture n'est plus dans la page à la fermeture : la feuille rend le focus à l'élément de même
// nom qui est maintenant là, au lieu de le laisser sur `body`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Un faux document du navigateur : l'élément actif et les éléments qu'une recherche rend. */
const fakeDocument = (activeElement: object, found: object[]): object => {
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
  return node({ activeElement, querySelectorAll: () => found })
}

const Page = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Text onPress={() => setOpen(true)}>Ouvrir</Text>
      <Sheet open={open} title="Publier" onClose={() => setOpen(false)}>
        <Text>Contenu</Text>
      </Sheet>
    </>
  )
}

const named = (name: string, extra: Record<string, unknown>) => ({
  focus: jest.fn(),
  getAttribute: (attribute: string) => (attribute === 'aria-label' ? name : null),
  ...extra,
})

describe('Sheet, the focus given back to a redrawn opener', () => {
  const close = fr.t(($) => $.common.close)
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    jest.mocked(focusWithoutScroll).mockClear()
  })
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('finds the element of the same name when the one it remembered left the page', async () => {
    const gone = named('Publier', { isConnected: false })
    const redrawn = named('Publier', { isConnected: true, getClientRects: () => [{}] })
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(gone, [named('Autre', { getClientRects: () => [{}] }), redrawn]),
      configurable: true,
    })
    await renderWithProviders(<Page />)
    await fireEvent.press(screen.getByText('Ouvrir'))
    jest.mocked(focusWithoutScroll).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: close }))

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
    expect(focused).toContain(redrawn)
    expect(focused).not.toContain(gone)
  })

  // Une feuille de téléphone à adresse disparaît avec sa page, encore ouverte : le focus est sur
  // `body`, et la barre redessinée est retrouvée un instant après (design-C1, mesuré à 390 px).
  it('gives the focus back after the sheet unmounted still open, once the page is back', async () => {
    jest.useFakeTimers()
    try {
      const gone = named('Publier', { isConnected: false })
      const redrawn = named('Publier', { isConnected: true, getClientRects: () => [{}] })
      const found: object[] = []
      const doc = fakeDocument(gone, found) as { activeElement: unknown; body: unknown }
      Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
      const view = await renderWithProviders(
        <Sheet open title="Publier" onClose={() => {}}>
          <Text>Contenu</Text>
        </Sheet>,
      )
      jest.mocked(focusWithoutScroll).mockClear()

      await view.unmount()
      doc.activeElement = doc.body
      // La barre n'est pas encore revenue : rien à focaliser, on attend.
      await act(() => jest.advanceTimersByTimeAsync(100))
      expect(jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])).not.toContain(
        redrawn,
      )
      found.push(redrawn)
      await act(() => jest.advanceTimersByTimeAsync(100))

      expect(jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])).toContain(redrawn)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the remembered element when it is still in the page', async () => {
    const here = named('Publier', { isConnected: true })
    const twin = named('Publier', { isConnected: true, getClientRects: () => [{}] })
    Object.defineProperty(globalThis, 'document', {
      value: fakeDocument(here, [twin]),
      configurable: true,
    })
    await renderWithProviders(<Page />)
    await fireEvent.press(screen.getByText('Ouvrir'))
    jest.mocked(focusWithoutScroll).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: close }))

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
    expect(focused).toContain(here)
    expect(focused).not.toContain(twin)
  })
})
