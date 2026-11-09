// La danse de publication (tranche R6a, planche R6-Danse) : quand un membre vient de publier un
// projet visible des membres, l'abeille du logo dessine un huit par-dessus le fil, avec une traînée
// de miel, puis file vers la nouvelle carte (`target`) et s'y pose en s'effaçant. `onDone` part à
// la fin : l'écran montre alors « Projet publié ».
//
// C'est un décor : caché aux lecteurs d'écran (l'avis « Projet publié » dit tout), et les tapes le
// traversent vers le fil dessous (`pointerEvents="none"`). Rien ne bouge sans geste du membre :
// la danse ne part qu'après « Publier ».
//
// « Réduire les animations » (CONTRIBUTING.md, « Animations ») : un vol de plus de 3 secondes à
// travers l'écran est un grand déplacement ; ici, rien ne vole et `onDone` part tout de suite (la
// carte, elle, paraît par un fondu, dans le fil : `Arrival`).
//
// Le temps : une seule valeur partagée (`progress`, de 0 à 1) avance au rythme de l'horloge, et
// chaque image en déduit où est l'abeille. La fin, elle, est donnée par une minuterie JavaScript de
// la même durée : `onDone` ne dépend ni de la mesure de la scène, ni du fil des animations, et part
// une seule fois, jamais après le démontage.
//
// Les données de l'abeille (son dessin, son point d'attache à la traînée) viennent de
// logo.generated.ts ; les tailles et les durées, des jetons de @ruche/brand
// (`layout.publishDance`, `durations`).
import { durations, layout } from '@ruche/brand'
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, G, Path } from 'react-native-svg'
import type { Measurable } from './coverTransition'
import { bee, beeAnchor, beeViewBox, trailPoints } from './logo.generated'
import { useHydrated } from './theme/hydration'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const sizes = layout.publishDance

// --- 1. Le temps -----------------------------------------------------------------------------------
// Trois phases à la suite : le huit (un tour de danse), le vol vers la carte (un déplacement sur
// l'écran), la pose (l'abeille et la traînée s'effacent).

const DANCE = durations.dance
const FLIGHT = durations.medium
const SETTLE = durations.base
/** La durée de toute la danse : `onDone` part à ce moment-là. */
export const PUBLISH_DANCE_MS = DANCE + FLIGHT + SETTLE
/** Les fins des deux premières phases, en part de la durée totale. */
const DANCE_END = DANCE / PUBLISH_DANCE_MS
const FLIGHT_END = (DANCE + FLIGHT) / PUBLISH_DANCE_MS
/** L'abeille paraît en fondu au début du huit, le temps d'un appui. */
const APPEAR = durations.quick / PUBLISH_DANCE_MS

// --- 2. Le huit, calculé une fois au chargement du module -------------------------------------------
// Une « lemniscate de Gerono » : x = A·sin θ, y = −B·sin θ·cos θ. Quand θ fait un tour, le point
// part du centre vers le haut à droite, fait la boucle de droite, repasse au centre et fait celle de
// gauche. A est la demi-largeur du huit ; B sa hauteur (sin θ·cos θ ne dépasse jamais ½).
// Le huit est ensuite rééchantillonné à pas réguliers sur sa longueur : l'abeille y vole à vitesse
// constante, et la traînée (un pointillé d'un seul trait) s'arrête pile sous elle.

const A = sizes.eightWidth / 2
const B = sizes.eightHeight
const FINE = 720
const SAMPLES = 240

