// Les squelettes (Miel 2, tranche R1 ; refaits en R16, « Les squelettes ») : des formes pleines à la
// place d'un contenu en cours de chargement, plutôt que le mot « Chargement… » seul. Elles annoncent
// la forme de ce qui arrive : la page ne saute pas quand le contenu les remplace.
//
// Les pièces de base, que les cartes vides de chaque composant assemblent (`ProjectCardSkeleton`
// dans ProjectCard.tsx, la ligne vide d'une liste dans ListGroup.tsx…) :
// - `Shape` : une forme pleine (bloc, ligne, rond, pastille), d'un brun miel transparent ;
// - `SkeletonSurface` : la carte vide, dans la matière d'une carte sans photo (crème de jour, la
//   feuille de nuit), coins et bord compris, avec sa lueur ;
// - `SkeletonGlow` : la lueur miel qui traverse lentement une carte vide (planche R16-Lueur) ;
// - `Loading` : le seul élément lu d'une zone qui charge, « Chargement… », occupé ; il enveloppe les
//   pièces (qui n'ont ni rôle ni nom), une fois pour toute la zone ;
// - `SkeletonRows` : des rangées vides (une liste, une feuille qui charge).
// Et les formes toutes faites d'avant, gardées pour les écrans qui ne changent pas : `SkeletonCard`,
// `SkeletonList` (`card`, `feed` : la carte du fil rangée dans les colonnes du Fil, `compact` : la
// petite carte de la mosaïque d'un membre).
//
// Quand on le voit (R16) : une page qui arrive en moins de 160 ms ne montre aucun squelette. `Loading`
// pose sa place tout de suite, mais reste invisible et caché aux lecteurs d'écran pendant ce délai,
// puis se montre en fondu. La page web pré-rendue, elle, ne peut rien attendre : son squelette se
// montre tout de suite, et reste là quand l'appli démarre.
import { borders, durations, layout, type Palette, type Radius, radii, space } from '@ruche/brand'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { PROJECT_CARD_COMPACT_HEIGHT, PROJECT_CARD_HEIGHT } from './ProjectCard'
import { GridCardsContext, useGridColumns } from './ProjectGrid'
import { skeletonGlowMark } from './theme/document'
import { useHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { fade, useCalmMotion } from './theme/motion'
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
/** La photo d'une rangée vide (celle d'une ligne de liste) et la hauteur de la rangée. */
const ROW_AVATAR = 40
const ROW_HEIGHT = 64

// ---------------------------------------------------------------------------------------------
// La lueur (planche R16-Lueur ; plan, choix 6)
// ---------------------------------------------------------------------------------------------

/** La bande de lumière fait 60 % de la largeur de la carte. */
const GLOW_SHARE = 0.6
/**
 * La courbe du passage, celle de la planche : lente au départ et à l'arrivée, sans rebond. Elle ne
 * sert qu'à la lueur, d'où sa place ici plutôt que parmi les courbes de la marque.
 */
const GLOW_CURVE = [0.45, 0, 0.55, 1] as const
/** Un cycle : le passage (1,8 s), puis le repos (1,2 s). */
const GLOW_CYCLE = durations.skeletonGlow + durations.skeletonPause
/** La part du cycle où la bande traverse (60 %) ; le reste, elle attend hors de la carte. */
const GLOW_PASS = `${Math.round((100 * durations.skeletonGlow) / GLOW_CYCLE)}%`
/**
 * Où va la bande, en part de sa propre largeur (`translateX` en % se mesure sur l'élément) : elle
 * part hors de la carte à gauche (-100 %) et en sort à droite (100 / 60 = 167 % de sa largeur).
 */
const GLOW_START = 'translateX(-100%)'
const GLOW_END = `translateX(${Math.round(100 / GLOW_SHARE)}%)`

/**
 * La même couleur, rendue transparente : les bords du dégradé. `transparent` tout court est un noir
 * transparent, qui grisait le milieu du fondu sur certains navigateurs ; les rôles `skeletonGlow`
 * sont écrits en `rgba(…)`, dont on remplace la dernière valeur.
 */
const clear = (color: string) => color.replace(/,\s*[\d.]+\)$/, ', 0)')

/** Le dégradé de la bande : transparent, le miel de la lueur au cœur, puis transparent. */
const glowGradient = (colors: Palette) =>
  `linear-gradient(90deg, ${clear(colors.skeletonGlow)} 0%, ${colors.skeletonGlow} 50%, ${clear(
    colors.skeletonGlow,
  )} 100%)`

