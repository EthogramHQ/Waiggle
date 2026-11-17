// Tests des mesures de mise en page (tranche R15, « L'ordinateur en grand », docs/scenarios/refonte.md) :
// - `wideContentWidth(fenêtre)`, une fonction pure : la largeur du contenu d'un écran de cartes
//   (gabarit large). Des marges de 32 points jusqu'à 1 536, puis 5 % de la fenêtre de chaque côté,
//   jamais plus de 1 920 ; sous 1 280, la largeur d'une page ordinaire (« rien ne change »), et 0
//   pour une fenêtre de 0 (la page pré-rendue, avant l'hydratation : jamais une largeur négative) ;
// - `columnsFor(largeur, minimum, écart)`, une fonction pure : combien de cartes de `minimum` points
//   au moins tiennent côte à côte dans `largeur`, séparées par `écart` ; toujours une au moins ;
// - `useLayout().columns` : la colonne principale et le panneau de côté (`layout.sidePanel`)
//   tiennent-ils côte à côte ?
// - `useContentWidth()`, hors de tout écran : la largeur d'une page ordinaire dans la fenêtre.
//
// Une fonction pure (même entrée, même sortie, rien d'autre) se teste sans rien dessiner : les
// attendus sont écrits en clair, largeur par largeur.
import { layout, space } from '@ruche/brand'
import { act, renderHook } from '@testing-library/react-native'
import { Dimensions } from 'react-native'
import { columnsFor, useContentWidth, useLayout, wideContentWidth } from './layout'

// La fenêtre de Jest (un téléphone), rendue après chaque test qui la change.
const initialWindow = Dimensions.get('window')
const setWindow = (width: number, height = 900) => {
  const size = { ...initialWindow, width, height }
  Dimensions.set({ window: size, screen: size })
}
afterEach(async () => {
  await act(async () => Dimensions.set({ window: initialWindow, screen: initialWindow }))
})

describe('wideContentWidth, the content of a wide screen', () => {
  // Les valeurs du plan : 32 points de marge jusqu'à 1 536, puis 90 % de la fenêtre, plafonnés.
  it('keeps 32-point margins up to 1 536, then 5 % of the window, and never goes past 1 920', () => {
    expect(wideContentWidth(1280)).toBe(1216)
    expect(wideContentWidth(1440)).toBe(1376)
    expect(wideContentWidth(1536)).toBe(1472)
    expect(wideContentWidth(1920)).toBe(1728)
    expect(wideContentWidth(2560)).toBe(1920)
    expect(wideContentWidth(3840)).toBe(layout.maxWideWidth)
  })

  // Relecture du plan, C1 : sous 1 280, la largeur d'une page ordinaire (la marge de la famille de
  // taille, sans dépasser 1 280) ; avant l'hydratation, la fenêtre vaut 0, et le contenu aussi.
  it('wideContentWidth equals the page width below 1 280', () => {
    expect(wideContentWidth(0)).toBe(0)
    expect(wideContentWidth(320)).toBe(288)
    expect(wideContentWidth(390)).toBe(358)
    expect(wideContentWidth(1024)).toBe(976)
    expect(wideContentWidth(1100)).toBe(1036)
    expect(wideContentWidth(1279)).toBe(1215)
  })

  it('is never negative, even for a window narrower than its margins', () => {
    for (const width of [0, 1, 10, 31, 32]) {
      expect(wideContentWidth(width)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('columnsFor, how many cards fit side by side', () => {
  it('adds a column as soon as one more card fits at its minimum width', () => {
    // Une carte de 320 au moins, 16 points entre deux : 2 dès 656 (320 + 16 + 320), 3 dès 992.
    expect(columnsFor(320, 320, 16)).toBe(1)
    expect(columnsFor(655, 320, 16)).toBe(1)
    expect(columnsFor(656, 320, 16)).toBe(2)
    expect(columnsFor(991, 320, 16)).toBe(2)
    expect(columnsFor(992, 320, 16)).toBe(3)
  })

  // Le Fil sur ordinateur : la colonne principale, à côté du panneau de 340 et de l'écart de 24,
  // des cartes de 16 points d'écart. Les minimums des cartes (décision du 17/11, après la relecture
  // du plan) : 320 (`cardMin.feed`), 420 à partir de 1 536 (`cardMin.feedWide`). À 1 100,
  // 1 036 − 340 − 24 = 672 points ; à 1 440, 1 376 − 364 = 1 012 ; à 1 920, 1 728 − 364 = 1 364.
  it('counts two columns of feed cards at 1 100, three at 1 440 and three at 1 920', () => {
    expect(columnsFor(672, 320, 16)).toBe(2)
    expect(columnsFor(1012, 320, 16)).toBe(3)
    expect(columnsFor(1364, 420, 16)).toBe(3)
  })

  // Une étiquette : tout le contenu large pour ses tuiles de 280 points au moins (`cardMin.tile`),
  // 12 points d'écart. À 1 280, 1 216 points : quatre tuiles ; à 1 920, 1 728 points : cinq.
  it('counts four tiles of a tag page at 1 280 and five at 1 920', () => {
    expect(columnsFor(1216, 280, 12)).toBe(4)
    expect(columnsFor(1728, 280, 12)).toBe(5)
  })

  // Relecture du plan, C2 : une grille qui reçoit 0 colonne coupe ses cartes par paquets de 0, et sa
  // boucle ne finit plus (la page se fige avant l'hydratation, où la largeur vaut 0).
  it('columnsFor gives at least one column, even at width 0', () => {
    expect(columnsFor(0, 320, 16)).toBe(1)
    expect(columnsFor(100, 320, 16)).toBe(1)
    expect(columnsFor(-50, 320, 16)).toBe(1)
    expect(columnsFor(Number.NaN, 320, 16)).toBe(1)
  })

  it('always gives a whole number', () => {
    for (const width of [500, 777, 1012, 1364, 1728]) {
      expect(Number.isInteger(columnsFor(width, 320, 16))).toBe(true)
    }
  })
})

describe('useLayout, two columns', () => {
  // Relecture du plan, C4 : la colonne de côté du gabarit large est le panneau (340), plus la
  // colonne de 320 d'avant. Deux colonnes seulement quand la principale (560), le panneau et leur
  // écart tiennent entre les marges de l'écran : sinon le panneau passerait sous un Fil sans fin.
  const fits = layout.mainColumn + layout.sidePanel + space.xxl + 2 * layout.screenPadding.medium

  it('useLayout says two columns only when the panel fits', async () => {
    setWindow(fits - 1)
    const { result } = await renderHook(() => useLayout())

    expect(result.current.width).toBe(fits - 1) // témoin : la fenêtre est bien celle-là
    expect(result.current.columns).toBe(false)
  })

  it('says two columns once the panel fits', async () => {
    setWindow(fits)
    const { result } = await renderHook(() => useLayout())

    expect(result.current.columns).toBe(true)
  })
})

describe('useContentWidth, outside of any screen', () => {
  // Hors d'un Screen (le catalogue, le test d'un composant seul) : la largeur d'une page ordinaire,
  // celle que les grilles comptaient jusqu'ici.
  it('gives the width of an ordinary page in a computer window', async () => {
    setWindow(1440)
    const { result } = await renderHook(() => useContentWidth())

    expect(result.current).toBe(layout.maxContentWidth)
  })

  it('gives the width of a phone page, inside its margins', async () => {
    setWindow(390)
    const { result } = await renderHook(() => useContentWidth())

    expect(result.current).toBe(390 - 2 * layout.screenPadding.compact)
  })
})
