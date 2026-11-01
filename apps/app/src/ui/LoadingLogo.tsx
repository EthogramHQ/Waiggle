// Le logo animé du lancement (Miel 2, tranche R1) : l'abeille arrive de la gauche, petite, écrit le
// « w » en grandissant, se pose (c'est le logo), puis repart à l'horizontale ; derrière elle, la
// traînée s'efface jusqu'à la rattraper, et tout s'estompe avant le vol suivant. Une boucle de
// durations.loadingLoop (4,6 s), reprise du prototype validé le 27/10/2026 (Recherches, « Image
// de marque/chargement », outil loop-snake.cjs) avec ses phases :
//   0-5 %   l'abeille apparaît sur l'élan, avant le « w » ;
//   5-60 %  elle écrit le « w », de 0,4 à sa taille du logo, et se redresse ;
//   60-72 % posée : le logo, immobile ;
//   72-100 % elle repart (la traînée la suit), la queue s'efface (comme `wgErase`), et tout
//            s'estompe de 84 à 100 %.
// Avec « Réduire les animations », le logo est posé, immobile (pas de boucle du tout).
//
// Les données (le vol, l'abeille, son point de pose) viennent de logo.generated.ts, fabriqué par
// scripts/logo.mts : ce fichier ne garde que le mouvement et les couleurs, par rôle.
// LaunchScreen, en bas, est l'écran plein du lancement sur téléphone (app/_layout.tsx).
import { durations } from '@ruche/brand'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { G, Path } from 'react-native-svg'
import {
  bee,
  beeAnchor,
  beeViewBox,
  flight,
  restOffset,
  trailWidth,
  viewBox,
} from './logo.generated'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

// createAnimatedComponent : une version du tracé SVG dont Reanimated peut changer les propriétés
// à chaque image, sur le fil des animations, sans redessiner le composant React.
const AnimatedPath = Animated.createAnimatedComponent(Path)

// --- 1. Le vol, mesuré une fois au chargement du module --------------------------------------------
// Le tracé `flight` (l'élan, le « w », la sortie) est lu morceau par morceau (M, L, C, Q absolus,
// tels que les écrit scripts/logo.mts), puis découpé en petits segments droits pour mesurer sa
// longueur : c'est elle qui règle les pointillés de la traînée, et la place de l'abeille à chaque
// instant. On mesure le tracé même qui est dessiné, plutôt que de recopier un nombre.

type Point = [number, number]