/**
 * La bande sur le web : une animation CSS, écrite par react-native-web. Les images clés vivent dans
 * une feuille créée une fois, au niveau du module (react-native-web en fait une classe et une règle
 * `@keyframes`), et ne portent que `transform` : le navigateur déplace la bande sans redessiner la
 * page. La couleur (le dégradé) et le retard de la colonne restent posés sur l'élément.
 * Sous « Réduire les animations », la feuille de la page (`documentCss`, theme/document.ts) l'arrête
 * avant même que l'appli démarre ; la bande reste alors à sa place de repos, hors de la carte : le
 * squelette est immobile, sans lueur, comme sur la planche.
 * `StyleSheet.create` ne connaît pas ces propriétés propres au web : d'où le passage par `unknown`.
 */
const webGlow = StyleSheet.create({
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: `${GLOW_SHARE * 100}%`,
    pointerEvents: 'none',
    transform: GLOW_START,
    animationKeyframes: [
      {
        '0%': { transform: GLOW_START },
        [GLOW_PASS]: { transform: GLOW_END },
        '100%': { transform: GLOW_END },
      },
    ],
    animationDuration: `${GLOW_CYCLE}ms`,
    animationTimingFunction: `cubic-bezier(${GLOW_CURVE.join(', ')})`,
    animationIterationCount: 'infinite',
  } as unknown as ViewStyle,
})

/**
 * La lueur sur le web. Son premier rendu ne lit pas `useCalmMotion` : la page pré-rendue est la même
 * pour tous, et c'est la feuille de la page qui arrête l'animation (relecture du plan, C1).
 */
function WebGlow({ column }: { column: number }) {
  const { colors } = useTheme()
  return (
    <View
      {...skeletonGlowMark}
      style={[
        webGlow.band,
        {
          animationDelay: `${column * durations.skeletonStagger}ms`,
          backgroundImage: glowGradient(colors),
        } as unknown as ViewStyle,
      ]}
    />
  )
}

/**
 * La lueur sur téléphone : une seule vue animée par Reanimated (sur le fil des animations), son
 * dégradé dessiné par `experimental_backgroundImage`, comme le voile de ScreenTopBar. Elle avance
 * de 0 à 1 (`progress`) ; sa position en points se calcule sur la largeur de la carte, mesurée par
 * le cadre qui la porte. Sous « Réduire les animations », aucune boucle : elle reste à sa place de
 * repos, hors de la carte (le squelette est immobile, WCAG 2.2.2).
 */