const eight = (() => {
  const fine: [number, number][] = []
  const lengths = [0]
  for (let i = 0; i <= FINE; i++) {
    const theta = (i / FINE) * 2 * Math.PI
    const point: [number, number] = [A * Math.sin(theta), -B * Math.sin(theta) * Math.cos(theta)]
    const previous = fine[i - 1]
    if (previous) {
      lengths.push(
        (lengths[i - 1] ?? 0) + Math.hypot(point[0] - previous[0], point[1] - previous[1]),
      )
    }
    fine.push(point)
  }
  const total = lengths[FINE] ?? 1
  const xs: number[] = []
  const ys: number[] = []
  let j = 0
  for (let i = 0; i <= SAMPLES; i++) {
    const s = (i / SAMPLES) * total
    while (j < FINE - 1 && (lengths[j + 1] ?? 0) < s) j++
    const s0 = lengths[j] ?? 0
    const s1 = lengths[j + 1] ?? s0
    const a = fine[j] ?? [0, 0]
    const b = fine[j + 1] ?? a
    const f = s1 > s0 ? Math.min(1, (s - s0) / (s1 - s0)) : 0
    xs.push(a[0] + (b[0] - a[0]) * f)
    ys.push(a[1] + (b[1] - a[1]) * f)
  }
  // La direction du vol (en degrés) à chaque échantillon : celle du point d'avant vers celui
  // d'après. Le huit est fermé : au bout, on regarde le début. « Déroulée » : jamais de saut de
  // 360° d'un échantillon au suivant, sinon l'interpolation ferait tourner l'abeille sur elle-même
  // le temps d'une image (le huit vole vers la gauche, où atan2 passe de 180° à −180°).
  const angles: number[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const before = i === 0 ? SAMPLES - 1 : i - 1
    const after = i === SAMPLES ? 1 : i + 1
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
  return { xs, ys, angles, total }
})()

/** La valeur d'un tableau du huit à la part u du tour (0 à 1), par interpolation linéaire. */
const eightAt = (table: number[], u: number) => {
  'worklet'
  const k = Math.min(SAMPLES, Math.max(0, u * SAMPLES))
  const i = Math.min(SAMPLES - 1, Math.floor(k))
  const a = table[i] ?? 0
  return a + ((table[i + 1] ?? a) - a) * (k - i)
}

/** Le huit en tracé SVG, centré sur (cx, cy). */
const eightPath = (cx: number, cy: number) =>
  eight.xs
    .map(
      (x, i) =>
        `${i === 0 ? 'M' : 'L'}${(cx + x).toFixed(1)} ${(cy + (eight.ys[i] ?? 0)).toFixed(1)}`,
    )
    .join(' ')

// --- 3. Le vol vers la carte -------------------------------------------------------------------------
// Une courbe de Bézier quadratique (un départ, un point de contrôle, une arrivée) du centre du huit
// à la cible. Le point de contrôle est écarté de la droite d'un cinquième de la distance : le vol
// s'incurve comme sur la planche, au lieu de filer en ligne droite.

const BOW = 0.2

type Flight = { cx: number; cy: number; qx: number; qy: number; tx: number; ty: number }

/** Le vol du centre (cx, cy) vers (tx, ty). Sans cible, il ne va nulle part : (tx, ty) = le centre. */
const flightOf = (cx: number, cy: number, tx: number, ty: number): Flight => {
  'worklet'
  const dx = tx - cx
  const dy = ty - cy
  // (−dy, dx) : la direction du vol tournée d'un quart de tour ; vers le bas à gauche quand
  // l'abeille descend vers la droite.
  return { cx, cy, qx: cx + dx / 2 - dy * BOW, qy: cy + dy / 2 + dx * BOW, tx, ty }
}

/** Le point de la courbe à t (0 à 1). */
const flightPoint = (f: Flight, t: number) => {
  'worklet'
  const u = 1 - t
  return {
    x: u * u * f.cx + 2 * u * t * f.qx + t * t * f.tx,
    y: u * u * f.cy + 2 * u * t * f.qy + t * t * f.ty,
  }
}

/** La longueur de la courbe de 0 à t, en petits segments droits (assez pour un pointillé). */
const flightLength = (f: Flight, t: number) => {
  'worklet'
  const steps = 16
  let length = 0
  let previous = flightPoint(f, 0)
  for (let i = 1; i <= steps; i++) {
    const point = flightPoint(f, (t * i) / steps)
    length += Math.hypot(point.x - previous.x, point.y - previous.y)
    previous = point
  }
  return length
}

/** Une courbe douce : part lentement, accélère, ralentit à l'arrivée. */
const smooth = (t: number) => {
  'worklet'
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/** Où en est chaque phase à l'instant p (0 à 1) : le huit, le vol, la pose. */
const phasesAt = (p: number) => {
  'worklet'
  // Le huit garde un peu d'élan aux deux bouts (moitié vitesse constante, moitié courbe douce).
  const raw = Math.min(1, p / DANCE_END)
  return {
    dance: (raw + smooth(raw)) / 2,
    flight: smooth((p - DANCE_END) / (FLIGHT_END - DANCE_END)),
    settle: Math.min(1, Math.max(0, (p - FLIGHT_END) / (1 - FLIGHT_END))),
  }
}

// --- 4. L'abeille -----------------------------------------------------------------------------------

const boxOf = (box: string) => {
  const [x = 0, y = 0, width = 1, height = 1] = box.split(' ').map(Number)
  return { x, y, width, height }
}
const beeBox = boxOf(beeViewBox)
const BEE = sizes.bee
const k = BEE / beeBox.width
const beeHeight = beeBox.height * k
// Le point de l'abeille où la traînée s'attache (son bout, dans le logo) : c'est lui qui suit le
// vol. Les transformations tournent autour du centre de la vue : on y ramène ce point d'abord.
const pivotX = (beeAnchor[0] - beeBox.x) * k - BEE / 2
const pivotY = (beeAnchor[1] - beeBox.y) * k - beeHeight / 2
const anchorLeft = (beeAnchor[0] - beeBox.x) * k
const anchorTop = (beeAnchor[1] - beeBox.y) * k
// Dans le logo, la traînée arrive sous l'abeille en montant vers la droite, et l'abeille est
// droite : elle se tient donc tournée de l'angle de la traînée à son bout (mesuré, jamais recopié),
// comme dans LoadingLogo. En vol, elle prend la direction du vol plus cet écart.
const trailEnd = trailPoints[trailPoints.length - 1] ?? [0, 0]
const trailBefore = trailPoints[trailPoints.length - 2] ?? [0, 0]
const TILT =
  (-Math.atan2(trailEnd[1] - trailBefore[1], trailEnd[0] - trailBefore[0]) * 180) / Math.PI

// --- 5. Le dessin -----------------------------------------------------------------------------------

/** Les gouttes que la traînée laisse : sur le huit (part du tour), puis sur le vol (part du vol). */
const EIGHT_DROP = 0.3
const FLIGHT_DROPS = [
  { at: 0.4, radius: sizes.drop },
  { at: 0.7, radius: (sizes.drop * 3) / 4 },
] as const

type Target = { x: number; y: number }

/**
 * Les instants où la vue visée (`aim`) est mesurée pendant la danse : tout de suite, une fois le fil
 * remonté en haut (un déplacement, `durations.medium`), et à la fin du huit, juste avant le vol.
 * L'abeille suit la dernière mesure.
 */
const MEASURE_AT = [0, durations.medium, DANCE]

/**
 * Hook : le coin haut gauche de la vue visée, mesuré dans la fenêtre aux instants de `MEASURE_AT`,
 * tant que la danse joue (`active`) ; `null` sans vue, ou avant la première mesure. Une vue cachée
 * répond un cadre vide : le point reste celui d'avant.
 */
const useAimedPoint = (
  aim: RefObject<Measurable | null> | undefined,
  active: boolean,
): Target | null => {
  const [point, setPoint] = useState<Target | null>(null)
  useEffect(() => {
    if (!aim || !active) return
    const measure = () =>
      aim.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) setPoint({ x, y })
      })
    const timers = MEASURE_AT.map((at) => setTimeout(measure, at))
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [aim, active])
  return aim ? point : null
}