const numbersIn = (text: string) => (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

/** Les morceaux du tracé, chacun comme une fonction t ∈ [0, 1] → point. */
function piecesOf(d: string) {
  const pieces: { at: (t: number) => Point; steps: number }[] = []
  let from: Point = [0, 0]
  for (const [, command, args] of d.matchAll(/([MLCQ])([^MLCQ]*)/g)) {
    const n = numbersIn(args ?? '')
    const p = (i: number): Point => [n[2 * i] ?? 0, n[2 * i + 1] ?? 0]
    const start = from
    if (command === 'M') {
      from = p(0)
    } else if (command === 'L') {
      const end = p(0)
      pieces.push({
        at: (t) => [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t],
        steps: 8,
      })
      from = end
    } else if (command === 'C') {
      const [c1, c2, end] = [p(0), p(1), p(2)]
      pieces.push({
        at: (t) => {
          const u = 1 - t
          const c = (j: 0 | 1) =>
            u * u * u * start[j] +
            3 * u * u * t * c1[j] +
            3 * u * t * t * c2[j] +
            t * t * t * end[j]
          return [c(0), c(1)]
        },
        steps: 12,
      })
      from = end
    } else if (command === 'Q') {
      const [control, end] = [p(0), p(1)]
      pieces.push({
        at: (t) => {
          const u = 1 - t
          const c = (j: 0 | 1) => u * u * start[j] + 2 * u * t * control[j] + t * t * end[j]
          return [c(0), c(1)]
        },
        steps: 200,
      })
      from = end
    }
  }
  return pieces
}

/** Le tracé découpé finement : la distance parcourue depuis le début, et le point atteint. */
function measure(d: string) {
  const lengths = [0]
  const points: Point[] = []
  const pieceEnds: number[] = []
  for (const piece of piecesOf(d)) {
    if (points.length === 0) points.push(piece.at(0))
    for (let i = 1; i <= piece.steps; i++) {
      const point = piece.at(i / piece.steps)
      const previous = points[points.length - 1] ?? point
      lengths.push(
        (lengths[lengths.length - 1] ?? 0) +
          Math.hypot(point[0] - previous[0], point[1] - previous[1]),
      )
      points.push(point)
    }
    pieceEnds.push(lengths[lengths.length - 1] ?? 0)
  }
  return { lengths, points, pieceEnds }
}

const measured = measure(flight)
/** La longueur totale du vol, dans le repère du logo (≈ 1 700 unités ; mesurée, jamais recopiée). */
const TOTAL = measured.lengths[measured.lengths.length - 1] ?? 1
/** Où commence le « w » : la fin de l'élan, le premier morceau droit du vol. */
const W_START = measured.pieceEnds[0] ?? 0
/** Où l'abeille se pose : le logo (restOffset, calculé par scripts/logo.mts). */
const REST = restOffset * TOTAL

// Le vol rééchantillonné à pas réguliers (STEP) : à chaque instant, la place et la direction de
// l'abeille se lisent par une simple division, sans recherche. Des tableaux de nombres simples :
// Reanimated les copie tels quels sur le fil des animations.
const SAMPLES = 600
const STEP = TOTAL / SAMPLES
const xs: number[] = []
const ys: number[] = []
const angles: number[] = []
{
  let j = 0
  for (let i = 0; i <= SAMPLES; i++) {
    const s = i * STEP
    while (j < measured.lengths.length - 2 && (measured.lengths[j + 1] ?? 0) < s) j++
    const s0 = measured.lengths[j] ?? 0
    const s1 = measured.lengths[j + 1] ?? s0
    const a = measured.points[j] ?? [0, 0]
    const b = measured.points[j + 1] ?? a
    const f = s1 > s0 ? Math.min(1, (s - s0) / (s1 - s0)) : 0
    xs.push(a[0] + (b[0] - a[0]) * f)
    ys.push(a[1] + (b[1] - a[1]) * f)
  }
  // La direction du vol (en degrés), d'un point à l'autre ; « déroulée » : jamais de saut de 360°
  // d'un échantillon au suivant, pour que l'interpolation ne fasse pas tourner l'abeille sur
  // elle-même.
  for (let i = 0; i <= SAMPLES; i++) {
    const before = Math.max(0, i - 1)
    const after = Math.min(SAMPLES, i + 1)
    let angle =
      (Math.atan2((ys[after] ?? 0) - (ys[before] ?? 0), (xs[after] ?? 0) - (xs[before] ?? 0)) *
        180) /
      Math.PI
    const previous = angles[i - 1]
    if (previous !== undefined) {
      while (angle - previous > 180) angle -= 360
      while (angle - previous < -180) angle += 360
    }
    angles.push(angle)
  }
}

/** La valeur d'un tableau échantillonné à la distance s du début du vol (interpolation linéaire). */
const sampleAt = (table: number[], s: number) => {
  'worklet'
  const u = Math.min(SAMPLES, Math.max(0, s / STEP))
  const i = Math.min(SAMPLES - 1, Math.floor(u))
  const a = table[i] ?? 0
  return a + ((table[i + 1] ?? a) - a) * (u - i)
}

// --- 2. Les phases de la boucle (le prototype, outil loop-snake.cjs) ------------------------------

const APPEAR = 0.05
const DRAWN = 0.6
const LEAVE = 0.72
const FADE = 0.84
/** Un instant de la pose : le logo immobile (« Réduire les animations », le premier dessin). */
export const restMoment = 0.66

/** L'abeille apparaît un peu avant le « w » : 30 unités d'élan avant son début. */
const EXT = 30
/** L'abeille tient sa tête 40° au-dessus de la direction du vol (le prototype, `offset-rotate`). */
const TILT = 40
/** Sa taille au départ, en part de celle du logo. */
const SMALL = 0.4
const LENGTH_W = REST - W_START
const LENGTH_OUT = TOTAL - REST
/** La direction du vol à la pose, et le redressement qui la ramène au logo (0° à la pose). */
const SETTLE = -(sampleAt(angles, REST) + TILT)

/** cubic-bezier(x1, y1, x2, y2) des CSS, évaluée par dichotomie (comme le prototype). */
const bezier = (x1: number, y1: number, x2: number, y2: number, t: number) => {
  'worklet'
  let low = 0
  let high = 1
  for (let i = 0; i < 24; i++) {
    const m = (low + high) / 2
    const x = 3 * (1 - m) ** 2 * m * x1 + 3 * (1 - m) * m * m * x2 + m ** 3
    if (x < t) low = m
    else high = m
  }
  const m = (low + high) / 2
  return 3 * (1 - m) ** 2 * m * y1 + 3 * (1 - m) * m * m * y2 + m ** 3
}

/**
 * Ce qu'on voit à l'instant p de la boucle (0 à 1) : la place de l'abeille sur le vol (`head`), sa
 * taille, son angle par rapport au logo, l'opacité, et la part du vol où la traînée est visible
 * (`tail` → `end`, en distance depuis le début du vol).
 */
const frameAt = (p: number) => {
  'worklet'
  if (p < APPEAR) {
    // L'élan : l'abeille paraît en fondu, petite, avant le « w ».
    const head = (p / APPEAR) * (W_START - EXT)
    return {
      head,
      scale: SMALL,
      angle: sampleAt(angles, head) + TILT,
      opacity: p / APPEAR,
      tail: W_START,
      end: W_START,
    }
  }
  if (p <= DRAWN) {
    // Le « w » : elle accélère puis ralentit (la courbe du prototype), grandit et se redresse.
    const drawn =
      -EXT + (LENGTH_W + EXT) * bezier(0.33, 0.15, 0.3, 1, (p - APPEAR) / (DRAWN - APPEAR))
    const share = Math.max(0, drawn) / LENGTH_W
    const scale = SMALL + (1 - SMALL) * share ** 2.2
    const head = W_START + drawn
    return {
      head,
      scale,
      angle: sampleAt(angles, head) + TILT + SETTLE * share ** 1.5,
      opacity: 1,
      tail: W_START,
      // Le bout rond de la traînée reste sous le ventre, même quand l'abeille est encore petite.
      end: head - (1 - scale) * trailWidth,
    }
  }
  if (p < LEAVE) {
    // Posée : le logo exactement.
    return { head: REST, scale: 1, angle: 0, opacity: 1, tail: W_START, end: REST }
  }
  // Le départ : elle accélère vers la droite et se remet à l'horizontale ; la queue de la traînée
  // avance à vitesse constante et la rattrape à la fin ; tout s'estompe sur les derniers 16 %.
  const t = (p - LEAVE) / (1 - LEAVE)
  const head = REST + LENGTH_OUT * bezier(0.42, 0, 1, 1, t)
  const smooth = t * t * (3 - 2 * t)
  return {
    head,
    scale: 1,
    angle: sampleAt(angles, head) + TILT + SETTLE * (1 - smooth),
    opacity: p < FADE ? 1 : Math.max(0, 1 - (p - FADE) / (1 - FADE)),
    tail: Math.max(W_START, W_START - EXT + (LENGTH_W + LENGTH_OUT + EXT) * t),
    end: head,
  }
}

// --- 3. Le dessin ------------------------------------------------------------------------------

/** Un cadre SVG « x y largeur hauteur », en nombres. */
const boxOf = (box: string) => {
  const [x = 0, y = 0, width = 1, height = 1] = box.split(' ').map(Number)
  return { x, y, width, height }
}
const logoBox = boxOf(viewBox)
const beeBox = boxOf(beeViewBox)
const [anchorX, anchorY] = beeAnchor
const REST_X = sampleAt(xs, REST)
const REST_Y = sampleAt(ys, REST)

type Props = {
  /** La largeur du logo, en points ; la hauteur suit ses proportions (114 × 59 par défaut). */
  width?: number
  /**
   * Un instant fixe de la boucle (0 à 1), sans mouvement : pour le catalogue, qui montre les
   * phases une à une. Absent dans l'appli.
   */
  moment?: number
}

export function LoadingLogo({ width = 114, moment }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const calm = useCalmMotion()
  // La valeur partagée : l'instant de la boucle, lu sur le fil des animations. Le premier dessin
  // (et la page pré-rendue du web) montre le logo posé ; la boucle part après l'affichage.
  const progress = useSharedValue(moment ?? restMoment)

  useEffect(() => {
    if (moment !== undefined || calm) {
      cancelAnimation(progress)
      progress.value = moment ?? restMoment
      return
    }
    // withRepeat(…, -1) : sans fin ; chaque tour repart de la valeur du départ, d'où le 0 d'abord.
    progress.value = 0
    progress.value = withRepeat(
      withTiming(1, { duration: durations.loadingLoop, easing: Easing.linear }),
      -1,
      false,
    )
    return () => cancelAnimation(progress)
  }, [calm, moment, progress])

  // L'échelle : des unités du logo vers les points de l'écran.
  const k = width / logoBox.width
  const height = logoBox.height * k
  // L'abeille est dessinée dans sa propre vue, à sa place du logo. Elle tourne et grandit autour
  // de son point de pose (beeAnchor) : on y déplace l'origine des transformations, qui est sinon
  // le centre de la vue.
  const beeWidth = beeBox.width * k
  const beeHeight = beeBox.height * k
  const pivotX = (anchorX - beeBox.x) * k - beeWidth / 2
  const pivotY = (anchorY - beeBox.y) * k - beeHeight / 2

  // La traînée : un pointillé d'un seul trait, posé sur le vol de `tail` à `end`. Un trait de
  // longueur nulle dessinerait quand même ses bouts ronds (un point) : il devient alors invisible.
  const trailProps = useAnimatedProps(() => {
    const frame = frameAt(progress.value)
    const length = frame.end - frame.tail
    return {
      strokeDasharray: [Math.max(length, 0.01), TOTAL * 2],
      strokeDashoffset: -frame.tail,
      opacity: length > 0.5 ? frame.opacity : 0,
    }
  })
  const beeStyle = useAnimatedStyle(() => {
    const frame = frameAt(progress.value)
    return {
      opacity: frame.opacity,
      transform: [
        { translateX: (sampleAt(xs, frame.head) - REST_X) * k + pivotX },
        { translateY: (sampleAt(ys, frame.head) - REST_Y) * k + pivotY },
        { rotate: `${frame.angle}deg` },
        { scale: frame.scale },
        { translateX: -pivotX },
        { translateY: -pivotY },
      ],
    }
  })

  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
    'aria-hidden': true,
  }
  return (
    <View
      // Une seule image pour les lecteurs d'écran, nommée « Waiggle se lance… » et marquée occupée
      // (aria-busy : react-native-web ignore accessibilityState ; React Native le lit aussi).
      accessible
      role="img"
      accessibilityLabel={t(($) => $.common.loadingApp)}
      aria-busy
      style={{ width, height }}
    >
      <Svg width={width} height={height} viewBox={viewBox} {...hidden}>
        <AnimatedPath
          d={flight}
          fill="none"
          stroke={colors.text}
          strokeWidth={trailWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          animatedProps={trailProps}
        />
      </Svg>
      <Animated.View
        {...hidden}
        style={[
          {
            position: 'absolute',
            left: (beeBox.x - logoBox.x) * k,
            top: (beeBox.y - logoBox.y) * k,
            width: beeWidth,
            height: beeHeight,
          },
          beeStyle,
        ]}
      >
        <Svg width={beeWidth} height={beeHeight} viewBox={beeViewBox}>
          {/* Comme Logo (variante entière) : le miel et les ailes, puis l'encre par-dessus. */}
          <G>
            <Path d={bee.honey} fill={colors.honey} />
            <Path d={bee.wing} fill={colors.surface} />
            <Path d={bee.ink} fill={colors.text} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  )
}

/**
 * L'écran du lancement sur téléphone, pendant le chargement des polices : le fond de l'appli (la
 * Cire de jour, la Nuit de nuit) et le logo animé au centre.
 */
export function LaunchScreen() {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <LoadingLogo />
    </View>
  )
}
