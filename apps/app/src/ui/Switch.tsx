// Un interrupteur (oui / non), en miel quand il est activé. La pastille glisse avec un ressort.
// Annoncé comme un interrupteur par les lecteurs d'écran, avec son nom et son état.
// Seul dans un formulaire (« Rendre public »), ou comme une ligne d'un ListGroup (`inGroup`, les
// réglages d'e-mail de « Mon profil ») : il prend alors les marges d'une ligne de réglage.
import { layout, radii, space } from '@ruche/brand'
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
  hint?: string
  disabled?: boolean
  /**
   * Une ligne d'un ListGroup : les marges et la hauteur d'une ligne (ListRow), et l'anneau de focus
   * dessiné à l'intérieur, puisque le groupe rogne ce qui dépasse.
   */
  inGroup?: boolean
}

// Dimensions de la maquette : piste 52 × 32, pastille 26.
const TRACK = { width: 52, height: 32 }
const KNOB = 26
const TRAVEL = TRACK.width - KNOB - (TRACK.height - KNOB)

export function Switch({
  label,
  value,
  onValueChange,
  hint,
  disabled = false,
  inGroup = false,
}: Props) {
  const { colors, shadows } = useTheme()
  const offset = useSharedValue(value ? TRAVEL : 0)
  // Quand la valeur change, la pastille glisse jusqu'à sa nouvelle place.
  useEffect(() => {
    offset.value = spring(value ? TRAVEL : 0)
  }, [value, offset])
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      // La barre d'espace l'active aussi sur le web (voir keyboard.ts).
      {...spaceToggles(() => onValueChange(!value), disabled)}
      {...(inGroup ? insetFocus : null)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: inGroup ? layout.controlHeight.regular : layout.touchTarget,
        ...(inGroup ? { paddingHorizontal: space.lg, paddingVertical: space.md } : null),
      }}
    >
      <View style={{ flex: 1, gap: space.xxs }}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          ...TRACK,
          borderRadius: radii.pill,
          justifyContent: 'center',
          paddingHorizontal: (TRACK.height - KNOB) / 2,
          backgroundColor: value ? colors.honey : colors.lineStrong,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <Animated.View
          style={[
            {
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              backgroundColor: colors.knob,
              boxShadow: shadows.float,
            },
            knob,
          ]}
        />
      </View>
    </Pressable>
  )
}
