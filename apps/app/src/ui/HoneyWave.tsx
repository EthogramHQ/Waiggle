// Le dessin de la vague de miel, sur iOS et Android (R17, scénario « La vague de miel à l'entrée ») :
// une forme pleine, peinte d'un dégradé pollen → miel → ambre, qui monte depuis le bouton touché,
// couvre l'écran puis se retire par le haut. Sa forme à chaque instant vient de ui/wavePath.ts ;
// l'hôte (ui/HoneyWaveHost.tsx) la pose au-dessus de tout et décide quand la page change. Sur le web,
// Metro prend ui/HoneyWave.web.tsx à la place.
//
// Le temps tourne sur le fil des animations de Reanimated, sans passer par JavaScript à chaque
// image :
// - `useFrameCallback` appelle sa fonction à chaque image de l'écran (60 ou 120 fois par seconde),
//   avec le temps écoulé depuis la première ; elle en tire l'instant `t` de la vague (0 à 1) ;
// - `useAnimatedProps` recalcule les propriétés d'un composant (ici l'attribut `d` du tracé SVG) à
//   chaque changement d'une valeur partagée qu'il lit (`t`), et les pose directement sur la vue
//   native, sans redessiner React.
import { durations } from '@ruche/brand'
import { useEffect, useState } from 'react'
import { useWindowDimensions } from 'react-native'
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useTheme } from './theme/ThemeProvider'
import { type HoneyWaveProps, wavePath } from './wavePath'

// Un tracé que Reanimated peut animer : ses propriétés reçoivent `animatedProps`.
const AnimatedPath = Animated.createAnimatedComponent(Path)

// L'identifiant du dégradé, que le tracé cite (`url(#…)`). Une seule vague joue à la fois ; les
// images figées du catalogue ont chacune le leur.
const GRADIENT = 'honey-wave-fill'

export function HoneyWave({ originY, at, width: givenWidth, height: givenHeight }: HoneyWaveProps) {
  const window = useWindowDimensions()
  const width = givenWidth ?? window.width
  const height = givenHeight ?? window.height
  const { colors } = useTheme()
  const gradient = at === undefined ? GRADIENT : `${GRADIENT}-${Math.round(at * 100)}`

  // L'instant de la vague, et le point de départ (le centre du bouton, mesuré un peu après le
  // toucher : il peut arriver pendant que la vague monte déjà).
  const t = useSharedValue(at ?? 0)
  const origin = useSharedValue(originY ?? height)
  useEffect(() => {
    origin.value = originY ?? height
  }, [origin, originY, height])

  // Une image figée (le catalogue) ne fait pas tourner l'horloge.
  const clock = useFrameCallback((frame) => {
    t.value = Math.min(1, frame.timeSinceFirstFrame / durations.wave)
  }, at === undefined)
  useEffect(() => {
    if (at !== undefined) {
      clock.setActive(false)
      t.value = at
    }
  }, [at, clock, t])

  // Le tracé du premier affichage, gardé tel quel : la mesure du bouton qui arrive redessine le
  // composant, et un tracé recalculé ici ramènerait la vague à son départ le temps d'une image.
  const [first] = useState(() => wavePath(0, width, height, { y: originY ?? height }))

  const animatedProps = useAnimatedProps(() => ({
    d: wavePath(t.value, width, height, { y: origin.value }),
  }))

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        {/* Le dégradé du haut vers le bas : le pollen au bord avant, le miel, l'ambre au fond. */}
        <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.honeyLight} />
          <Stop offset="0.3" stopColor={colors.honey} />
          <Stop offset="1" stopColor={colors.amber} />
        </LinearGradient>
      </Defs>
      <AnimatedPath
        fill={`url(#${gradient})`}
        d={at === undefined ? first : wavePath(at, width, height, { y: originY ?? height })}
        animatedProps={animatedProps}
      />
    </Svg>
  )
}