function NativeGlow({ column }: { column: number }) {
  const { colors } = useTheme()
  const calm = useCalmMotion()
  const progress = useSharedValue(0)
  const width = useSharedValue(0)
  useEffect(() => {
    if (calm) {
      cancelAnimation(progress)
      progress.value = 0
      return
    }
    // withSequence : le passage, puis un repos sur place ; withRepeat(…, -1) le rejoue sans fin, en
    // repartant du début (sans aller-retour) ; withDelay décale chaque colonne de 150 ms.
    progress.value = withDelay(
      column * durations.skeletonStagger,
      withRepeat(
        withSequence(
          withTiming(1, { duration: durations.skeletonGlow, easing: Easing.bezier(...GLOW_CURVE) }),
          withTiming(1, { duration: durations.skeletonPause }),
        ),
        -1,
        false,
      ),
    )
    return () => cancelAnimation(progress)
  }, [calm, column, progress])
  // De -60 % de la carte (la bande juste à gauche) à 100 % (juste à droite).
  const band = useAnimatedStyle(() => ({
    transform: [{ translateX: (-GLOW_SHARE + progress.value * (1 + GLOW_SHARE)) * width.value }],
  }))
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${GLOW_SHARE * 100}%`,
            experimental_backgroundImage: glowGradient(colors),
          },
          band,
        ]}
      />
    </View>
  )
}

/**
 * La lueur miel qui traverse une carte vide, toutes les 3 secondes ; `column` (le rang de la carte
 * dans sa rangée, 0 pour la première) la fait passer 150 ms plus tard d'une colonne à la suivante,
 * pour qu'elle traverse la page. Posée par `SkeletonSurface`, dans une carte qui la rogne. Une
 * décoration : rien à lire, rien à toucher.
 */
export function SkeletonGlow({ column = 0 }: { column?: number }): ReactNode {
  return Platform.OS === 'web' ? <WebGlow column={column} /> : <NativeGlow column={column} />
}

// ---------------------------------------------------------------------------------------------
// Les pièces
// ---------------------------------------------------------------------------------------------

/**
 * Une forme pleine, de cette hauteur et de cette largeur (en part de la carte). Sa couleur, le rôle
 * `skeleton` (un brun miel transparent de jour, le miel de nuit), se voit à 1,5:1 au moins sur la
 * page, sur une carte et sur une carte vide, sans virer au kaki sur la lumière miel.
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
 * La carte vide : la matière d'une carte réelle sans photo (le rôle `skeletonCard`, crème de jour,
 * la feuille de nuit), avec ses coins, son bord et son ombre, et la lueur qui la traverse. Pas une
 * dalle grise. Ses enfants (des `Shape`) se posent dedans ; la lueur passe par-dessus, rognée par la
 * carte.
 */
export function SkeletonSurface({
  children,
  height,
  column = 0,
  radius = 'sheet',
}: {
  children?: ReactNode
  /** La hauteur de ce qu'elle imite (lue sur le composant, jamais recopiée) ; sinon, son contenu. */
  height?: number
  /** Le rang de la carte dans sa rangée : le retard de sa lueur. */
  column?: number
  /** Les coins de ce qu'elle imite : ceux d'une carte du fil par défaut. */
  radius?: Radius
}): ReactNode {
  const { colors, shadows } = useTheme()
  return (
    // Deux cadres : l'ombre se dessine autour du premier ; le second rogne la lueur à ses coins.
    <View
      style={{
        ...(height !== undefined ? { height } : null),
        borderRadius: radii[radius],
        borderWidth: borders.hairline,
        borderColor: colors.surfaceBorder,
        backgroundColor: colors.skeletonCard,
        boxShadow: shadows.card,
      }}
    >
      <View style={{ flexGrow: 1, overflow: 'hidden', borderRadius: radii[radius] }}>
        {children}
        <SkeletonGlow column={column} />
      </View>
    </View>
  )
}

/**
 * Le contexte du fondu (`Reveal`) : `Loading` lui dit quand le squelette s'est montré. Un contenu
 * arrivé avant ne fond pas (rien n'a été vu). Hors d'un `Reveal`, personne n'écoute.
 */
export const LoadingShownContext = createContext<(() => void) | null>(null)

/** Caché aux lecteurs d'écran, sur le web (`aria-hidden`) comme sur iOS et Android. */
const hiddenFromReaders = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const

/**
 * Le cadre qui nomme et marque occupé une zone qui charge : « Chargement… », dans la langue de
 * l'appli, une seule fois pour toutes les pièces qu'il enveloppe. Le rôle « progressbar » (sans
 * valeur : une attente dont on ne connaît pas la fin) fait lire ce nom sur le web, où un bloc sans
 * rôle serait ignoré. Occupé : `aria-busy` sur le web (react-native-web ignore accessibilityState),
 * l'état « busy » sur téléphone.
 *
 * Il pose sa place tout de suite (la page ne saute pas), mais reste invisible et caché aux lecteurs
 * d'écran pendant 160 ms (`durations.quick`) : une page qui arrive plus vite ne montre aucun
 * squelette. Puis il se montre en fondu (180 ms). « Tout de suite » se décide au montage : dans la
 * page web pré-rendue (avant que l'appli démarre), il est déjà montré, et le reste.
 */
export function Loading({
  children,
  shown = false,
}: {
  children: ReactNode
  /** Montré tout de suite, sans attendre les 160 ms. */
  shown?: boolean
}) {
  const { t } = useTranslation()
  const hydrated = useHydrated()
  // useState(() => …) : calculé une seule fois, au montage. L'hydratation qui suit ne change rien.
  const [atOnce] = useState(() => shown || !hydrated)
  const [visible, setVisible] = useState(atOnce)
  const opacity = useSharedValue(atOnce ? 1 : 0)
  const onShown = useContext(LoadingShownContext)
  useEffect(() => {
    if (visible) return
    const timer = setTimeout(() => {
      setVisible(true)
      opacity.value = fade(1, 'page')
    }, durations.quick)
    return () => clearTimeout(timer)
  }, [visible, opacity])
  useEffect(() => {
    if (visible) onShown?.()
  }, [visible, onShown])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t(($) => $.common.loading)}
      {...(Platform.OS === 'web' ? { 'aria-busy': true } : { accessibilityState: { busy: true } })}
      {...(visible ? null : hiddenFromReaders)}
      style={[{ gap: space.xxl }, style]}
    >
      {children}
    </Animated.View>
  )
}

// ---------------------------------------------------------------------------------------------
// Les formes toutes faites
// ---------------------------------------------------------------------------------------------

/**
 * Les formes d'une carte du fil (R4) : une carte vide de la hauteur d'une `ProjectCard` et, en bas,
 * un panneau plein à la place du verre, avec les rangées de la carte (l'auteur, le titre,
 * l'accroche, « Tester » et le statut). Quand les cartes arrivent, rien ne saute.
 */
function FeedCardShapes({ column = 0 }: { column?: number }) {
  const { colors } = useTheme()
  return (
    <SkeletonSurface height={PROJECT_CARD_HEIGHT} column={column}>
      <View style={{ flexGrow: 1, justifyContent: 'flex-end', padding: space.sm }}>
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
    </SkeletonSurface>
  )
}

/**
 * R14 : les formes d'une carte compacte (la mosaïque d'un membre) : une carte vide de la hauteur
 * d'une `ProjectCard size="compact"` (lue sur la carte, jamais recopiée) et, en bas, son verre plus
 * serré avec ce qu'elle montre : le titre, puis le statut et les réactions.
 */
function CompactCardShapes({ column = 0 }: { column?: number }) {
  const { colors } = useTheme()
  return (
    <SkeletonSurface height={PROJECT_CARD_COMPACT_HEIGHT} column={column}>
      <View style={{ flexGrow: 1, justifyContent: 'flex-end', padding: space.sm }}>
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
    </SkeletonSurface>
  )
}

/** Les formes d'une carte simple (un bloc et deux lignes), dans une carte vide de coins de tuile. */
function CardShapes({ column = 0 }: { column?: number }) {
  return (
    <SkeletonSurface radius="tile" column={column}>
      <View style={{ gap: space.sm, padding: space.lg }}>
        <Shape height={BLOCK} width="100%" />
        <Shape height={LINE} width="80%" />
        <Shape height={LINE} width="55%" />
      </View>
    </SkeletonSurface>
  )
}

/**
 * Des rangées vides, celles d'une liste (la photo, puis le nom et une ligne de plus), dans une carte
 * vide aux coins d'un groupe de réglages. Pour une liste ou une feuille qui charge (`StateMessage
 * kind="loading"`, `LoadingScreen shape="list"`), sans `Loading` autour : l'appelant le pose.
 */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  const { colors } = useTheme()
  return (
    <SkeletonSurface radius="group">
      {Array.from({ length: count }, (_, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: des rangées identiques, jamais réordonnées.
          key={index}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            minHeight: ROW_HEIGHT,
            paddingHorizontal: space.lg,
            // Le filet entre deux rangées, comme dans une liste (`ListGroup`).
            ...(index > 0
              ? { borderTopWidth: borders.hairline, borderTopColor: colors.surfaceBorder }
              : null),
          }}
        >
          <Shape height={ROW_AVATAR} width={ROW_AVATAR} round />
          <View style={{ flex: 1, gap: space.sm }}>
            <Shape height={LINE} width={index % 2 === 0 ? '55%' : '40%'} />
            <Shape height={LINE} width={index % 2 === 0 ? '80%' : '70%'} />
          </View>
        </View>
      ))}
    </SkeletonSurface>
  )
}

/**
 * La forme des cartes : `card`, la carte simple (un bloc et deux lignes) ; `feed`, la carte du fil
 * (R4), de sa hauteur, avec son panneau ; `compact`, la petite carte de la mosaïque d'un membre (R14).
 */
export type SkeletonShape = 'card' | 'feed' | 'compact'

const shapes = { card: CardShapes, feed: FeedCardShapes, compact: CompactCardShapes } as const

export function SkeletonCard({ shape = 'card' }: { shape?: SkeletonShape }) {
  const Shapes = shapes[shape]
  return (
    <Loading>
      <Shapes />
    </Loading>
  )
}

/**
 * Plusieurs cartes vides, sans `Loading` autour : la liste de `SkeletonList`, ou une partie d'une
 * page vide plus grande (`LoadingScreen`), qui pose un seul `Loading` pour toute la page.
 */
export function SkeletonCards({
  count = 3,
  shape = 'card',
}: {
  count?: number
  shape?: SkeletonShape
}) {
  if (shape === 'feed') return <FeedGridShapes count={count} />
  const Shapes = shapes[shape]
  return (
    <View style={{ gap: space.xxl }}>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des formes identiques, jamais réordonnées.
        <Shapes key={index} />
      ))}
    </View>
  )
}

export function SkeletonList({
  count = 3,
  shape = 'card',
}: {
  count?: number
  shape?: SkeletonShape
}) {
  return (
    <Loading>
      <SkeletonCards count={count} shape={shape} />
    </Loading>
  )
}

/**
 * R16 : la forme d'une page qui arrive (plan, choix 5 et 11) : le Fil et une grille de cartes (4
 * cartes dans les colonnes du Fil), un membre (son en-tête, puis 4 petites cartes), un projet (la
 * galerie, le titre, l'auteur, la description), une liste (5 rangées), un formulaire (3 champs et
 * le bouton). Sans `Loading` autour : `LoadingScreen` le pose, une fois pour toute la page. Ces
 * formes de base attendent les pièces de chaque composant (`ProjectCardSkeleton`,
 * `MemberHeaderSkeleton`…), que les écrans poseront à leur place.
 */
export type SkeletonPageShape = 'feed' | 'project' | 'member' | 'grid' | 'list' | 'form'

/** Les cartes d'une page vide : comme sur les planches de R16, quatre. */
const PAGE_CARDS = 4
/** La galerie d'un projet, et la photo d'un membre, en points. */
const GALLERY = 320
const MEMBER_AVATAR = 96
/** Les champs d'un formulaire vide. */
const FORM_FIELDS = 3
/** La largeur du bouton d'un formulaire vide. */
const BUTTON_WIDTH = 160

export function SkeletonPage({ shape }: { shape: SkeletonPageShape | SkeletonShape }) {
  switch (shape) {
    case 'feed':
    case 'grid':
      return <FeedGridShapes count={PAGE_CARDS} />
    case 'compact':
      return <FeedGridShapes count={PAGE_CARDS} compact />
    case 'card':
      return <SkeletonCards count={3} />
    case 'list':
      return <SkeletonRows />
    case 'member':
      return (
        <View style={{ gap: space.xxl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <Shape height={MEMBER_AVATAR} width={MEMBER_AVATAR} round />
            <View style={{ flex: 1, gap: space.sm }}>
              <Shape height={TITLE} width="50%" />
              <Shape height={LINE} width="70%" />
            </View>
          </View>
          <FeedGridShapes count={PAGE_CARDS} compact />
        </View>
      )
    case 'project':
      return (
        <View style={{ gap: space.lg }}>
          <SkeletonSurface height={GALLERY} />
          <Shape height={TITLE} width="60%" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Shape height={AVATAR} width={AVATAR} round />
            <Shape height={LINE} width="30%" />
          </View>
          <Shape height={LINE} width="95%" />
          <Shape height={LINE} width="90%" />
          <Shape height={LINE} width="70%" />
        </View>
      )
    case 'form':
      return (
        <View style={{ gap: space.xl }}>
          {Array.from({ length: FORM_FIELDS }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: des champs identiques, jamais réordonnés.
            <View key={index} style={{ gap: space.sm }}>
              <Shape height={LINE} width="30%" />
              <SkeletonSurface radius="group" height={layout.controlHeight.regular} />
            </View>
          ))}
          <Shape height={layout.controlHeight.regular} width={BUTTON_WIDTH} round />
        </View>
      )
  }
}

/**
 * Les cartes du fil qui chargent, rangées comme les cartes qui arrivent (relecture de design de
 * R15) : dans les colonnes de `ProjectGrid`, au même écart, une rangée après l'autre. Avant, une
 * seule carte de 1 364 points de large à 1 920, puis le Fil en trois colonnes : tout sautait. Sous
 * une grille de compactes (« Récents » d'Explorer, sur ordinateur), la forme d'une compacte, comme
 * la carte (`ProjectCard`). La dernière rangée se complète de cases vides, comme dans la grille.
 * R16 : chaque carte passe sa colonne à sa lueur, qui traverse ainsi la rangée.
 */
function FeedGridShapes({ count, compact = false }: { count: number; compact?: boolean }) {
  const { columns, probe } = useGridColumns()
  const compactCards = useContext(GridCardsContext) === 'compact'
  const wide = useLayout().sizeClass === 'wide'
  const Shapes = compact || (compactCards && wide) ? CompactCardShapes : FeedCardShapes
  const rows = Math.ceil(count / columns)
  return (
    <View style={{ gap: space.lg }}>
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des rangées identiques, jamais réordonnées.
        <View key={row} style={{ flexDirection: 'row', gap: space.lg }}>
          {Array.from({ length: columns }, (_, column) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: une case est une place dans la rangée.
            <View key={column} style={{ flex: 1 }}>
              {row * columns + column < count ? <Shapes column={column} /> : null}
            </View>
          ))}
        </View>
      ))}
      {probe}
    </View>
  )
}
