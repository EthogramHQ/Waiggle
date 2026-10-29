// La version allégée de la lumière d'ambiance : celle du téléphone, et celle du web quand la
// lumière vivante (WebGL, AmbientLight.web.tsx) n'est pas possible ou pas souhaitée. Derrière
// l'écran, une grande lueur douce qui prend la couleur de sa source (une image, trois couleurs) ou,
// sans source, la « lumière miel ». Elle respire lentement, s'avive d'une impulsion et, sur
// téléphone, suit l'inclinaison de l'appareil.
//
// Vie privée : la position de la souris et le capteur d'inclinaison ne servent qu'au dessin ; rien
// n'est gardé ni envoyé ; l'image dessinée n'est jamais relue.
//
// Le flou ne coûte rien : on n'applique pas de filtre de flou (très coûteux à calculer), on affiche
// une image minuscule agrandie, qui est floue par nature. Pour un visuel, c'est son « ThumbHash » :
// un résumé de l'image en quelques dizaines d'octets, calculé par le serveur à l'envoi.
import { durations, honeyLight, type Scheme } from '@ruche/brand'
import { Image } from 'expo-image'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AppState, Platform, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { type AmbientSource, sameSource, useAmbientSource } from './theme/ambient'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

// La lumière déborde de l'écran de tous côtés : en respirant ou en s'inclinant, elle ne laisse
// jamais voir son bord.
const BLEED = '-15%'
// Amplitude du déplacement quand on incline le téléphone, en points.
const TILT = 18

/** Les deux places de la lumière : celle qu'on voit, et celle où entre la source suivante. */
type Slots = { a: AmbientSource; b: AmbientSource; front: 'a' | 'b' }

export function SoftLight({
  source,
  still = false,
}: {
  source: AmbientSource
  /**
   * Sans respiration : la version de repli d'un ordinateur dont la carte graphique a refusé
   * WebGL (une machine lente, que l'on ne fait pas travailler image après image).
   */
  still?: boolean
}) {
  const { scheme, colors } = useTheme()
  const calm = useCalmMotion()
  const { onPulse } = useAmbientSource()
  // Les dégradés SVG sont désignés par un identifiant. Il dépend seulement du thème : deux lumières
  // affichées en même temps partagent le même dégradé, identique, sans conflit. (Un identifiant
  // tiré au hasard ou par useId différerait entre la page préparée sur le serveur et le navigateur.)
  const id = scheme

  // Le fondu entre deux sources : la nouvelle entre dans la place cachée, puis les deux places se
  // croisent en 900 ms (l'une s'éteint pendant que l'autre s'allume). Il reste avec « Réduire les
  // animations » : c'est une transition, pas une boucle.
  const [slots, setSlots] = useState<Slots>(() => ({ a: source, b: null, front: 'a' }))
  const crossing = useSharedValue(0) // 0 : la place a se voit ; 1 : la place b
  useEffect(() => {
    setSlots((current) => {
      const shown = current.front === 'a' ? current.a : current.b
      if (sameSource(shown, source)) return current
      return current.front === 'a'
        ? { a: current.a, b: source, front: 'b' }
        : { a: source, b: current.b, front: 'a' }
    })
  }, [source])
  const firstFront = useRef(true)
  useEffect(() => {
    // Au premier affichage, la source est là d'emblée : rien à croiser.
    if (firstFront.current) {
      firstFront.current = false
      return
    }
    crossing.value = withTiming(slots.front === 'b' ? 1 : 0, {
      duration: durations.lightFade,
      easing: Easing.inOut(Easing.quad),
    })
  }, [slots.front, crossing])
  const showA = useAnimatedStyle(() => ({ opacity: 1 - crossing.value }))
  const showB = useAnimatedStyle(() => ({ opacity: crossing.value }))

  // La respiration : la lumière grossit un peu puis revient, en boucle, sur 20 secondes. Elle
  // s'arrête quand l'appli passe en arrière-plan (rien à dessiner pour personne) et reprend au
  // retour. Avec « Réduire les animations », la lumière reste immobile (J5, WCAG 2.2.2 : une
  // animation qui dure plus de 5 secondes à côté du contenu doit pouvoir s'arrêter). Elle ne
  // respire pas non plus quand on la demande immobile (`still`).
  const breath = useSharedValue(0)
  const resting = calm || still
  useEffect(() => {
    if (resting) {
      cancelAnimation(breath)
      breath.value = 0
      return
    }
    const breathe = () => {
      breath.value = withRepeat(
        withTiming(1, { duration: durations.breath / 2, easing: Easing.inOut(Easing.sin) }),
        -1, // sans fin
        true, // aller-retour
      )
    }
    breathe()
    let paused = false
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !paused) {
        paused = true
        cancelAnimation(breath)
      } else if (state === 'active' && paused) {
        paused = false
        breathe()
      }
    })
    return () => {
      subscription.remove()
      cancelAnimation(breath)
    }
  }, [resting, breath])

  // L'impulsion : la lumière s'avive et grossit un instant, puis revient en douceur. Les rafales
  // sont déjà fusionnées par le fournisseur (theme/ambient.tsx). Immobile en mode calme.
  const kick = useSharedValue(0)
  useEffect(
    () =>
      onPulse((force) => {
        if (calm) return
        kick.value = withSequence(
          withTiming(force, { duration: durations.quick, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: durations.long, easing: Easing.out(Easing.exp) }),
        )
      }),
    [onPulse, calm, kick],
  )

  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.08 + kick.value * 0.06 }],
    opacity: Math.min(1, 0.85 + breath.value * 0.15 + kick.value * 0.15),
  }))

  // La nuit, la lumière est plus forte : c'est une lanterne dans le noir.
  const strength = scheme === 'night' ? 0.55 : 0.6

  return (
    // overflow: 'hidden' rogne ce qui déborde : sans lui, la lumière agrandit la page et, sur le
    // web, fait apparaître une barre de défilement horizontale.
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Tilt>
        {/* Deux couches : l'extérieure fixe l'intensité, l'intérieure respire. */}
        <View style={{ position: 'absolute', inset: BLEED, opacity: strength }}>
          <Animated.View style={[StyleSheet.absoluteFill, breathing]}>
            <Animated.View style={[StyleSheet.absoluteFill, showA]}>
              <Glow source={slots.a} scheme={scheme} id={`${id}a`} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, showB]}>
              <Glow source={slots.b} scheme={scheme} id={`${id}b`} />
            </Animated.View>
          </Animated.View>
        </View>
      </Tilt>
      <Veil id={id} night={scheme === 'night'} background={colors.background} />
    </View>
  )
}

