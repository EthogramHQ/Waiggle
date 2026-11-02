// Deux colonnes côte à côte sur un grand écran : une principale, large, et une latérale, plus
// étroite. Quand la place manque (téléphone, fenêtre étroite), la latérale passe dessous.
// Le passage se fait tout seul, par la largeur disponible, sans mesurer la fenêtre : chaque colonne
// a une largeur de base et peut grandir ; quand les deux bases ne tiennent plus sur une ligne,
// la seconde va à la ligne (flexWrap).
//
// Des rangées (R5a, la page d'un projet sur ordinateur) : plusieurs paires de colonnes l'une sous
// l'autre, séparées au besoin par un trait. En haut, la galerie | l'en-tête et ses actions ; en
// bas, la description | les commentaires. Pourquoi pas deux longues colonnes : l'ordre de la page
// (lecteurs d'écran, touche Tab) suit alors l'ordre de lecture, rangée par rangée (rangée 1 à
// gauche, rangée 1 à droite, puis rangée 2), au lieu de parcourir toute la colonne de gauche avant
// de revenir en haut à droite (point des listes de R5a : « Suivre » venait après tout le contenu).
// Les colonnes de chaque rangée ont les mêmes bases : elles restent alignées d'une rangée à l'autre.
import { borders, layout, type Space, space } from '@ruche/brand'
import { Fragment, type ReactNode } from 'react'
import { View } from 'react-native'
import { useTheme } from './theme/ThemeProvider'

/**
 * Une rangée : sa colonne principale (à gauche) et sa colonne latérale (à droite). `continues` :
 * la rangée prolonge la précédente, sans trait au-dessus d'elle, même avec `divided` (le pied de
 * la page d'un projet : « Signaler ce projet », en bas à gauche, lu après les commentaires).
 */
export type ColumnsRow = { main: ReactNode; side: ReactNode; continues?: boolean }

type Props = { gap?: Space } & (
  | { main: ReactNode; side: ReactNode; rows?: never; divided?: never }
  | {
      /** Les rangées, dans l'ordre de lecture. */
      rows: readonly ColumnsRow[]
      /** Un trait fin entre deux rangées (la page d'un projet : sous la galerie). */
      divided?: boolean
      main?: never
      side?: never
    }
)

export function Columns(props: Props) {
  const gap = props.gap ?? 'xxl'
  if (props.rows === undefined) return <ColumnPair main={props.main} side={props.side} gap={gap} />
  return (
    // Les rangées l'une sous l'autre, avec le même écart que les colonnes (et autour du trait).
    <View style={{ gap: space[gap] }}>
      {props.rows.map((row, index) => (
        // Le rang suffit comme clé : les rangées d'une page ne changent pas d'ordre.
        // biome-ignore lint/suspicious/noArrayIndexKey: l'ordre des rangées est fixe.
        <Fragment key={index}>
          {props.divided && index > 0 && !row.continues ? <RowDivider /> : null}
          <ColumnPair main={row.main} side={row.side} gap={gap} />
        </Fragment>
      ))}
    </View>
  )
}

/** Une paire de colonnes : la principale, puis la latérale, qui passe dessous quand la place manque. */
function ColumnPair({ main, side, gap }: { main: ReactNode; side: ReactNode; gap: Space }) {
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

/**
 * Le trait entre deux rangées, sur toute la largeur. Décoratif : caché aux lecteurs d'écran (les
 * titres des sections suffisent à dire qu'on change de partie). `testID` : un trait n'a ni rôle ni
 * nom, et le test de l'ordre doit pouvoir le situer entre les rangées.
 */
function RowDivider() {
  const { colors } = useTheme()
  return (
    <View
      testID="columns-divider"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ height: borders.hairline, alignSelf: 'stretch', backgroundColor: colors.line }}
    />
  )
}
