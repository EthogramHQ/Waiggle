// La lumière d'ambiance, signature de la direction Miel : derrière l'écran, une grande lueur douce
// qui prend la couleur du visuel affiché (un projet, un avatar). Sans visuel, c'est la « lumière
// miel ». Elle respire lentement et, sur téléphone, suit l'inclinaison de l'appareil.
//
// Le flou ne coûte rien : on n'applique pas de filtre de flou (très coûteux à calculer), on affiche
// une image minuscule agrandie, qui est floue par nature. Pour un visuel, c'est son « ThumbHash » :
// un résumé de l'image en quelques dizaines d'octets, calculé par le serveur à l'envoi.
import { durations, honeyLight } from '@ruche/brand'
import { Image } from 'expo-image'
import { type ReactNode, useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le résumé flou du visuel à l'origine de la lumière. Sans lui : la lumière miel. */
  thumbhash?: string | null
}

// La lumière déborde de l'écran de tous côtés : en respirant ou en s'inclinant, elle ne laisse
// jamais voir son bord.
const BLEED = '-15%'
// Amplitude du déplacement quand on incline le téléphone, en points.
const TILT = 18

export function AmbientLight({ thumbhash }: Props) {
  const { scheme, colors } = useTheme()
  // Les dégradés SVG sont désignés par un identifiant. Il dépend seulement du thème : deux lumières
  // affichées en même temps partagent le même dégradé, identique, sans conflit. (Un identifiant
  // tiré au hasard ou par useId différerait entre la page préparée sur le serveur et le navigateur.)
  const id = scheme

  // La respiration : la lumière grossit un peu puis revient, en boucle, sur 20 secondes.
  const breath = useSharedValue(0)
  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: durations.breath / 2, easing: Easing.inOut(Easing.sin) }),
      -1, // sans fin
      true, // aller-retour
    )
  }, [breath])
  const breathing = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.08 }],
    opacity: 0.85 + breath.value * 0.15,
  }))

  // La nuit, la lumière est plus forte : c'est une lanterne dans le noir.
  const strength = scheme === 'night' ? 0.55 : 0.6

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Tilt>
        {/* Deux couches : l'extérieure fixe l'intensité, l'intérieure respire. */}
        <View style={{ position: 'absolute', inset: BLEED, opacity: strength }}>
          <Animated.View style={[StyleSheet.absoluteFill, breathing]}>
            {thumbhash ? (
              // Les couleurs d'un résumé flou sont un peu ternes : on les ravive (sur le web et
              // Android ; iOS ne sait pas le faire et garde les couleurs telles quelles).
              <View style={[StyleSheet.absoluteFill, { filter: 'saturate(1.7)' }]}>
                <Image
                  source={{ thumbhash }}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                  accessible={false}
                />
              </View>
            ) : (
              <Svg width="100%" height="100%">
                <Defs>
                  <RadialGradient id={`light${id}`} cx="30%" cy="25%" r="75%">
                    {honeyLight[scheme].map((stop) => (
                      <Stop key={stop.at} offset={stop.at} stopColor={stop.color} />
                    ))}
                  </RadialGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#light${id})`} />
              </Svg>
            )}
          </Animated.View>
        </View>
      </Tilt>
      {/* Le voile : la lumière s'efface vers le bas dans la couleur du fond, pour que le texte
          posé plus bas reste lisible. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`veil${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset={0} stopColor={colors.background} stopOpacity={0.15} />
            <Stop offset={0.6} stopColor={colors.background} stopOpacity={0.75} />
            <Stop offset={0.9} stopColor={colors.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#veil${id})`} />
      </Svg>
    </View>
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

/** Sur le web (ordinateur), pas de capteur : la couche reste en place. */
function StillTilt({ children }: { children: ReactNode }) {
  return <View style={StyleSheet.absoluteFill}>{children}</View>
}

// Choisi une fois pour toutes selon la plateforme : un composant ne change jamais de hooks en route.
const Tilt = Platform.OS === 'web' ? StillTilt : SensorTilt
