// Le champ de recherche (refonte, tranche R3) : une pilule blanche avec une loupe, un texte
// d'attente (« Un projet, une personne, un outil ») et, dès qu'on a tapé quelque chose, une croix
// « Effacer la recherche ». Il sert dans la barre du haut sur ordinateur et dans la page de
// recherche.
//
// Il reprend les gardes de TextField (relecture du plan, R2-E5 : un composant neuf reprend celles
// de l'existant le plus proche) :
// - un nom pour les lecteurs d'écran (« Rechercher »), sans étiquette visible : la loupe et le
//   texte d'attente suffisent à l'œil. Le nom passe par `aria-label`, que React Native et
//   react-native-web comprennent tous deux ;
// - le focus se voit : la bordure prend la couleur de l'anneau de focus ;
// - toucher la loupe ou le bord de la pilule donne le focus à la saisie (charte : toucher l'icône
//   d'un champ donne le focus), et la saisie elle-même fait 44 points de haut ;
// - le texte suit la taille de texte de l'appareil, et le champ rétrécit (minWidth 0) au lieu de
//   déborder de la barre à 200 % ;
// - avec une action à côté (« Annuler » de la page de recherche, prop `action`), l'action passe
//   sous le champ quand le texte est grand, au lieu de l'écraser à quelques points (R3, relecture
//   de design, point 5 : à 320 points et 200 %, on lisait « Un p ») ;
// - sur le web, Entrée ne fait pas perdre le focus (`blurOnSubmit`), et Échap vide le champ ;
// - la croix est dans un cadre de 44 points (sur le web, `hitSlop` n'existe pas), et rend le focus
//   au champ en disparaissant : sinon le clavier retombait en haut de la page.
//
// Ce fichier exporte aussi `SearchButton`, la loupe seule de la barre du haut en largeur moyenne,
// et `usePill`, la pilule que partage `SearchLink` (le lien qui a l'air d'un champ, SearchLink.tsx).
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import { type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, Platform, Pressable, TextInput, View } from 'react-native'
import { Icon } from './Icon'
import type { PressEvent } from './ListGroup'
import { linkProps } from './SettingsNav'
import { Text } from './Text'
import { TAP_GUARD_MS } from './tapGuard'
import { fontName } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  value: string
  onChangeText: (text: string) => void
  /** Entrée (ou « Rechercher » du clavier du téléphone) : chercher tout de suite. */
  onSubmit?: () => void
  /** Le champ vient d'être vidé, par la croix ou par Échap (en plus de `onChangeText('')`). */
  onClear?: () => void
  /** Le champ prend le focus dès qu'il paraît (la page de recherche, ouverte pour chercher). */
  autoFocus?: boolean
  placeholder: string
  /** Le nom lu par les lecteurs d'écran (« Rechercher »). */
  label: string
  /** Prend la place qui reste dans une rangée (la barre du haut) ; voir `GROW_BASIS`. */
  grow?: boolean
  /**
   * Un bouton posé à droite du champ (« Annuler » de la page de recherche, sur téléphone). Il passe
   * sous le champ quand le texte est grand ; voir `ACTION_BASIS`.
   */
  action?: ReactNode
}

/**
 * La largeur en dessous de laquelle un champ qui prend la place qui reste (`grow`) passe plutôt à
 * la ligne, dans une rangée qui le permet : à texte agrandi, la barre du haut garde un champ où
 * l'on voit ce qu'on tape, au lieu d'un champ écrasé à quelques points.
 */
const GROW_BASIS = 220

/**
 * La largeur que le champ garde à côté de son action, au texte de taille normale ; elle grandit
 * avec le texte (`scale`). En dessous, l'action passe sous le champ. 160 points : à 320 points de
 * large et au texte normal, le champ et « Annuler » tiennent sur une ligne ; dès 150 % de texte,
 * « Annuler » passe dessous (mesuré à 320 et 390 points).
 */
