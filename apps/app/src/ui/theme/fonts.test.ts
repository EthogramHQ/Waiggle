// Tests du chargement des polices sur le web (tranche R13, « Le premier chargement » ; plan,
// décision 3 ; relecture du plan, décision 4).
// - Le texte s'affiche dès la première image, dans une police du système, puis dans celle de la
//   marque quand elle arrive : chaque police est déclarée en `font-display: swap` (`{ uri, display }`
//   dans `fontFiles`, lu par expo-font sur le web).
// - Geist Mono (la chasse fixe, ~200 Ko) n'est ni déclarée ni préchargée dans la page pré-rendue :
//   elle se charge après l'hydratation, par un second chargement réservé au web.
//
// `useAppFonts()` (fonts.ts) charge les polices de l'appli et dit si celles du lancement sont prêtes
// (app/_layout.tsx s'en sert). expo-font est remplacé ici : on note les polices demandées, par nom.
import { act, renderHook } from '@testing-library/react-native'
import { FontDisplay } from 'expo-font'
import { Platform } from 'react-native'
import { fontFiles, useAppFonts } from './fonts'

// Les noms des polices demandées à expo-font, par `useFonts` ou par `loadAsync`, dans l'ordre.
const mockRequested: string[][] = []
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: (map: Record<string, unknown> | string | string[]) => {
    mockRequested.push(typeof map === 'object' && !Array.isArray(map) ? Object.keys(map) : [])
    return [false, null]
  },
  loadAsync: (map: Record<string, unknown> | string) => {
    mockRequested.push(typeof map === 'object' ? Object.keys(map) : [map])
    return new Promise(() => {})
  },
}))

// L'hydratation de la page web, tenue par le test : fausse jusqu'à `hydrate()` sur le web, vraie
// d'emblée sur téléphone, comme le vrai module (qui, lui, lit la plateforme une fois pour toutes au
// chargement : Jest se charge comme un téléphone).
let mockHydrated = false
const mockListeners = new Set<() => void>()
jest.mock('./hydration', () => {
  const { useSyncExternalStore } = require('react')
  const { Platform: platform } = require('react-native')
  return {
    ...jest.requireActual('./hydration'),
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

const FUNNEL = Object.keys(fontFiles).filter((name) => name.startsWith('Funnel'))
const GEIST = Object.keys(fontFiles).filter((name) => name.startsWith('GeistMono'))
const requested = () => new Set(mockRequested.flat())

beforeEach(() => {
  mockRequested.length = 0
  mockHydrated = false
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('the fonts of the app', () => {
  it('declares every font in font-display swap, so the text shows at once in a system font', () => {
    expect(Object.keys(fontFiles)).toHaveLength(8) // témoin : les huit polices, mêmes clés
    for (const source of Object.values(fontFiles)) {
      expect(source).toMatchObject({ display: FontDisplay.SWAP })
      expect((source as { uri?: unknown }).uri).toBeDefined()
    }
  })

  it('loads Geist Mono only after hydration on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    expect(FUNNEL).toHaveLength(6) // témoin
    expect(GEIST).toHaveLength(2) // témoin
    await renderHook(() => useAppFonts())

    // Le premier rendu (celui du pré-rendu, puis de l'hydratation) : les six Funnel, sans Geist Mono.
    expect([...requested()].sort()).toEqual([...FUNNEL].sort())

    await hydrate()

    for (const name of GEIST) expect(requested()).toContain(name)
  })

  it('loads every font from the start on a phone, where nothing is pre-rendered', async () => {
    await renderHook(() => useAppFonts())

    expect([...requested()].sort()).toEqual(Object.keys(fontFiles).sort())
  })
})
