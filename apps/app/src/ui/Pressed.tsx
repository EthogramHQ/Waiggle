// Rend touchable un contenu qui n'est pas un bouton (un avatar, une carte), avec un nom pour les
// lecteurs d'écran. Il s'enfonce légèrement sous le doigt, comme les boutons.
import { layout, pressScale } from '@ruche/brand'
import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { spring } from './theme/motion'

type Props = {
  label: string
  onPress: () => void
  children: ReactNode
  role?: 'button' | 'link'
}

export function Pressed({ label, onPress, children, role = 'button' }: Props) {
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole={role}
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => {
          scale.value = spring(pressScale, 'firm')
        }}
        onPressOut={() => {
          scale.value = spring(1)
        }}
        // Au moins 44 points de côté à toucher, même pour un contenu plus petit (le logo).
        style={{
          minHeight: layout.touchTarget,
          minWidth: layout.touchTarget,
          justifyContent: 'center',
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
