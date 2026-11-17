// La mosaïque des projets d'un membre (tranche R14, planches `R3-Moi` et `R3-Membre-Desktop`) : le
// projet le plus récent en grande carte, comme celles du Fil, les suivants en cartes compactes
// (`ProjectCard size="compact"`), sans case vide, dans l'ordre des projets.
//
// Deux pièces :
// - `mosaicRows(count, width)`, une fonction pure (même entrée, même sortie, rien d'autre) : le plan
//   des rangées. Une rangée est la liste des rangs posés côte à côte (`[3, 4, 5]`) ; le bloc d'en
//   tête, la grande carte avec deux compactes empilées à côté, s'écrit `{ lead: 0, beside: [1, 2] }` ;
// - `ProjectMosaic`, qui dessine ce plan : l'écran lui donne les projets (`items`) et la façon de
//   dessiner la carte d'un projet à une taille donnée (`render(item, size)`).
//
// Selon la largeur (scénario, « Ce que la mosaïque devient selon la largeur ») :
// - téléphone (sous 700 points, et toujours avant l'hydratation du web : le pré-rendu ne connaît
//   pas la fenêtre) : la grande carte seule, puis des rangées de deux compactes ;
// - au-delà : 1 projet, la grande carte ; 2, deux grandes cartes égales côte à côte ; 3 et plus, le
//   bloc d'en tête, puis des rangées de trois (de quatre dès 1 536 points).
// La dernière rangée s'étire : ses cartes se partagent toute la largeur, jamais de case vide.
//
// Les rangées, pas des colonnes : un lecteur d'écran et la touche Tab suivent l'ordre des projets
// (1, 2, 3…), puisque l'ordre de l'arbre est celui de la lecture. Dans une rangée, les cases prennent
// la hauteur de la plus haute (l'étirement par défaut d'une rangée flexbox), et chaque case étire sa
// carte (`CardStretchContext`) : une compacte qui grandit à texte agrandi entraîne ses voisines, et
// la grande carte suit ses deux compactes. La mosaïque est annoncée comme une liste.
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { CardStretchContext, PROJECT_CARD_GAP, type ProjectCardSize } from './ProjectCard'
import { sizeClassFor, useLayout } from './theme/layout'

/** Une rangée de la mosaïque : des rangs côte à côte, ou le bloc d'en tête. */
export type MosaicRow = number[] | { lead: number; beside: [number, number] }

/** À partir de cette largeur (en points), les rangées sous le bloc d'en tête comptent quatre cartes. */
export const MOSAIC_FOUR_COLUMNS = 1536

/** Le nombre de colonnes sous le bloc d'en tête, au-delà du téléphone : trois, ou quatre. */
const columnsFor = (width: number) => (width >= MOSAIC_FOUR_COLUMNS ? 4 : 3)

/** Les rangs de `from` à `count - 1`, coupés en rangées de `size` (la dernière, plus courte). */
const chunks = (from: number, count: number, size: number): number[][] => {
  const rows: number[][] = []
  for (let start = from; start < count; start += size) {
    rows.push(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i))
  }
  return rows
}

/** Le plan des rangées pour `count` projets dans une page de `width` points. */
export function mosaicRows(count: number, width: number): MosaicRow[] {
  if (count <= 0) return []
  // Le téléphone : la grande carte seule sur sa rangée, puis les compactes deux par deux.
  if (sizeClassFor(width) === 'compact') return [[0], ...chunks(1, count, 2)]
  if (count === 1) return [[0]]
  if (count === 2) return [[0, 1]]
  return [{ lead: 0, beside: [1, 2] }, ...chunks(3, count, columnsFor(width))]
}

type Props<T> = {
  /** Les projets, dans l'ordre (le plus récent d'abord) ; leur `id` sert de clé. */
  items: readonly T[]
  /** La carte d'un projet, à la taille que lui donne la mosaïque. */
  render: (item: T, size: ProjectCardSize) => ReactNode
}

const GAP = PROJECT_CARD_GAP

/**
 * Une case de la mosaïque, ce que le lecteur d'écran compte (« liste, 5 éléments »). Elle étire sa
 * carte à sa hauteur. `listitem` posé à la main sur la case : les rangées ne sont que de la mise en
 * page (une liste `Stack` poserait ses éléments sur les rangées).
 */
function Cell({ style, children }: { style: ViewStyle; children: ReactNode }) {
  return (
    <View role="listitem" style={style}>
      <CardStretchContext.Provider value>{children}</CardStretchContext.Provider>
    </View>
  )
}

/**
 * Une part égale d'une rangée : base nulle et `minWidth: 0`, pour qu'un long titre ne l'élargisse
 * pas (jamais `flex: 1`, que le web lit autrement ; voir les pièges de react-native-web).
 */
const share = { flexGrow: 1, flexBasis: 0, minWidth: 0 } as const

export function ProjectMosaic<T extends { id: string }>({ items, render }: Props<T>) {
  // La largeur de la fenêtre, 0 avant l'hydratation du web (la mise en page du téléphone).
  const { width } = useLayout()
  const rows = mosaicRows(items.length, width)
  const columns = columnsFor(width)
  // Deux projets au-delà du téléphone : deux grandes cartes égales, côte à côte.
  const twoEqual = rows.length === 1 && Array.isArray(rows[0]) && rows[0].length === 2
  const sizeOf = (rank: number): ProjectCardSize => (rank === 0 || twoEqual ? 'full' : 'compact')

  const cell = (rank: number, style: ViewStyle) => {
    const item = items[rank]
    if (!item) return null
    return (
      <Cell key={item.id} style={style}>
        {render(item, sizeOf(rank))}
      </Cell>
    )
  }

  return (
    // role="list" posé à la main (les cases portent leur `listitem`) ; la liste ne dépasse jamais
    // sa colonne.
    <View role="list" style={{ gap: GAP, maxWidth: '100%', flexShrink: 1 }}>
      {rows.map((row) => {
        if (Array.isArray(row)) {
          return (
            <View key={items[row[0] ?? 0]?.id} style={{ flexDirection: 'row', gap: GAP }}>
              {row.map((rank) => cell(rank, share))}
            </View>
          )
        }
        // Le bloc d'en tête. La grande carte couvre toutes les colonnes sauf une, et ses deux
        // compactes empilées la dernière : la grande et la colonne d'à côté tombent sur les mêmes
        // bords que les rangées dessous. Pour cela, la grande part d'une base égale aux écarts
        // qu'elle enjambe, puis grandit de `columns - 1` parts : chaque part vaut alors exactement
        // une case des rangées du dessous.
        return (
          <View key={items[row.lead]?.id} style={{ flexDirection: 'row', gap: GAP }}>
            {cell(row.lead, { flexGrow: columns - 1, flexBasis: (columns - 2) * GAP, minWidth: 0 })}
            {/* La colonne des deux compactes, à la hauteur de la rangée : elles se la partagent. */}
            <View style={{ ...share, gap: GAP }}>
              {row.beside.map((rank) => cell(rank, { flexGrow: 1 }))}
            </View>
          </View>
        )
      })}
    </View>
  )
}
