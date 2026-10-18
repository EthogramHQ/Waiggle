// Un bouton en forme de pilule. Cinq styles :
// - primary   : l'action principale de l'écran, en miel (une seule par écran, idéalement) ;
// - secondary : une action possible, blanche et bordée ;
// - danger    : une action qui supprime, en rouge pâle ;
// - confirm   : la confirmation finale d'une suppression, en rouge plein ;
// - glass     : un bouton posé sur une image ou une lumière d'ambiance.
// Sous le doigt, le bouton s'enfonce légèrement avec un ressort (voir theme/motion.ts).
// Pendant une action en cours (loading), il est désactivé pour éviter les doubles envois.
import { borders, layout, pressScale, radii, space } from '@ruche/brand'
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
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
        // Les lecteurs d'écran annoncent « désactivé » ou « occupé ». Les propriétés aria-… sont les
        // seules que react-native-web transmet au navigateur (accessibilityState y est ignoré) ;
        // React Native les lit aussi sur téléphone.
        aria-disabled={inactive}
        aria-busy={loading}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Le style dépend de l'état « appuyé ». Le contour du focus clavier, lui, est commun à tous
        // les éléments touchables : une règle CSS dans app/+html.tsx (« :focus-visible »).
        style={(state) => {
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
          ]
        }}
      >
        {/* Pendant le chargement, le libellé reste en place mais invisible et l'indicateur se pose
            par-dessus : le bouton garde sa largeur, et ce qui l'entoure (le titre d'un en-tête)
            ne saute pas. */}
        <View
          style={{
            flexDirection: 'row',
            gap: space.sm,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 1,
            opacity: loading ? 0 : 1,
          }}
        >
          {/* flexShrink: 0 : l'icône garde sa taille quand le libellé passe sur deux lignes. */}
          {icon ? (
            <View style={{ flexShrink: 0 }}>
              <Icon name={icon} size={20} tone={tone} />
            </View>
          ) : null}
          {/* selectable={false} : un double-clic n'y surligne pas de texte. breakAnywhere : un nom de
              site très long (« Continuer vers … ») se coupe au lieu de sortir du bouton. */}
          <Text variant="button" tone={tone} align="center" selectable={false} breakAnywhere>
            {label}
          </Text>
        </View>
        {loading ? (
          <View
            style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}