const ACTION_BASIS = 160

/**
 * La pilule commune au champ et au lien (SearchLink) : fond blanc, bord fin, bord de focus quand il
 * le faut. Le bord de focus est plus épais : une marge compense la différence, pour que la pilule
 * garde la même taille et que rien ne bouge quand le champ prend ou perd le focus.
 */
export const usePill = (focused: boolean, grow: boolean) => {
  const { colors } = useTheme()
  const width = focused ? borders.strong : borders.hairline
  return {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: layout.touchTarget,
    // Rétrécit dans une rangée au lieu de la pousser hors de l'écran (texte agrandi).
    flexShrink: 1,
    minWidth: 0,
    ...(grow ? { flexGrow: 1, flexBasis: GROW_BASIS } : null),
    margin: borders.strong - width,
    paddingLeft: space.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: width,
    borderColor: focused ? colors.focusRing : colors.outline,
  }
}

/**
 * Hook : la taille du texte par rapport à la normale (1 au texte normal, 2 à 200 %). Elle se lit sur
 * la hauteur d'une ligne de texte invisible : `fontScale` vaut toujours 1 sur le web, où un texte
 * agrandi (réglage du navigateur, essais à 200 %) ne se voit qu'à la taille des lettres. Rend la
 * mesure et la ligne à poser (hors du flux, cachée à l'œil et aux lecteurs d'écran).
 */
const useTextScale = (sample: string) => {
  const [scale, setScale] = useState(1)
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height / textStyles.body.lineHeight
    // Une mesure à 0 (vue pas encore dessinée) ne dit rien.
    if (next > 0 && Math.abs(next - scale) > 0.05) setScale(next)
  }
  const probe = (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      onLayout={measure}
      style={{ position: 'absolute', top: 0, left: 0, opacity: 0 }}
    >
      <Text numberOfLines={1} selectable={false}>
        {sample}
      </Text>
    </View>
  )
  return { scale, probe }
}

