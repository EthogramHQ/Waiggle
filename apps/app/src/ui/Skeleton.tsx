// Les squelettes (Miel 2, tranche R1) : des formes pleines à la place d'un contenu en cours de
// chargement (le fil, une page), plutôt que le mot « Chargement… » seul. Elles annoncent la forme de
// ce qui arrive : la page ne saute pas quand le contenu les remplace.
// - SkeletonCard : une carte, un grand bloc et deux lignes (à 80 % et 55 % de la largeur).
// - SkeletonList : plusieurs cartes l'une sous l'autre.
// - `shape="feed"` (R4) : la forme d'une carte du fil, de sa hauteur, avec son panneau en bas ;
//   R15, rangées dans les colonnes de la grille du fil (`ProjectGrid`).
// - `shape="compact"` (R14) : la forme d'une petite carte de la mosaïque d'un membre, de sa hauteur.
// Les formes « respirent » (leur opacité monte et descend doucement) pour dire que ça avance. Avec
// « Réduire les animations », elles restent immobiles : une animation sans fin à côté du contenu
// s'arrête à la demande (WCAG 2.2.2).
// Pour un lecteur d'écran, les formes ne disent rien : l'ensemble est nommé « Chargement… » et
// marqué occupé, une seule fois, même pour une liste de plusieurs cartes.
import { durations, layout, radii, space } from '@ruche/brand'
import { type ReactNode, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { PROJECT_CARD_COMPACT_HEIGHT, PROJECT_CARD_HEIGHT } from './ProjectCard'
import { GridCardsContext, useGridColumns } from './ProjectGrid'
import { useLayout } from './theme/layout'
import { useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur du grand bloc d'une carte, puis celle d'une ligne, en points. */
const BLOCK = 90
const LINE = 14
/**
 * Les formes de la carte du fil : la photo de l'auteur (28, comme dans la carte), une ligne de titre,
 * la pastille « Tester » (la hauteur d'un contrôle compact, et sa largeur à peu près).
 */
const AVATAR = 28
const TITLE = 22
const PILL = layout.controlHeight.compact
const PILL_WIDTH = 96
/** Le creux de la respiration : les formes descendent à cette opacité, puis remontent. */
const LOW = 0.55
/** La durée d'une demi-respiration : un dixième de celle de la lumière d'ambiance (2 s). */
const BREATH = durations.breath / 10

/**
 * Hook : l'opacité qui respire, partagée par toutes les formes d'un squelette (elles battent
 * ensemble). withRepeat(…, -1, true) rejoue le fondu sans fin, aller puis retour.
 */
const useBreath = () => {
  const calm = useCalmMotion()
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (calm) {
      cancelAnimation(opacity)
      opacity.value = 1
      return
    }
    opacity.value = withRepeat(withTiming(LOW, { duration: BREATH }), -1, true)
    return () => cancelAnimation(opacity)
  }, [calm, opacity])
  return useAnimatedStyle(() => ({ opacity: opacity.value }))
}

/**
 * Une forme pleine, de cette hauteur et de cette largeur (en part de la carte). Sa couleur, le rôle
 * `skeleton`, se voit à 1,5:1 au moins sur la page, sur une carte et (de jour) sur la lumière miel :
 * l'ancien fond groupé ne faisait que 1,1:1 et disparaissait, de nuit surtout.
 */
export function Shape({
  height,
  width,
  round = false,
}: {
  height: number
  width: `${number}%` | number
  /** Un rond (la photo de l'auteur) ou une pastille, plutôt qu'un bloc aux coins doux. */
  round?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height,
        width,
        borderRadius: round ? radii.pill : radii.small,
        backgroundColor: colors.skeleton,
      }}
    />
  )
}

/**
 * Les formes d'une carte du fil (R4) : un bloc de la hauteur d'une `ProjectCard` et, en bas, un
 * panneau plein à la place du verre, avec les rangées de la carte (l'auteur, le titre, l'accroche,
 * « Tester » et le statut). Quand les cartes arrivent, rien ne saute.
 */
function FeedCardShapes() {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: PROJECT_CARD_HEIGHT,
        justifyContent: 'flex-end',
        padding: space.sm,
        borderRadius: radii.sheet,
        backgroundColor: colors.skeleton,
      }}
    >
      {/* Le verre, plein : la matière d'une feuille, sans flou (rien derrière à flouter). */}
      <View
        style={{
          gap: space.md,
          padding: space.lg,
          borderRadius: radii.panel,
          backgroundColor: colors.sheet,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Shape height={AVATAR} width={AVATAR} round />
          <Shape height={LINE} width="40%" />
        </View>
        <Shape height={TITLE} width="70%" />
        <Shape height={LINE} width="90%" />
        <Shape height={LINE} width="60%" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Shape height={PILL} width={PILL_WIDTH} round />
          <Shape height={LINE * 2} width={PILL_WIDTH} round />
        </View>
      </View>
    </View>
  )
}