/** Le dessin d'une source : l'image floue, le dégradé de ses trois couleurs, ou le miel. */
function Glow({ source, scheme, id }: { source: AmbientSource; scheme: Scheme; id: string }) {
  const { colors } = useTheme()
  if (source !== null && 'thumbhash' in source) {
    return (
      // Les couleurs d'un résumé flou sont un peu ternes : on les ravive (sur le web et Android ;
      // iOS ne sait pas le faire et garde les couleurs telles quelles).
      <View style={[StyleSheet.absoluteFill, { filter: 'saturate(1.7)' }]}>
        <Image
          source={{ thumbhash: source.thumbhash }}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      </View>
    )
  }
  // Trois couleurs données : le même dégradé rond que le miel, avec elles. De jour, il part d'un
  // cœur clair ; de nuit, il s'éteint dans le fond, comme une lanterne.
  const stops =
    source === null
      ? honeyLight[scheme]
      : scheme === 'night'
        ? [
            { at: 0, color: source.palette[0] },
            { at: 0.35, color: source.palette[2] },
            { at: 1, color: colors.background },
          ]
        : [
            { at: 0, color: colors.surface },
            { at: 0.38, color: source.palette[1] },
            { at: 0.78, color: source.palette[0] },
            { at: 1, color: source.palette[2] },
          ]
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <RadialGradient id={`light${id}`} cx="30%" cy="25%" r="75%">
          {stops.map((stop) => (
            <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#light${id})`} />
    </Svg>
  )
}

/**
 * Le voile : la lumière s'efface vers le bas dans la couleur du fond, pour que le texte posé plus
 * bas reste lisible. Partagé avec la lumière vivante du web.
 */
export function Veil({
  id,
  night,
  background,
}: {
  id: string
  night: boolean
  background: string
}) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`veil${id}`} x1="0" y1="0" x2="0" y2="1">
          {/* La nuit, le voile est plus présent dès le haut : sous une lumière vive, les petits
              textes discrets passaient sous le contraste minimal. */}
          <Stop offset={0} stopColor={background} stopOpacity={night ? 0.35 : 0.15} />
          <Stop offset={0.6} stopColor={background} stopOpacity={0.75} />
          <Stop offset={0.9} stopColor={background} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#veil${id})`} />
    </Svg>
  )
}

/** Sur téléphone : la couche suit l'inclinaison de l'appareil (capteur de gravité). */
function SensorTilt({ children }: { children: ReactNode }) {
  const calm = useCalmMotion()
  // Le capteur de gravité donne, en m/s², la direction du « bas » : environ ±9,8 sur chaque axe.
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' })
  const tilt = useAnimatedStyle(() => {
    if (calm) return { transform: [] }
    const { x, y } = gravity.sensor.value
    return {
      transform: [
        { translateX: Math.max(-1, Math.min(1, x / 9.8)) * TILT },
        { translateY: Math.max(-1, Math.min(1, y / 9.8)) * TILT },
      ],
    }
  })
  return <Animated.View style={[StyleSheet.absoluteFill, tilt]}>{children}</Animated.View>
}

/** Sur le web, pas de capteur : la couche reste en place. */
function StillTilt({ children }: { children: ReactNode }) {
  return <View style={StyleSheet.absoluteFill}>{children}</View>
}

// Choisi une fois pour toutes selon la plateforme : un composant ne change jamais de hooks en route.
const Tilt = Platform.OS === 'web' ? StillTilt : SensorTilt
