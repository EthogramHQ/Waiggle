// Un bouton rond qui n'affiche qu'une icône (retour, partager, plus…). Comme on ne voit pas de texte,
// le nom (`label`) est obligatoire : c'est lui que lisent les lecteurs d'écran (« Retour »), et
// lui qui permet aux tests de retrouver le bouton.
import { borders, layout, pressScale, pressScaleFab, radii, space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { ActivityIndicator, Platform, Pressable, View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { describedBy as describedByProps } from './aria'
import { BADGE_SIZE } from './CountBadge'
import { Icon, type IconName, type IconTone } from './Icon'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  icon: IconName
  label: string
  onPress: () => void
  /**
   * glass : sur une image ou une lumière ; plain : sur une surface ; honey : action principale ;
   * bare : répété dans une liste (le « … » de chaque commentaire), sans disque au repos ; il n'en
   * prend un, de verre, que sous le doigt ou quand ce qu'il ouvre est ouvert (`expanded`).
   */
  variant?: 'glass' | 'plain' | 'honey' | 'bare'
  /** regular : 44 points ; large : 64 (jeton `layout.fab`), sans l'enfoncement du bouton flottant. */
  size?: 'regular' | 'large'
  /**
   * Le bouton rond flottant (« + », publier un projet, Miel 2) : 64 points (jeton `layout.fab`),
   * et il s'enfonce davantage sous le doigt (`pressScaleFab`, 0,92 au lieu de 0,96) : plus petit
   * qu'une carte, il doit répondre de façon plus « physique ».
   */
  fab?: boolean
  disabled?: boolean
  /**
   * Une action est en route (l'envoi d'un commentaire) : le bouton est annoncé occupé, garde son nom,
   * montre une roue à la place de l'icône et ignore les appuis, pour éviter un double envoi. Il n'est
   * pas pour autant désactivé : sur le web, `disabled` le retirerait du parcours au clavier, et le
   * focus retomberait sur la page (comme `Button`).
   */
  loading?: boolean
  /**
   * Le `nativeID` d'un texte qui précise sur quoi porte le bouton (voir aria.ts) : plusieurs
   * boutons « Supprimer la note » se distinguent ainsi par la note qu'ils suppriment.
   */
  describedBy?: string
  /**
   * La même précision sur téléphone, où `aria-describedby` n'existe pas : un indice lu après le nom
   * (« Supprimer la note », puis le début de la note).
   */
  hint?: string
  /** Pour y poser le focus du clavier depuis le composant qui l'utilise (voir NoteList). */
  ref?: Ref<View>
  /**
   * Une pastille posée sur le coin haut droit (le nombre de nouveautés d'une cloche : CountBadge).
   * Elle ne dit rien aux lecteurs d'écran : le `label` doit contenir le nombre.
   */
  badge?: ReactNode
  /**
   * Pour un bouton qui ouvre quelque chose (le menu « … », tranche 7b) : vrai quand c'est ouvert.
   * `aria-expanded`, que React Native et react-native-web transmettent tous deux (le lecteur
   * d'écran dit « réduit » ou « développé ») ; absent, le bouton n'en dit rien.
   */
  expanded?: boolean
  /** Ce qu'il ouvre est un menu (`aria-haspopup`, web) : le lecteur d'écran l'annonce. */
  hasMenu?: boolean
}

// Où s'accroche le coin bas gauche de la pastille, compté depuis le bord droit (et le haut) du
// bouton : une pastille d'un chiffre dépasse alors de 4 points en haut et à droite (space.xs).
const BADGE_ANCHOR = BADGE_SIZE - space.xs

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'glass',
  size = 'regular',
  disabled = false,
  loading = false,
  describedBy,
  hint,
  ref,
  badge,
  expanded,
  hasMenu = false,
  fab = false,
}: Props) {
  const { colors, shadows } = useTheme()
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  // Le grand rond (« large ») et le bouton flottant ont le diamètre du jeton `layout.fab`.
  const big = fab || size === 'large'
  const diameter = big ? layout.fab : layout.touchTarget

  const looks: Record<NonNullable<Props['variant']>, { box: ViewStyle; tone: IconTone }> = {
    glass: {
      box: {
        backgroundColor: colors.glass,
        borderWidth: borders.hairline,
        borderColor: colors.glassBorder,
        boxShadow: `${shadows.highlight}, ${shadows.float}`,
      },
      tone: 'default',
    },
    plain: { box: { backgroundColor: colors.surfaceGrouped }, tone: 'default' },
    bare: { box: {}, tone: 'default' },
    honey: {
      box: { backgroundColor: colors.honey, boxShadow: `${shadows.highlight}, ${shadows.honey}` },
      tone: 'onHoney',
    },
  }
  const look = looks[variant]
  // Un bouton miel inactif garde sa forme mais pâlit, sans ombre, comme `Button` : à 55 % d'opacité,
  // son icône perdrait le contraste que garde le couple `honeyDisabled` / `onHoneyDisabled`.
  const inactive = disabled || loading
  const inactiveHoney = inactive && variant === 'honey'

  return (
    <Animated.View style={animated}>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...describedByProps(describedBy)}
        // Sur le web, aria-describedby suffit ; ailleurs, l'indice joue ce rôle.
        accessibilityHint={Platform.OS === 'web' ? undefined : hint}
        aria-disabled={disabled}
        // « Occupé » : `aria-busy`, que react-native-web transmet au navigateur et que React Native
        // traduit pour VoiceOver et TalkBack (accessibilityState seul serait ignoré sur le web).
        aria-busy={loading}
        {...(expanded === undefined ? null : { 'aria-expanded': expanded })}
        {...(hasMenu && Platform.OS === 'web' ? { 'aria-haspopup': 'menu' } : null)}
        disabled={disabled}
        onPress={() => {
          if (!loading) onPress()
        }}
        onPressIn={() => {
          // Pendant une action en route, le bouton ne répond pas au doigt : il ne s'enfonce pas.
          if (!loading) scale.value = spring(fab ? pressScaleFab : pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le contour du focus clavier est commun à tous les éléments : voir app/+html.tsx.
        style={({ pressed }) => [
          {
            width: diameter,
            height: diameter,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
          },
          look.box,
          // Le disque de `bare` : le verre se voit sur la feuille comme sur le gris de ses cartes.
          variant === 'bare' && (pressed || expanded === true) && looks.glass.box,
          inactiveHoney && { backgroundColor: colors.honeyDisabled, boxShadow: 'none' },
          inactive && !inactiveHoney && { opacity: 0.55 },
        ]}
      >
        {/* La roue remplace l'icône dans le même rond : le bouton ne change pas de taille. */}
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <Icon name={icon} size={big ? 28 : 22} tone={inactiveHoney ? 'disabled' : look.tone} />
        )}
      </Pressable>
      {badge ? (
        // Par-dessus le coin haut droit : elle déborde un peu du rond, sans agrandir la zone à
        // toucher ni décaler l'icône. Elle est accrochée par son coin bas gauche (left, bottom) et
        // non par le haut droit : quand le texte agrandi la fait grossir, elle grandit vers le haut
        // et vers la droite, hors du bouton, au lieu de recouvrir l'icône. pointerEvents : un
        // toucher sur la pastille va au bouton.
        <View
          style={{
            position: 'absolute',
            left: diameter - BADGE_ANCHOR,
            bottom: diameter - BADGE_ANCHOR,
            pointerEvents: 'none',
          }}
        >
          {badge}
        </View>
      ) : null}
    </Animated.View>
  )
}
