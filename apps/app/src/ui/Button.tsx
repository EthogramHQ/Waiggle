// Un bouton en forme de pilule. Cinq styles :
// - primary   : l'action principale de l'écran, en miel (une seule par écran, idéalement) ;
// - secondary : une action possible, blanche et bordée ;
// - danger    : une action qui supprime, en rouge pâle ;
// - confirm   : la confirmation finale d'une suppression, en rouge plein ;
// - glass     : un bouton posé sur une image ou une lumière d'ambiance.
// Sous le doigt, le bouton s'enfonce légèrement avec un ressort (voir theme/motion.ts).
// Pendant une action en cours (loading), il est désactivé pour éviter les doubles envois.
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { ActivityIndicator, Pressable, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Icon, type IconName } from './Icon'
import { Text, type Tone } from './Text'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'confirm' | 'glass'

type Props = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  /** regular : 52 points de haut ; compact : 44 (dans une carte, une barre). */
  size?: 'regular' | 'compact'
  icon?: IconName
  loading?: boolean
  disabled?: boolean
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  icon,
  loading = false,
  disabled = false,
}: Props) {
  const { colors, shadows } = useTheme()
  const inactive = disabled || loading

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
    confirm: {
      box: { backgroundColor: colors.danger },
      pressed: { opacity: 0.85 },
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

  return (
    // Deux couches : Animated.View porte l'enfoncement animé, Pressable reçoit le doigt.
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // Les lecteurs d'écran annoncent « désactivé » ou « occupé ».
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le style peut dépendre de l'état : appuyé, et sur ordinateur, choisi au clavier (focused).
        style={(state) => {
          const focused = 'focused' in state && state.focused === true
          return [
            {
              minHeight: layout.controlHeight[size],
              borderRadius: radii.pill,
              paddingHorizontal: space.xl,
              paddingVertical: space.sm, // si le texte agrandi passe sur deux lignes
              flexDirection: 'row',
              gap: space.sm,
              alignItems: 'center',
              justifyContent: 'center',
            },
            look.box,
            state.pressed && look.pressed,
            inactiveHoney && { backgroundColor: colors.honeyDisabled, boxShadow: 'none' },
            inactive && !inactiveHoney && { opacity: 0.55 },
            focused && {
              outlineColor: colors.focusRing,
              outlineWidth: borders.focus,
              outlineStyle: 'solid',
              outlineOffset: borders.focus,
            },
          ]
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.textMuted} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={20} tone={tone} /> : null}
            <Text variant="button" tone={tone} align="center">
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  )
}
