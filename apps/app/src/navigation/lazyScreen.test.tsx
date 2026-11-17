// Tests des écrans chargés à la demande (tranche R13, « Le premier chargement » : « les écrans rares
// et lourds se chargent quand on les ouvre, pas avec l'accueil » ; relecture du plan, décisions 2
// et 3).
//
// `lazyScreen(load)` (navigation/lazyScreen.tsx) enveloppe l'écran d'une route lourde (modération,
// éditeur de projet, réglages, coin des testeurs) : `load` rend l'écran par un `import()`, que la
// construction du site range dans un morceau à part.
// - Au pré-rendu et à l'hydratation, la page de chargement (`LoadingScreen`) : un `React.lazy` posé
//   là laisserait dans le HTML une frontière en suspens (`<!--$!-->`), que React refait au client
//   (erreur 419) ; l'écran ne se charge qu'une fois la page hydratée (`useHydrated()`).
// - Un morceau introuvable (un onglet ouvert avant un déploiement demande l'ancien) : sur le web,
//   la page se recharge, une seule fois par adresse (le sessionStorage s'en souvient) ; ensuite, et
//   toujours sur téléphone, l'erreur va à l'écran de secours de la route (« Réessayer »).
//
// Ici, la page de chargement et l'écran sont de simples balises, que react-dom/server sait écrire.
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { Component, createElement, type ReactElement, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { lazyScreen } from './lazyScreen'

// react-dom/server fabrique le HTML d'une page, comme la construction du site web. Ses types ne sont
// pas installés : le « as » décrit seulement la fonction dont on se sert.
const { renderToString } = require('react-dom/server') as {
  renderToString: (element: ReactElement) => string
}

// La page de chargement, réduite à une balise qu'on retrouve au serveur comme au client.
jest.mock('../screens/states', () => {
  const { createElement: create } = require('react')
  return { LoadingScreen: () => create('progress', { 'aria-label': 'loading-screen' }) }
})

// L'hydratation de la page web, tenue par le test : fausse jusqu'à `hydrate()` (le vrai module la
// croit faite d'emblée, Jest se chargeant comme un téléphone) ; fausse au serveur, toujours.
let mockHydrated = false
const mockListeners = new Set<() => void>()
jest.mock('../ui/theme/hydration', () => {
  const { useSyncExternalStore } = require('react')
  const { Platform: platform } = require('react-native')
  return {
    ...jest.requireActual('../ui/theme/hydration'),
    useHydrated: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockListeners.add(listener)
          return () => mockListeners.delete(listener)
        },
        () => mockHydrated || platform.OS !== 'web',
        () => platform.OS !== 'web',
      ),
  }
})
const hydrate = async () => {
  mockHydrated = true
  await act(async () => {
    for (const listener of mockListeners) listener()
  })
}

/** L'écran lourd, réduit à une balise. */
const HeavyScreen = () => createElement('article', { 'aria-label': 'heavy-screen' })

/** Les balises rendues d'un type donné (`progress`, `article`), en parcourant l'arbre. */
type Node = { type: unknown; children: (Node | string)[] }
const count = (type: string): number => {
  let found = 0
  const visit = (node: Node | string) => {
    if (typeof node === 'string') return
    if (node.type === type) found++
    for (const child of node.children) visit(child)
  }
  visit(screen.root as unknown as Node)
  return found
}

/** L'écran de secours de la route (celui d'Expo Router, `ErrorBoundary`), réduit à une balise. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed
      ? createElement('aside', { 'aria-label': 'retry' })
      : this.props.children
  }
}

/** Un faux sessionStorage, vide au départ, et une fausse adresse dont on note les rechargements. */
const lendBrowser = (pathname: string) => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
  const reload = jest.fn()
  const location = { pathname, href: `https://waiggle.test${pathname}`, reload }
  const page = globalThis as Record<string, unknown>
  const before = { location: page.location, sessionStorage: page.sessionStorage }
  page.location = location
  page.sessionStorage = storage
  const window = page.window as Record<string, unknown> | undefined
  if (window && window !== page) {
    window.location = location
    window.sessionStorage = storage
  }
  return {
    reload,
    restore: () => {
      page.location = before.location
      page.sessionStorage = before.sessionStorage
    },
  }
}

beforeEach(() => {
  mockHydrated = false
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('a screen loaded on demand', () => {
  it('renders the loading screen on the server and at hydration, without leaving a boundary to the client', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const load = jest.fn(async () => HeavyScreen)
    const Route = lazyScreen(load)

    // Au serveur (le pré-rendu) : la page de chargement, sans frontière en suspens.
    const html = renderToString(createElement(Route))
    expect(html).toContain('loading-screen')
    expect(html).not.toContain('<!--$!-->')
    expect(html).not.toContain('<!--$?-->')
    expect(html).not.toContain('heavy-screen')

    // Au client, à l'hydratation : la même page de chargement, rien de plus.
    await render(createElement(Route))
    expect(count('progress')).toBe(1)
    expect(count('article')).toBe(0)

    // Une fois la page hydratée : l'écran, chargé à ce moment-là.
    await hydrate()
    await waitFor(() => expect(count('article')).toBe(1))
    expect(count('progress')).toBe(0)
    expect(load).toHaveBeenCalled()
  })

  it('reloads the page once when a screen chunk fails to load on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    mockHydrated = true
    const browser = lendBrowser('/settings')
    try {
      const failing = () => Promise.reject(new Error('Loading chunk 12 failed'))

      // Le morceau manque : la page se recharge, et garde la page de chargement en attendant.
      const first = await render(createElement(Boundary, null, createElement(lazyScreen(failing))))
      await waitFor(() => expect(browser.reload).toHaveBeenCalledTimes(1))
      expect(count('progress')).toBe(1)
      await first.unmount()

      // Rechargée, la page manque encore le morceau (un vrai défaut) : plus de rechargement, l'écran
      // de secours de la route, avec « Réessayer ».
      await render(createElement(Boundary, null, createElement(lazyScreen(failing))))
      await waitFor(() => expect(count('aside')).toBe(1))
      expect(browser.reload).toHaveBeenCalledTimes(1)
    } finally {
      browser.restore()
    }
  })

  it('leaves a failed chunk to the error screen on a phone, without reloading', async () => {
    const browser = lendBrowser('/settings')
    try {
      const failing = () => Promise.reject(new Error('Loading chunk 12 failed'))

      await render(createElement(Boundary, null, createElement(lazyScreen(failing))))

      await waitFor(() => expect(count('aside')).toBe(1))
      expect(browser.reload).not.toHaveBeenCalled()
    } finally {
      browser.restore()
    }
  })
})
