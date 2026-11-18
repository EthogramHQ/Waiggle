// Une liste répartie en colonnes, lue de haut en bas puis colonne après colonne (tranche R16,
// « Ruches, Recherche et Outils en grand » ; planches R16-Outils-1920 et 1440) : « De A à Z » de la
// page Outils, sur un grand écran, sur 5 colonnes à 1 920 et 4 à 1 440. La première colonne se lit
// Arduino, Bolt, Canva, ChatGPT ; la deuxième reprend à Claude : l'ordre alphabétique se suit d'un
// coup d'œil vers le bas, comme dans un index, et l'ordre de lecture d'un lecteur d'écran (l'ordre
// de l'arbre) est le même.
//
// Elle a la matière d'un `ListGroup` (le groupe blanc, ses filets entre les lignes) et y pose les
// mêmes lignes (`ListRow`, ou `ListRowSkeleton` pendant le chargement), avec un filet vertical entre
// deux colonnes. Le nombre de colonnes vient de la place (`useContentWidth`, publiée par `Screen`) :
// autant de colonnes d'au moins 300 points qu'il en tient. Les colonnes ont la même largeur ; la
// dernière peut être plus courte (19 outils sur 5 colonnes : 4, 4, 4, 4, 3).
import { borders, radii, space } from '@ruche/brand'
import { Children, Fragment, type ReactNode } from 'react'
import { View } from 'react-native'
import { useLargeText } from './textScale'
import { columnsFor, useContentWidth } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

/**
 * La largeur minimale d'une colonne : une ligne d'outil y garde son nom, sa précision (« Matériel
 * et objets · 4 projets ») et son chevron. 5 colonnes dans les 1 728 points de contenu à 1 920,
 * 4 dans les 1 376 à 1 440 (les planches).
 */
const COLUMN_MIN = 300

/** Le texte très agrandi (200 %) : une colonne demande une fois et demie sa largeur minimale. */
const LARGE_TEXT_FACTOR = 1.5

type Props = {
  /** Les lignes, dans l'ordre de lecture (l'ordre alphabétique de « De A à Z »). */
  children: ReactNode
  /** Le nombre de colonnes, imposé (le catalogue) ; sans lui, il suit la place. */
  columns?: number
}

export function ColumnList({ children, columns: imposed }: Props) {
  const { colors, shadows } = useTheme()
  const room = useContentWidth()
  const { large, probe } = useLargeText()
  const min = large ? Math.round(COLUMN_MIN * LARGE_TEXT_FACTOR) : COLUMN_MIN
  const columns =
    imposed !== undefined && Number.isFinite(imposed)
      ? Math.max(1, Math.round(imposed))
      : columnsFor(room, min, 0)
  // Children.toArray : les lignes, sans les « trous » (null, false), chacune avec sa clé.
  const rows = Children.toArray(children)
  if (rows.length === 0) return null
  // Autant de lignes par colonne qu'il faut pour toutes les poser : les premières colonnes sont
  // pleines, la dernière prend le reste.
  const perColumn = Math.ceil(rows.length / columns)
  // Les colonnes qui reçoivent des lignes, et seulement elles (relecture de design R16, point 1) :
  // deux outils trouvés par « Clau » sur 5 colonnes en dessinaient 3 vides, filets compris, et la
  // liste semblait cassée. Chacune garde la largeur d'une colonne : le groupe blanc ne prend que
  // leur part de la place (2 colonnes sur 5 : 40 %) et s'arrête après la dernière.
  const drawn = Math.ceil(rows.length / perColumn)
  const separator = (
    <View
      style={{
        height: borders.hairline,
        backgroundColor: colors.groupSeparator,
        marginLeft: space.lg,
      }}
    />
  )
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: borders.hairline,
        borderColor: colors.groupBorder,
        boxShadow: shadows.soft,
        // Le groupe rogne ce qui dépasse : l'anneau de focus d'une ligne se dessine à l'intérieur
        // (comme dans un `ListGroup`).
        overflow: 'hidden',
        // Moins de colonnes que la place n'en tient : le groupe se pose à gauche, à leur largeur.
        ...(drawn < columns
          ? { alignSelf: 'flex-start', width: `${(drawn / columns) * 100}%` as const }
          : null),
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: drawn }, (_, c) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: une colonne est une place dans la liste
            key={c}
            style={{
              flex: 1,
              minWidth: 0,
              // Le filet vertical entre deux colonnes, de la couleur des filets entre les lignes.
              borderLeftWidth: c > 0 ? borders.hairline : 0,
              borderLeftColor: colors.groupSeparator,
            }}
          >
            {rows.slice(c * perColumn, (c + 1) * perColumn).map((row, i) => (
              <Fragment key={(row as { key?: string }).key ?? i}>
                {i > 0 ? separator : null}
                {row}
              </Fragment>
            ))}
          </View>
        ))}
      </View>
      {probe}
    </View>
  )
}
