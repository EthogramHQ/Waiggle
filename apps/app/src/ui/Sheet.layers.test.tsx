// Le focus d'une feuille face aux couches qui l'entourent (R6a, correction C9, contre-visite du design) :
// - N1 : une fenêtre ouverte par-dessus la feuille (« Supprimer ce projet ? ») pose son focus sur
//   « Annuler » pendant son fondu d'ouverture. Le piège à focus du Modal de la feuille, encore actif,
//   le reprenait ; la feuille lui cache donc ce focus-là (écoute à la descente sur `window`, avant
//   les pièges posés sur le document) tant que la couche du dessus n'est pas active ;
// - S2 : une feuille ouverte par son adresse n'a pas d'ouvreur (le focus était sur la page). À sa
//   fermeture, le focus va au titre principal de la page qui reste, au lieu de rester sur `body`.
//
// Jest n'a pas de navigateur : on prête à la page le peu que la feuille en lit (l'élément actif, la
// recherche d'éléments, les écouteurs de `window`) et on espionne `focusWithoutScroll`.
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Platform } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { fr } from '../testing/text'
import { focusWithoutScroll } from './focus'
import { openModalLayer } from './modalLayers'
import { Sheet } from './Sheet'
import { Text } from './Text'

jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
jest.mock('./focus', () => ({
  ...jest.requireActual('./focus'),
  focusWithoutScroll: jest.fn(() => true),
}))

/** Un faux document : l'élément actif, ce qu'une recherche rend ; toute autre propriété existe. */
const fakeDocument = (found: object[]): { activeElement: unknown; body: unknown } => {
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
  const page = node({ activeElement: null, querySelectorAll: () => found }) as {
    activeElement: unknown
    body: unknown
  }
  // Ouverte par son adresse : personne ne l'a ouverte d'un bouton, le focus est sur la page.
  page.activeElement = page.body
  return page
}

/** Le titre principal d'une page : visible, hors de toute couche. */
const pageTitle = () => ({
  tagName: 'H1',
  focus: jest.fn(),
  getClientRects: () => [{}],
  closest: () => null,
  setAttribute: jest.fn(),
})

type FocusEvent = {
  target: unknown
  stopImmediatePropagation: jest.Mock
  stopPropagation: jest.Mock
}
type Listener = (event: FocusEvent) => void

// Les écouteurs posés sur `window` (ici `globalThis`), par type, à la descente seulement. Prêtés
// pour tout le fichier : React Query s'y abonne aussi, et se désabonne après chaque test, quand
// RNTL démonte (après nos `afterEach`).
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

/** Rend de quoi envoyer un focus posé sur `target` aux écouteurs de `window`. */
const lendWindowListeners = () => {
  return (target: unknown): FocusEvent => {
    const event = { target, stopImmediatePropagation: jest.fn(), stopPropagation: jest.fn() }
    for (const listener of captured.get('focus') ?? []) listener(event)
    return event
  }
}

/**
 * Une couche posée dans `<body>` (la place d'un Modal) : sa boîte (`aria-modal`), dont `role` vaut
 * `dialog` une fois active, et, à côté de la boîte, une borne du piège à focus (où Tab arrive en
 * sortant du dernier bouton). Rend un élément de la boîte et la borne.
 */
const layerOf = (role: string | null) => {
  const body = (globalThis as { document?: { body?: unknown } }).document?.body
  const root = {
    parentElement: body,
    querySelector: (selector: string) =>
      selector.includes('aria-modal')
        ? { getAttribute: (name: string) => (name === 'role' ? role : null) }
        : null,
  }
  return { inBox: { parentElement: root }, bracket: { parentElement: root } }
}
const elementOfLayer = (role: string | null) => layerOf(role).inBox

const Page = () => {
  const [open, setOpen] = useState(true)
  return (
    <Sheet open={open} title="Publier" onClose={() => setOpen(false)}>
      <Text>Contenu</Text>
    </Sheet>
  )
}

