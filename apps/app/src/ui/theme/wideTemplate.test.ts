// Tests du seuil du gabarit large des pages de résultats (tranche R16, « Ruches, Recherche et Outils
// en grand ») : la Recherche passe en grand dès 1 280 points de fenêtre, et reste la colonne
// d'aujourd'hui en dessous (« sous 1 280, rien ne change »).
import { act, renderHook } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { useWideTemplate } from './wideTemplate'

// La fenêtre de Jest (un téléphone), rendue après chaque test qui la change.
const initialWindow = Dimensions.get('window')
const setWindow = (width: number) => {
  const size = { ...initialWindow, width, height: 900 }
  Dimensions.set({ window: size, screen: size })
}
afterEach(async () => {
  await act(async () => Dimensions.set({ window: initialWindow, screen: initialWindow }))
})

describe('useWideTemplate', () => {
  it.each([
    [390, false],
    [1100, false],
    [1279, false],
    [1280, true],
    [1440, true],
    [1920, true],
  ])('at a %i-point window, says %s', async (width, wide) => {
    setWindow(width)
    const { result } = await renderHook(() => useWideTemplate())
    expect(result.current).toBe(wide)
  })
})