/**
 * R14 : les formes d'une carte compacte (la mosaïque d'un membre) : un bloc de la hauteur d'une
 * `ProjectCard size="compact"` (lue sur la carte, jamais recopiée) et, en bas, son verre plus serré
 * avec ce qu'elle montre : le titre, puis le statut et les réactions.
 */
function CompactCardShapes() {
  const { colors } = useTheme()
  return (
    <View
      style={{
        height: PROJECT_CARD_COMPACT_HEIGHT,
        justifyContent: 'flex-end',
        padding: space.sm,
        borderRadius: radii.sheet,
        backgroundColor: colors.skeleton,
      }}
    >
      <View
        style={{
          gap: space.sm,
          padding: space.md,
          borderRadius: radii.panel,
          backgroundColor: colors.sheet,
        }}
      >
        <Shape height={TITLE} width="80%" />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Shape height={LINE * 2} width="45%" round />
          <Shape height={LINE * 2} width="25%" round />
        </View>
      </View>
    </View>
  )
}

/** Les formes d'une carte, sans nom : la carte nommée ou la liste les enveloppe. */
function CardShapes() {
  return (
    <View style={{ gap: space.sm }}>
      <Shape height={BLOCK} width="100%" />
      <Shape height={LINE} width="80%" />
      <Shape height={LINE} width="55%" />
    </View>
  )
}

/**
 * Le cadre qui nomme et marque occupé : « Chargement… », dans la langue de l'appli. Le rôle
 * « progressbar » (sans valeur : une attente dont on ne connaît pas la fin) fait lire ce nom sur le
 * web, où un bloc sans rôle serait ignoré. Occupé : `aria-busy` sur le web (react-native-web ignore
 * accessibilityState), l'état « busy » sur téléphone.
 */
export function Loading({
  children,
}: {
  children: ReactNode /** R16 : montré tout de suite (pré-rendu). */
  shown?: boolean
}) {
  const { t } = useTranslation()
  const breath = useBreath()
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t(($) => $.common.loading)}
      {...(Platform.OS === 'web' ? { 'aria-busy': true } : { accessibilityState: { busy: true } })}
      style={[{ gap: space.xxl }, breath]}
    >
      {children}
    </Animated.View>
  )
}

/**
 * La forme des cartes : `card`, la carte simple (un bloc et deux lignes) ; `feed`, la carte du fil
 * (R4), de sa hauteur, avec son panneau ; `compact`, la petite carte de la mosaïque d'un membre (R14).
 */
type SkeletonShape = 'card' | 'feed' | 'compact'

const shapes = { card: CardShapes, feed: FeedCardShapes, compact: CompactCardShapes } as const

export function SkeletonCard({ shape = 'card' }: { shape?: SkeletonShape }) {
  const Shapes = shapes[shape]
  return (
    <Loading>
      <Shapes />
    </Loading>
  )
}

export function SkeletonList({
  count = 3,
  shape = 'card',
}: {
  count?: number
  shape?: SkeletonShape
}) {
  const Shapes = shapes[shape]
  return (
    <Loading>
      {shape === 'feed' ? (
        <FeedGridShapes count={count} />
      ) : (
        Array.from({ length: count }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: des formes identiques, jamais réordonnées.
          <Shapes key={index} />
        ))
      )}
    </Loading>
  )
}

/**
 * Les cartes du fil qui chargent, rangées comme les cartes qui arrivent (relecture de design de
 * R15) : dans les colonnes de `ProjectGrid`, au même écart, une rangée après l'autre. Avant, une
 * seule carte de 1 364 points de large à 1 920, puis le Fil en trois colonnes : tout sautait. Sous
 * une grille de compactes (« Récents » d'Explorer, sur ordinateur), la forme d'une compacte, comme
 * la carte (`ProjectCard`). La dernière rangée se complète de cases vides, comme dans la grille.
 */
function FeedGridShapes({ count }: { count: number }) {
  const { columns, probe } = useGridColumns()
  const compactCards = useContext(GridCardsContext) === 'compact'
  const wide = useLayout().sizeClass === 'wide'
  const Shapes = compactCards && wide ? CompactCardShapes : FeedCardShapes
  const rows = Math.ceil(count / columns)
  return (
    <View style={{ gap: space.lg }}>
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des rangées identiques, jamais réordonnées.
        <View key={row} style={{ flexDirection: 'row', gap: space.lg }}>
          {Array.from({ length: columns }, (_, column) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: une case est une place dans la rangée.
            <View key={column} style={{ flex: 1 }}>
              {row * columns + column < count ? <Shapes /> : null}
            </View>
          ))}
        </View>
      ))}
      {probe}
    </View>
  )
}

// R16, socle : pièce vide, écrite par la tranche (plan R16).
/** La carte vide : la matière d'une carte sans photo (crème de jour, surface de nuit). */
export function SkeletonSurface(_props: { children?: ReactNode; height?: number }): ReactNode {
  return null
}

// R16, socle : pièce vide, écrite par la tranche (plan R16).
/** La lueur miel qui traverse une carte vide ; `column` décale son passage d'une colonne à l'autre. */
export function SkeletonGlow(_props: { column?: number }): ReactNode {
  return null
}
