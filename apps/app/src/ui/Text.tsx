// Le texte de l'appli. Tout texte affiché passe par ce composant, qui choisit la police, la taille et
// la couleur à partir des jetons de @ruche/brand. Un écran dit ce qu'est le texte (un titre de
// projet, une légende) et pas à quoi il ressemble : pour changer tous les titres, on change le jeton.
import {
  type FontFamily,
  type FontWeight,
  maxTextScale,
  readableWidth,
  type TextVariant,
  textStyles,
} from '@ruche/brand'
import type { ReactNode } from 'react'
import {
  Text as NativeText,
  type TextProps as NativeTextProps,
  Platform,
  type TextStyle,
} from 'react-native'
import { fontFiles, fontName, monoFont } from './theme/fonts'
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
  | 'onBadge'

/**
 * Les couleurs que seul un texte peut prendre, en plus de celles qu'il partage avec les icônes : le
 * nom de l'auteur sur une tuile de miel (un brun) et le texte posé sur une tuile d'encre (la couleur
 * du fond de page, qui s'y lit comme l'encre sur la page : le contraste est le même).
 */
export type TextTone = Tone | 'onHoneyTile' | 'onInk'

// Sur le web, un mot sans espace plus large que l'écran déborde ; « overflow-wrap: anywhere » le
// coupe. Les téléphones le font déjà d'eux-mêmes. Cette propriété CSS manque aux types de React
// Native : on la déclare donc ici, une fois.
const breakAnywhereStyle = (Platform.OS === 'web' ? { overflowWrap: 'anywhere' } : {}) as TextStyle

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
  onBadge: 'onBadge',
  onHoneyTile: 'onHoneyTile',
  onInk: 'background',
} as const satisfies Record<TextTone, string>

/**
 * La police d'un rôle de texte. Geist Mono (les rôles `mono` et `code`) n'est pas encore livrée :
 * tant que son fichier manque à `fontFiles`, on prend la police à chasse fixe du système
 * (`monoFont`). Le jour où Geist Mono y entre, ce texte la prend sans autre changement.
 */
const fontFamilyOf = (family: FontFamily, weight: FontWeight): string => {
  const name = fontName(family, weight)
  return family === 'mono' && !(name in fontFiles) ? monoFont : name
}

/**
 * Le nom géant d'un outil (`toolName`, `toolNameWide`) tient sur une ligne : il rétrécit quand il
 * est long, plutôt que de passer à la ligne au milieu d'un mot.
 * - Sur téléphone, React Native le fait seul : `adjustsFontSizeToFit` avec `numberOfLines={1}`.
 * - Sur le web, ces deux réglages n'existent pas. La taille devient une formule CSS, `clamp(min,
 *   idéal, max)` : l'idéal partage la largeur de l'écran (moins ses marges) entre les lettres du
 *   nom, environ 0,58 de la taille chacune pour cette police serrée ; jamais plus grand que le
 *   jeton, jamais plus petit qu'un titre de carte. L'interlettrage et la hauteur de ligne
 *   passent en proportions (em, sans unité), pour suivre la taille calculée.
 */
const giantVariants: readonly TextVariant[] = ['toolName', 'toolNameWide']
/** La largeur moyenne d'une lettre de Funnel Display grasse et serrée, en fraction de sa taille. */
const GIANT_LETTER_WIDTH = 0.58
/** Les marges de l'écran autour du nom, de part et d'autre, en points (≈ deux fois 24). */
const GIANT_MARGINS = 48
const giantWebStyle = (variant: TextVariant, children: ReactNode): TextStyle => {
  const style = textStyles[variant]
  const letters = typeof children === 'string' ? Math.max(Array.from(children).length, 1) : 8
  const ideal = `calc((100vw - ${GIANT_MARGINS}px) / ${(letters * GIANT_LETTER_WIDTH).toFixed(2)})`
  // Le plancher : la taille d'un titre de carte. Un nom très long qui n'y tient toujours pas passe
  // à la ligne entre ses mots, plutôt que de sortir de l'écran.
  const smallest = textStyles.title3.size
  // Les types de React Native n'attendent que des nombres ici ; react-native-web passe les textes
  // tels quels au navigateur.
  return {
    fontSize: `clamp(${smallest}px, ${ideal}, ${style.size}px)`,
    lineHeight: `${(style.lineHeight / style.size).toFixed(3)}`,
    letterSpacing: `${style.tracking}em`,
  } as unknown as TextStyle
}

