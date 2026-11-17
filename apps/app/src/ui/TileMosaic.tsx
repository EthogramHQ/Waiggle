// La mosaïque de tuiles (tranche R6b, planches `R6-Outil` et `R6-Outil-Desktop`) : les projets
// d'un outil en `ProjectTile`, du plus récent au plus ancien, en rangées de tuiles.
//
// Le nombre de colonnes (R15, « Des colonnes qui suivent la place ») : autant de tuiles qu'il en
// tient côte à côte sans descendre sous `layout.cardMin.tile`, dans la largeur que l'écran publie
// (`useContentWidth()`) : quatre à 1 280 points, cinq à 1 920. Un écran peut l'imposer (`columns`) :
// les Ruches, restées étroites, gardent leurs deux colonnes ; un téléphone aussi, où la place ne
// tient qu'une tuile de 280 points.
//
// La planche dessinait des colonnes de hauteurs libres ; la relecture du plan (point 15) a choisi
// des **rangées** : un lecteur d'écran et la touche Tab suivent l'ordre des projets (1, 2, 3, 4…),
// jamais une colonne après l'autre (1, 3, 5, puis 2, 4, 6). Le rythme de la planche reste par des
// rangées alternées, hautes puis basses ; dans une rangée, les tuiles ont la même hauteur (celle de
// la plus haute, à texte agrandi) et lisent leur titre au même niveau.
//
// Chaque tuile prend la largeur de sa colonne (`TileCellContext` de `Tile.tsx`) ; la dernière
// rangée est complétée par des cases vides, pour que ses tuiles gardent la même largeur. La
// mosaïque est annoncée comme une liste : « liste, 7 éléments ».
import { layout, space } from '@ruche/brand'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'
import { mosaicRowHeights, TileCellContext } from './Tile'
import { columnsFor, useContentWidth } from './theme/layout'

type Props = {
  /** Les tuiles (`ProjectTile`), dans l'ordre des projets. */
  children: ReactNode
  /**
   * Le nombre de colonnes, imposé par l'écran (un entier, 1 au moins) ; sans lui, il suit la place
   * (une seule colonne avant l'hydratation du web, où la place vaut 0).
   */
  columns?: number | undefined
}

export function TileMosaic({ children, columns: imposed }: Props) {
  // La largeur de la colonne où la mosaïque est posée, publiée par l'écran ou par `Columns`.
  const room = useContentWidth()
  // Un nombre imposé reste raisonnable : entier, 1 au moins (0 ou `NaN` boucleraient sans fin).
  const columns =
    imposed === undefined
      ? columnsFor(room, layout.cardMin.tile, space.md)
      : Number.isFinite(imposed)
        ? Math.max(1, Math.round(imposed))
        : 1
  // Children.toArray : les tuiles, sans les « trous » (null, false) laissés par l'écran, chacune
  // avec sa clé.
  const tiles = Children.toArray(children)
  const rows: ReactNode[][] = []
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns))
  return (
    // role="list" posé à la main, et "listitem" sur chaque case remplie : les rangées ne sont que
    // de la mise en page (`Stack accessibilityRole="list"` poserait ses `listitem` sur les rangées).
    <View role="list" style={{ gap: space.md }}>
      {rows.map((row, r) => {
        const minHeight = mosaicRowHeights[r % mosaicRowHeights.length] ?? mosaicRowHeights[0]
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: une rangée n'a pas d'autre identité que sa place
          <View key={r} style={{ flexDirection: 'row', gap: space.md }}>
            {Array.from({ length: columns }, (_, c) => {
              const tile = row[c]
              // Une case : une part égale de la rangée (base nulle, `minWidth: 0` pour qu'un long
              // titre ne l'élargisse pas), étirée à la hauteur de la rangée.
              const cell = { flexGrow: 1, flexBasis: 0, minWidth: 0 } as const
              return tile === undefined ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: une case vide n'est qu'une place
                <View key={c} style={cell} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: une case est une place dans la rangée
                <View key={c} role="listitem" style={cell}>
                  <TileCellContext.Provider value={{ minHeight }}>{tile}</TileCellContext.Provider>
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}
