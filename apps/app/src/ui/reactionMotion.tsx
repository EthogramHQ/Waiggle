// Le mouvement d'une réaction posée (R5a, scénario « La capsule ») : une goutte de miel tombe sur
// le bouton et s'écrase, un anneau s'élargit autour, le bouton rebondit, le nombre roule, et pour
// « Waggle ! » la petite abeille danse. Ce fichier ne dessine que le mouvement ; la capsule
// (ReactionCapsule.tsx) décide quand il part : seulement après un geste du membre, jamais au
// chargement de la page ni quand un nombre change sans lui.
//
// « Réduire les animations » (A11, décision du scénario) : la goutte et le rebond restent, ce sont
// de petits mouvements qui disent « c'est posé » ; ils sont seulement plus courts. L'anneau qui
// s'élargit, le nombre qui roule et la danse de l'abeille s'effacent : le nombre change d'un coup.
//
// `ReduceMotion.Never` : sans lui, Reanimated sauterait aussi les petits mouvements quand
// l'appareil demande moins d'animations (il saute à la fin de toute animation). Ici, c'est nous qui
// décidons, avec `calm`, ce qui reste.
import { durations, springs } from '@ruche/brand'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTheme } from './theme/ThemeProvider'

const never = ReduceMotion.Never

/** Un ressort de la marque qui joue même en mode calme (voir plus haut). */
const springAlways = (to: number, name: keyof typeof springs = 'honey') => {
  'worklet'
  return withSpring(to, { ...springs[name], reduceMotion: never })
}

/** Une durée fixe qui joue même en mode calme. */
const timingAlways = (to: number, duration: number, easing = Easing.out(Easing.quad)) => {
  'worklet'
  return withTiming(to, { duration, easing, reduceMotion: never })
}

/**
 * Hook : le rebond d'un bouton. `play()` le fait gonfler un instant puis revenir avec un ressort
 * de miel. En mode calme, le même rebond, plus petit. Le style se pose sur une vue à part de
 * l'enfoncement sous le doigt : deux transformations animées sur la même vue s'écraseraient.
 */
export function useBounce(calm: boolean) {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  // useCallback : la même fonction d'un rendu à l'autre, tant que `calm` ne change pas ; un effet
  // qui en dépend ne repart pas à chaque rendu.
  const play = useCallback(() => {
    scale.value = withSequence(
      timingAlways(calm ? 1.06 : 1.14, durations.quick / 2),
      springAlways(1, 'drop'),
    )
  }, [calm, scale])
  return { style, play }
}

/** La goutte : un dessin de 12 × 16 points, pointe en haut. */
const DROP_WIDTH = 12
const DROP_HEIGHT = 16
// Une goutte dans un cadre de 12 × 16 : la pointe en haut, le ventre rond en bas.
const dropPath =
  'M6 0 C6 0 0 7.2 0 10.2 C0 13.4 2.7 16 6 16 C9.3 16 12 13.4 12 10.2 C12 7.2 6 0 6 0 Z'
/** La hauteur de la chute, en points : de plus haut que la capsule, ou d'un peu plus haut (calme). */
const FALL = { full: 34, calm: 10 }
/** Le diamètre de l'anneau au départ ; il s'élargit jusqu'à `RING_GROWTH` fois cette taille. */
const RING_SIZE = 36
const RING_GROWTH = 1.9

type BurstProps = {
  /**
   * Un numéro qui change à chaque réaction posée : chaque nouveau numéro rejoue la goutte et
   * l'anneau. Zéro, au montage : rien ne part.
   */
  play: number
  /** Le centre du bouton, en points, depuis le bord gauche de la couche (mesuré par la capsule). */
  x: number
  /** La hauteur du centre du bouton, depuis le haut de la couche. */
  y: number
  calm: boolean
}

/**
 * La goutte et l'anneau d'une réaction posée, dans une couche qui ne prend aucune tape. Ils sont
 * dessinés hors du verre de la capsule, qui rogne ce qui dépasse : la goutte tombe d'au-dessus, et
 * l'anneau s'élargit au-delà du bord.
 */
