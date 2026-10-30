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
import { useLayout } from './theme/layout'
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

// Dans la scène d'accueil sur ordinateur, le centre porte le logo et sa bulle : la tuile du bas,
// qui passait dessous et apparaissait en fantôme, se range sous la bulle, à droite.
const sceneTiles: Tile[] = tiles.map((tile) =>
  tile.icon === 'smiley' ? { ...tile, left: '60%', top: '84%' } : tile,
)

// Une boucle de flottement dure huit secondes : assez lent pour apaiser, pas pour endormir.
const FLOAT_PERIOD = 8000
const FLOAT_HEIGHT = 8 // en points

// En dessous de cette hauteur de fenêtre, la bande décorative (téléphone) rétrécit…
const SHORT_WINDOW = 700
// … sans descendre sous cette hauteur : la plus grande tuile (88 points, posée à mi-hauteur) y
// tient encore entière.
const MIN_BAND_HEIGHT = 190

type Props = {
  height: number
  children?: ReactNode
  /** band : une bande décorative (téléphone) ; scene : la scène d'accueil, le centre laissé libre. */
  layout?: 'band' | 'scene'
}

export function Constellation({ height, children, layout = 'band' }: Props) {
  const calm = useCalmMotion()
  // Sur un téléphone court (320 × 568), la bande rétrécit d'autant qu'il manque de hauteur : les
  // portes d'entrée de l'accueil restent au-dessus du pli (relecture de design R1, puis R2 C5). Au-
  // delà de SHORT_WINDOW, rien ne change. La hauteur de la fenêtre vaut 0 avant l'hydratation
  // (useLayout) : le pré-rendu garde la hauteur pleine.
  const windowHeight = useLayout().height
  const shown =
    layout === 'band' && windowHeight > 0 && windowHeight < SHORT_WINDOW
      ? Math.max(Math.min(height, MIN_BAND_HEIGHT), height - (SHORT_WINDOW - windowHeight))
      : height
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: FLOAT_PERIOD, easing: Easing.linear }), -1)
  }, [t])

  return (
    <View style={{ height: shown, alignSelf: 'stretch' }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', inset: 0 }}
      >
        {(layout === 'scene' ? sceneTiles : tiles).map((tile) => (
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
