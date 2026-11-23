// Le choix de la décoration du rayon (R19, feuille « Décorer mon rayon », planche R19-Miel, option
// b11) : une teinte (Miel, Ambre, Pollen) et un motif de cire (Lisse, Gaufré, Rayé, Pointillé),
// chacun une rangée de pastilles hexagonales à cocher. Sous chaque pastille, son nom, puis « À toi »
// pour ce qui est déjà acheté (ou offert : Miel et Lisse), sinon son prix (teinte 10 miel, motif 15,
// Louis 23/11). Un achat vaut pour toujours.
//
// Le composant ne lit aucune donnée et n'achète rien : il dit le choix entier à la feuille
// (`onChange`, l'autre moitié gardée), qui montre l'aperçu, le solde, le prix total et envoie la
// requête. Un choix trop cher reste possible : c'est la feuille qui explique, au moment d'acheter
// (option b9).
//
// Les pastilles montrent exactement le dessin du rayon : les couleurs de chaque teinte viennent de
// `combTints` (ui/HoneyComb), et la pastille d'un motif le pose sur la teinte cochée, pour voir ce
// qu'on obtiendra.
//
// Pour un lecteur d'écran et au clavier, chaque rangée est un groupe de boutons radio, comme
// `Choices` : Tab ne s'y arrête qu'une fois (sur le choix coché), les flèches cochent le voisin en
// faisant le tour, la barre d'espace coche. Le nom lu d'une pastille est son nom ; « À toi » ou le
// prix le décrit (`aria-describedby` sur le web, l'indice sur téléphone).

import { radii, space } from '@ruche/brand'
import {
  DECORATIONS,
  type Decoration,
  type DecorationPattern,
  type DecorationTint,
  type OwnedDecorations,
} from '@ruche/contracts'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, Pressable, View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg'
import { describedBy } from './aria'
import { combTints } from './HoneyComb'
import { Icon } from './Icon'
import { spaceToggles } from './keyboard'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Les teintes proposées, dans l'ordre de la planche. */
  tints: DecorationTint[]
  /** Les motifs proposés, dans l'ordre de la planche. */
  patterns: DecorationPattern[]
  /** Ce que le membre a déjà (les offerts y sont toujours) : « À toi » au lieu d'un prix. */
  owned: OwnedDecorations
  /** Le choix coché : une teinte et un motif. */
  value: Decoration
  /**
   * Le solde de miel. Il ne retire aucun choix (option b9 : un choix trop cher reste possible, la
   * feuille explique au moment d'acheter) ; gardé dans les propriétés, fixées au plan, pour la
   * feuille qui le passe avec le reste.
   */
  balance: number
  /** Le nouveau choix entier : la moitié touchée, l'autre gardée. */
  onChange: (value: Decoration) => void
}

/** La pastille : un hexagone pointe en haut, à la taille de la planche (48 de large, 54 de haut). */
const SWATCH_WIDTH = 48
const SWATCH_HEIGHT = 54
/** La place d'une pastille, son anneau et sa légende compris (la planche : 72). */
const OPTION_WIDTH = 72
/** L'anneau du choix coché, autour de la pastille. */
const RING_WIDTH = 2.5
const RING_PADDING = 3
/** Le motif de cire, posé à demi transparent, comme sur le rayon (ui/HoneyComb). */
const PATTERN_OPACITY = 0.5

/** L'hexagone de la pastille, dans sa boîte de 48 × 54 (un peu en retrait, pour son trait). */
const HEXAGON = (() => {
  const inset = 1
  const w = SWATCH_WIDTH
  const h = SWATCH_HEIGHT
  const points = [
    [w / 2, inset],
    [w - inset, h / 4],
    [w - inset, (3 * h) / 4],
    [w / 2, h - inset],
    [inset, (3 * h) / 4],
    [inset, h / 4],
  ]
  return `M${points.map(([x, y]) => `${x} ${y}`).join(' L')}Z`
})()

