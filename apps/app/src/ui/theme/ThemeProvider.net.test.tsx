// Test du filet du thème sur le web (tranche R13, « Le premier chargement » ; plan, décision 7) : si
// une page ne dit jamais qu'elle est hydratée, le thème pose quand même `data-hydrated` sur <html>,
// pour qu'elle ne reste pas cachée (documentCss, theme/document.ts). Passé de 3 à 10 secondes : à 3 s,
// un téléphone modeste voyait la page de jour en mode sombre (l'appli y démarrait à 8,5 s) ; le même
// délai que le filet en CSS seul.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render } from '@testing-library/react-native'
import { Platform, Text } from 'react-native'
import { ThemeProvider } from './ThemeProvider'

// La page ne dit jamais qu'elle est hydratée (le vrai module la croit hydratée d'emblée hors du web,
// Jest se chargeant comme un téléphone).
jest.mock('./hydration', () => ({
  ...jest.requireActual('./hydration'),
  useHydrated: () => false,
}))

/** Un faux <html> qui retient ses attributs : c'est tout ce que le thème y lit et y écrit. */
const fakeRoot = () => {
  const attributes = new Map<string, string>()
  return {
    attributes,
    style: { setProperty: jest.fn() } as Record<string, unknown>,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  }
}

let root: ReturnType<typeof fakeRoot>

beforeEach(async () => {
  await AsyncStorage.clear()
  jest.useFakeTimers()
  jest.replaceProperty(Platform, 'OS', 'web')
  root = fakeRoot()
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: root, body: { style: {} } },
  })
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
  Reflect.deleteProperty(globalThis, 'document')
})

describe('the safety net of the theme (web)', () => {
  it('shows a page that never says it is hydrated after 10 s, not before', async () => {
    await render(
      <ThemeProvider>
        <Text>page</Text>
      </ThemeProvider>,
    )
    expect(root.attributes.has('data-hydrated')).toBe(false)

    // À 3 s (l'ancien filet) et jusqu'à 10 s : toujours cachée, l'appli a encore le temps de démarrer.
    await act(async () => jest.advanceTimersByTime(9_999))
    expect(root.attributes.has('data-hydrated')).toBe(false)

    await act(async () => jest.advanceTimersByTime(1))
    expect(root.attributes.has('data-hydrated')).toBe(true)
  })
})
