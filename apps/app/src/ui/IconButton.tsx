// Un bouton rond qui n'affiche qu'une icône (retour, partager, plus…). Comme on ne voit pas de texte,
// le nom (`label`) est obligatoire : c'est lui que lisent les lecteurs d'écran (« Retour »), et
// lui qui permet aux tests de retrouver le bouton.
import { borders, layout, pressScale, radii } from '@ruche/brand'
import { Pressable, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
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
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'glass',
  size = 'regular',
  disabled = false,
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
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        style={(state) => {
          const focused = 'focused' in state && state.focused === true
          return [
            {
              width: diameter,
              height: diameter,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
            },
            look.box,
            disabled && { opacity: 0.55 },
            focused && {
              outlineColor: colors.focusRing,
              outlineWidth: borders.focus,
              outlineStyle: 'solid',
              outlineOffset: borders.focus,
            },
          ]
        }}
      >
        <Icon name={icon} size={size === 'large' ? 28 : 22} tone={look.tone} />
      </Pressable>
    </Animated.View>
  )
}
