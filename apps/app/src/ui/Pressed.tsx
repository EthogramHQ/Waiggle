// Rend touchable un contenu qui n'est pas un bouton (un avatar, une carte), avec un nom pour les
// lecteurs d'écran. Il s'enfonce légèrement sous le doigt, comme les boutons : à 96 % de sa taille
// (jeton `pressScale` de Miel 2, dans packages/brand/src/motion.ts), avec le ressort « ferme ».
import { layout, pressScale } from '@ruche/brand'
import type { ReactNode } from 'react'
import { Pressable } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { describedBy as describedByProps } from './aria'
import { enterActivates } from './keyboard'
import { spring } from './theme/motion'

type Props = {
  label: string
  onPress: () => void
  children: ReactNode
  role?: 'button' | 'link'
  /**
   * Remplit la hauteur offerte par son parent (une case de grille, à côté d'une carte plus haute) :
   * le contenu doit alors grandir lui aussi (flexGrow).
   */
  fill?: boolean
  /** Le `nativeID` d'un texte qui décrit l'élément, lu après son nom (voir aria.ts). */
  describedBy?: string
}

export function Pressed({
  label,
  onPress,
  children,
  role = 'button',
  fill = false,
  describedBy,
}: Props) {
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View style={[animated, fill && { flexGrow: 1 }]}>
      <Pressable
        accessibilityRole={role}
        accessibilityLabel={label}
        {...describedByProps(describedBy)}
        // Un lien s'ouvre avec Entrée sur le web (react-native-web ne le fait que pour un bouton).
        {...(role === 'link' ? enterActivates(onPress) : null)}
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
          ...(fill ? { flexGrow: 1 } : null),
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