describe('Sheet, the focus of a layer opened above it (web, N1)', () => {
  let closeLayer: (() => void) | null = null
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'document', { value: fakeDocument([]), configurable: true })
  })
  afterEach(() => {
    closeLayer?.()
    closeLayer = null
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('hides from its own focus trap a focus set in the window opening above it', async () => {
    const focusOn = lendWindowListeners()
    await renderWithProviders(<Page />)
    const cancel = elementOfLayer(null) // le fondu d'ouverture n'est pas fini : pas encore active
    closeLayer = openModalLayer('above', (node) => node === cancel)

    const event = focusOn(cancel)

    expect(event.stopImmediatePropagation).toHaveBeenCalled()
  })

  it('lets the other focus moves reach the traps (witness)', async () => {
    const focusOn = lendWindowListeners()
    await renderWithProviders(<Page />)
    const cancel = elementOfLayer(null)
    closeLayer = openModalLayer('above', (node) => node === cancel)
    // Le témoin : la feuille écoute bien, et arrête le focus de la couche du dessus.
    expect(focusOn(cancel).stopImmediatePropagation).toHaveBeenCalled()

    // Un élément hors de la couche du dessus (la feuille elle-même, la page) : rien n'est arrêté.
    expect(focusOn(elementOfLayer(null)).stopImmediatePropagation).not.toHaveBeenCalled()
  })

  it('no longer stops anything once the layer above is active (its own trap then decides)', async () => {
    const focusOn = lendWindowListeners()
    await renderWithProviders(<Page />)
    const cancel = elementOfLayer('dialog')
    closeLayer = openModalLayer('above', (node) => node === cancel)

    expect(focusOn(cancel).stopImmediatePropagation).not.toHaveBeenCalled()
  })

  // Mesuré dans le navigateur après la première version de C9 : Tab, depuis le dernier bouton de la
  // fenêtre active, arrivait sur la borne du piège, à côté de sa boîte ; lue comme « encore
  // inactive », elle était arrêtée, et Tab ne bouclait plus (Annuler → borne → page).
  it('lets Tab reach the trap bounds of the active layer above, beside its box', async () => {
    const focusOn = lendWindowListeners()
    await renderWithProviders(<Page />)
    const active = layerOf('dialog')
    closeLayer = openModalLayer('above', (node) => node === active.inBox || node === active.bracket)

    expect(focusOn(active.bracket).stopImmediatePropagation).not.toHaveBeenCalled()
  })

  it('stops listening once closed', async () => {
    const focusOn = lendWindowListeners()
    await renderWithProviders(<Page />)
    const cancel = elementOfLayer(null)
    closeLayer = openModalLayer('above', (node) => node === cancel)

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))

    expect(focusOn(cancel).stopImmediatePropagation).not.toHaveBeenCalled()
  })
})

describe('Sheet opened by its address, then closed (web, S2)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web')
    jest.mocked(focusWithoutScroll).mockClear()
  })
  afterEach(() => {
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'document')
  })

  it('gives the focus to the title of the page that remains, not to the page itself', async () => {
    const title = pageTitle()
    const page = fakeDocument([title])
    Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
    await renderWithProviders(<Page />)
    jest.mocked(focusWithoutScroll).mockClear()

    await fireEvent.press(screen.getByRole('button', { name: fr.t(($) => $.common.close) }))

    const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
    expect(focused).toContain(title)
    expect(focused).not.toContain(page.body)
  })

  it('does the same when the sheet leaves with its page, still open (phone)', async () => {
    jest.useFakeTimers()
    try {
      const found: object[] = []
      const page = fakeDocument(found)
      Object.defineProperty(globalThis, 'document', { value: page, configurable: true })
      const view = await renderWithProviders(<Page />)
      jest.mocked(focusWithoutScroll).mockClear()

      await view.unmount()
      // La page d'avant n'est pas encore revenue : rien à focaliser, on attend.
      await act(() => jest.advanceTimersByTimeAsync(100))
      const title = pageTitle()
      found.push(title)
      await act(() => jest.advanceTimersByTimeAsync(100))

      const focused = jest.mocked(focusWithoutScroll).mock.calls.map((call) => call[0])
      expect(focused).toContain(title)
      expect(focused).not.toContain(page.body)
    } finally {
      jest.useRealTimers()
    }
  })
})
