// Une liste de cartes de projets, en grille : une colonne sur téléphone, deux sur tablette, trois
// sur ordinateur. Sans projet, un message (donné par l'écran) remplace la grille.
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
}

const columnsFor = { compact: 1, medium: 2, wide: 3 } as const

export function ProjectGrid({ children, empty }: Props) {
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
  const columns = columnsFor[sizeClass]
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