type Props = {
  /** Vrai : la danse joue (une fois) ; faux : rien n'est dessiné, et la danse attend. */
  playing: boolean
  /**
   * Où l'abeille se pose : un point de la scène (la vue qui contient la danse, et qu'elle couvre),
   * en points depuis son coin haut gauche ; le haut de la nouvelle carte, par exemple. Il peut
   * bouger pendant la danse (le fil se remet en page) : l'abeille le suit. `null` : la danse finit
   * sur place, au centre du huit.
   */
  target: Target | null
  /**
   * Correction C2 de R6a : la vue à viser (la photo de la nouvelle carte), que la danse mesure
   * elle-même dans la fenêtre (`measureInWindow`) pendant le huit, aux instants de `MEASURE_AT`.
   * Elle l'emporte sur `target` dès sa première mesure. Le repère : la danse doit couvrir la fenêtre
   * depuis son coin haut gauche (`Screen overlay`), sinon le point mesuré tomberait à côté.
   */
  aim?: RefObject<Measurable | null>
  /** Appelé une fois par danse, à sa fin ; tout de suite avec « Réduire les animations ». */
  onDone(): void
  /**
   * Force le mode calme (vrai) ou le mouvement complet (faux), pour le catalogue. Absent dans
   * l'appli, qui suit le réglage de l'appareil (`useCalmMotion`).
   */
  calm?: boolean
  /**
   * Un instant fixe de la danse (0 à 1), sans mouvement ni `onDone` : pour le catalogue et les
   * captures, qui la montrent figée (la planche R6-Danse est figée pendant le vol). Absent dans
   * l'appli.
   */
  moment?: number
}

