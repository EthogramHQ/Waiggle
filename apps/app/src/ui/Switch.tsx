// Un interrupteur (oui / non), en miel quand il est activé. La pastille glisse avec un ressort.
// Annoncé comme un interrupteur par les lecteurs d'écran, avec son nom et son état.
import { radii, space } from '@ruche/brand'
import { useEffect } from 'react'
import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Text } from './Text'
import { spring } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  value: boolean
  onValueChange: (value: boolean) => void
  hint?: string
  disabled?: boolean
}

// Dimensions de la maquette : piste 52 × 32, pastille 26.
const TRACK = { width: 52, height: 32 }
const KNOB = 26
const TRAVEL = TRACK.width - KNOB - (TRACK.height - KNOB)

export function Switch({ label, value, onValueChange, hint, disabled = false }: Props) {
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
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}
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
