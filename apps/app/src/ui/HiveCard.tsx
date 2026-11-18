// La carte d'une ruche (tranche R16, « Ruches, Recherche et Outils en grand » ; planches
// R16-Ruches-1920 et 1440) : sur un grand écran, l'onglet Ruches range ses ruches en cartes, sur
// plusieurs colonnes (`CardGrid`), au lieu d'une colonne de lignes. La carte dit la même chose que
// la ligne d'aujourd'hui (`HiveRow`), rangée autrement :
// - en haut, l'alvéole, le nom de la ruche et « 4 membres · animée par Papi Jean » ;
// - en bas, la pile des visages à gauche, et à droite les nouveautés : « 2 nouveautés » en miel,
//   ou « rien de neuf » en gris. Le bas reste en bas : les cartes d'une rangée ont la même hauteur
//   (celle de la plus haute, un nom sur deux lignes), et leurs nouveautés s'alignent.
//
// Toute la carte est un seul lien vers la page de la ruche, nommé comme la ligne (« Famille,
// 4 membres, animée par Papi Jean, 2 nouveautés ») : l'alvéole et les visages sont cachés à
// l'oreille, le nom du lien dit déjà tout. Les textes viennent de `useHiveText` (HiveRow.tsx).
//
// `HiveCardSkeleton` : la carte vide, aux mêmes marges, pendant le chargement de l'onglet (planche
// R16-Ruches-Squelette-1920). Sans rôle ni nom : le `Loading` autour dit « Chargement… ».
import { borders, layout, radii, type Space, space } from '@ruche/brand'
import type { HiveSummary } from '@ruche/contracts'
import { useContext } from 'react'
import { View, type ViewStyle } from 'react-native'
import { AvatarStack } from './AvatarStack'
import { Hexagon, HiveBadge } from './HiveBadge'
import { useHiveText } from './HiveRow'
import type { ImageSource } from './image'
import { TextLineShape } from './ListGroup'
import { Pressed } from './Pressed'
import { GridColumnContext } from './ProjectGrid'
import { Shape, SkeletonSurface } from './Skeleton'
import { STATUS_PILL_HEIGHT, StatusPill } from './StatusPill'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/**
 * La grille des cartes de ruche (planches R16-Ruches) : des cartes de 400 points au moins, à 24
 * points l'une de l'autre, soit 4 colonnes de 414 à 1 920 et 3 de 443 à 1 440. Donnée telle quelle
 * à `CardGrid` par l'écran (`<CardGrid {...hiveCardGrid}>`), qui n'écrit ainsi aucune taille ; les
 * invitations de l'onglet prennent les mêmes colonnes.
 */
export const hiveCardGrid = { minWidth: 400, gap: 'xxl' } as const satisfies {
  minWidth: number
  gap: Space
}

type Props = {
  hive: HiveSummary
  /** Ouvre la page de la ruche (l'écran choisit l'adresse). */
  onPress: () => void
  /**
   * Fait d'une adresse de photo une source d'image (`useMediaSources()`, donné par l'écran). Absente,
   * ou null pour une photo : les initiales du membre, dans la pile.
   */
  toSource?: (url: string | null | undefined) => ImageSource | null
}

/** Cache une vue et ce qu'elle contient aux lecteurs d'écran : web, iOS et Android. */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
}

/** L'alvéole de la carte : la taille de celle de la ligne (`layout.hive.regular`, 44 points). */
const BADGE = layout.hive.regular

/** L'intérieur de la carte, partagé avec la carte vide : ses marges et l'écart entre haut et bas. */
const inner: ViewStyle = { flexGrow: 1, padding: space.lg, gap: space.lg }
/** Le haut : l'alvéole, puis le nom et sa précision. */
const top: ViewStyle = { flexDirection: 'row', alignItems: 'flex-start', gap: space.md }
/** Le texte du haut : il prend la place qui reste (jamais `flex: 1`, une base nulle sur le web). */
const topText: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: space.xxs }
/**
 * Le bas : les visages et les nouveautés, poussés au bas de la carte (`marginTop: 'auto'`) ; s'ils
 * ne tiennent pas côte à côte (texte agrandi), les nouveautés passent dessous.
 */
