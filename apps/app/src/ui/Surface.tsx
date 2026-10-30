// Une surface : le « matériau » sur lequel on pose du contenu. Cinq matières, décrites dans
// docs/design/miel.md :
// - plain   : surface pleine, pour ce qui se lit longtemps ;
// - grouped : groupe blanc bordé (champs d'un formulaire, liste de réglages) ;
// - glass   : verre, pour ce qui flotte (barres, boutons ronds sur une image) ;
// - panel   : verre plus dense, qui porte du texte posé sur une image ;
// - sheet   : feuille qui monte du bas de l'écran.
// Les surfaces pleines (plain, grouped) ont une fine bordure beige (surfaceBorder) : blanches sur la
// Cire, un blanc à peine chaud, elles s'en détacheraient mal sans elle.
// Le verre floute ce qui passe derrière lui. Le flou est calculé par l'appareil, ce qui a un coût :
// c'est ici, et seulement ici, qu'on décide où et comment il est appliqué.
// Texte sur le panneau : `textMuted` seulement si le panneau est posé sur la page ; sur une image
// ou sur la lumière, `textSecondary` (voir contrastPairs, @ruche/brand).
import { borders, type Radius, radii, type Space, space } from '@ruche/brand'
import { BlurView } from 'expo-blur'
import type { ReactNode } from 'react'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import { useTheme } from './theme/ThemeProvider'

export type SurfaceVariant = 'plain' | 'grouped' | 'glass' | 'panel' | 'sheet'

/**
 * L'ombre portée par la surface. `card` : l'ombre d'une carte posée sur la page ; `none` : aucune.
 * Le panneau n'en a pas par défaut : il est posé dans une carte, qui porte déjà l'ombre (une ombre
 * sous le panneau assombrirait la photo de la carte).
 */
export type SurfaceShadow = 'card' | 'none'

type Props = {
  children: ReactNode
  variant?: SurfaceVariant
  radius?: Radius
  padding?: Space
  gap?: Space
  /** Occupe toute la largeur disponible (vrai par défaut). */
  fill?: boolean
  /**
   * Une feuille posée au centre de l'écran (une fenêtre de confirmation) plutôt que sortie du bas :
   * ses quatre coins sont arrondis.
   */
  centered?: boolean
  /** L'ombre portée ; sans elle, celle de la matière (aucune pour `plain` et `panel`). */
  shadow?: SurfaceShadow
  /**
   * Dans une colonne de hauteur limitée (une feuille, tranche R2) : `shrink`, la surface rétrécit
   * jusqu'à la hauteur permise (son contenu défile alors dedans) ; `fill`, elle prend toute la
   * hauteur. Sans cela, sur le web, une vue ne rétrécit jamais (react-native-web lui donne
   * `flexShrink: 0`) et une longue feuille dépassait de la fenêtre.
   */
  fit?: 'shrink' | 'fill'
}

// Rayon, intensité du flou (de 1 à 100 pour expo-blur) et ombre par défaut de chaque matière.
const defaults = {
  plain: { radius: 'tile', blur: 0, shadow: null },
  grouped: { radius: 'group', blur: 0, shadow: 'soft' },
  glass: { radius: 'pill', blur: 40, shadow: 'float' },
  panel: { radius: 'panel', blur: 50, shadow: null },
  sheet: { radius: 'sheet', blur: 60, shadow: 'float' },
} as const satisfies Record<
  SurfaceVariant,
  { radius: Radius; blur: number; shadow: 'soft' | 'float' | null }
>

// Sur Android, le vrai flou demande de désigner à l'avance ce qu'il faut flouter (une « cible »).
// En attendant de le brancher écran par écran, le verre y est un peu plus opaque, sans flou.
const realBlur = Platform.OS === 'ios' || Platform.OS === 'web'

// Le flou sur le web. expo-blur y pose son propre filtre (une saturation à 180 % et une teinte), qui
// avive trop les couleurs et change celle du verre : on écrit le filtre nous-mêmes, le même flou
// (l'intensité d'expo-blur, divisée par 5, en pixels) et une saturation de 1,2, qui avive juste un
// peu ce qui passe derrière. `backdropFilter` n'existe pas dans les types de React Native (il ne
// sert que sur le web), d'où ce type élargi ; react-native-web l'écrit aussi pour Safari.
type WebStyle = ViewStyle & { backdropFilter?: string }
const webBlur = (intensity: number): WebStyle => ({
  backdropFilter: `blur(${intensity / 5}px) saturate(1.2)`,
})