export function SearchField({
  value,
  onChangeText,
  onSubmit,
  onClear,
  autoFocus = false,
  placeholder,
  label,
  grow = false,
  action,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)
  // useRef : une poignée vers la saisie, pour lui rendre le focus quand la croix disparaît.
  const input = useRef<TextInput>(null)
  // Le dernier envoi (Entrée) : la seconde Entrée d'une double frappe, dans la même fenêtre que la
  // garde des fenêtres (TAP_GUARD_MS), ne relance pas la recherche.
  const lastSubmit = useRef<number | null>(null)
  const pill = usePill(focused, grow)
  const body = textStyles.body
  const { scale, probe } = useTextScale(placeholder)

  const clear = () => {
    onChangeText('')
    onClear?.()
  }

  const submit = () => {
    if (!onSubmit) return
    const now = Date.now()
    const previous = lastSubmit.current
    lastSubmit.current = now
    if (previous !== null && now - previous < TAP_GUARD_MS) return
    onSubmit()
  }

  const field = (
    // Toute la pilule se touche : la loupe ou le bord donnent le focus à la saisie. Ce n'est pas un
    // contrôle de plus pour les lecteurs d'écran ni pour Tab (la saisie est déjà là) : ni rôle, ni
    // arrêt du clavier (sur le web, Pressable se met dans l'ordre de Tab sans `tabIndex` -1).
    <Pressable
      accessible={false}
      focusable={false}
      {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
      onPress={() => input.current?.focus()}
      style={pill}
    >
      {/* La loupe est décorative : le nom du champ dit déjà ce qu'il fait. */}
      <Icon name="magnifying-glass" size={20} tone="muted" />
      <TextInput
        ref={input}
        aria-label={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        // Le champ de recherche du navigateur (type="search") ajoute sa propre croix : on garde
        // la nôtre, nommée et de 44 points. D'où un champ texte ordinaire.
        onSubmitEditing={submit}
        // Entrée cherche sans quitter le champ (web) : on corrige ou complète tout de suite.
        // react-native-web lit encore `blurOnSubmit` (pas `submitBehavior`).
        {...(Platform.OS === 'web' && onSubmit ? { blurOnSubmit: false } : null)}
        // Échap vide le champ (web) ; déjà vide, il laisse la touche au navigateur.
        onKeyPress={(event) => {
          if (Platform.OS !== 'web') return
          const native = event.nativeEvent as { key: string; preventDefault?: () => void }
          if (native.key !== 'Escape' || value === '') return
          native.preventDefault?.()
          clear()
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: fontName(body.family, body.weight),
          fontSize: body.size,
          lineHeight: body.lineHeight,
          color: colors.text,
          // La saisie elle-même fait 44 points de haut : c'est elle que l'on touche et que les
          // outils mesurent (relecture de l'interface de R3, C5).
          minHeight: layout.touchTarget,
          paddingVertical: space.xs,
          // Sur le web, le navigateur dessine son propre contour : la bordure de la pilule s'en
          // charge déjà.
          outlineWidth: 0,
        }}
      />
      {value !== '' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(($) => $.search.clear)}
          onPress={() => {
            clear()
            // La croix disparaît avec le texte : le focus revient au champ, pas en haut de page.
            input.current?.focus()
          }}
          style={({ pressed }) => ({
            width: layout.touchTarget,
            height: layout.touchTarget,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            ...(pressed ? { backgroundColor: colors.surfaceGrouped } : null),
          })}
        >
          <Icon name="x" size={18} tone="muted" />
        </Pressable>
      ) : (
        // Sans texte, la place de la croix reste : le champ garde sa largeur de saisie.
        <View style={{ width: space.md }} />
      )}
    </Pressable>
  )

  if (!action) return field
  // Le champ et son action sur une rangée qui passe à la ligne : le champ demande au moins
  // ACTION_BASIS points (plus au texte agrandi) ; s'il ne les a pas, l'action passe dessous.
  // `flexBasis` réelle et `flexGrow` (jamais `flex: 1`, qui part de 0 et ne fait jamais passer la
  // ligne : charte, R3).
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
      {probe}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: ACTION_BASIS * scale, minWidth: 0 }}>
        {field}
      </View>
      {action}
    </View>
  )
}

/**
 * La loupe seule, lien vers la page de recherche : la barre du haut en largeur moyenne, où le champ
 * n'a pas la place. Un rond de 44 points.
 *
 * Son nom (« Rechercher ») est un texte caché à l'œil mais lu, et non un `aria-label` : le nom du
 * champ s'écrit pareil, et un nom posé en étiquette ferait croire aux outils (et aux tests qui
 * cherchent le champ par son étiquette) qu'un champ « Rechercher » est là. Un texte rendu invisible
 * par l'opacité reste dans l'arbre d'accessibilité, sur le web comme sur téléphone.
 */
export function SearchButton({ label, href, onPress }: ButtonProps) {
  const { colors, shadows } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      {...linkProps(href, false)}
      onPress={(event?: PressEvent) => {
        if (Platform.OS === 'web') event?.preventDefault?.()
        onPress()
      }}
      style={({ pressed }) => ({
        width: layout.touchTarget,
        height: layout.touchTarget,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        // Le même verre que la cloche voisine (IconButton `glass`).
        backgroundColor: pressed ? colors.surfaceGrouped : colors.glass,
        borderWidth: borders.hairline,
        borderColor: colors.glassBorder,
        boxShadow: `${shadows.highlight}, ${shadows.float}`,
      })}
    >
      <Icon name="magnifying-glass" size={22} />
      <View style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}>
        <Text selectable={false}>{label}</Text>
      </View>
    </Pressable>
  )
}

type ButtonProps = {
  /** Le nom lu (« Rechercher »). */
  label: string
  /** L'adresse de la page de recherche : sur le web, un vrai `<a href>`. */
  href: string
  onPress: () => void
}
