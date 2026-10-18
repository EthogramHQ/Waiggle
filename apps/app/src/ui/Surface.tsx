// Une surface : le « matériau » sur lequel on pose du contenu. Cinq matières, décrites dans
// docs/design/miel.md :
// - plain   : surface pleine, pour ce qui se lit longtemps ;
// - grouped : groupe blanc bordé (champs d'un formulaire, liste de réglages) ;
// - glass   : verre, pour ce qui flotte (barres, boutons ronds sur une image) ;
// - panel   : verre plus dense, qui porte du texte posé sur une image ;
// - sheet   : feuille qui monte du bas de l'écran.
// Le verre floute ce qui passe derrière lui. Le flou est calculé par l'appareil, ce qui a un coût :
// c'est ici, et seulement ici, qu'on décide où et comment il est appliqué.
import { type Radius, radii, type Space, space } from '@ruche/brand'
import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from './theme/ThemeProvider'

export type SurfaceVariant = 'plain' | 'grouped' | 'glass' | 'panel' | 'sheet'

type Props = {
  children: ReactNode
  variant?: SurfaceVariant
  radius?: Radius
  padding?: Space
  gap?: Space
  /** Occupe toute la largeur disponible (vrai par défaut). */
  fill?: boolean
}

// Rayon et intensité du flou par matière (le flou va de 1 à 100 pour expo-blur).
const defaults = {
  plain: { radius: 'tile', blur: 0 },
  grouped: { radius: 'group', blur: 0 },
  glass: { radius: 'pill', blur: 40 },
  panel: { radius: 'panel', blur: 50 },
  sheet: { radius: 'sheet', blur: 60 },
} as const satisfies Record<SurfaceVariant, { radius: Radius; blur: number }>

// Sur Android, le vrai flou demande de désigner à l'avance ce qu'il faut flouter (une « cible »).
// En attendant de le brancher écran par écran, le verre y est un peu plus opaque, sans flou.
const realBlur = Platform.OS === 'ios' || Platform.OS === 'web'

export function Surface({ children, variant = 'plain', radius, padding, gap, fill = true }: Props) {
  const { colors, shadows, scheme } = useTheme()
  const { blur, radius: defaultRadius } = defaults[variant]

  const look: Record<SurfaceVariant, ViewStyle> = {
    plain: { backgroundColor: colors.surface },
    grouped: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.groupBorder,
      boxShadow: shadows.soft,
    },
    glass: {
      backgroundColor: realBlur ? colors.glass : colors.panel,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      boxShadow: `${shadows.highlight}, ${shadows.float}`,
    },
    panel: {
      backgroundColor: realBlur ? colors.panel : colors.sheet,
      borderWidth: 1,
      borderColor: colors.panelBorder,
      boxShadow: `${shadows.highlight}, ${shadows.card}`,
    },
    sheet: {
      backgroundColor: realBlur ? colors.sheet : colors.surface,
      boxShadow: shadows.float,
    },
  }

  const style: ViewStyle = {
    ...look[variant],
    borderRadius: radii[radius ?? defaultRadius],
    // Une feuille n'est arrondie qu'en haut : elle sort du bas de l'écran.
    ...(variant === 'sheet' ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null),
    ...(padding ? { padding: space[padding] } : null),
    ...(gap ? { gap: space[gap] } : null),
    ...(fill ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }),
  }

  if (blur > 0 && realBlur) {
    // Deux boîtes : l'extérieure porte l'ombre, l'intérieure rogne aux coins arrondis
    // (overflow: 'hidden'), ce qui rognerait aussi l'ombre si elles étaient ensemble.
    // Dans l'intérieure, trois couches empilées : le flou, puis la couleur de la matière, puis le
    // contenu. La couleur est une couche à part car, sur le web, le flou impose sa propre teinte à
    // la place de la couleur qu'on lui donne : le texte posé dessus manquait alors de contraste.
    const { boxShadow, alignSelf, backgroundColor, ...inner } = style
    const corners = {
      borderRadius: style.borderRadius,
      borderBottomLeftRadius: style.borderBottomLeftRadius,
      borderBottomRightRadius: style.borderBottomRightRadius,
    }
    return (
      <View style={{ ...corners, ...(boxShadow ? { boxShadow } : null), alignSelf }}>
        <View style={{ ...inner, overflow: 'hidden' }}>
          <BlurView
            intensity={blur}
            tint={scheme === 'night' ? 'dark' : 'light'}
            // Les couches reprennent les coins arrondis : sur le web, une couche floutée n'est pas
            // rognée par l'arrondi de son parent, et ses coins carrés dépasseraient.
            style={[StyleSheet.absoluteFill, corners]}
          />
          <View style={[StyleSheet.absoluteFill, corners, { backgroundColor }]} />
          {children}
        </View>
      </View>
    )
  }
  return <View style={style}>{children}</View>
}