export function Surface({
  children,
  variant = 'plain',
  radius,
  padding,
  gap,
  fill = true,
  centered = false,
  shadow,
  fit,
}: Props) {
  const { colors, shadows, scheme } = useTheme()
  const { blur, radius: defaultRadius, shadow: defaultShadow } = defaults[variant]

  // L'ombre portée, puis, pour le verre, le reflet en haut (une ombre « inset », à l'intérieur).
  const cast = shadow === undefined ? defaultShadow : shadow === 'none' ? null : shadow
  const highlight = variant === 'glass' || variant === 'panel'
  const boxShadow =
    [highlight ? shadows.highlight : null, cast ? shadows[cast] : null]
      .filter((part) => part !== null)
      .join(', ') || undefined

  const look: Record<SurfaceVariant, ViewStyle> = {
    plain: {
      backgroundColor: colors.surface,
      borderWidth: borders.hairline,
      borderColor: colors.surfaceBorder,
    },
    grouped: {
      backgroundColor: colors.surface,
      borderWidth: borders.hairline,
      borderColor: colors.surfaceBorder,
    },
    glass: {
      backgroundColor: realBlur ? colors.glass : colors.panel,
      borderWidth: borders.hairline,
      borderColor: colors.glassBorder,
    },
    panel: {
      backgroundColor: realBlur ? colors.panel : colors.sheet,
      borderWidth: borders.hairline,
      borderColor: colors.panelBorder,
    },
    sheet: {
      backgroundColor: realBlur ? colors.sheet : colors.surface,
    },
  }

  // minHeight: 0 : sans lui, une boîte flexible ne descend pas sous la hauteur de son contenu.
  const fitStyle: ViewStyle | null =
    fit === 'fill'
      ? { flex: 1, minHeight: 0 }
      : fit === 'shrink'
        ? { flexShrink: 1, minHeight: 0 }
        : null
  const style: ViewStyle = {
    ...look[variant],
    ...(boxShadow ? { boxShadow } : null),
    borderRadius: radii[radius ?? defaultRadius],
    // Une feuille n'est arrondie qu'en haut : elle sort du bas de l'écran. Posée au centre, non.
    ...(variant === 'sheet' && !centered
      ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
      : null),
    ...(padding ? { padding: space[padding] } : null),
    ...(gap ? { gap: space[gap] } : null),
    ...(fill ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }),
    ...fitStyle,
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
    // Les couches sont posées à l'intérieur de la bordure : leur arrondi est plus petit de l'épaisseur
    // de la bordure, sinon un fin croissant clair apparaît dans chaque coin.
    const border = typeof style.borderWidth === 'number' ? style.borderWidth : 0
    const inset = (radius: ViewStyle['borderRadius']) =>
      typeof radius === 'number' ? Math.max(0, radius - border) : radius
    const layerCorners = {
      borderRadius: inset(corners.borderRadius),
      borderBottomLeftRadius: inset(corners.borderBottomLeftRadius),
      borderBottomRightRadius: inset(corners.borderBottomRightRadius),
    }
    return (
      <View style={{ ...corners, ...(boxShadow ? { boxShadow } : null), alignSelf, ...fitStyle }}>
        <View style={{ ...inner, overflow: 'hidden' }}>
          {/* Les couches reprennent les coins arrondis : sur le web, une couche floutée n'est pas
              rognée par l'arrondi de son parent, et ses coins carrés dépasseraient. */}
          {Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, layerCorners, webBlur(blur)]} />
          ) : (
            <BlurView
              intensity={blur}
              tint={scheme === 'night' ? 'dark' : 'light'}
              style={[StyleSheet.absoluteFill, layerCorners]}
            />
          )}
          <View style={[StyleSheet.absoluteFill, layerCorners, { backgroundColor }]} />
          {children}
        </View>
      </View>
    )
  }
  return <View style={style}>{children}</View>
}
