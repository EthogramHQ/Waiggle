// Pile : range ses enfants les uns sous les autres (ou côte à côte avec `direction="row"`), avec un
// écart régulier pris dans l'échelle des espaces. C'est la brique de mise en page des écrans : ils
// n'écrivent ainsi jamais de marge ou d'écart en chiffres.
import { type Space, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

type Props = {
  children: ReactNode
  direction?: 'column' | 'row'
  gap?: Space
  padding?: Space
  paddingX?: Space
  paddingY?: Space
  /** Alignement sur l'autre axe que celui de la pile (en travers). */
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  /** Répartition le long de la pile. */
  justify?: 'start' | 'center' | 'end' | 'between'
  /** Passe à la ligne quand il n'y a plus de place (pour des pastilles, par exemple). */
  wrap?: boolean
  /** Prend toute la place disponible dans son parent. */
  grow?: boolean
  accessibilityRole?: 'list' | 'radiogroup' | 'none'
  accessibilityLabel?: string
}

const alignments = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
  between: 'space-between',
} as const

export function Stack({
  children,
  direction = 'column',
  gap = 'md',
  padding,
  paddingX,
  paddingY,
  align,
  justify,
  wrap = false,
  grow = false,
  accessibilityRole,
  accessibilityLabel,
}: Props) {
  const style: ViewStyle = {
    flexDirection: direction,
    gap: space[gap],
    ...(padding ? { padding: space[padding] } : null),
    ...(paddingX ? { paddingHorizontal: space[paddingX] } : null),
    ...(paddingY ? { paddingVertical: space[paddingY] } : null),
    ...(align ? { alignItems: alignments[align] } : null),
    ...(justify ? { justifyContent: alignments[justify] } : null),
    ...(wrap ? { flexWrap: 'wrap' } : null),
    // minWidth: 0 laisse le texte se replier au lieu de pousser la mise en page hors de l'écran.
    ...(grow ? { flex: 1, minWidth: 0 } : null),
  }
  return (
    <View
      style={style}
      {...(accessibilityRole ? { accessibilityRole } : null)}
      {...(accessibilityLabel ? { accessibilityLabel } : null)}
    >
      {children}
    </View>
  )
}

/** Raccourci : une pile horizontale, éléments centrés verticalement. */
export function Row(props: Omit<Props, 'direction'>) {
  return <Stack direction="row" align="center" {...props} />
}
