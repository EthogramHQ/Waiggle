// La constellation d'accueil : des tuiles de verre et de miel qui flottent doucement, chacune avec
// l'icône d'un genre de projet (une idée, une fusée, une conversation…). Elle remplace les visuels
// de projets des maquettes : un visiteur sans compte ne doit rien voir des projets des membres.
// Ce qu'on place à l'intérieur (`children`) s'affiche au centre, par-dessus.
import { radii } from '@ruche/brand'
import { type ReactNode, useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { Icon, type IconName } from './Icon'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Tile = {
  icon: IconName
  left: `${number}%`
  top: `${number}%`
  size: number
  rotate: number // en degrés
  look: 'honey' | 'glass' | 'light'
  phase: number // décalage dans la boucle de flottement, de 0 à 1
}

// Les tuiles, placées en pourcentage de la zone : elles suivent la taille de l'écran.
const tiles: Tile[] = [
  { icon: 'sparkle', left: '8%', top: '10%', size: 64, rotate: -8, look: 'honey', phase: 0 },
  { icon: 'rocket-launch', left: '36%', top: '2%', size: 84, rotate: 6, look: 'glass', phase: 0.2 },
  { icon: 'lightbulb', left: '70%', top: '8%', size: 70, rotate: 10, look: 'light', phase: 0.45 },
  {
    icon: 'chat-circle-dots',
    left: '4%',
    top: '52%',
    size: 78,
    rotate: 5,
    look: 'glass',
    phase: 0.6,
  },
  {
    icon: 'hands-clapping',
    left: '74%',
    top: '50%',
    size: 88,
    rotate: -6,
    look: 'honey',
    phase: 0.3,
  },
  { icon: 'smiley', left: '44%', top: '66%', size: 56, rotate: -12, look: 'light', phase: 0.8 },
]

// Une boucle de flottement dure huit secondes : assez lent pour apaiser, pas pour endormir.
const FLOAT_PERIOD = 8000
const FLOAT_HEIGHT = 8 // en points

type Props = { height: number; children?: ReactNode }

export function Constellation({ height, children }: Props) {
  const calm = useCalmMotion()
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: FLOAT_PERIOD, easing: Easing.linear }), -1)
  }, [t])

  return (
    <View style={{ height, alignSelf: 'stretch' }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', inset: 0 }}
      >
        {tiles.map((tile) => (
          <FloatingTile key={tile.icon} tile={tile} t={t} still={calm} />
        ))}
      </View>
      {children ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      ) : null}
    </View>
  )
}

function FloatingTile({ tile, t, still }: { tile: Tile; t: SharedValue<number>; still: boolean }) {
  const { colors, shadows } = useTheme()
  // Chaque tuile monte et descend en suivant une sinusoïde, décalée des autres par sa phase.
  const float = useAnimatedStyle(() => ({
    transform: [
      { translateY: still ? 0 : Math.sin((t.value + tile.phase) * 2 * Math.PI) * FLOAT_HEIGHT },
      { rotate: `${tile.rotate}deg` },
    ],
  }))
  const looks = {
    honey: { backgroundColor: colors.honey, boxShadow: `${shadows.highlight}, ${shadows.honey}` },
    glass: {
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      boxShadow: `${shadows.highlight}, ${shadows.float}`,
    },
    light: { backgroundColor: colors.honeyLight, boxShadow: shadows.float },
  }
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: tile.left,
          top: tile.top,
          width: tile.size,
          height: tile.size,
          borderRadius: radii.small,
          alignItems: 'center',
          justifyContent: 'center',
          ...looks[tile.look],
        },
        float,
      ]}
    >
      <Icon
        name={tile.icon}
        size={Math.round(tile.size * 0.42)}
        tone={tile.look === 'glass' ? 'amber' : 'onHoney'}
      />
    </Animated.View>
  )
}