const bottom: ViewStyle = {
  marginTop: 'auto',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space.sm,
  // La hauteur de la pastille des nouveautés, même sans pastille (« rien de neuf », ou sans
  // visages) : toutes les cartes ont le même bas.
  minHeight: STATUS_PILL_HEIGHT,
}

export function HiveCard({ hive, onPress, toSource }: Props) {
  const { colors, shadows } = useTheme()
  const { name, news, label, detail } = useHiveText(hive)
  return (
    // `fill` : la carte prend la hauteur de sa case, celle de la plus haute de la rangée.
    <Pressed label={label} onPress={onPress} role="link" fill>
      <View
        style={{
          flexGrow: 1,
          backgroundColor: colors.surface,
          borderWidth: borders.hairline,
          borderColor: colors.surfaceBorder,
          // Le rayon d'un groupe blanc ; l'anneau du focus du clavier le suit (Pressed le lit ici).
          borderRadius: radii.group,
          boxShadow: shadows.soft,
        }}
      >
        <View style={inner}>
          <View style={top}>
            <View {...hiddenFromReaders} style={{ flexShrink: 0 }}>
              <HiveBadge icon={hive.icon} name={hive.name} size={BADGE} />
            </View>
            <View style={topText}>
              {/* En entier, sur deux lignes s'il le faut : un nom ne se coupe jamais par « … ». */}
              <Text variant="headline" weight={700} breakAnywhere>
                {name}
              </Text>
              <Text variant="caption" tone="secondary" breakAnywhere>
                {detail}
              </Text>
            </View>
          </View>
          <View style={bottom}>
            {hive.faces.length > 0 ? (
              // Sans nom : un décor, caché tout entier (le nom du lien compte les membres).
              <AvatarStack
                members={hive.faces.map((face) => ({
                  name: face.name,
                  source: toSource ? toSource(face.avatarUrl) : null,
                }))}
                max={hive.faces.length}
              />
            ) : (
              <View />
            )}
            {hive.news > 0 ? (
              <StatusPill label={news} strong />
            ) : (
              <Text variant="caption" tone="muted">
                {news}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Pressed>
  )
}

/** Les largeurs des pièces vides : le nom, la précision, les visages, la pastille. */
const EMPTY = {
  name: '55%',
  detail: '80%',
  faces: 72,
  // La hauteur de la pile des visages (`AvatarStack`, taille regular).
  facesHeight: 28,
  news: 88,
} as const

/**
 * La carte vide d'une ruche (planche R16-Ruches-Squelette-1920) : la matière d'une carte vide
 * (`SkeletonSurface`, sa lueur comprise), l'alvéole vide, deux lignes, puis en bas la pile des
 * visages et la pastille des nouveautés, aux marges de la vraie carte. Son rang dans la rangée vient
 * de la grille (`GridColumnContext`) : sa lueur passe après celle de sa voisine de gauche.
 */
export function HiveCardSkeleton() {
  const { colors } = useTheme()
  const column = useContext(GridColumnContext)
  return (
    <SkeletonSurface radius="group" column={column}>
      <View style={inner}>
        <View style={top}>
          <View style={{ flexShrink: 0 }}>
            <Hexagon size={BADGE} fill={colors.skeleton} />
          </View>
          <View style={topText}>
            <TextLineShape variant="headline" width={EMPTY.name} />
            <TextLineShape variant="caption" width={EMPTY.detail} />
          </View>
        </View>
        <View style={bottom}>
          <Shape height={EMPTY.facesHeight} width={EMPTY.faces} round />
          <Shape height={STATUS_PILL_HEIGHT} width={EMPTY.news} round />
        </View>
      </View>
    </SkeletonSurface>
  )
}
