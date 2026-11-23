// L'alvéole du niveau (R19, planches R19-Profil et R19-Niveau) : une alvéole de miel, fermée par
// son opercule de cire crème, qui porte le numéro du niveau. Elle se pose dans le panneau de la
// récolte (regular), en petit dans un avis de l'Activité ou un rang (small), en gros plan au
// catalogue (large).
//
// Au passage d'un niveau (`rise={{ from: 4 }}`, quand `levelSeen < level`), elle joue une fois :
// une cire fondue couleur Pollen coule dans l'alvéole et couvre le 4 (de 0 à 560 ms), puis la cire
// se fige et le 5 apparaît en fondu (de 560 à 880 ms). Une annonce polie dit alors « Niveau 5 »,
// une seule fois, et `onRisen` prévient l'écran à la fin (il marque le niveau comme vu). Le rayon
// qui se vide ensuite (de 880 à 1 440 ms) n'est pas dessiné ici : c'est le rayon (HoneyComb).
//
// « Réduire les animations » (useCalmMotion) : pas de cire qui coule, un fondu de 320 ms de
// l'ancien numéro vers le nouveau ; l'annonce et `onRisen` restent.
//
// Le dessin est caché aux lecteurs d'écran : l'écran écrit le niveau en toutes lettres à côté
// (« Niveau 4 »). C'est aussi pourquoi le chiffre peut être plafonné : posé dans un hexagone de
// taille fixe, il grandit avec la taille du texte jusqu'à remplir l'opercule, jamais au-delà. La
// boîte de l'alvéole ne change jamais de taille : rien ne bouge autour pendant le mouvement.
import { durations, easings, layout, type TextVariant } from '@ruche/brand'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type LayoutChangeEvent, View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { ClipPath, Defs, Path } from 'react-native-svg'
import { LiveStatus } from './LiveStatus'
import { Text } from './Text'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type Size = 'small' | 'regular' | 'large'

type Props = {
  level: number
  /** small : 40 de large (Activité, rang) ; regular : 46 (panneau) ; large : 150 (gros plan). */
  size: Size
  /**
   * Le passage d'un niveau, à jouer une fois : `from` est le niveau d'avant. L'écran le fige pour
   * la visite (relecture d'interface UI-4) ; un nouveau rendu avec le même passage ne rejoue rien.
   */
  rise?: { from: number }
  /** Appelé une fois, à la fin du passage (jamais sans `rise`). */
  onRisen?: () => void
}

// Le dessin, dans un repère de 100 × 115,47 (un hexagone pointe en haut : sa hauteur est sa
// largeur × 2 / √3). Une marge de 2 autour laisse la place au trait du bord.
const RATIO = 115.47 / 100
const VIEW_BOX = '-2 -2 104 119.47'
/** Le bord : l'hexagone extérieur. */
const OUTER = 'M50 0 100 28.87V86.6L50 115.47 0 86.6V28.87Z'
/** L'opercule : l'hexagone intérieur, de 80 de large, centré. */
const INNER = 'M50 11.55 90 34.64V80.83L50 103.92 10 80.83V34.64Z'
/** Le reflet : un trait clair arrondi, en haut à gauche du bord. */
const GLINT = 'M13 27 Q21 21.5 30 16.5'
/** La goutte de cire qui déborde du bord, en bas à gauche. */
const DROP =
  'M17 86 C17 86 12.5 93 12.5 96 C12.5 98.8 14.6 101 17 101 C19.4 101 21.5 98.8 21.5 96 C21.5 93 17 86 17 86 Z'

/** La part de l'alvéole où le chiffre peut grandir : l'intérieur de l'opercule, à peu près. */
const DIGIT_BOX = { width: 0.62, height: 0.46 }

const digitVariant: Record<Size, TextVariant> = {
  small: 'callout',
  regular: 'headline',
  large: 'hero',
}

/** Les temps du passage (planche R19-Niveau) : la coulée, puis le sceau qui prend. */
const POUR = durations.slow
const SET = durations.base
const never = ReduceMotion.Never

/**
 * Le front de la cire fondue, à la hauteur `front` (dans le repère du dessin) : ondulé, avec deux
 * coulures qui descendent plus bas. Tout ce qui est au-dessus est couvert ; l'opercule (ClipPath)
 * le découpe à sa forme.
 */
