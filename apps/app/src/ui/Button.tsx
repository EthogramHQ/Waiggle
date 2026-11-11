// Un bouton en forme de pilule. Cinq styles :
// - primary   : l'action principale de l'écran, en miel (une seule par écran, idéalement) ;
// - secondary : une action possible, blanche et bordée ;
// - danger    : une action qui supprime, en rouge pâle ;
// - confirm   : la confirmation finale d'une suppression, en rouge plein, avec un reflet et un halo ;
// - glass     : un bouton posé sur une image ou une lumière d'ambiance.
// Quatre tailles (Miel 2), lues dans le jeton `layout.controlHeight` : xl (56, l'action d'une page
// d'accueil), regular (52, par défaut), compact (44, dans une carte, une barre) et small (36, une
// action discrète). Le petit bouton se dessine sur 36 points, mais le doigt garde ses 44 : voir
// plus bas, « cadre ».
// Sous le doigt, le bouton s'enfonce légèrement avec un ressort (voir theme/motion.ts).
// Pendant une action en cours (loading), il ignore les appuis pour éviter les doubles envois, mais
// garde le focus du clavier : désactivé pour de bon, le navigateur le retirerait du parcours au
// clavier, et le focus retomberait tout en haut de la page.
// Avec `checked`, il devient un interrupteur (« Suivre » / « Suivi ») : le lecteur d'écran annonce
// son état, activé ou non, au lieu d'un simple bouton. Avec `role="link"`, il se lit « lien » : il
// mène à une autre page (R7b).
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { type ReactNode, type Ref, useCallback, useLayoutEffect, useRef } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { describedBy } from './aria'
import { Icon, type IconName } from './Icon'
import { spaceToggles } from './keyboard'
import { Text, type Tone } from './Text'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'confirm' | 'glass'

/** Les tailles du bouton, dans l'ordre : leur hauteur dessinée vient de `layout.controlHeight`. */
export type ButtonSize = keyof typeof layout.controlHeight

/** Les propriétés du bouton, reprises par ceux qui l'enrobent (RetryButton). */
export type ButtonProps = Props