export type TextProps = {
  children: ReactNode
  variant?: TextVariant
  tone?: TextTone
  /** Remplace la graisse prévue par la variante (par exemple un libellé en gras). */
  weight?: FontWeight
  align?: 'left' | 'center' | 'right'
  /** Chiffres de même largeur, pour que les compteurs ne bougent pas quand ils changent. */
  tabular?: boolean
  /** Souligné (liens). */
  underline?: boolean
  /** Agrandissement maximal avec le réglage de taille de l'appareil (2 par défaut). */
  maxScale?: number
  /**
   * Coupe un mot trop long n'importe où plutôt que de le laisser dépasser de l'écran (une adresse
   * de site, un nom sans espace).
   */
  breakAnywhere?: boolean
  /** Une ligne de longueur confortable (readableWidth), même sur un grand écran. */
  readable?: boolean
  /**
   * Fait du texte un titre, de ce niveau (voir `headingLevel` plus bas) : 1 pour le titre de la
   * page, 2 pour ses sections, 3 et 4 en dessous (les titres écrits par les membres).
   */
  heading?: HeadingLevel
  /**
   * Le rôle lu par les lecteurs d'écran. « header » en est exclu : un titre passe par `heading`,
   * qui porte aussi son niveau ; un titre sans niveau ne compile plus.
   */
  accessibilityRole?: Exclude<NativeTextProps['accessibilityRole'], 'header'>
} & Pick<
  NativeTextProps,
  | 'numberOfLines'
  | 'selectable'
  | 'accessibilityLabel'
  // « polite » : un texte qui apparaît en cours de route est lu par les lecteurs d'écran, sans
  // couper ce qu'ils disent (par exemple « Préparation de la photo… »).
  | 'accessibilityLiveRegion'
  | 'accessible'
  | 'onPress'
  | 'testID'
  | 'nativeID'
>

/** Les niveaux de titre de l'appli : la page (1), ses sections (2), puis dessous (3, 4). */
export type HeadingLevel = 1 | 2 | 3 | 4

/**
 * Les propriétés d'un titre, à étaler sur un texte (`{...headingLevel(2)}`). Un lecteur d'écran
 * parcourt une page par ses titres, et leur niveau dit ce qui est dans quoi : « Description »
 * (niveau 2) appartient au projet (niveau 1), « La recette » (niveau 3) à la description. Si tous
 * les titres ont le même niveau, la page paraît une suite de pages sans lien.
 * - Partout, le rôle « header » : sur téléphone, VoiceOver et TalkBack l'annoncent « titre » (ils
 *   ne connaissent pas de niveau).
 * - Sur le web, `aria-level` en plus : react-native-web en fait une vraie balise `<h1>` à `<h4>`
 *   (sans lui, tout titre devient un `<h1>`). Cette propriété manque aux types de React Native.
 */
export const headingLevel = (level: HeadingLevel): object => ({
  accessibilityRole: 'header',
  ...(Platform.OS === 'web' ? { 'aria-level': level } : null),
})

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  weight,
  align,
  tabular = false,
  underline = false,
  maxScale = maxTextScale,
  breakAnywhere = false,
  readable = false,
  heading,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const style = textStyles[variant]
  const giant = giantVariants.includes(variant)
  return (
    <NativeText
      // Les textes grandissent avec le réglage de taille de l'appareil, jusqu'à deux fois leur taille.
      maxFontSizeMultiplier={maxScale}
      // Le nom géant d'un outil rétrécit pour tenir sur une ligne (téléphone ; le web le fait par
      // sa formule de taille, plus bas).
      {...(giant && Platform.OS !== 'web'
        ? { numberOfLines: 1, adjustsFontSizeToFit: true }
        : null)}
      style={{
        fontFamily: fontFamilyOf(style.family, weight ?? style.weight),
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
        ...(breakAnywhere ? breakAnywhereStyle : null),
        ...(readable ? { maxWidth: readableWidth } : null),
        ...(giant && Platform.OS === 'web' ? giantWebStyle(variant, children) : null),
      }}
      {...rest}
      {...(heading ? headingLevel(heading) : null)}
    >
      {children}
    </NativeText>
  )
}
