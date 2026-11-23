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
import { type ColorName, layout } from '@ruche/brand'
import type { DecorationPattern, DecorationTint } from '@ruche/contracts'
import { useId } from 'react'
import { View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
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
 * à la taille dessinée. Lisse : aucun motif, les grains de pollen suffisent.
 */
function patternPath(pattern: DecorationPattern, width: number, height: number, scale: number) {
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
}

export function HoneyComb({ cells, label, valueText, tint, pattern, size, count }: Props) {
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
    </View>
  )
}