const pourPath = (front: number) => {
  'worklet'
  const f = front
  return (
    `M0 -20H100V${f}C92 ${f + 5} 84 ${f - 3} 76 ${f + 1}` +
    `C72 ${f + 3} 71 ${f + 12} 68 ${f + 12}C65 ${f + 12} 65 ${f + 3} 60 ${f + 1}` +
    `C50 ${f - 3} 44 ${f + 4} 36 ${f + 2}C33 ${f + 1} 32 ${f + 8} 29.5 ${f + 8}` +
    `C27 ${f + 8} 27 ${f + 1} 22 ${f}C14 ${f - 2} 6 ${f + 4} 0 ${f}Z`
  )
}
/** Le front au départ (au-dessus de l'opercule) et à l'arrivée (sous sa pointe basse). */
const FRONT_START = -16
const FRONT_END = 112

// createAnimatedComponent : une version du tracé SVG dont Reanimated peut changer le dessin.
const AnimatedPath = Animated.createAnimatedComponent(Path)

export function LevelCell({ level, size, rise, onRisen }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const calm = useCalmMotion()
  const width = layout.levelCell[size]
  const height = Math.round(width * RATIO)

  // Le passage à jouer, par une clé : le même passage redessiné garde la même clé.
  const riseKey = rise ? `${rise.from}>${level}` : null
  // L'ancien numéro, dessiné sous la cire tant que le passage n'est pas fini ; `null` ensuite.
  const [old, setOld] = useState<number | null>(rise ? rise.from : null)
  // La phrase de la région polie : vide jusqu'au moment où le nouveau numéro apparaît.
  const [said, setSaid] = useState('')

  // Lus par l'effet sans le relancer : le rappel de l'écran change à chaque rendu, et un réglage
  // de mouvement changé en route ne doit pas couper un passage commencé.
  const latest = useRef({
    onRisen,
    calm,
    from: rise?.from,
    announce: t(($) => $.game.level, { level }),
  })
  latest.current = { onRisen, calm, from: rise?.from, announce: t(($) => $.game.level, { level }) }
  const played = useRef<string | null>(null)

  const pour = useSharedValue(0) // 0 : la cire au-dessus ; 1 : l'opercule couvert
  const pourOpacity = useSharedValue(1) // la cire fondue, qui s'efface quand elle se fige
  const oldOpacity = useSharedValue(1)
  const newOpacity = useSharedValue(rise ? 0 : 1)

  useEffect(() => {
    if (riseKey === null || played.current === riseKey) return
    played.current = riseKey
    const { calm: calmNow, from } = latest.current
    setOld(from ?? null)
    const ease = Easing.bezier(...easings.exit)
    const timers: ReturnType<typeof setTimeout>[] = []
    let finished = false
    const finish = (after: number) => {
      timers.push(
        setTimeout(() => {
          finished = true
          setOld(null)
          latest.current.onRisen?.()
        }, after),
      )
    }

    if (calmNow) {
      // Un fondu sur place, de l'ancien numéro vers le nouveau.
      oldOpacity.value = withTiming(0, { duration: SET, easing: ease, reduceMotion: never })
      newOpacity.value = 0
      newOpacity.value = withTiming(1, { duration: SET, easing: ease, reduceMotion: never })
      setSaid(latest.current.announce)
      finish(SET)
    } else {
      pour.value = 0
      pourOpacity.value = 1
      oldOpacity.value = 1
      newOpacity.value = 0
      // La cire coule et couvre l'ancien numéro…
      pour.value = withTiming(1, { duration: POUR, easing: ease, reduceMotion: never })
      // … puis elle se fige (elle s'efface sur l'opercule crème) et le nouveau numéro apparaît.
      pourOpacity.value = withDelay(
        POUR,
        withTiming(0, { duration: SET, easing: ease, reduceMotion: never }),
      )
      newOpacity.value = withDelay(
        POUR,
        withTiming(1, { duration: SET, easing: ease, reduceMotion: never }),
      )
      timers.push(setTimeout(() => setSaid(latest.current.announce), POUR))
      finish(POUR + SET)
    }
    return () => {
      timers.forEach(clearTimeout)
      // Démonté avant la fin (ou effet rejoué en développement) : le passage n'a pas eu lieu, un
      // prochain montage le rejouera.
      if (!finished) played.current = null
    }
  }, [riseKey, pour, pourOpacity, oldOpacity, newOpacity])

  // Un identifiant propre à cette alvéole, pour la découpe SVG ; sans les « : » de useId, qu'une
  // adresse `url(#…)` du web ne lit pas.
  const clipId = `level-cell-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const variant = digitVariant[size]

  return (
    <View style={{ width, height }}>
      <View
        // Le dessin : caché aux lecteurs d'écran, sur chaque plateforme (le niveau est écrit à côté).
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
      >
        <Svg width={width} height={height} viewBox={VIEW_BOX}>
          <Path d={OUTER} fill={colors.honey} stroke={colors.honeyPressed} strokeWidth={3} />
          <Path d={INNER} fill={colors.wax} />
          <Path
            d={GLINT}
            fill="none"
            stroke={colors.wax}
            strokeOpacity={0.9}
            strokeWidth={4}
            strokeLinecap="round"
          />
          {/* En petit (40 points), la goutte ne serait qu'une poussière sur le bord : elle part. */}
          {size === 'small' ? null : (
            <Path d={DROP} fill={colors.wax} stroke={colors.honeyPressed} strokeWidth={1} />
          )}
        </Svg>
        {old !== null ? (
          <>
            <Digit value={old} variant={variant} width={width} opacity={oldOpacity} />
            <Pour
              clipId={clipId}
              width={width}
              height={height}
              pour={pour}
              opacity={pourOpacity}
              color={colors.honeyLight}
            />
          </>
        ) : null}
        <Digit value={level} variant={variant} width={width} opacity={newOpacity} />
      </View>
      {/* La région polie n'existe que pour un passage : une alvéole immobile n'a rien à dire, et
          une liste d'avis n'aurait pas une région vide par ligne. */}
      {rise || said !== '' ? <LiveStatus message={said} visible={false} /> : null}
    </View>
  )
}

/** La cire fondue, découpée à la forme de l'opercule, posée par-dessus l'ancien numéro. */
function Pour({
  clipId,
  width,
  height,
  pour,
  opacity,
  color,
}: {
  clipId: string
  width: number
  height: number
  pour: SharedValue<number>
  opacity: SharedValue<number>
  color: string
}) {
  const props = useAnimatedProps(() => ({
    d: pourPath(FRONT_START + pour.value * (FRONT_END - FRONT_START)),
  }))
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      <Svg width={width} height={height} viewBox={VIEW_BOX}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={INNER} />
          </ClipPath>
        </Defs>
        <AnimatedPath
          d={pourPath(FRONT_START)}
          fill={color}
          clipPath={`url(#${clipId})`}
          animatedProps={props}
        />
      </Svg>
    </Animated.View>
  )
}

