// Un bouton rond qui n'affiche qu'une icône (retour, partager, plus…). Comme on ne voit pas de texte,
// le nom (`label`) est obligatoire : c'est lui que lisent les lecteurs d'écran (« Retour »), et
// lui qui permet aux tests de retrouver le bouton.
import { borders, layout, pressScale, radii } from '@ruche/brand'
import type { Ref } from 'react'
import { Platform, Pressable, type View, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { describedBy as describedByProps } from './aria'
import { Icon, type IconName, type IconTone } from './Icon'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  icon: IconName
  label: string
  onPress: () => void
  /** glass : sur une image ou une lumière ; plain : sur une surface ; honey : action principale. */
  variant?: 'glass' | 'plain' | 'honey'
  /** regular : 44 points ; large : 64 (le bouton « Publier » de la barre d'onglets). */
  size?: 'regular' | 'large'
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
}

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
}: Props) {
  const { colors, shadows } = useTheme()
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const diameter = size === 'large' ? 64 : layout.touchTarget

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
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
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
        <Icon name={icon} size={size === 'large' ? 28 : 22} tone={look.tone} />
      </Pressable>
    </Animated.View>
  )
}
