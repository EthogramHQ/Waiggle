// Les illustrations des écrans de passage (e-mail envoyé, adresse vérifiée, lien externe, page
// introuvable). Faites de formes et de lumière miel, jamais de dessins génériques : elles prennent
// les couleurs du thème, de jour comme de nuit, et respirent doucement.
//
// Toutes démarrent seules et durent : avec « Réduire les animations », elles s'immobilisent (WCAG
// 2.2.2, comme la lumière d'ambiance). Le portail apparaît alors en fondu, sans mouvement.
import { durations, maskVisible, radii } from '@ruche/brand'
import { type ReactNode, useEffect, useId } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg'
import { Icon, type IconName } from './Icon'
import { Mascot } from './Mascot'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/**
 * Une valeur qui va de 0 à 1 et revient, en boucle : le souffle des illustrations. Avec « Réduire
 * les animations », elle reste à 0 (relecture du plan R5a, ui-14) : un souffle sans fin à côté du
 * contenu est un mouvement qui démarre seul et dure plus de 5 secondes.
 */
const useBreath = (period: number, still = false) => {
  // `still` : immobile quoi que dise l'appareil (l'allure calme imposée par le catalogue).
  const calm = useCalmMotion() || still
  // useSharedValue : une valeur que lit le fil des animations de Reanimated, sans redessiner React.
  const t = useSharedValue(0)
  useEffect(() => {
    if (calm) {
      // cancelAnimation arrête une boucle déjà lancée (le réglage peut changer pendant la visite).
      cancelAnimation(t)
      t.value = 0
      return
    }
    t.value = withRepeat(
      withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => cancelAnimation(t)
  }, [t, period, calm])
  return t
}

/**
 * Un nom de dégradé ou de filtre propre à chaque dessin (`url(#…)`). La pile garde les pages quittées
 * en `display: none` : avec un nom commun, le navigateur prendrait celui d'une page cachée et ne
 * dessinerait rien. useId donne le même au pré-rendu web et dans le navigateur.
 */
const useSvgId = (name: string) => `${name}-${useId().replace(/[^\w-]/g, '')}`

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
  const haloId = useSvgId('emblem-halo')
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
            <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={colors.honeyLight} stopOpacity={0.9} />
              <Stop offset={1} stopColor={colors.honeyLight} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill={`url(#${haloId})`} />
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

// --- Le portail (R5a, planches R5a-Portail et R5a-Portail-Nuit) ---
//
// Toucher « Tester la démo » ouvre le portail : la page qu'on quitte se floute et part au fond, des
// anneaux de lumière sont aspirés vers le centre, et une lumière tourne autour. Tout est dessiné
// ici, page floutée comprise : aucun réglage de transition dans la navigation (relecture du plan,
// ui-18), et l'écran qui le montre (LeavingScreen) n'a qu'à le poser en décor.

/** La hauteur du portail : la bande de miel d'un écran de marque (300 points au moins). */
const portalHeight = 300
/**
 * L'anneau le plus grand, à son départ : une ellipse plus large que haute, comme un tunnel vu de
 * biais. Plus large que l'écran d'un téléphone : il entre par les bords, comme sur la planche.
 */
const ringWidth = 560
const ringHeight = 300
const ringCount = 6
/** Le temps qu'un anneau met à aller du bord au centre, en millisecondes. */
const ringTrip = 7000
/** Un tour de la lumière, en millisecondes. */
const lightTurn = 14_000
/** L'ouverture : la page quittée part au fond pendant ce temps (millisecondes). */
const opening = 1100
/** Le cœur de lumière, au centre, où se pose la flèche. */
const coreSide = 128
/** Le carré dans lequel tourne la lumière (centré, plus large que le portail : ses coins ne se voient pas). */
const lightSide = 560

/**
 * La taille d'un anneau selon son avancée `p` (0 au bord, 1 au centre). Une vraie profondeur : un
 * anneau qui avance à vitesse constante dans un tunnel rapetisse comme 1 / distance, donc lentement
 * au bord et de plus en plus vite près du centre, où il disparaît. Ramenée de 1 à 0.
 */
const depthScale = (p: number) => {
  'worklet' // tourne aussi sur le fil des animations
  // 1,2 : une profondeur douce, qui laisse cinq anneaux lisibles entre le bord et le cœur
  // (planche R5a-Portail) ; plus forte, ils se serraient tous sous la lumière du centre.
  const depth = 1.2
  const far = 1 / (1 + depth)
  return (1 / (1 + depth * p) - far) / (1 - far)
}

/** L'opacité d'un anneau : il naît au bord, brille au milieu du trajet, s'éteint au centre. */
const ringOpacity = (p: number) => {
  'worklet'
  return Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.3)
}

