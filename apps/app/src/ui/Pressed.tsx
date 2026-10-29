// Rend touchable un contenu qui n'est pas un bouton (un avatar, une carte), avec un nom pour les
// lecteurs d'écran. Il s'enfonce légèrement sous le doigt, comme les boutons : à 96 % de sa taille
// (jeton `pressScale` de Miel 2, dans packages/brand/src/motion.ts), avec le ressort « ferme ».
// L'anneau de focus du clavier (web) et son halo se dessinent autour de l'élément touchable : ils
// suivent son rayon. Ce rayon est celui du contenu, donné par `radius` ou lu dans le style du
// contenu (une carte arrondie à 28) : sinon l'anneau restait carré autour d'une carte arrondie.
import { layout, pressScale, type Radius, radii } from '@ruche/brand'
import { isValidElement, type ReactNode } from 'react'
import { Pressable, type StyleProp, StyleSheet, type ViewStyle } from 'react-native'
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
  /**
   * Le rayon du contenu, que l'anneau de focus doit suivre. Inutile si le contenu est une vue dont
   * le style porte déjà son rayon (`borderRadius`) : il y est lu.
   */
  radius?: Radius
}

/** Le rayon écrit dans le style du contenu, s'il est une seule vue qui en a un. */
const radiusOf = (children: ReactNode): number | undefined => {
  if (!isValidElement<{ style?: StyleProp<ViewStyle> }>(children)) return undefined
  // StyleSheet.flatten : un style peut être une liste de styles ; on obtient leur fusion.
  const radius = StyleSheet.flatten(children.props.style)?.borderRadius
  return typeof radius === 'number' ? radius : undefined
}

export function Pressed({
  label,
  onPress,
  children,
  role = 'button',
  fill = false,
  describedBy,
  radius,
}: Props) {
  const borderRadius = radius === undefined ? radiusOf(children) : radii[radius]
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
          ...(borderRadius === undefined ? null : { borderRadius }),
          ...(fill ? { flexGrow: 1 } : null),
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  )
}