export function ReactionBurst({ play, x, y, calm }: BurstProps) {
  const { colors } = useTheme()
  const fall = useSharedValue(0) // 0 : en haut ; 1 : posée sur le bouton
  const splat = useSharedValue(0) // 0 : ronde ; 1 : écrasée et effacée
  const ring = useSharedValue(0) // 0 : petit et visible ; 1 : grand et effacé
  const drop = useSharedValue(0) // l'opacité de la goutte
  const ringOpacity = useSharedValue(0)

  useEffect(() => {
    if (play === 0) return
    const fallTime = calm ? 140 : 240
    // La chute accélère (comme un objet qui tombe), puis la goutte s'écrase et s'efface.
    drop.value = withSequence(
      timingAlways(1, 1),
      withTiming(1, { duration: fallTime, reduceMotion: never }),
      timingAlways(0, durations.quick),
    )
    fall.value = withSequence(timingAlways(0, 1), timingAlways(1, fallTime, Easing.in(Easing.quad)))
    splat.value = withSequence(
      timingAlways(0, 1),
      withTiming(0, { duration: fallTime, reduceMotion: never }),
      timingAlways(1, durations.quick),
    )
    if (calm) {
      ringOpacity.value = 0
      return
    }
    // L'anneau part quand la goutte touche le bouton.
    ring.value = withSequence(
      timingAlways(0, 1),
      withTiming(0, { duration: fallTime, reduceMotion: never }),
      timingAlways(1, durations.medium),
    )
    ringOpacity.value = withSequence(
      timingAlways(0, 1),
      withTiming(0, { duration: fallTime, reduceMotion: never }),
      timingAlways(0.7, 1),
      timingAlways(0, durations.medium),
    )
  }, [play, calm, drop, fall, splat, ring, ringOpacity])

  const height = calm ? FALL.calm : FALL.full
  const dropStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateY: -height * (1 - fall.value) },
      // En s'écrasant, la goutte s'élargit et s'aplatit.
      { scaleX: 1 + splat.value * 0.9 },
      { scaleY: 1 - splat.value * 0.6 },
    ],
  }))
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: 0.6 + ring.value * (RING_GROWTH - 0.6) }],
  }))

  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - RING_SIZE / 2,
            top: y - RING_SIZE / 2,
            width: RING_SIZE,
            height: RING_SIZE,
            borderRadius: RING_SIZE / 2,
            borderWidth: 2,
            borderColor: colors.honey,
          },
          ringStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - DROP_WIDTH / 2,
            // La goutte se pose sur le haut de l'icône (le centre du bouton, moins une demi-icône).
            top: y - DROP_HEIGHT - 4,
            width: DROP_WIDTH,
            height: DROP_HEIGHT,
          },
          dropStyle,
        ]}
      >
        <Svg width={DROP_WIDTH} height={DROP_HEIGHT} viewBox={`0 0 ${DROP_WIDTH} ${DROP_HEIGHT}`}>
          <Path d={dropPath} fill={colors.honey} stroke={colors.honeyPressed} strokeWidth={1} />
        </Svg>
      </Animated.View>
    </>
  )
}

type DanceProps = {
  /** Un numéro qui change à chaque « Waggle ! » posé ; zéro au montage. */
  play: number
  calm: boolean
  children: ReactNode
}

/**
 * La danse de l'abeille (« Waggle ! ») : elle se balance de gauche à droite, quelques fois, puis
 * revient droite. C'est la danse frétillante des abeilles (la « waggle dance ») qui a donné son nom
 * à la réaction. Effacée en mode calme : elle se répète, c'est un mouvement de plus.
 */
export function BeeDance({ play, calm, children }: DanceProps) {
  const turn = useSharedValue(0)
  useEffect(() => {
    if (play === 0 || calm) return
    const step = 70
    turn.value = withSequence(
      timingAlways(-16, step),
      timingAlways(16, step * 2),
      timingAlways(-12, step * 2),
      timingAlways(10, step * 2),
      timingAlways(-6, step * 2),
      springAlways(0, 'firm'),
    )
  }, [play, calm, turn])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: turn.value / 8 }, { rotate: `${turn.value}deg` }],
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}

type RollProps = {
  value: number
  calm: boolean
  /** Dessine un nombre (la capsule choisit sa police et sa couleur). */
  render: (value: number) => ReactNode
}

/**
 * Le nombre qui roule : quand il change, l'ancien monte et s'efface, le nouveau arrive d'en
 * dessous (et l'inverse quand il redescend). Rien au montage. Le nouveau nombre reste dans le flux
 * (il donne sa taille au bouton) ; l'ancien est posé par-dessus le temps de partir. Pas de
 * rognage : à 200 % de texte, un cadre rogné couperait les chiffres.
 */
export function RollingCount({ value, calm, render }: RollProps) {
  const [shown, setShown] = useState({ value, previous: value, direction: 0 })
  const progress = useSharedValue(1)
  const height = useRef(16)
  const lineHeight = useSharedValue(16)

  if (shown.value !== value) {
    // Un changement : on le note pendant le rendu (et non dans un effet), pour que l'ancien et le
    // nouveau nombre soient dessinés ensemble dès la première image.
    setShown({ value, previous: shown.value, direction: value > shown.value ? 1 : -1 })
  }

  useEffect(() => {
    if (shown.direction === 0) return
    if (calm) {
      progress.value = 1
      return
    }
    progress.value = 0
    progress.value = withTiming(1, {
      duration: durations.base,
      easing: Easing.out(Easing.cubic),
      reduceMotion: never,
    })
  }, [shown, calm, progress])

  const direction = shown.direction
  const incoming = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: direction * (1 - progress.value) * lineHeight.value * 0.7 }],
  }))
  const outgoing = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: -direction * progress.value * lineHeight.value * 0.7 }],
  }))

  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height
    if (next > 0 && next !== height.current) {
      height.current = next
      lineHeight.value = next
    }
  }

  return (
    <View>
      <Animated.View style={incoming} onLayout={measure}>
        {render(shown.value)}
      </Animated.View>
      {direction !== 0 && !calm ? (
        <Animated.View
          // Caché aux lecteurs d'écran : l'ancien nombre n'est qu'une trace qui s'en va.
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
            outgoing,
          ]}
        >
          {render(shown.previous)}
        </Animated.View>
      ) : null}
    </View>
  )
}
