// Le texte de l'appli. Tout texte affiché passe par ce composant, qui choisit la police, la taille et
// la couleur à partir des jetons de @ruche/brand. Un écran dit ce qu'est le texte (un titre de
// projet, une légende) et pas à quoi il ressemble : pour changer tous les titres, on change le jeton.
import {
  type FontFamily,
  type FontWeight,
  maxHeadingScale,
  maxTextScale,
  readableWidth,
  type TextVariant,
  textStyles,
} from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import {
  Dimensions,
  Text as NativeText,
  type TextProps as NativeTextProps,
  Platform,
  type TextStyle,
} from 'react-native'
import type { Focusable } from './focus'
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
 * La police d'un rôle de texte. Geist Mono (les rôles `mono` et `code`) est livrée en 400 et 500 ;
 * si une graisse manquait un jour à `fontFiles`, on prendrait `monoFont` plutôt qu'une police que
 * l'appli n'a pas chargée.
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

/**
 * Un grand titre sur le web (R4, M5) : `maxScale` n'y existe pas (le navigateur n'agrandit pas les
 * `px`), alors le titre suit la largeur de l'écran, jamais plus grand que son jeton : `min(34px,
 * 8.5vw)`. Sur 320 points il tient à 27 points, et même un utilisateur qui agrandit tout le texte
 * (200 % : 54 points) garde « Réglages » et « Recherche » entiers sur une ligne ; dès 400 points de
 * large, la taille est celle du jeton. Une formule CSS, sans mesure ni rendu de plus (la page web
 * est pré-rendue sans connaître l'écran). La hauteur de ligne et l'interlettrage passent en
 * proportions pour suivre.
 */
const bigTitleWebStyle = (variant: TextVariant): TextStyle => {
  const style = textStyles[variant]
  return {
    fontSize: `min(${style.size}px, ${(style.size / 4).toFixed(2)}vw)`,
    lineHeight: `${(style.lineHeight / style.size).toFixed(3)}`,
    letterSpacing: `${style.tracking}em`,
  } as unknown as TextStyle
}

/** Le texte le plus agrandi que l'appli doit tenir : le réglage d'un téléphone poussé à 200 %. */
const LARGEST_TEXT_SCALE = 2

/**
 * Le nombre de lettres du plus long mot d'un texte. Seules les espaces ordinaires (et les sauts de
 * ligne) séparent deux mots : une espace insécable les lie en un bloc qui ne se coupe pas
 * (« projets · 3 »). `Array.from` compte les lettres, pas les unités du codage (un emoji = 1).
 */
const longestWord = (text: string) =>
  Math.max(1, ...text.split(/[ \t\n]+/).map((word) => Array.from(word).length))

/**
 * Un titre dont aucun mot ne doit se couper (R5b, « Commentaires 6 » dans la feuille, en `title2`) :
 * la formule des grands titres (`bigTitleWebStyle`), avec un troisième plafond, calculé sur le plus
 * long mot. Doublé par le texte agrandi, ce mot tient encore dans la largeur de l'écran moins ses
 * marges, sur 320 points comme ailleurs. La formule des grands titres est réglée sur 8 lettres
 * (« Réglages ») : « Commentaires » en a 12, et le titre d'une feuille (34 points) se coupait au
 * milieu du mot. Un titre court garde exactement la taille des autres titres.
 */
const wholeWordsWebStyle = (variant: TextVariant, words: string): TextStyle => {
  const style = textStyles[variant]
  const perLetter = LARGEST_TEXT_SCALE * longestWord(words) * GIANT_LETTER_WIDTH
  const fit = `calc((100vw - ${GIANT_MARGINS}px) / ${perLetter.toFixed(2)})`
  return {
    fontSize: `min(${style.size}px, ${(style.size / 4).toFixed(2)}vw, ${fit})`,
    lineHeight: `${(style.lineHeight / style.size).toFixed(3)}`,
    letterSpacing: `${style.tracking}em`,
  } as unknown as TextStyle
}

