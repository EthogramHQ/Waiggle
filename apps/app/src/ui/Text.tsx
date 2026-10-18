// Le texte de l'appli. Tout texte affiché passe par ce composant, qui choisit la police, la taille et
// la couleur à partir des jetons de @ruche/brand. Un écran dit ce qu'est le texte (un titre de
// projet, une légende) et pas à quoi il ressemble : pour changer tous les titres, on change le jeton.
import { type FontWeight, maxTextScale, type TextVariant, textStyles } from '@ruche/brand'
import type { ReactNode } from 'react'
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

/** Les couleurs de texte possibles, par rôle. */
export type Tone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'danger'
  | 'success'
  | 'onHoney'
  | 'onDanger'
  | 'disabled'
  | 'status'

const toneColor = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  accent: 'amberText',
  danger: 'dangerText',
  success: 'success',
  onHoney: 'onHoney',
  onDanger: 'onDanger',
  disabled: 'onHoneyDisabled',
  status: 'statusText',
} as const

export type TextProps = {
  children: ReactNode
  variant?: TextVariant
  tone?: Tone
  /** Remplace la graisse prévue par la variante (par exemple un libellé en gras). */
  weight?: FontWeight
  align?: 'left' | 'center' | 'right'
  /** Chiffres de même largeur, pour que les compteurs ne bougent pas quand ils changent. */
  tabular?: boolean
  /** Souligné (liens). */
  underline?: boolean
  /** Agrandissement maximal avec le réglage de taille de l'appareil (2 par défaut). */
  maxScale?: number
} & Pick<
  NativeTextProps,
  | 'numberOfLines'
  | 'selectable'
  | 'accessibilityRole'
  | 'accessibilityLabel'
  // « polite » : un texte qui apparaît en cours de route est lu par les lecteurs d'écran, sans
  // couper ce qu'ils disent (par exemple « Préparation de la photo… »).
  | 'accessibilityLiveRegion'
  | 'accessible'
  | 'onPress'
  | 'testID'
  | 'nativeID'
>

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  weight,
  align,
  tabular = false,
  underline = false,
  maxScale = maxTextScale,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const style = textStyles[variant]
  return (
    <NativeText
      // Les textes grandissent avec le réglage de taille de l'appareil, jusqu'à deux fois leur taille.
      maxFontSizeMultiplier={maxScale}
      style={{
        fontFamily: fontName(style.family, weight ?? style.weight),
        // La graisse est déjà dans le fichier de police : on n'en redemande pas une au système,
        // qui sinon « grossirait » les lettres une deuxième fois.
        fontWeight: 'normal',
        fontSize: style.size,
        lineHeight: style.lineHeight,
        // L'interlettrage est donné en fraction de la taille : on le convertit en points.
        letterSpacing: style.size * style.tracking,
        color: colors[toneColor[tone]],
        // « ...(condition ? {…} : null) » n'ajoute la propriété que si elle a une valeur.
        ...(align ? { textAlign: align } : null),
        ...(tabular ? { fontVariant: ['tabular-nums'] as const } : null),
        ...(underline ? { textDecorationLine: 'underline' as const } : null),
      }}
      {...rest}
    >
      {children}
    </NativeText>
  )
}