/** Un anneau du portail, décalé de `index` sixièmes de trajet sur ses voisins. */
function Ring({
  index,
  flow,
  opened,
  stroke,
}: {
  index: number
  flow: SharedValue<number>
  opened: SharedValue<number>
  stroke: string
}) {
  const style = useAnimatedStyle(() => {
    // `% 1` : passé le centre, l'anneau repart du bord ; les six se suivent sans trou.
    const p = (flow.value + index / ringCount) % 1
    return {
      opacity: ringOpacity(p) * opened.value * 0.9,
      transform: [{ scale: Math.max(0.001, depthScale(p)) }],
    }
  })
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: ringWidth,
          height: ringHeight,
          left: '50%',
          top: '50%',
          marginLeft: -ringWidth / 2,
          marginTop: -ringHeight / 2,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${ringWidth} ${ringHeight}`}>
        <Ellipse
          cx={ringWidth / 2}
          cy={ringHeight / 2}
          rx={ringWidth / 2 - 2}
          ry={ringHeight / 2 - 2}
          fill="none"
          stroke={stroke}
          strokeWidth={1.6}
        />
      </Svg>
    </Animated.View>
  )
}

/**
 * La page qu'on quitte, floutée : un rappel de page (une barre, une photo, des lignes de texte),
 * sans aucun texte réel, derrière un flou. À l'ouverture, elle part au fond du portail ; avec
 * « Réduire les animations », elle s'efface sur place.
 */
function LeftPage({ opened, calm }: { opened: SharedValue<number>; calm: boolean }) {
  const { colors } = useTheme()
  const blurId = useSvgId('portal-blur')
  const style = useAnimatedStyle(() => ({
    opacity: 1 - opened.value,
    transform: calm ? [] : [{ scale: 1 - opened.value * 0.85 }],
  }))
  // La page dessinée, en unités de 0 à 100 de large : centrée dans le portail, à sa hauteur.
  const shapes: [number, number, number, number][] = [
    [6, 6, 88, 10], // la barre du haut
    [6, 22, 88, 46], // la photo
    [6, 74, 70, 6], // le titre
    [6, 84, 52, 4], // une ligne
    [6, 92, 62, 4], // une autre
  ]
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="-40 -6 180 112" preserveAspectRatio="xMidYMid meet">
        <Defs>
          {/* Le flou de la page quittée : un flou gaussien, dessiné par le portail lui-même. */}
          <Filter id={blurId} x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation={2.4} />
          </Filter>
        </Defs>
        <G filter={`url(#${blurId})`}>
          <Rect x={0} y={0} width={100} height={100} rx={6} fill={colors.surface} opacity={0.75} />
          {shapes.map(([x, y, width, height]) => (
            <Rect
              key={`${x},${y}`}
              x={x}
              y={y}
              width={width}
              height={height}
              rx={2}
              fill={colors.honey}
              opacity={0.45}
            />
          ))}
        </G>
      </Svg>
    </Animated.View>
  )
}

/**
 * Le portail vers un autre site : des anneaux de lumière aspirés vers une flèche, au centre d'un
 * cœur lumineux, et une lumière qui tourne. Un décor, caché aux lecteurs d'écran : la page dit en
 * toutes lettres où l'on va. Sans propriété : il prend toute la largeur qu'on lui donne (la bande
 * de miel sur téléphone, le haut de la carte sur ordinateur) et ce qui dépasse est rogné par elle.
 *
 * `calm` impose l'allure de « Réduire les animations » (le catalogue la montre ainsi à côté de
 * l'autre) ; sans lui, le portail suit le réglage de l'appareil.
 */