/**
 * Le motif d'une pastille, sur toute sa boîte, découpé ensuite à sa forme. Les mêmes mesures que le
 * motif du rayon (`patternPath` de ui/HoneyComb, à la taille de ses alvéoles de 30) : rayures à 45°
 * de 3 tous les 9, grille tous les 8, points tous les 8. Si le dessin du rayon change, celui-ci
 * change avec lui.
 */
function swatchPattern(pattern: DecorationPattern) {
  const w = SWATCH_WIDTH
  const h = SWATCH_HEIGHT
  const parts: string[] = []
  if (pattern === 'striped') {
    for (let x = -h; x < w; x += 9) parts.push(`M${x} ${h}L${x + h} 0`)
  } else if (pattern === 'waffle') {
    for (let x = 4; x < w; x += 8) parts.push(`M${x} 0V${h}`)
    for (let y = 4; y < h; y += 8) parts.push(`M0 ${y}H${w}`)
  } else if (pattern === 'dotted') {
    for (let y = 4; y < h; y += 8) {
      for (let x = 4; x < w; x += 8)
        parts.push(`M${x - 1.5} ${y}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0`)
    }
  }
  return parts.join('')
}

/** La pastille dessinée : la teinte, ses grains de pollen (Lisse) ou son motif de cire. */
function Swatch({ tint, pattern }: { tint: DecorationTint; pattern: DecorationPattern }) {
  const { colors } = useTheme()
  // Un identifiant propre à la pastille pour son `clipPath` (sept pastilles sur la même feuille) ;
  // lettres et chiffres seulement, comme le rayon.
  const clipId = `swatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const tones = combTints[tint]
  const motif = swatchPattern(pattern)
  return (
    <Svg
      width={SWATCH_WIDTH}
      height={SWATCH_HEIGHT}
      viewBox={`0 0 ${SWATCH_WIDTH} ${SWATCH_HEIGHT}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Path d={HEXAGON} fill={colors[tones.fill]} stroke={colors[tones.stroke]} strokeWidth={1.2} />
      {motif === '' ? (
        // Lisse : les trois grains de pollen d'une alvéole pleine, à l'échelle de la pastille.
        <>
          <Circle cx={16} cy={20} r={3.4} fill={colors[tones.grain]} />
          <Circle cx={31} cy={25} r={2.8} fill={colors[tones.grain]} />
          <Circle cx={22} cy={36} r={3.1} fill={colors[tones.grain]} />
        </>
      ) : (
        <>
          <Defs>
            <ClipPath id={clipId}>
              <Path d={HEXAGON} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${clipId})`}>
            <Path
              d={motif}
              fill={pattern === 'dotted' ? colors.wax : 'none'}
              stroke={pattern === 'dotted' ? 'none' : colors.wax}
              strokeWidth={pattern === 'striped' ? 3 : 1}
              opacity={PATTERN_OPACITY}
            />
          </G>
        </>
      )}
    </Svg>
  )
}

type KeyEvent = { key: string; preventDefault: () => void }

type Option<T extends string> = {
  value: T
  name: string
  /** Déjà à soi : « À toi » ; sinon son prix en miel. */
  owned: boolean
  price: number
  /** Ce que la pastille montre : sa teinte et son motif. */
  tint: DecorationTint
  pattern: DecorationPattern
}

/**
 * Une rangée de pastilles à cocher (la teinte, ou le motif) : sa question, puis le groupe radio. Le
 * parcours au clavier est celui de `Choices`.
 */
function SwatchGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const baseId = useId()
  // Les pastilles, pour y poser le focus quand une flèche passe à la voisine.
  const refs = useRef<(View | null)[]>([])
  // Le seul arrêt de Tab : le choix coché (le premier s'il n'est pas proposé).
  const checkedIndex = options.findIndex((option) => option.value === value)
  const tabStop = checkedIndex === -1 ? 0 : checkedIndex

  // Sur le web seulement : les flèches cochent la voisine et lui donnent le focus (en faisant le
  // tour) ; la barre d'espace coche (react-native-web ne la fait réagir que sur les boutons).
  const keys = (index: number, option: Option<T>) => {
    if (Platform.OS !== 'web') return null
    const spaceBar = spaceToggles(() => onChange(option.value)) as {
      onKeyDown?: (event: KeyEvent) => void
    }
    return {
      tabIndex: index === tabStop ? (0 as const) : (-1 as const),
      onKeyDown: (event: KeyEvent) => {
        const step =
          event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              ? -1
              : 0
        if (step === 0) {
          spaceBar.onKeyDown?.(event)
          return
        }
        // preventDefault : la flèche ne fait pas défiler la page.
        event.preventDefault()
        const next = (index + step + options.length) % options.length
        const neighbour = options[next]
        if (neighbour) onChange(neighbour.value)
        refs.current[next]?.focus()
      },
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" weight={600} tone="muted">
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {options.map((option, index) => {
          const checked = option.value === value
          const status = option.owned
            ? t(($) => $.game.decoration.owned)
            : t(($) => $.game.decoration.price, { amount: option.price })
          // Le texte de « À toi » ou du prix, qui décrit la pastille (web).
          const statusId = `${baseId}-${option.value}`
          return (
            <Pressable
              key={option.value}
              ref={(node) => {
                refs.current[index] = node
              }}
              accessibilityRole="radio"
              accessibilityLabel={option.name}
              {...describedBy(Platform.OS === 'web' ? statusId : undefined)}
              accessibilityHint={Platform.OS === 'web' ? undefined : status}
              aria-checked={checked}
              onPress={() => onChange(option.value)}
              {...keys(index, option)}
              style={({ pressed }) => ({
                width: OPTION_WIDTH,
                alignItems: 'center',
                gap: space.xxs,
                paddingVertical: space.xxs,
                borderRadius: radii.tile,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {/* L'anneau : ambre autour du choix coché, transparent sinon (la place est gardée,
                  rien ne bouge quand la coche passe). */}
              <View
                style={{
                  padding: RING_PADDING,
                  // L'arrondi de la planche (14) : celui d'un petit bloc.
                  borderRadius: radii.code,
                  borderWidth: RING_WIDTH,
                  borderColor: checked ? colors.amber : 'transparent',
                }}
              >
                <Swatch tint={option.tint} pattern={option.pattern} />
              </View>
              <Text variant="caption" weight={600} align="center">
                {option.name}
              </Text>
              <View
                nativeID={statusId}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.xxs }}
              >
                {option.owned ? <Icon name="check" size={12} tone="success" /> : null}
                <Text
                  variant="caption"
                  weight={600}
                  tone={option.owned ? 'success' : 'muted'}
                  align="center"
                >
                  {status}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export function DecorationPicker({ tints, patterns, owned, value, onChange }: Props) {
  const { t } = useTranslation()
  const tintOptions: Option<DecorationTint>[] = tints.map((tint) => ({
    value: tint,
    name: t(($) => $.game.decoration.tints[tint]),
    owned: owned.tints.includes(tint),
    price: DECORATIONS.tint[tint],
    tint,
    pattern: 'smooth',
  }))
  // La pastille d'un motif le pose sur la teinte cochée : on voit le rayon qu'on obtiendra.
  const patternOptions: Option<DecorationPattern>[] = patterns.map((pattern) => ({
    value: pattern,
    name: t(($) => $.game.decoration.patterns[pattern]),
    owned: owned.patterns.includes(pattern),
    price: DECORATIONS.pattern[pattern],
    tint: value.tint,
    pattern,
  }))

  return (
    <View style={{ gap: space.lg }}>
      <SwatchGroup
        label={t(($) => $.game.decoration.tint)}
        options={tintOptions}
        value={value.tint}
        onChange={(tint) => onChange({ ...value, tint })}
      />
      <SwatchGroup
        label={t(($) => $.game.decoration.pattern)}
        options={patternOptions}
        value={value.pattern}
        onChange={(pattern) => onChange({ ...value, pattern })}
      />
    </View>
  )
}
