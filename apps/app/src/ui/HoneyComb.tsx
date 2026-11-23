// Le rayon (R19, planches R19-Recolte, R19-Profil et R19-Membre) : une rangée d'alvéoles
// hexagonales, pointe en haut, scellées une à une à mesure que le pollen approche du niveau suivant.
// Dix alvéoles mènent au niveau suivant (option a1) ; une alvéole pleine porte trois grains de
// pollen. En petit (`size="small"`), le même dessin sert de jauge à un défi : `count` alvéoles
// (5 pour « 5 retours »), dont `cells` remplies.
//
// La décoration achetée avec du miel (« Décorer mon rayon », liste de la planche R19-Miel) change
// le dessin des alvéoles pleines : la teinte (Miel, Ambre, Pollen) et le motif de cire (Lisse,
// Gaufré, Rayé, Pointillé). Elle ne change rien à ce qui est lu.
//
// Pour un lecteur d'écran, c'est une barre de progression, comme la jauge en alvéoles de miel
// (ui/HoneyMeter) : un nom (« Mon rayon »), une valeur (les alvéoles remplies) et la phrase qui la
// dit (« 7 alvéoles sur 10 vers le niveau 5 »). Les alvéoles, elles, sont du dessin : rien d'autre
// n'est lu.
import { type ColorName, durations, layout } from '@ruche/brand'
import type { DecorationPattern, DecorationTint } from '@ruche/contracts'
import { useEffect, useId, useRef } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** Les alvéoles qui mènent au niveau suivant (option a1). */
const LEVEL_CELLS = 10
const SQRT3 = Math.sqrt(3)

/**
 * Les couleurs d'une teinte : le fond d'une alvéole pleine, son trait, ses grains de pollen. Tous
 * des rôles de la marque, de jour comme de nuit. Le trait est ce qui détache l'alvéole du fond
 * (une forme, 3:1 : `amber` et `amberText` sur le fond de page ont leur couple dans contrastPairs).
 * Exporté pour que le choix de la décoration (ses pastilles) montre exactement la même teinte.
 */
export const combTints: Record<
  DecorationTint,
  { fill: ColorName; stroke: ColorName; grain: ColorName }
> = {
  // Miel, offert : le miel de la marque, des grains de pollen clair.
  honey: { fill: 'honey', stroke: 'amber', grain: 'honeyLight' },
  // Ambre : l'alvéole ambre et son trait brun (le dessin « Ambre » de la planche R19-Profil).
  amber: { fill: 'amber', stroke: 'amberText', grain: 'honeyLight' },
  // Pollen : une alvéole claire, des grains de miel (le rayon de la planche R19-Recolte).
  pollen: { fill: 'honeyLight', stroke: 'amber', grain: 'honey' },
}

/** Le motif de cire, posé sur les alvéoles pleines : la cire crème (`wax`), à demi transparente. */
const PATTERN_OPACITY = 0.5

