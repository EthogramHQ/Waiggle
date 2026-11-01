// Une liste de cartes de projets, en grille : une colonne sur téléphone, deux sur tablette, trois
// sur ordinateur, ou le nombre que l'écran impose (`columns` : le Fil, dont la colonne principale
// est plus étroite à côté de sa colonne latérale, R4). Sans projet, un message (donné par l'écran)
// remplace la grille.
import { space } from '@ruche/brand'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'
import { Surface } from './Surface'
import { Text } from './Text'
import { useLayout } from './theme/layout'

type Props = {
  children: ReactNode
  /** Le message affiché quand la liste est vide. */
  empty: string
  /**
   * Le nombre de colonnes, imposé par l'écran (un entier de 1 à 3) ; sans lui, il suit la largeur.
   * C'est l'écran qui le choisit (2 en `wide` et 1 sinon, pour le Fil) : la grille ne sait pas ce
   * qui est posé à côté d'elle.
   */
  columns?: number
}

const columnsFor = { compact: 1, medium: 2, wide: 3 } as const

// Une valeur donnée par l'écran reste raisonnable : entière, entre 1 et 3 (une valeur absurde
// ne casse pas la grille en rangées vides ou en boucle sans fin).
const boundedColumns = (columns: number) =>
  Number.isFinite(columns) ? Math.min(3, Math.max(1, Math.round(columns))) : 1

export function ProjectGrid({ children, empty, columns: imposed }: Props) {
  const { sizeClass } = useLayout()
  // Children.toArray : la liste des cartes, sans les « trous » (null, false) laissés par l'écran,
  // chacune avec sa clé.
  const cards = Children.toArray(children)
  if (cards.length === 0) {
    return (
      <Surface variant="grouped" padding="xl">
        <Text tone="secondary" align="center">
          {empty}
        </Text>
      </Surface>
    )
  }
  // La grille est faite de rangées de `columns` cases de même largeur (flex: 1). La dernière
  // rangée est complétée par des cases vides, pour que ses cartes gardent la même largeur.
  const columns = imposed === undefined ? columnsFor[sizeClass] : boundedColumns(imposed)
  const rows: ReactNode[][] = []
  for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns))
  return (
    // accessibilityRole="list" : les lecteurs d'écran annoncent une liste et son nombre d'éléments.
    <View accessibilityRole="list" style={{ gap: space.lg }}>
      {rows.map((row, r) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: une rangée n'a pas d'autre identité que sa place
        <View key={r} style={{ flexDirection: 'row', gap: space.lg }}>
          {Array.from({ length: columns }, (_, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: idem, une case est une place dans la rangée
            <View key={c} style={{ flex: 1 }}>
              {row[c] ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
