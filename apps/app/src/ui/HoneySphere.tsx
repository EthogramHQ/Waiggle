// La sphère de miel de « Tu es à jour » (R4, planche R4-Fil-AJour) : une bulle de verre à moitié
// pleine de miel, dont la surface ondule doucement, comme un pot qu'on vient de poser. C'est un
// décor : le titre et le texte de « Tu es à jour » disent tout, la sphère est donc cachée aux
// lecteurs d'écran. Avec « Réduire les animations », le miel reste immobile (WCAG 2.2.2 : un
// mouvement qui démarre seul et dure doit pouvoir s'arrêter, comme la lumière d'ambiance).
//
// Comment l'onde avance : chaque nappe de miel est un dessin deux fois plus large que la sphère, fait
// de vagues dont la longueur est exactement la largeur de la sphère. On le fait glisser d'une
// largeur, puis on recommence : la vague d'arrivée est la même que celle du départ, la boucle ne se
// voit pas. La sphère (un rond, `overflow: hidden`) ne montre que sa part du dessin.
import { borders, durations } from '@ruche/brand'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/**
 * Le temps d'une vague, en millisecondes : lent, pour que le miel paraisse épais. Un tiers d'une
 * « respiration » de la lumière d'ambiance (jeton `breath`), pour que les deux mouvements de la page
 * restent de la même famille, lents tous les deux.
 */
const WAVE_PERIOD = durations.breath / 3

/** La hauteur du miel dans la sphère : un peu plus de la moitié, comme sur la planche. */
const LEVEL = 0.56
/** La hauteur d'une vague, en part du diamètre : à peine une ride. */
const AMPLITUDE = 0.035

type Props = {
  /** Le diamètre de la sphère, en points (128 par défaut, la taille de la planche sur téléphone). */
  size?: number
}

/**
 * Le tracé d'une nappe : deux vagues (une par largeur de sphère) sur `2 × size` de large, puis le
 * fond. `shift` décale les vagues d'une demi-longueur pour que les deux nappes ne se recouvrent pas.
 */
const wavePath = (size: number, height: number, shift: number) => {
  const amp = size * AMPLITUDE
  const top = amp // la crête la plus haute touche le haut du dessin
  const half = size / 2
  // Une vague = une courbe qui monte puis une qui descend (courbes de Bézier quadratiques :
  // « Q point de contrôle, point d'arrivée » ; « T » prolonge la courbe en miroir).
  let d = `M ${-shift} ${top}`
  for (let x = -shift; x < size * 2 + half; x += size) {
    d += ` Q ${x + half / 2} ${top - amp} ${x + half} ${top} T ${x + size} ${top}`
  }
  return `${d} V ${height} H ${-shift} Z`
}

export function HoneySphere({ size = 128 }: Props) {
  const { colors, scheme, shadows } = useTheme()
  const calm = useCalmMotion()
  // Une valeur partagée de Reanimated : elle vit sur le fil des animations, qui la fait avancer de
  // 0 à 1 à chaque vague sans repasser par React. La page pré-rendue du web montre la position 0.
  const phase = useSharedValue(0)

  useEffect(() => {
    // Calme : on ne démarre rien, pas même une image demandée au navigateur. Le miel reste à sa
    // place de départ (le retour à 0 se fait au nettoyage, quand le réglage change en route).
    if (calm) return
    phase.value = withRepeat(
      withTiming(1, { duration: WAVE_PERIOD, easing: Easing.linear }),
      -1, // sans fin
      false, // repart du début, sans aller-retour : la vague avance toujours dans le même sens
    )
    return () => {
      cancelAnimation(phase)
      phase.value = 0
    }
  }, [calm, phase])

  const liquid = size * (1 - LEVEL) // le haut du miel, depuis le haut de la sphère
  const height = size - liquid + size * AMPLITUDE * 2
  // La nappe de devant avance vers la gauche, celle de derrière vers la droite, plus lentement à
  // l'œil puisqu'elle est plus pâle : le miel paraît avoir de l'épaisseur.
  const front = useAnimatedStyle(() => ({ transform: [{ translateX: -phase.value * size }] }))
  const back = useAnimatedStyle(() => ({
    transform: [{ translateX: (phase.value - 1) * size }],
  }))

  const layer = {
    position: 'absolute' as const,
    left: 0,
    top: liquid - size * AMPLITUDE * 2,
    width: size * 2,
    height,
  }
  return (
    <View
      // Décor : caché aux lecteurs d'écran sur iOS (accessibilityElementsHidden), Android
      // (importantForAccessibility) et le web (aria-hidden).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.glass,
          // Un liseré neutre et une ombre douce : de jour, le verre blanc se pose sur le cœur
          // blanc de la lumière miel, et sans eux le haut de la sphère disparaissait.
          borderWidth: borders.hairline,
          borderColor: colors.surfaceBorder,
          boxShadow: shadows.soft,
        }}
      >
        {/* La nappe de derrière, plus pâle (la lumière miel), décalée d'une demi-vague. */}
        <Animated.View style={[layer, back]}>
          <Svg width={size * 2} height={height}>
            <Path d={wavePath(size, height, size / 2)} fill={colors.honeyLight} />
          </Svg>
        </Animated.View>
        {/* La nappe de devant, le miel lui-même. */}
        <Animated.View style={[layer, { top: layer.top + size * AMPLITUDE }, front]}>
          <Svg width={size * 2} height={height}>
            <Path d={wavePath(size, height, 0)} fill={colors.honey} />
          </Svg>
        </Animated.View>
        {/* Le reflet du verre, en haut à gauche : une ellipse blanche, plus discrète la nuit. */}
        <View
          style={{
            position: 'absolute',
            left: size * 0.2,
            top: size * 0.12,
            width: size * 0.26,
            height: size * 0.14,
            borderRadius: size,
            backgroundColor: colors.knob,
            opacity: scheme === 'day' ? 0.85 : 0.3,
            transform: [{ rotate: '-28deg' }],
          }}
        />
      </View>
    </View>
  )
}