export function PublishDance({
  playing,
  target: given,
  aim,
  onDone,
  calm: forcedCalm,
  moment,
}: Props) {
  const { colors } = useTheme()
  const systemCalm = useCalmMotion()
  const calm = forcedCalm ?? systemCalm
  const progress = useSharedValue(moment ?? 0)
  const measured = useAimedPoint(aim, playing && !calm && moment === undefined)
  const target = measured ?? given

  // Le dernier `onDone` reçu, lu à la fin : un écran qui passe une nouvelle fonction à chaque
  // rendu ne relance pas la danse.
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  // Vrai dès que `onDone` est parti, jusqu'à ce que la danse s'arrête (`playing` faux) : une seule
  // fin par danse, même si le mode calme change en route ou si React rejoue les effets.
  const doneRef = useRef(false)
  useEffect(() => {
    if (!playing) doneRef.current = false
  }, [playing])

  useEffect(() => {
    if (!playing || moment !== undefined || doneRef.current) return
    const finish = () => {
      if (doneRef.current) return
      doneRef.current = true
      onDoneRef.current()
    }
    if (calm) {
      finish()
      return
    }
    progress.value = 0
    // ReduceMotion.Never : c'est `calm` qui décide (le catalogue peut forcer le mouvement).
    progress.value = withTiming(1, {
      duration: PUBLISH_DANCE_MS,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    })
    const timer = setTimeout(finish, PUBLISH_DANCE_MS)
    return () => {
      clearTimeout(timer)
      cancelAnimation(progress)
    }
  }, [playing, calm, moment, progress])

  useEffect(() => {
    if (moment !== undefined) progress.value = moment
  }, [moment, progress])

  // La scène : mesurée dès qu'elle est posée ; avant, la fenêtre en tient lieu (un téléphone : la
  // danse couvre l'écran ; une seule image au plus avant la mesure).
  const window = useWindowDimensions()
  const hydrated = useHydrated()
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  const width = stage?.width ?? window.width
  const height = stage?.height ?? window.height
  const cx = width / 2
  const cy = height * sizes.eightTop
  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout
    setStage((previous) =>
      previous && previous.width === w && previous.height === h
        ? previous
        : { width: w, height: h },
    )
  }

  // La géométrie, copiée dans des valeurs partagées : le fil des animations la lit à chaque image,
  // et suit ainsi une cible qui bouge sans repartir de zéro.
  const geometry = useSharedValue({ cx, cy, tx: cx, ty: cy, aimed: false })
  useEffect(() => {
    geometry.value = {
      cx,
      cy,
      tx: target?.x ?? cx,
      ty: target?.y ?? cy,
      aimed: target !== null,
    }
  }, [cx, cy, target?.x, target?.y, target, geometry])

  const eightD = useMemo(() => eightPath(cx, cy), [cx, cy])
  const flight = flightOf(cx, cy, target?.x ?? cx, target?.y ?? cy)
  const flightD = `M${cx.toFixed(1)} ${cy.toFixed(1)} Q${flight.qx.toFixed(1)} ${flight.qy.toFixed(1)} ${flight.tx.toFixed(1)} ${flight.ty.toFixed(1)}`
  const eightDrop = { x: cx + eightAt(eight.xs, EIGHT_DROP), y: cy + eightAt(eight.ys, EIGHT_DROP) }

  // Sur le web, la page pré-rendue ne connaît pas la fenêtre : rien n'est dessiné avant
  // l'hydratation (la danse ne part de toute façon qu'après un geste du membre).
  if (!hydrated || !playing || (calm && moment === undefined)) return null

  const hidden = {
    'aria-hidden': true,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  }
  return (
    <View {...hidden} pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <Svg width={width} height={height} pointerEvents="none">
        <EightTrail d={eightD} progress={progress} color={colors.honeyPressed} />
        <FlightTrail
          d={flightD}
          progress={progress}
          geometry={geometry}
          color={colors.honeyPressed}
        />
        <Drop
          x={eightDrop.x}
          y={eightDrop.y}
          radius={(sizes.drop * 3) / 4}
          progress={progress}
          along="dance"
          at={EIGHT_DROP}
          color={colors.honey}
        />
        {target
          ? FLIGHT_DROPS.map((drop) => {
              const point = flightPoint(flight, drop.at)
              return (
                <Drop
                  key={drop.at}
                  x={point.x}
                  y={point.y}
                  radius={drop.radius}
                  progress={progress}
                  along="flight"
                  at={drop.at}
                  color={colors.honey}
                />
              )
            })
          : null}
      </Svg>
      <Bee progress={progress} geometry={geometry} />
    </View>
  )
}

