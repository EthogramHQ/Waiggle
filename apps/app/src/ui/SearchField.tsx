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
// - le texte suit la taille de texte de l'appareil, et le champ rétrécit (minWidth 0) au lieu de
//   déborder de la barre à 200 % ;
// - sur le web, Entrée ne fait pas perdre le focus (`blurOnSubmit`), et Échap vide le champ ;
// - la croix est dans un cadre de 44 points (sur le web, `hitSlop` n'existe pas), et rend le focus
//   au champ en disparaissant : sinon le clavier retombait en haut de la page.
//
// Ce fichier exporte aussi `SearchLink` : la même pilule, mais un lien (vers la page de recherche),
// pour la barre du haut hors de cette page. Taper dans un champ qui change de page en cours de
// frappe perdrait des lettres ; le lien ouvre la page, dont le champ prend le focus.
import { borders, layout, radii, space, textStyles } from '@ruche/brand'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, TextInput, View } from 'react-native'
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
}

/**
 * La largeur en dessous de laquelle un champ qui prend la place qui reste (`grow`) passe plutôt à
 * la ligne, dans une rangée qui le permet : à texte agrandi, la barre du haut garde un champ où
 * l'on voit ce qu'on tape, au lieu d'un champ écrasé à quelques points.
 */
const GROW_BASIS = 220

/** La pilule commune au champ et au lien : fond blanc, bord fin, bord de focus quand il le faut. */
const usePill = (focused: boolean, grow: boolean) => {
  const { colors } = useTheme()
  return {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.xs,
    minHeight: layout.touchTarget,
    // Rétrécit dans une rangée au lieu de la pousser hors de l'écran (texte agrandi).
    flexShrink: 1,
    minWidth: 0,
    ...(grow ? { flexGrow: 1, flexBasis: GROW_BASIS } : null),
    paddingLeft: space.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: focused ? borders.strong : borders.hairline,
    borderColor: focused ? colors.focusRing : colors.groupBorder,
  }
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

  return (
    <View style={pill}>
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
          minHeight: layout.touchTarget - 2,
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
export function SearchButton({ label, href, onPress }: Omit<LinkProps, 'placeholder' | 'grow'>) {
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

type LinkProps = {
  /** Le nom lu (« Rechercher ») ; le texte d'attente affiché ne l'est pas. */
  label: string
  placeholder: string
  href: string
  onPress: () => void
  /** Prend la place qui reste dans une rangée, comme le champ (`SearchField grow`). */
  grow?: boolean
}

/**
 * La pilule de recherche, mais un lien : hors de la page de recherche, elle y mène (la barre du
 * haut). Elle a l'air d'un champ vide, pour qu'on sache où chercher.
 */
export function SearchLink({ label, placeholder, href, onPress, grow = false }: LinkProps) {
  const pill = usePill(false, grow)
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...linkProps(href, false)}
      onPress={(event?: PressEvent) => {
        // Sur le web, le `<a>` ne recharge pas la page : c'est le routeur qui en change.
        if (Platform.OS === 'web') event?.preventDefault?.()
        onPress()
      }}
      style={({ pressed }) => ({
        ...pill,
        paddingRight: space.lg,
        ...(pressed ? { backgroundColor: colors.surfaceGrouped } : null),
      })}
    >
      <Icon name="magnifying-glass" size={20} tone="muted" />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text tone="muted" numberOfLines={1} selectable={false}>
          {placeholder}
        </Text>
      </View>
    </Pressable>
  )
}
