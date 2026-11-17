// Tests de la mosaïque des projets d'un membre (tranche R14, docs/scenarios/refonte.md, « La
// mosaïque » et « Ce que la mosaïque devient selon la largeur ») : le plus récent en grande carte,
// les suivants en cartes compactes, sans case vide, dans l'ordre des projets.
//
// Deux pièces, testées chacune :
// - `mosaicRows(count, width)`, une fonction pure : le plan des rangées pour `count` projets dans
//   une page de `width` points. Une rangée est la liste des rangs des projets posés côte à côte
//   (`[3, 4, 5]`) ; le bloc d'en tête, la grande carte avec deux compactes empilées à côté, s'écrit
//   `{ lead: 0, beside: [1, 2] }`. Une fonction pure (même entrée, même sortie, rien d'autre) se
//   teste sans rien dessiner : on écrit les attendus en clair, largeur par largeur ;
// - `ProjectMosaic`, le composant qui suit ce plan : `items` (les projets, chacun avec un `id`) et
//   `render(item, size)`, qui dessine la carte d'un projet à la taille donnée (`'full'`, la grande ;
//   `'compact'`, la petite). La largeur vient de `useLayout()` : la mise en page de téléphone tant
//   que la page n'est pas hydratée (le pré-rendu du web ne connaît pas la fenêtre).
//
// Les seuils (choix 7 du plan R14) : sous 700 points, la mise en page de téléphone ; au-delà, des
// rangées de trois, de quatre à partir de 1 536 points.
import { screen } from '@testing-library/react-native'
import { Dimensions, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { renderWithProviders } from '../testing/render'
import { mosaicRows, ProjectMosaic } from './ProjectMosaic'
import { useHydrated } from './theme/hydration'

// Les outils de test passent par le module des comptes ; on le remplace, comme dans les écrans.
jest.mock('../accounts/api', () => ({ useSession: jest.fn() }))
// L'hydratation de la page, qu'un test choisit (vraie sur téléphone, d'emblée).
jest.mock('./theme/hydration', () => ({
  ...jest.requireActual('./theme/hydration'),
  useHydrated: jest.fn(() => true),
}))

/** Le bloc d'en tête : la grande carte (rang 0) et deux compactes empilées à côté (1 et 2). */
const block = { lead: 0, beside: [1, 2] }

// Les attendus, écrits en clair pour chaque nombre de projets, de 1 à 7.
/** Téléphone : la grande seule, puis des rangées de deux ; la dernière s'étire. */
const phone = [
  [[0]],
  [[0], [1]],
  [[0], [1, 2]],
  [[0], [1, 2], [3]],
  [[0], [1, 2], [3, 4]],
  [[0], [1, 2], [3, 4], [5]],
  [[0], [1, 2], [3, 4], [5, 6]],
]
/** Tablette et ordinateur jusqu'à 1 535 points : le bloc, puis des rangées de trois. */
const threeColumns = [
  [[0]],
  [[0, 1]],
  [block],
  [block, [3]],
  [block, [3, 4]],
  [block, [3, 4, 5]],
  [block, [3, 4, 5], [6]],
]
/** À partir de 1 536 points : le bloc, puis des rangées de quatre. */
const fourColumns = [
  [[0]],
  [[0, 1]],
  [block],
  [block, [3]],
  [block, [3, 4]],
  [block, [3, 4, 5]],
  [block, [3, 4, 5, 6]],
]
const expected: Record<number, unknown[][]> = {
  390: phone,
  768: threeColumns,
  1024: threeColumns,
  1440: threeColumns,
  1920: fourColumns,
}

/** Les rangs posés par un plan, dans l'ordre de lecture (le bloc : la grande, puis ses deux). */
const readOrder = (rows: ReturnType<typeof mosaicRows>): number[] =>
  rows.flatMap((row) => (Array.isArray(row) ? row : [row.lead, ...row.beside]))

describe('mosaicRows, the plan of the mosaic', () => {
  it('plans rows with no empty cell, for 1 to 7 projects, at 390, 768, 1 024, 1 440 and 1 920 points', () => {
    for (const [width, plans] of Object.entries(expected)) {
      plans.forEach((plan, index) => {
        const count = index + 1
        const rows = mosaicRows(count, Number(width))
        expect({ width, count, rows }).toEqual({ width, count, rows: plan })
        // Aucune case vide, aucun projet oublié ni répété : chaque rang une fois, dans l'ordre.
        expect(readOrder(rows)).toEqual(Array.from({ length: count }, (_, rank) => rank))
      })
    }
  })

  it('puts the big card alone on its row on a phone', () => {
    for (const width of [320, 390, 699]) {
      for (let count = 1; count <= 7; count += 1) {
        expect(mosaicRows(count, width)[0]).toEqual([0])
      }
    }
    // Témoin : dès 700 points, trois projets font le bloc d'en tête.
    expect(mosaicRows(3, 700)[0]).toEqual(block)
  })

  it('lays four columns from 1 536 points and three at 1 535', () => {
    expect(mosaicRows(7, 1536)).toEqual([block, [3, 4, 5, 6]])
    expect(mosaicRows(7, 1535)).toEqual([block, [3, 4, 5], [6]])
  })

  it('plans nothing for no project', () => {
    expect(mosaicRows(0, 390)).toEqual([])
    expect(mosaicRows(0, 1440)).toEqual([])
  })
})

// --- Le composant ---------------------------------------------------------------------------------

type Item = { id: string; title: string }
const items = (count: number): Item[] =>
  Array.from({ length: count }, (_, rank) => ({ id: `p${rank + 1}`, title: `Projet ${rank + 1}` }))

/** Un nœud de l'arbre rendu, le peu qu'on en lit (RNTL 14 n'exporte pas ce type). */
type Host = {
  props: Record<string, unknown>
  parent: Host | null
  children: ReadonlyArray<Host | string>
}
const hostsOf = (node: Host): Host[] => [
  node,
  ...node.children.flatMap((child) => (typeof child === 'string' ? [] : hostsOf(child))),
]
/** Les nœuds d'un rôle, dans l'ordre de l'arbre (celui du lecteur d'écran et de la touche Tab). */
const withRole = (role: string) =>
  hostsOf(screen.root as unknown as Host).filter(
    (node) => (node.props.role ?? node.props.accessibilityRole) === role,
  )
const textOf = (node: Host): string =>
  node.children.map((child) => (typeof child === 'string' ? child : textOf(child))).join('')
const styleOf = (node: Host) =>
  (StyleSheet.flatten(node.props.style as ViewStyle) ?? {}) as ViewStyle

/** La taille reçue par chaque projet, notée par `render`. */
let sizes: Record<string, string> = {}
const mosaic = (count: number) => (
  <ProjectMosaic
    items={items(count)}
    render={(item: Item, size: 'full' | 'compact') => {
      sizes[item.id] = size
      return (
        <View testID={`card-${item.id}`}>
          <Text>{item.title}</Text>
        </View>
      )
    }}
  />
)

// La fenêtre de Jest (un téléphone, 390 points), rendue après le test qui la change.
const initialWindow = Dimensions.get('window')
const setWindow = (width: number) => {
  const size = { ...initialWindow, width, height: 900 }
  Dimensions.set({ window: size, screen: size })
}

beforeEach(() => {
  sizes = {}
  jest.mocked(useHydrated).mockReturnValue(true)
})
afterEach(() => {
  Dimensions.set({ window: initialWindow, screen: initialWindow })
})

describe('ProjectMosaic', () => {
  it('is one list with one item per project', async () => {
    setWindow(1440)
    await renderWithProviders(mosaic(5))

    expect(withRole('list')).toHaveLength(1)
    expect(withRole('listitem')).toHaveLength(5)
  })

  it('reads the projects in order 1, 2, 3, 4, 5 with two compact cards stacked beside the big one', async () => {
    setWindow(1440)
    await renderWithProviders(mosaic(5))

    expect(withRole('listitem').map(textOf)).toEqual([
      'Projet 1',
      'Projet 2',
      'Projet 3',
      'Projet 4',
      'Projet 5',
    ])
    expect(sizes).toEqual({
      p1: 'full',
      p2: 'compact',
      p3: 'compact',
      p4: 'compact',
      p5: 'compact',
    })
  })

  it('draws the big card, then the compact cards, on a phone', async () => {
    await renderWithProviders(mosaic(4))

    expect(withRole('listitem').map(textOf)).toEqual([
      'Projet 1',
      'Projet 2',
      'Projet 3',
      'Projet 4',
    ])
    expect(sizes).toEqual({ p1: 'full', p2: 'compact', p3: 'compact', p4: 'compact' })
  })

  it('draws a single project as the big card', async () => {
    setWindow(1440)
    await renderWithProviders(mosaic(1))

    expect(sizes).toEqual({ p1: 'full' })
  })

  it('draws two equal cards for two projects, beyond a phone', async () => {
    setWindow(1440)
    await renderWithProviders(mosaic(2))

    expect(Object.keys(sizes)).toEqual(['p1', 'p2'])
    expect(sizes.p1).toBe(sizes.p2)
  })

  it('lays out the phone mosaic until the page is hydrated, even at 1 920 points', async () => {
    setWindow(1920)
    jest.mocked(useHydrated).mockReturnValue(false)
    await renderWithProviders(mosaic(2))

    // La mise en page de téléphone : la grande carte, puis la seconde en compacte (et non deux
    // cartes égales, celles d'un ordinateur).
    expect(sizes).toEqual({ p1: 'full', p2: 'compact' })
  })

  // La hauteur d'une rangée : celle de sa carte la plus haute. Jest ne calcule pas la mise en page ;
  // on vérifie la règle qui la donne : aucune hauteur fixée entre la liste et une case, et rien qui
  // empêche une case de s'étirer (l'étirement est la règle par défaut d'une rangée flexbox). Les deux
  // compactes empilées à côté de la grande se partagent la hauteur de leur colonne.
  it('stretches the cards of a row and the big card to the tallest one when a compact card grows', async () => {
    setWindow(1440)
    await renderWithProviders(mosaic(5))

    const list = withRole('list')[0] as Host
    const cells = withRole('listitem')
    expect(cells).toHaveLength(5) // témoin : la mosaïque est là
    for (const cell of cells) {
      const own = styleOf(cell)
      expect(own.height).toBeUndefined()
      expect(own.maxHeight).toBeUndefined()
      expect([undefined, 'stretch']).toContain(own.alignSelf)
      for (let node = cell.parent; node && node !== list; node = node.parent) {
        const style = styleOf(node)
        expect(style.height).toBeUndefined()
        expect([undefined, 'stretch']).toContain(style.alignItems)
      }
    }
    // Les deux compactes du bloc (projets 2 et 3) grandissent pour remplir leur colonne.
    for (const cell of cells.slice(1, 3)) {
      expect(Number(styleOf(cell).flexGrow ?? 0)).toBeGreaterThanOrEqual(1)
    }
  })
})