type Geometry = SharedValue<{ cx: number; cy: number; tx: number; ty: number; aimed: boolean }>

/** La traînée du huit : elle se dessine sous l'abeille, puis pâlit et s'affine pendant le vol. */
function EightTrail({
  d,
  progress,
  color,
}: {
  d: string
  progress: SharedValue<number>
  color: string
}) {
  const props = useAnimatedProps(() => {
    const phase = phasesAt(progress.value)
    const drawn = phase.dance * eight.total
    return {
      // Un pointillé d'un seul trait, posé du début du huit jusqu'à l'abeille. Un trait de
      // longueur nulle dessinerait quand même ses bouts ronds : il est alors invisible.
      strokeDasharray: [Math.max(drawn, 0.01), eight.total * 2],
      strokeWidth: sizes.trail + (sizes.trailFaded - sizes.trail) * phase.flight,
      opacity: drawn > 0.5 ? (1 - phase.flight / 2) * (1 - phase.settle) : 0,
    }
  })
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      animatedProps={props}
    />
  )
}

/** La traînée du vol, fraîche : du centre du huit jusqu'à l'abeille, qui file vers la carte. */
function FlightTrail({
  d,
  progress,
  geometry,
  color,
}: {
  d: string
  progress: SharedValue<number>
  geometry: Geometry
  color: string
}) {
  const props = useAnimatedProps(() => {
    const phase = phasesAt(progress.value)
    const g = geometry.value
    const f = flightOf(g.cx, g.cy, g.tx, g.ty)
    const drawn = g.aimed ? flightLength(f, phase.flight) : 0
    return {
      strokeDasharray: [Math.max(drawn, 0.01), flightLength(f, 1) * 2 + 1],
      opacity: drawn > 0.5 ? 1 - phase.settle : 0,
    }
  })
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={sizes.trail}
      strokeLinecap="round"
      strokeLinejoin="round"
      animatedProps={props}
    />
  )
}

