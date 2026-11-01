// Les illustrations des écrans de passage (e-mail envoyé, adresse vérifiée, lien externe, page
// introuvable). Faites de formes et de lumière miel, jamais de dessins génériques : elles prennent
// les couleurs du thème, de jour comme de nuit, et respirent doucement.
import { durations, radii } from '@ruche/brand'
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg'
import { Icon, type IconName } from './Icon'
import { useTheme } from './theme/ThemeProvider'

/** Une valeur qui va de 0 à 1 et revient, en boucle : le souffle des illustrations. */
const useBreath = (period: number) => {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
  }, [t, period])
  return t
}

/** Le côté de l'emblème entier, halo compris, et celui de sa tuile de miel. */
const emblemSide = 180
const tileSide = 96
/** La tuile penche de quelques degrés, comme posée à la main. */
const tileTilt = 6
/**
 * La boîte qu'occupe la tuile penchée : un carré tourné dépasse de ses coins, de côté × (cos + sin).
 * Arrondie au point supérieur, pour que les coins ne sortent jamais du bord.
 */
const tileBox = Math.ceil(
  tileSide * (Math.cos((tileTilt * Math.PI) / 180) + Math.sin((tileTilt * Math.PI) / 180)),
)

/** Une tuile de miel qui porte une icône, dans un halo (e-mail envoyé, adresse vérifiée). */
export function Emblem({ icon, flush = false }: { icon: IconName; flush?: boolean }) {
  const { colors, shadows } = useTheme()
  const breath = useBreath(durations.breath / 4)
  const halo = useAnimatedStyle(() => ({
    opacity: 0.55 + breath.value * 0.35,
    transform: [{ scale: 1 + breath.value * 0.08 }],
  }))
  // Deux façons de poser l'emblème :
  // - par défaut, le cadre est le halo entier (180 points), tuile au milieu : l'emblème centré des
  //   écrans de passage ;
  // - `flush` (rangé à gauche, dans StateMessage) : le cadre n'est que la tuile, penchée (la boîte
  //   d'un carré tourné de 6° dépasse de ses coins). Le halo déborde hors du flux, à gauche et en
  //   bas, sous le titre qui suit ; en haut, une marge le garde dans la place de l'emblème, pour ne
  //   pas se poser sur ce qui précède. Ainsi le bord de la tuile est celui du texte, et l'air sous
  //   elle se règle par l'écart de StateMessage, pas par le halo (relecture R3 : 37 points de
  //   décalage et 119 de vide avant le titre).
  const frame = flush ? tileBox : emblemSide
  const spill = (emblemSide - frame) / 2
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: frame,
        height: frame,
        alignItems: 'center',
        justifyContent: 'center',
        ...(flush ? { marginTop: spill } : null),
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: emblemSide,
            height: emblemSide,
            ...(flush ? { left: -spill, top: -spill } : null),
          },
          halo,
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="emblem-halo" cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={colors.honeyLight} stopOpacity={0.9} />
              <Stop offset={1} stopColor={colors.honeyLight} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#emblem-halo)" />
        </Svg>
      </Animated.View>
      <View
        style={{
          width: tileSide,
          height: tileSide,
          borderRadius: radii.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.honey,
          boxShadow: `${shadows.highlight}, ${shadows.honey}`,
          transform: [{ rotate: `-${tileTilt}deg` }],
        }}
      >
        <Icon name={icon} size={44} tone="onHoney" />
      </View>
    </View>
  )
}

/** Des anneaux de lumière autour d'une flèche : la porte vers un autre site. */
export function PortalRings() {
  const { colors } = useTheme()
  const breath = useBreath(durations.breath / 5)
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breath.value * 0.05 }] }))
  const rings = [0.98, 0.8, 0.62, 0.46, 0.32]
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 260,
        height: 260,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={[{ position: 'absolute', width: 260, height: 260 }, pulse]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="portal-core" cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={colors.knob} stopOpacity={1} />
              <Stop offset={0.45} stopColor={colors.honeyLight} stopOpacity={0.9} />
              <Stop offset={1} stopColor={colors.honey} stopOpacity={0.15} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={49} fill="url(#portal-core)" />
          {rings.map((r) => (
            <Circle
              key={r}
              cx={50}
              cy={50}
              r={r * 49}
              fill="none"
              stroke={colors.amber}
              strokeOpacity={0.35}
              strokeWidth={0.6}
            />
          ))}
        </Svg>
      </Animated.View>
      <Icon name="arrow-up-right" size={40} tone="amber" />
    </View>
  )
}

/** Des alvéoles de miel, dont une vide au milieu : ce qu'on cherchait n'est plus là. */
export function Honeycomb() {
  const { colors } = useTheme()
  const breath = useBreath(durations.breath / 4)
  const glow = useAnimatedStyle(() => ({ opacity: 0.7 + breath.value * 0.3 }))
  // Un hexagone à plat de 30 de rayon, centré en (0, 0) ; on le recopie en sept endroits.
  const hex = 'M30 0 15 26 -15 26 -30 0 -15 -26 15 -26Z'
  const cells: [number, number, boolean][] = [
    [0, 0, true],
    [48, -28, false],
    [48, 28, false],
    [0, 56, false],
    [-48, 28, false],
    [-48, -28, false],
    [0, -56, false],
  ]
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: 220, height: 220, alignSelf: 'center' }, glow]}
    >
      <Svg width="100%" height="100%" viewBox="-110 -110 220 220">
        {cells.map(([x, y, empty]) => (
          <Path
            key={`${x},${y}`}
            d={hex}
            transform={`translate(${x} ${y})`}
            fill={empty ? colors.surface : colors.honey}
            fillOpacity={empty ? 0.9 : 0.85}
            stroke={empty ? colors.honeyLight : colors.honeyPressed}
            strokeWidth={empty ? 3 : 1}
          />
        ))}
      </Svg>
    </Animated.View>
  )
}