export function PortalRings({ calm: forcedCalm = false }: { calm?: boolean } = {}) {
  const { colors, scheme } = useTheme()
  const deviceCalm = useCalmMotion()
  const calm = forcedCalm || deviceCalm
  const coreId = useSvgId('portal-core')
  const lightId = useSvgId('portal-light')
  // Trois valeurs animées : l'avancée des anneaux (0 → 1, en boucle), le tour de la lumière
  // (0 → 1, en boucle), l'ouverture (0 → 1, une fois).
  const flow = useSharedValue(0)
  const spin = useSharedValue(0)
  const opened = useSharedValue(0)
  // Le cœur respire, comme les autres illustrations (immobile en mode calme).
  const breath = useBreath(durations.breath / 5, forcedCalm)

  useEffect(() => {
    if (calm) {
      // Mode calme : rien ne bouge ; le portail apparaît en fondu, les anneaux à leur place.
      // `ReduceMotion.Never` : sans lui, Reanimated sauterait aussi ce fondu quand l'appareil
      // demande moins de mouvement (le fondu n'est pas un déplacement).
      cancelAnimation(flow)
      cancelAnimation(spin)
      flow.value = 0
      spin.value = 0
      opened.value = withTiming(1, { duration: durations.slow, reduceMotion: ReduceMotion.Never })
      return
    }
    // L'ouverture accélère vers la fin (`Easing.in`) : la page est aspirée, pas poussée.
    opened.value = withTiming(1, { duration: opening, easing: Easing.in(Easing.cubic) })
    // Une boucle sans aller-retour (dernier argument `false`) : les anneaux vont toujours vers le
    // centre, la lumière tourne toujours dans le même sens.
    flow.value = withRepeat(withTiming(1, { duration: ringTrip, easing: Easing.linear }), -1, false)
    spin.value = withRepeat(
      withTiming(1, { duration: lightTurn, easing: Easing.linear }),
      -1,
      false,
    )
    return () => {
      cancelAnimation(flow)
      cancelAnimation(spin)
    }
  }, [calm, flow, spin, opened])

  // La lumière qui tourne apparaît avec les anneaux.
  const light = useAnimatedStyle(() => ({
    opacity: opened.value,
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }))
  // Le cœur grandit un peu à l'ouverture (sauf en mode calme), puis respire.
  const core = useAnimatedStyle(() => ({
    opacity: opened.value,
    transform: [{ scale: (calm ? 1 : 0.6 + opened.value * 0.4) * (1 + breath.value * 0.06) }],
  }))

  // Les couleurs des planches : de jour, des anneaux et un cœur blancs sur le miel ; de nuit, une
  // lumière de miel (honeyLight) sur la lanterne sombre.
  const night = scheme === 'night'
  const glow = night ? colors.honeyLight : colors.knob

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={{ alignSelf: 'stretch', height: portalHeight }}
    >
      <LeftPage opened={opened} calm={calm} />
      {/* La lumière qui tourne : une tache claire décentrée, dans un carré qui pivote sur le centre. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: lightSide,
            height: lightSide,
            left: '50%',
            top: '50%',
            marginLeft: -lightSide / 2,
            marginTop: -lightSide / 2,
          },
          light,
        ]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={lightId} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={glow} stopOpacity={night ? 0.35 : 0.55} />
              <Stop offset={1} stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={50} cy={30} rx={26} ry={16} fill={`url(#${lightId})`} />
        </Svg>
      </Animated.View>
      {Array.from({ length: ringCount }, (_, index) => (
        <Ring
          // biome-ignore lint/suspicious/noArrayIndexKey: six anneaux fixes, leur rang est leur nom.
          key={index}
          index={index}
          flow={flow}
          opened={opened}
          stroke={night ? colors.honeyLight : colors.knob}
        />
      ))}
      <Centered side={coreSide} style={core}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={coreId} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={glow} stopOpacity={1} />
              <Stop offset={0.5} stopColor={glow} stopOpacity={0.95} />
              <Stop offset={1} stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={`url(#${coreId})`} />
        </Svg>
      </Centered>
      <Centered side={coreSide}>
        <Icon name="arrow-up-right" size={36} tone="onHoney" />
      </Centered>
    </View>
  )
}

/** Une couche de ce côté, centrée dans son parent (le portail, les alvéoles). */
function Centered({
  side,
  style,
  children,
}: {
  side: number
  style?: ReturnType<typeof useAnimatedStyle>
  children: ReactNode
}) {
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: side,
          height: side,
          left: '50%',
          top: '50%',
          marginLeft: -side / 2,
          marginTop: -side / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}

// --- Les alvéoles (R5a, planche R5a-Introuvable) ---

/** La hauteur des alvéoles : une bande de miel, avec un peu de marge pour la rangée du bas. */
const honeycombHeight = 340
/**
 * Un hexagone « pointe en haut » de ce rayon (du centre à un sommet), et l'écart entre deux. Leur
 * pas : une largeur d'hexagone (√3 × rayon) plus l'écart en largeur, trois quarts de hauteur en
 * hauteur.
 */
const hexRadius = 92
const hexGap = 10
const hexWidth = Math.sqrt(3) * hexRadius
const stepX = hexWidth + hexGap
const stepY = 1.5 * hexRadius + hexGap * (Math.sqrt(3) / 2)
/**
 * Le dessin dépasse de la boîte à gauche et à droite (jusqu'au bord de l'écran, qui le rogne) :
 * plus que la plus grande marge d'un écran (32 points sur ordinateur).
 */
const honeycombBleed = 48

/** Le tracé d'un hexagone pointe en haut, centré en (0, 0). */
const hexPath = (radius: number) =>
  `${Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    return `${i === 0 ? 'M' : 'L'}${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)}`
  }).join(' ')}Z`

/**
 * Les alvéoles : trois rangées en quinconce, assez pour couvrir un écran large ; celle du milieu
 * (0, 0) porte la mascotte.
 */
const cells: [number, number][] = [
  ...[-2, -1, 0, 1, 2].map((column): [number, number] => [column * stepX, 0]),
  ...[-1.5, -0.5, 0.5, 1.5].flatMap((column): [number, number][] => [
    [column * stepX, -stepY],
    [column * stepX, stepY],
  ]),
]

/**
 * Des alvéoles de verre posées sur le miel, et au centre, dans la plus claire, la mascotte à la
 * loupe : ce qu'on cherchait n'est pas là. Un décor, caché aux lecteurs d'écran : le titre de la
 * page dit tout. Il prend toute la largeur qu'on lui donne, comme le portail.
 */
export function Honeycomb() {
  const { colors, scheme } = useTheme()
  const breath = useBreath(durations.breath / 4)
  const glowId = useSvgId('honeycomb-glow')
  const fadeId = useSvgId('honeycomb-fade')
  const maskId = useSvgId('honeycomb-mask')
  // La lumière derrière l'alvéole du centre respire (immobile en mode calme).
  const glow = useAnimatedStyle(() => ({ opacity: 0.7 + breath.value * 0.3 }))
  // Le verre : de jour, du blanc translucide sur le miel ; de nuit, un voile de miel sur la lanterne.
  const night = scheme === 'night'
  const pane = night ? colors.honeyLight : colors.knob
  const half = honeycombHeight / 2
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={{ alignSelf: 'stretch', height: honeycombHeight }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -honeycombBleed,
          right: -honeycombBleed,
        }}
      >
        {/* viewBox étroit et « meet » : la hauteur fixe l'échelle (un point par unité), et le dessin,
            centré, s'étend à gauche et à droite aussi loin que la boîte (hors du viewBox, il reste
            visible dans la zone du dessin). */}
        <Svg
          width="100%"
          height="100%"
          viewBox={`-150 ${-half} 300 ${honeycombHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <Defs>
            {/* Les rangées du haut et du bas s'effacent vers les bords de la boîte, au lieu d'être
                coupées net (un masque : blanc, on voit ; transparent, on ne voit pas). */}
            <LinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset={0} stopColor={maskVisible} stopOpacity={0} />
              <Stop offset={0.2} stopColor={maskVisible} stopOpacity={1} />
              <Stop offset={0.8} stopColor={maskVisible} stopOpacity={1} />
              <Stop offset={1} stopColor={maskVisible} stopOpacity={0} />
            </LinearGradient>
            <Mask id={maskId}>
              <Rect
                x={-1000}
                y={-half}
                width={2000}
                height={honeycombHeight}
                fill={`url(#${fadeId})`}
              />
            </Mask>
          </Defs>
          <G mask={`url(#${maskId})`}>
            {cells.map(([x, y]) => (
              <Path
                key={`${x},${y}`}
                d={hexPath(hexRadius)}
                transform={`translate(${x} ${y})`}
                fill={pane}
                fillOpacity={night ? 0.06 : 0.2}
                stroke={pane}
                strokeOpacity={night ? 0.4 : 0.75}
                strokeWidth={1.5}
              />
            ))}
          </G>
        </Svg>
      </View>
      <Centered side={hexRadius * 3} style={glow}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={pane} stopOpacity={night ? 0.35 : 0.7} />
              <Stop offset={1} stopColor={pane} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={`url(#${glowId})`} />
        </Svg>
      </Centered>
      {/* L'alvéole du centre, plus claire, avec un second bord à l'intérieur : la vitre où se pose
          la mascotte. */}
      <Centered side={hexRadius * 2}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`${-hexRadius} ${-hexRadius} ${hexRadius * 2} ${hexRadius * 2}`}
        >
          <Path
            d={hexPath(hexRadius)}
            fill={pane}
            fillOpacity={night ? 0.12 : 0.4}
            stroke={pane}
            strokeOpacity={night ? 0.6 : 0.95}
            strokeWidth={2}
          />
          <Path
            d={hexPath(hexRadius - 14)}
            fill="none"
            stroke={pane}
            strokeOpacity={night ? 0.35 : 0.7}
            strokeWidth={1.5}
          />
        </Svg>
      </Centered>
      <Centered side={hexRadius * 2}>
        <Mascot pose="search" size="sm" decorative />
      </Centered>
    </View>
  )
}