/**
 * Une goutte de miel, laissée quand l'abeille passe à la part `at` du huit (`along="dance"`) ou du
 * vol (`"flight"`), effacée à la pose. Une goutte du huit pâlit avec lui quand l'abeille s'en va.
 */
function Drop({
  x,
  y,
  radius,
  progress,
  along,
  at,
  color,
}: {
  x: number
  y: number
  radius: number
  progress: SharedValue<number>
  along: 'dance' | 'flight'
  at: number
  color: string
}) {
  const props = useAnimatedProps(() => {
    const phase = phasesAt(progress.value)
    if (phase[along] < at) return { opacity: 0 }
    return { opacity: (along === 'dance' ? 1 - phase.flight / 2 : 1) * (1 - phase.settle) }
  })
  return <AnimatedCircle cx={x} cy={y} r={radius} fill={color} animatedProps={props} />
}

/** L'abeille du logo : elle suit le huit, puis le vol, la traînée accrochée sous elle. */
function Bee({ progress, geometry }: { progress: SharedValue<number>; geometry: Geometry }) {
  const { colors } = useTheme()
  const style = useAnimatedStyle(() => {
    const p = progress.value
    const phase = phasesAt(p)
    const g = geometry.value
    let x = g.cx + eightAt(eight.xs, phase.dance)
    let y = g.cy + eightAt(eight.ys, phase.dance)
    let angle = eightAt(eight.angles, Math.min(phase.dance, 0.999))
    if (g.aimed && phase.flight > 0) {
      const f = flightOf(g.cx, g.cy, g.tx, g.ty)
      const point = flightPoint(f, phase.flight)
      // La direction : du point juste avant vers le point atteint (au départ, juste après).
      const t0 = Math.max(0, phase.flight - 0.02)
      const t1 = Math.max(phase.flight, 0.02)
      const a = flightPoint(f, t0)
      const b = flightPoint(f, t1)
      x = point.x
      y = point.y
      angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    }
    const appear = Math.min(1, p / APPEAR)
    const size = (0.6 + 0.4 * appear) * (1 - phase.settle / 2)
    // Vers la gauche, l'abeille se retourne (son reflet) au lieu de voler sur le dos : son reflet
    // vole naturellement vers 180° + TILT, d'où l'angle. Le changement se fait quand le vol est
    // vertical, là où les deux poses sont le reflet l'une de l'autre.
    const leftward = Math.cos((angle * Math.PI) / 180) < 0
    return {
      opacity: appear * (1 - phase.settle),
      transform: [
        // Le point d'attache sur (x, y), puis la rotation et l'échelle autour de lui.
        { translateX: x - anchorLeft + pivotX },
        { translateY: y - anchorTop + pivotY },
        { rotate: `${leftward ? angle - 180 - TILT : angle + TILT}deg` },
        { scaleX: leftward ? -size : size },
        { scaleY: size },
        { translateX: -pivotX },
        { translateY: -pivotY },
      ],
    }
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: BEE, height: beeHeight }, style]}
    >
      <Svg width={BEE} height={beeHeight} viewBox={beeViewBox}>
        {/* Comme Logo (variante entière) : le miel et les ailes, puis l'encre par-dessus. */}
        <G>
          <Path d={bee.honey} fill={colors.honey} />
          <Path d={bee.wing} fill={colors.surface} />
          <Path d={bee.ink} fill={colors.text} />
        </G>
      </Svg>
    </Animated.View>
  )
}
