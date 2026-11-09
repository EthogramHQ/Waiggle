// Tests de backRelay (navigation/backRelay.ts) : le relais du Retour du navigateur passe avant
// Expo Router. Chromium appelle les écouteurs de `popstate` dans l'ordre de pose : l'ordre vient de
// celui des imports de `index.ts`, le point d'entrée. Un test lit donc ce fichier : le relais doit
// y être importé avant `expo-router/entry`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('the app entry point', () => {
  it('loads the back relay before Expo Router', () => {
    const entry = readFileSync(join(__dirname, '..', '..', 'index.ts'), 'utf8')
    const imports = [...entry.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    const relay = imports.indexOf('./src/navigation/backRelay')
    const router = imports.indexOf('expo-router/entry')
    expect(relay).toBeGreaterThanOrEqual(0)
    expect(router).toBeGreaterThanOrEqual(0)
    expect(relay).toBeLessThan(router)
  })
})

describe('backRelay', () => {
  it('listens to popstate once, at capture, as soon as it is loaded on the web', () => {
    const addEventListener = jest.fn()
    const original = (globalThis as { window?: unknown }).window
    Object.defineProperty(globalThis, 'window', {
      value: { addEventListener, removeEventListener: jest.fn() },
      configurable: true,
      writable: true,
    })
    try {
      jest.isolateModules(() => {
        jest.replaceProperty(require('react-native').Platform, 'OS', 'web')
        require('./backRelay')
      })
      expect(addEventListener).toHaveBeenCalledTimes(1)
      expect(addEventListener.mock.calls[0]?.[0]).toBe('popstate')
      expect(addEventListener.mock.calls[0]?.[2]).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'window', {
        value: original,
        configurable: true,
        writable: true,
      })
      jest.restoreAllMocks()
    }
  })
})