/** Un hexagone pointe en haut, de `width` de large (plat à plat), centré en `cx`, `cy`. */
function hexagonPath(cx: number, cy: number, width: number) {
  const radius = width / SQRT3
  const corners = [-90, -30, 30, 90, 150, 210].map((degrees) => {
    const angle = (degrees * Math.PI) / 180
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`
  })
  return `M${corners.join(' L')}Z`
}

/** Un petit disque, écrit comme un tracé (deux demi-cercles) : tous les points d'un motif en un seul. */
function dotPath(cx: number, cy: number, radius: number) {
  return `M${(cx - radius).toFixed(2)} ${cy.toFixed(2)}a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0`
}

/**
 * Le motif d'une décoration, sur toute la largeur du rayon : il est ensuite découpé à la forme des
 * alvéoles pleines (le `clipPath`). `scale` ramène les mesures de la planche (des alvéoles de 30)
 * à la taille dessinée. Lisse : aucun motif, les grains de pollen suffisent. Exporté pour les
 * pastilles du choix de la décoration (ui/DecorationPicker) : le même dessin aux deux endroits.
 */
export function patternPath(
  pattern: DecorationPattern,
  width: number,
  height: number,
  scale: number,
) {
  const parts: string[] = []
  if (pattern === 'striped') {
    // Des rayures à 45°, de 3 de large tous les 9.
    const step = 9 * scale
    for (let x = -height; x < width; x += step) {
      parts.push(`M${x.toFixed(2)} ${height.toFixed(2)}L${(x + height).toFixed(2)} 0`)
    }
  } else if (pattern === 'waffle') {
    // Une grille fine, tous les 8 : la cire gaufrée.
    const step = 8 * scale
    for (let x = step / 2; x < width; x += step)
      parts.push(`M${x.toFixed(2)} 0V${height.toFixed(2)}`)
    for (let y = step / 2; y < height; y += step)
      parts.push(`M0 ${y.toFixed(2)}H${width.toFixed(2)}`)
  } else if (pattern === 'dotted') {
    // Des points, tous les 8.
    const step = 8 * scale
    for (let y = step / 2; y < height; y += step) {
      for (let x = step / 2; x < width; x += step) parts.push(dotPath(x, y, 1.5 * scale))
    }
  }
  return parts.join('')
}

type Props = {
  /** Les alvéoles remplies, de 0 à `count` (au-delà, la jauge s'arrête à `count`). */
  cells: number
  /** Le nom lu de la barre : « Mon rayon », « Son rayon », le nom d'un défi. */
  label: string
  /** La phrase lue de la valeur : « 7 alvéoles sur 10 vers le niveau 5 », « 3 sur 5 ». */
  valueText: string
  /** La teinte des alvéoles pleines (décoration ; Miel par défaut, offert). */
  tint: DecorationTint
  /** Le motif de cire des alvéoles pleines (décoration ; Lisse par défaut, offert). */
  pattern: DecorationPattern
  /** `regular` : le rayon d'un membre (alvéoles de 30) ; `small` : la jauge d'un défi (22). */
  size: 'regular' | 'small'
  /** Le nombre d'alvéoles : 10 pour le rayon, celui du défi pour une jauge (5 pour « 5 retours »). */
  count?: number
  /**
   * R19, le passage de niveau (planche R19-Niveau) : le rayon se vide. `from` est le nombre
   * d'alvéoles pleines d'avant (10, le rayon plein) : elles sont dessinées pleines, puis se vident
   * de droite à gauche jusqu'à `cells`, une seule fois (un nouveau rendu avec le même passage ne
   * rejoue rien). Avec « Réduire les animations », elles s'effacent ensemble, en fondu. Le lecteur
   * d'écran lit tout de suite la vraie valeur (`cells`) : le mouvement n'est que du dessin.
   */
  drain?: { from: number } | undefined
}

/** Le temps où le rayon se vide (planche R19-Niveau : de 880 à 1 440 ms, `slow`). */
const DRAIN_MS = durations.slow
/** L'opacité d'une alvéole en train de se vider (`g.sort` de la planche). */
const DRAINING_OPACITY = 0.35

export function HoneyComb({ cells, label, valueText, tint, pattern, size, count, drain }: Props) {
  const { colors } = useTheme()
  // Un identifiant propre à ce rayon pour son `clipPath` : deux rayons sur la même page (le profil
  // et la feuille de décoration) ne doivent pas se découper l'un l'autre. Les deux-points de
  // `useId` n'ont pas leur place dans une adresse `url(#…)` : on ne garde que lettres et chiffres.
  const clipId = `comb${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const total = Math.max(1, Math.round(count ?? LEVEL_CELLS))
  const filled = Math.min(Math.max(0, Math.round(cells)), total)

  const cell = size === 'small' ? layout.comb.smallCell : layout.comb.cell
  const gap = layout.comb.gap
  const scale = cell / layout.comb.cell
  const height = (2 * cell) / SQRT3
  const width = total * (cell + gap) - gap
  // Chaque alvéole est dessinée un peu plus étroite que sa place, pour que son trait y tienne.
  const drawn = cell - 1.5
  const centers = Array.from({ length: total }, (_, i) => cell / 2 + i * (cell + gap))
  const cy = height / 2
  const colorsOfTint = combTints[tint]
  const motif = pattern === 'smooth' ? '' : patternPath(pattern, width, height, scale)
  // Les alvéoles qui se vident : celles qui étaient pleines avant le passage et ne le sont plus.
  const drainFrom = drain ? Math.min(Math.max(0, Math.round(drain.from)), total) : 0
  const drained = centers.slice(filled, Math.max(filled, drainFrom))
  const calm = useCalmMotion()

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-valuetext={valueText}
      // Le rayon se resserre dans une colonne étroite (320 points), sans jamais s'élargir : la
      // boîte garde les proportions du dessin, le SVG la remplit.
      style={{ width: '100%', maxWidth: width, aspectRatio: width / height }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width.toFixed(2)} ${height.toFixed(2)}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {motif !== '' && filled > 0 && (
          <Defs>
            {/* La forme des alvéoles pleines, qui découpe le motif. */}
            <ClipPath id={clipId}>
              {centers.slice(0, filled).map((cx) => (
                <Path key={cx} d={hexagonPath(cx, cy, drawn)} />
              ))}
            </ClipPath>
          </Defs>
        )}
        {centers.map((cx, i) => {
          const full = i < filled
          return (
            <G key={cx}>
              <Path
                d={hexagonPath(cx, cy, drawn)}
                fill={colors[full ? colorsOfTint.fill : 'surfaceGrouped']}
                stroke={colors[full ? colorsOfTint.stroke : 'lineStrong']}
                strokeWidth={1.2}
              />
              {/* Trois grains de pollen dans une alvéole pleine, quand aucun motif ne la couvre. */}
              {full && pattern === 'smooth' && (
                <>
                  <Circle
                    cx={cx - 5 * scale}
                    cy={cy - 4 * scale}
                    r={2.2 * scale}
                    fill={colors[colorsOfTint.grain]}
                  />
                  <Circle
                    cx={cx + 4.5 * scale}
                    cy={cy - scale}
                    r={1.8 * scale}
                    fill={colors[colorsOfTint.grain]}
                  />
                  <Circle
                    cx={cx - scale}
                    cy={cy + 6 * scale}
                    r={2 * scale}
                    fill={colors[colorsOfTint.grain]}
                  />
                </>
              )}
            </G>
          )
        })}
        {motif !== '' && filled > 0 && (
          <G clipPath={`url(#${clipId})`}>
            <Path
              d={motif}
              // Les rayures et la grille sont des traits ; les points, des disques pleins.
              fill={pattern === 'dotted' ? colors.wax : 'none'}
              stroke={pattern === 'dotted' ? 'none' : colors.wax}
              strokeWidth={(pattern === 'striped' ? 3 : 1) * scale}
              opacity={PATTERN_OPACITY}
            />
          </G>
        )}
      </Svg>
      {/* Le rayon qui se vide : une alvéole pleine posée sur chaque alvéole vidée, qui s'efface.
          En pourcentages de la boîte, qui se resserre dans une colonne étroite. */}
      {drained.map((cx, i) => (
        <DrainCell
          key={cx}
          index={filled + i}
          // De droite à gauche : la plus à droite part la première.
          order={drained.length - 1 - i}
          steps={drained.length}
          passage={`${drainFrom}>${filled}`}
          calm={calm}
          left={(cx - cell / 2) / width}
          span={cell / width}
          height={height}
          cell={cell}
          drawn={drawn}
          fill={colors[colorsOfTint.fill]}
          stroke={colors[colorsOfTint.stroke]}
        />
      ))}
    </View>
  )
}

type DrainProps = {
  index: number
  order: number
  steps: number
  /** Le passage joué (« 10>1 ») : le même passage ne se rejoue pas. */
  passage: string
  calm: boolean
  /** La place de l'alvéole, en fraction de la largeur du rayon. */
  left: number
  span: number
  height: number
  cell: number
  drawn: number
  fill: string
  stroke: string
}

/** Une durée fixe, même en mode calme : c'est le rayon qui décide de ce qui reste (un fondu). */
const fade = (to: number, duration: number) =>
  withTiming(to, { duration, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never })

/** Une alvéole qui se vide : pleine au départ, puis à demi transparente, puis partie. */
function DrainCell({
  index,
  order,
  steps,
  passage,
  calm,
  left,
  span,
  height,
  cell,
  drawn,
  fill,
  stroke,
}: DrainProps) {
  const opacity = useSharedValue(1)
  // Le passage déjà joué : un nouveau rendu avec le même passage ne rejoue rien.
  const played = useRef<string | null>(null)
  useEffect(() => {
    if (played.current === passage) return
    played.current = passage
    if (calm) {
      // Mode calme : toutes ensemble, un fondu sur place.
      opacity.value = fade(0, durations.base)
      return
    }
    const step = DRAIN_MS / Math.max(1, steps)
    opacity.value = withDelay(
      order * step,
      withSequence(fade(DRAINING_OPACITY, step / 2), fade(0, step / 2)),
    )
  }, [passage, calm, order, steps, opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      testID={`comb-drain-${index}`}
      pointerEvents="none"
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        {
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${left * 100}%`,
          width: `${span * 100}%`,
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${cell.toFixed(2)} ${height.toFixed(2)}`}>
        <Path
          d={hexagonPath(cell / 2, height / 2, drawn)}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.2}
        />
      </Svg>
    </Animated.View>
  )
}
