// Deux colonnes côte à côte sur un grand écran : une principale, large, et une latérale, plus
// étroite. Quand la place manque (téléphone, fenêtre étroite), la latérale passe dessous.
// Le passage se fait tout seul, par la largeur disponible, sans mesurer la fenêtre : chaque colonne
// a une largeur de base et peut grandir ; quand les deux bases ne tiennent plus sur une ligne,
// la seconde va à la ligne (flexWrap).
import { layout, type Space, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'

type Props = { main: ReactNode; side: ReactNode; gap?: Space }

export function Columns({ main, side, gap = 'xxl' }: Props) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[gap], alignItems: 'flex-start' }}
    >
      {/* flexGrow 999 : la colonne principale prend presque toute la place gagnée. */}
      <View
        style={{
          flexGrow: 999,
          flexShrink: 1,
          flexBasis: layout.mainColumn,
          minWidth: 0,
          gap: space[gap],
        }}
      >
        {main}
      </View>
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: layout.sideColumn,
          minWidth: 0,
          gap: space[gap],
        }}
      >
        {side}
      </View>
    </View>
  )
}