type Measured = { width: number; height: number }

/**
 * Un numéro, centré sur l'opercule. Il suit la taille du texte de l'appareil, mais ne dépasse
 * jamais l'opercule : mesuré à sa taille naturelle (`onLayout`, qui ignore la réduction : pas de
 * boucle), il est réduit à l'œil (`scale`) s'il est plus grand. Même façon que le chiffre de
 * CountBadge. Sa couche est plus large que l'alvéole : un nombre long n'y passe pas à la ligne
 * avant d'être mesuré, et l'alvéole rogne ce qui dépasserait.
 */
function Digit({
  value,
  variant,
  width,
  opacity,
}: {
  value: number
  variant: TextVariant
  width: number
  opacity: SharedValue<number>
}) {
  const [natural, setNatural] = useState<Measured | null>(null)
  const height = width * RATIO
  const box = { width: width * DIGIT_BOX.width, height: height * DIGIT_BOX.height }
  const scale = natural ? Math.min(1, box.width / natural.width, box.height / natural.height) : 1
  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout
    if (next.width <= 0 || next.height <= 0) return
    // Le même objet quand rien ne change : pas de rendu de plus.
    setNatural((was) =>
      was && was.width === next.width && was.height === next.height
        ? was
        : { width: next.width, height: next.height },
    )
  }
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -width,
          right: -width,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <View onLayout={measure} style={{ transform: [{ scale }] }}>
        <Text variant={variant} weight={700} tone="onHoney" tabular align="center">
          {String(value)}
        </Text>
      </View>
    </Animated.View>
  )
}