type Props = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  /** xl : 56 points ; regular : 52 ; compact : 44 (carte, barre) ; small : 36 dessinés, 44 à toucher. */
  size?: ButtonSize
  icon?: IconName
  /**
   * L'icône après le libellé plutôt qu'avant (R5a) : la flèche « ↗ » d'un lien qui sort de
   * l'appli (« Ouvrir le site ↗ », comme « Tester ↗ » de `TestLink`). Décorative, comme avant.
   */
  iconAfter?: boolean
  /**
   * Un décor posé avant le libellé, à la place d'une icône : les visages des auteurs dans le
   * bouton des nouveautés du fil (`AvatarStack` sans nom). Toujours décoratif : le nom du bouton
   * reste son libellé, le décor doit être caché aux lecteurs d'écran par celui qui le fournit.
   */
  leading?: ReactNode
  loading?: boolean
  disabled?: boolean
  /**
   * Inactif mais toujours atteignable au clavier (web) : le bouton reste une étape de Tab, annoncé
   * « désactivé » (`aria-disabled`), et un appui ne fait rien. Pour un bouton dont on doit pouvoir
   * apprendre pourquoi il attend (R6a : « Enregistrer » grisé, décrit par « Rien à enregistrer pour
   * l'instant. ») : la raison se lie par `describedById` (web) et `hint` (téléphone). Un bouton
   * désactivé pour de bon sort du parcours au clavier, et sa raison avec lui. Sur téléphone, les
   * lecteurs d'écran atteignent déjà un bouton désactivé : rien ne change.
   */
  focusableWhenDisabled?: boolean
  /** Le nom lu par les lecteurs d'écran, s'il diffère du texte affiché (« Suivi » → « Suivre Léa »). */
  spokenLabel?: string
  /** Fait du bouton un interrupteur, activé ou non (role « switch »). */
  checked?: boolean
  /**
   * Le texte (caché) qui précise sur quoi porte le bouton, quand plusieurs boutons portent le même
   * nom (« Retirer » sur chaque carte de la modération) : relié par aria-describedby sur le web.
   */
  describedById?: string | undefined
  /** La même précision sur téléphone, où aria-describedby n'existe pas : un indice lu après le nom. */
  hint?: string | undefined
  /**
   * `link` : un bouton qui mène à une autre page (« Le coin des testeurs », R7b) se lit « lien »,
   * comme ce qu'il fait ; il reste dessiné et touché comme un bouton. `button` par défaut. Sans
   * effet avec `checked` (un interrupteur reste un interrupteur).
   */
  role?: 'button' | 'link'
  /** Pour y poser le focus du clavier depuis le composant qui l'utilise (voir NoteComposer). */
  ref?: Ref<View>
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  iconAfter = false,
  leading,
  loading = false,
  disabled = false,
  focusableWhenDisabled = false,
  spokenLabel,
  checked,
  describedById,
  hint,
  role = 'button',
  ref,
}: Props) {
  const { colors, shadows } = useTheme()
  const spokenRole = checked === undefined ? role : 'switch'
  // Le rôle « lien » sur le web. react-native-web choisit la balise d'après le rôle : `<button>`
  // pour un bouton, mais `<div>` pour un lien sans adresse. Le même bouton qui passe de
  // « Rejoindre les testeurs » (bouton) à « Le coin des testeurs » (lien) changerait alors de
  // balise : React remplacerait l'élément, et le focus du clavier tomberait sur la page. On garde
  // donc la balise `<button>` (Entrée et Espace l'activent d'eux-mêmes) et l'on écrit le rôle sur
  // l'élément, comme `title` dans RelativeTime. Sur téléphone, `accessibilityRole` suffit.
  const webLink = Platform.OS === 'web' && spokenRole !== 'switch'
  const node = useRef<View | null>(null)
  // useLayoutEffect : le rôle est écrit avant que le navigateur dessine, avant toute lecture.
  useLayoutEffect(() => {
    if (!webLink) return
    const element = node.current as unknown as HTMLElement | null
    element?.setAttribute?.('role', spokenRole)
  }, [webLink, spokenRole])
  // Deux mains sur la même vue : la nôtre (le rôle) et celle de l'appelant (le focus).
  const setRefs = useCallback(
    (view: View | null) => {
      node.current = view
      if (typeof ref === 'function') ref(view)
      else if (ref) (ref as { current: View | null }).current = view
    },
    [ref],
  )
  const inactive = disabled || loading
  // Inactif mais gardé dans le parcours au clavier (web) : le Pressable reste désactivé (il ignore
  // clic, Entrée et Espace, et react-native-web en tire `aria-disabled`), mais avec une étape de
  // Tab explicite : sans elle, react-native-web lui donnerait `tabIndex -1`.
  const keptInTab = Platform.OS === 'web' && disabled && focusableWhenDisabled
  const small = size === 'small'
  // La hauteur dessinée. Plus basse que la zone à toucher (le petit bouton), la pilule se pose
  // dans un « cadre » invisible de 44 points : c'est lui que le doigt touche. Un débord invisible
  // (hitSlop) ne suffirait pas : react-native-web l'ignore, et le web aussi se touche du doigt.
  const drawn = layout.controlHeight[size]
  const framed = drawn < layout.touchTarget

  // Une « valeur partagée » : un nombre que Reanimated anime sans redessiner le composant.
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // L'apparence de chaque style : fond, bordure, ombre et couleur du texte.
  const looks: Record<ButtonVariant, { box: ViewStyle; pressed: ViewStyle; tone: Tone }> = {
    primary: {
      box: { backgroundColor: colors.honey, boxShadow: `${shadows.highlight}, ${shadows.honey}` },
      pressed: { backgroundColor: colors.honeyPressed },
      tone: 'onHoney',
    },
    secondary: {
      box: {
        backgroundColor: colors.surface,
        borderWidth: borders.strong,
        borderColor: colors.outline,
      },
      pressed: { backgroundColor: colors.surfaceGrouped },
      tone: 'default',
    },
    danger: {
      box: { backgroundColor: colors.dangerSoft },
      pressed: { borderWidth: borders.strong, borderColor: colors.dangerBorder },
      tone: 'danger',
    },
    // Le geste qui ne se défait pas : le rouge plein reçoit le même reflet que le miel, et son halo
    // rouge (jeton shadows.danger) le détache de la fenêtre de confirmation.
    confirm: {
      box: { backgroundColor: colors.danger, boxShadow: `${shadows.highlight}, ${shadows.danger}` },
      // Appuyé, un rouge plus sombre plutôt qu'un bouton transparent : le blanc y garde 6,6:1 au
      // lieu de tomber à 4,0:1 sur une feuille claire (relecture de design R2).
      pressed: { backgroundColor: colors.dangerPressed },
      tone: 'onDanger',
    },
    glass: {
      box: {
        backgroundColor: colors.glass,
        borderWidth: borders.hairline,
        borderColor: colors.glassBorder,
        boxShadow: `${shadows.highlight}, ${shadows.float}`,
      },
      pressed: { backgroundColor: colors.panel },
      tone: 'default',
    },
  }
  const look = looks[variant]
  // Un bouton miel inactif garde sa forme mais pâlit, sans ombre.
  const inactiveHoney = inactive && variant === 'primary'
  const tone: Tone = inactiveHoney ? 'disabled' : look.tone

  // La pilule dessinée : sa hauteur, sa forme et son apparence, selon qu'elle est appuyée.
  const pill = (pressed: boolean): StyleProp<ViewStyle> => [
    {
      minHeight: drawn,
      borderRadius: radii.pill,
      paddingHorizontal: small ? space.lg : space.xl,
      // Si le texte agrandi passe sur deux lignes, il garde de l'air au-dessus et au-dessous.
      paddingVertical: small ? space.xs : space.sm,
      flexDirection: 'row',
      gap: space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    look.box,
    // Un interrupteur blanc activé (« Projet suivi ») prend une teinte miel légère : on voit
    // son état d'un coup d'œil, pas seulement à son icône.
    checked && variant === 'secondary' && { backgroundColor: colors.honeySoft },
    pressed && look.pressed,
    inactiveHoney && { backgroundColor: colors.honeyDisabled, boxShadow: 'none' },
    inactive && !inactiveHoney && { opacity: 0.55 },
    // Inactif, le bouton rouge perd son halo : il n'appelle plus le geste.
    inactive && variant === 'confirm' && { boxShadow: 'none' },
  ]

  // L'icône, avant ou après le libellé (`iconAfter`). flexShrink: 0 : elle garde sa taille quand
  // le libellé passe sur deux lignes.
  const glyph = icon ? (
    <View style={{ flexShrink: 0 }}>
      <Icon name={icon} size={small ? 16 : 20} tone={tone} />
    </View>
  ) : null

  const content: ReactNode = (
    <>
      {/* Pendant le chargement, le libellé reste en place mais invisible et l'indicateur se pose
          par-dessus : le bouton garde sa largeur, et ce qui l'entoure (le titre d'un en-tête)
          ne saute pas. */}
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          // minWidth: 0 : sans lui, une rangée ne descend pas sous la largeur de son contenu, et
          // le libellé ne se replierait pas.
          flexShrink: 1,
          minWidth: 0,
          opacity: loading ? 0 : 1,
          // Avec un décor (les visages des nouveautés), la rangée passe à la ligne quand le libellé
          // ne tient plus à côté (320 points, texte à 200 %) : le décor reste au-dessus, et le
          // libellé garde toute la largeur au lieu d'être coupé au milieu d'un mot.
          ...(leading ? { flexWrap: 'wrap' as const, rowGap: space.xs } : null),
        }}
      >
        {/* flexShrink: 0 : l'icône ou le décor gardent leur taille quand le libellé passe sur deux
            lignes. */}
        {leading ? <View style={{ flexShrink: 0 }}>{leading}</View> : null}
        {icon && !iconAfter ? glyph : null}
        {/* selectable={false} : un double-clic n'y surligne pas de texte. breakAnywhere : un nom de
            site très long (« Continuer vers … ») se coupe au lieu de sortir du bouton. Le petit
            bouton prend le texte d'une carte, en gras : celui des boutons ne tiendrait pas dans
            ses 36 points. */}
        <Text
          variant={small ? 'callout' : 'button'}
          {...(small ? { weight: 700 as const } : null)}
          tone={tone}
          align="center"
          selectable={false}
          breakAnywhere
        >
          {label}
        </Text>
        {icon && iconAfter ? glyph : null}
      </View>
      {loading ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : null}
    </>
  )

  return (
    // Deux couches : Animated.View porte l'enfoncement animé, Pressable reçoit le doigt.
    // Jamais plus large que la place donnée (maxWidth), et prêt à rétrécir dans une rangée
    // (flexShrink) : à texte agrandi (200 %, 320 points), le libellé passe alors à la ligne au lieu
    // de sortir de l'écran. Sur le web, une vue ne rétrécit pas d'elle-même (flexShrink: 0 par
    // défaut dans react-native-web) : « Suivre ce projet » mesurait 329 points dans un écran de 320.
    <Animated.View style={[{ maxWidth: '100%', flexShrink: 1 }, animated]}>
      <Pressable
        ref={setRefs}
        // Sur le web, la balise reste celle d'un bouton ; le rôle « lien » est écrit plus haut.
        accessibilityRole={webLink ? 'button' : spokenRole}
        accessibilityLabel={spokenLabel ?? label}
        {...describedBy(describedById)}
        // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle (comme IconButton).
        accessibilityHint={Platform.OS === 'web' ? undefined : hint}
        aria-checked={checked}
        // Les lecteurs d'écran annoncent « désactivé » ou « occupé ». Les propriétés aria-… sont les
        // seules que react-native-web transmet au navigateur (accessibilityState y est ignoré) ;
        // React Native les lit aussi sur téléphone.
        aria-disabled={inactive}
        aria-busy={loading}
        // Sur le web, un bouton occupé reste dans le parcours au clavier (voir plus haut) ; sur
        // téléphone, il n'y a pas ce souci : il est désactivé, et annoncé comme tel.
        disabled={Platform.OS === 'web' ? disabled : inactive}
        {...(keptInTab ? { tabIndex: 0 as const } : null)}
        // Pendant le chargement, l'appui ne fait rien (le bouton reste pourtant focalisable) ; un
        // bouton inactif gardé dans Tab non plus (Entrée, Espace, clic).
        onPress={() => {
          if (!inactive) onPress()
        }}
        // Un interrupteur s'active aussi avec la barre d'espace sur le web (voir keyboard.ts).
        {...(checked === undefined ? null : spaceToggles(onPress, inactive))}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le style dépend de l'état « appuyé ». Le contour du focus clavier, lui, est commun à tous
        // les éléments touchables : une règle CSS dans app/+html.tsx (« :focus-visible »). Le cadre
        // du petit bouton est arrondi lui aussi : ce contour y garde la forme d'une pilule.
        style={(state) =>
          framed
            ? { minHeight: layout.touchTarget, justifyContent: 'center', borderRadius: radii.pill }
            : pill(state.pressed)
        }
      >
        {(state) => (framed ? <View style={pill(state.pressed)}>{content}</View> : content)}
      </Pressable>
    </Animated.View>
  )
}
