// Un bouton rond qui n'affiche qu'une icône (retour, partager, plus…). Comme on ne voit pas de texte,
// le nom (`label`) est obligatoire : c'est lui que lisent les lecteurs d'écran (« Retour »), et
// lui qui permet aux tests de retrouver le bouton.
import { borders, layout, pressScale, pressScaleFab, radii, space } from '@ruche/brand'
import type { ReactNode, Ref } from 'react'
import { Platform, Pressable, View, type ViewStyle } from 'react-native'
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
  /** glass : sur une image ou une lumière ; plain : sur une surface ; honey : action principale. */
  variant?: 'glass' | 'plain' | 'honey'
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
    honey: {
      box: { backgroundColor: colors.honey, boxShadow: `${shadows.highlight}, ${shadows.honey}` },
      tone: 'onHoney',
    },
  }
  const look = looks[variant]

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
        {...(expanded === undefined ? null : { 'aria-expanded': expanded })}
        {...(hasMenu && Platform.OS === 'web' ? { 'aria-haspopup': 'menu' } : null)}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(fab ? pressScaleFab : pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le contour du focus clavier est commun à tous les éléments : voir app/+html.tsx.
        style={[
          {
            width: diameter,
            height: diameter,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
          },
          look.box,
          disabled && { opacity: 0.55 },
        ]}
      >
        <Icon name={icon} size={big ? 28 : 22} tone={look.tone} />
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