/**
 * La même garde sur téléphone, où le réglage de l'appareil agrandit le texte : l'agrandissement
 * s'arrête quand le plus long mot remplirait la largeur de la fenêtre (jamais sous 1). La largeur
 * est lue au rendu, sans s'abonner à ses changements : seul un titre qui l'a demandée la lit, et
 * le rendu suivant (une rotation redessine l'écran) prend la nouvelle.
 */
const wholeWordsScale = (variant: TextVariant, words: string) =>
  Math.max(
    1,
    (Dimensions.get('window').width - GIANT_MARGINS) /
      (longestWord(words) * GIANT_LETTER_WIDTH * textStyles[variant].size),
  )

export type TextProps = {
  children: ReactNode
  /**
   * Un texte dont aucun mot ne doit se couper, même agrandi à 200 % sur 320 points : la taille
   * descend assez pour que le plus long mot de ce texte tienne sur une ligne (voir
   * `wholeWordsWebStyle`). `CountedTitle` le donne au titre et à son nombre, qui gardent ainsi la
   * même taille.
   */
  wholeWords?: string
  variant?: TextVariant
  tone?: TextTone
  /** Remplace la graisse prévue par la variante (par exemple un libellé en gras). */
  weight?: FontWeight
  align?: 'left' | 'center' | 'right'
  /** Chiffres de même largeur, pour que les compteurs ne bougent pas quand ils changent. */
  tabular?: boolean
  /** Souligné (liens). */
  underline?: boolean
  /**
   * Agrandissement maximal avec le réglage de taille de l'appareil : 2 par défaut, 1,5 pour un grand
   * titre (`heading` 1 ou 2, voir plus bas).
   */
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
   * Pour poser le focus sur ce texte depuis le code (le titre d'une page à son arrivée, R4) : sur le
   * web, le texte devient focalisable par le code seulement (`tabIndex -1`), jamais par Tab.
   */
  focusRef?: Ref<Focusable>
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
  // Un texte qui est à lui seul un état (« Nouvel essai possible à 21:47 », RetryAt) : role status.
  | 'role'
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
  maxScale: maxScaleProp,
  breakAnywhere = false,
  readable = false,
  heading,
  focusRef,
  wholeWords,
  ...rest
}: TextProps) {
  const { colors } = useTheme()
  const style = textStyles[variant]
  const giant = giantVariants.includes(variant)
  // Un grand titre (niveau 1 ou 2, 22 points ou plus) grossit moins que le texte courant : doublé,
  // il ne tient plus sur 320 points et se coupe au milieu du mot (R4, M5). Un titre de groupe en
  // petites capitales (13 points) et les titres écrits par les membres (niveaux 3 et 4) gardent
  // l'agrandissement complet.
  const bigTitle = heading !== undefined && heading <= 2 && style.size >= textStyles.heading.size
  const maxScale = Math.min(
    maxScaleProp ?? (bigTitle ? maxHeadingScale : maxTextScale),
    wholeWords !== undefined && Platform.OS !== 'web'
      ? wholeWordsScale(variant, wholeWords)
      : Number.POSITIVE_INFINITY,
  )
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
        ...(bigTitle && Platform.OS === 'web' ? bigTitleWebStyle(variant) : null),
        // Après la formule des grands titres, qu'elle reprend en y ajoutant son plafond.
        ...(wholeWords !== undefined && Platform.OS === 'web'
          ? wholeWordsWebStyle(variant, wholeWords)
          : null),
      }}
      {...rest}
      {...(heading ? headingLevel(heading) : null)}
      // `Focusable` est le nom commun des vues qu'un écran focalise ; le texte natif en est une.
      {...(focusRef ? { ref: focusRef as unknown as Ref<NativeText> } : null)}
      {...(focusRef && Platform.OS === 'web' ? { tabIndex: -1 } : null)}
    >
      {children}
    </NativeText>
  )
}
