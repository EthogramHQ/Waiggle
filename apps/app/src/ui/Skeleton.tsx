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
// - `SkeletonRows` : des lignes vides de liste (une liste, une feuille qui charge) ;
// - `SkeletonPage` : la forme d'une page entière qui arrive, faite des pièces des composants.
// Et les formes toutes faites d'avant, gardées pour les écrans qui ne changent pas : `SkeletonCard`,
// `SkeletonList` (`card`, `feed` : la carte du fil rangée dans les colonnes du Fil, `compact` : la
// petite carte de la mosaïque d'un membre ; ces deux-là dessinent `ProjectCardSkeleton`).
//
// Quand on le voit (R16) : une page qui arrive en moins de 160 ms ne montre aucun squelette. `Loading`
// pose sa place tout de suite, mais reste invisible et caché aux lecteurs d'écran pendant ce délai,
// puis se montre en fondu. La page web pré-rendue, elle, ne peut rien attendre : son squelette se
// montre tout de suite, et reste là quand l'appli démarre. Un `Loading` qui prend la place d'un autre
// continue la même attente, au lieu d'en recommencer une (voir `Loading`).
import { borders, durations, layout, type Palette, type Radius, radii, space } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
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
// Les pièces vides des composants, qui assemblent elles-mêmes les pièces de base de ce fichier : ces
// fichiers importent celui-ci, et celui-ci les importe à son tour. Sans effet : de part et d'autre,
// rien n'est lu au chargement du module, seulement au rendu, quand tous sont chargés.
import { Columns } from './Columns'
import { ListGroup, ListRowSkeleton, TextLineShape } from './ListGroup'
import { MemberHeaderSkeleton } from './MemberHeader'
import { ProjectCardSkeleton } from './ProjectCard'
import { ProjectCoverSkeleton } from './ProjectCover'
import { useGridColumns } from './ProjectGrid'
import { TextFieldSkeleton } from './TextField'
import { skeletonGlowMark } from './theme/document'
import { useHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { fade, useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

/** La hauteur du grand bloc d'une carte simple, puis celle d'une ligne, en points. */
const BLOCK = 90
const LINE = 14

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

// ---------------------------------------------------------------------------------------------
// La continuité entre deux attentes (R16)
// ---------------------------------------------------------------------------------------------

/** Une attente à l'écran : depuis quand elle attend (en ms, `Date.now()`), et si elle se voit. */
type Wait = { since: number; shown: boolean }

/**
 * Les `Loading` montés en ce moment, partout dans l'appli. Un objet par `Loading`, qu'il tient à
 * jour lui-même. Une simple variable du module suffit : on n'y garde que ce qui est à l'écran, et
 * chacun s'en retire en se démontant (un test qui démonte sa page la laisse donc vide).
 */
const mounted = new Set<Wait>()

/**
 * Les `Loading` qui viennent de quitter l'écran, dans le passage en cours (une seule mise à jour de
 * React, un « commit ») : la garde de session qui passe la main à l'écran, un morceau de page arrivé
 * à la place de son attente, un écran qui change de forme d'attente. Vidé juste après ce passage
 * (une microtâche : elle s'exécute dès que React a fini d'écrire l'écran), pour qu'une attente
 * montée plus tard, seule, reste une première attente.
 */
let leaving: Wait | null = null

/** Retient qu'une attente quitte l'écran dans ce passage, en fusionnant avec ses voisines. */
const noteLeaving = (wait: Wait) => {
  if (!leaving) {
    // Une promesse plutôt que `queueMicrotask`, que les fausses horloges des tests remplacent.
    void Promise.resolve().then(() => {
      leaving = null
    })
  }
  leaving = {
    since: Math.min(wait.since, leaving?.since ?? wait.since),
    shown: wait.shown || (leaving?.shown ?? false),
  }
}

/**
 * Ce qu'un `Loading` qui se monte peut reprendre, deviné pendant son rendu : React dessine le
 * nouveau avant de démonter l'ancien, qui est donc encore là. Si une attente se voit, il se montre
 * tout de suite ; sinon il reprend la date de la plus ancienne. Vérifié une fois à l'écran (voir
 * `Loading`) : seule une attente qui part dans le même passage se continue.
 */
const guessWait = (now: number): Wait => {
  let since = now
  for (const wait of mounted) {
    if (wait.shown) return { since: wait.since, shown: true }
    since = Math.min(since, wait.since)
  }
  return { since, shown: false }
}

/**
 * Hook : quand une attente qui se monte se montre, selon la règle de continuité (voir `Loading`).
 * Il rend `visible` (vue et lue) et le style animé de son opacité. `decided` : montrée d'office, au
 * montage (demandé, ou la page web pré-rendue). `tracked` : l'attente compte parmi celles de
 * l'écran (`mounted`, `leaving`), et une suivante peut la continuer. Un `Loading` l'est ; les formes
 * posées hors de lui (`DelayedShapes`) ne le sont pas : elles suivent la règle sans la porter, et
 * leur départ ne fait rien continuer.
 * Hors du module, seul `DelayedShapes` s'en sert, pour se montrer au même instant que le `Loading`
 * qui l'accompagne, y compris quand celui-ci continue une attente déjà montrée (R16).
 */
export function useWait(
  decided: boolean,
  tracked: boolean,
): { visible: boolean; style: ReturnType<typeof useAnimatedStyle> } {
  // Le moment du montage, et l'attente devinée pendant ce premier rendu.
  const [born] = useState(Date.now)
  const [start, setStart] = useState<Wait>(() =>
    decided ? { since: born, shown: true } : guessWait(born),
  )
  const [visible, setVisible] = useState(start.shown)
  const opacity = useSharedValue(start.shown ? 1 : 0)
  const onShown = useContext(LoadingShownContext)

  // Sa place dans `mounted`, tenue à jour (l'objet est le même du montage au démontage).
  const self = useRef<Wait>(start)
  self.current.shown = visible
  // useLayoutEffect : avant que l'écran se dessine, et dans le même passage que le démontage de
  // l'ancien `Loading` (React démonte d'abord, puis monte : `leaving` est déjà écrit ici). Au montage
  // seulement : `start`, `decided` et `tracked` ne servent qu'à ce moment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: lu une fois, au montage
  useLayoutEffect(() => {
    const mine = self.current
    if (!decided) {
      // La vérification de `guessWait` : seule une attente qui part dans ce passage se continue ;
      // sinon, c'est une première attente, qui compte ses 160 ms depuis son montage.
      const taken: Wait = leaving ?? { since: born, shown: false }
      if (taken.shown !== start.shown || taken.since !== start.since) {
        mine.since = taken.since
        mine.shown = taken.shown
        setStart(taken)
        setVisible(taken.shown)
        opacity.value = taken.shown ? 1 : 0
      }
    }
    if (!tracked) return
    mounted.add(mine)
    return () => {
      mounted.delete(mine)
      noteLeaving(mine)
    }
  }, [])

  useEffect(() => {
    if (visible) return
    // Le reste des 160 ms, comptées depuis le début de l'attente (la sienne, ou celle qu'il continue).
    const timer = setTimeout(
      () => {
        setVisible(true)
        opacity.value = fade(1, 'page')
      },
      Math.max(0, start.since + durations.quick - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [visible, opacity, start.since])
  useEffect(() => {
    if (visible) onShown?.()
  }, [visible, onShown])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return { visible, style }
}

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
 *
 * La continuité (R16) : un `Loading` qui prend la place d'un autre, dans le même passage (la garde
 * de session passe la main à un écran qui attend encore ses données), continue la même attente.
 * L'ancien se voyait : le nouveau se montre tout de suite, sans fondu (sinon la page vide
 * disparaissait 160 ms, puis revenait en fondu : elle clignotait). L'ancien attendait encore : le
 * nouveau se montre quand l'ancien l'aurait fait (l'attente se compte une fois). Un `Loading` monté
 * seul garde ses 160 ms, même si un autre se voit ailleurs dans la page.
 */
export function Loading({
  children,
  shown = false,
  label,
}: {
  children: ReactNode
  /** Montré tout de suite, sans attendre les 160 ms. */
  shown?: boolean
  /**
   * Le nom lu de l'attente, quand l'appelant a le sien (la carte du membre reçoit `loadingLabel` de
   * son écran) ; sans lui, « Chargement… » dans la langue de l'appli.
   */
  label?: string
}) {
  const { t } = useTranslation()
  const hydrated = useHydrated()
  // useState(() => …) : calculé une seule fois, au montage. L'hydratation qui suit ne change rien.
  // `decided` : montré d'office (demandé, ou la page pré-rendue), rien à reprendre d'une autre.
  const [decided] = useState(() => shown || !hydrated)
  const { visible, style } = useWait(decided, true)
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t(($) => $.common.loading)}
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
 * Des lignes vides, celles d'une liste : les lignes vides de `ListGroup` (`ListRowSkeleton` : la
 * photo, puis le nom et une précision), dans le groupe blanc et ses filets d'une vraie liste. Une
 * liste qui charge a ainsi la matière et la hauteur de la liste qui arrive (planche R16-Explorer-
 * Listes). Pour une liste ou une feuille qui charge (`StateMessage kind="loading"`, `LoadingScreen
 * shape="list"`), sans `Loading` autour : l'appelant le pose.
 */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <ListGroup>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des lignes identiques, jamais réordonnées.
        <ListRowSkeleton key={index} />
      ))}
    </ListGroup>
  )
}

/**
 * La forme des cartes : `card`, la carte simple (un bloc et deux lignes) ; `feed`, la carte du fil
 * (R4), de sa hauteur, avec son panneau ; `compact`, la petite carte de la mosaïque d'un membre (R14).
 * Les deux dernières sont la carte de projet vide (`ProjectCardSkeleton`, ProjectCard.tsx), dessinée
 * par la carte elle-même : quand elle change, son squelette change avec elle.
 */
export type SkeletonShape = 'card' | 'feed' | 'compact'

/** Une carte vide de cette forme, à ce rang dans sa rangée (le retard de sa lueur). */
function ShapedCard({ shape, column = 0 }: { shape: SkeletonShape; column?: number }) {
  if (shape === 'card') return <CardShapes column={column} />
  return <ProjectCardSkeleton size={shape === 'compact' ? 'compact' : 'full'} column={column} />
}

export function SkeletonCard({ shape = 'card' }: { shape?: SkeletonShape }) {
  return (
    <Loading>
      <ShapedCard shape={shape} />
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
  return (
    <View style={{ gap: space.xxl }}>
      {Array.from({ length: count }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des formes identiques, jamais réordonnées.
        <ShapedCard key={index} shape={shape} />
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
 * R16 : la forme d'une page qui arrive (plan, choix 5 et 11), faite des pièces vides de chaque
 * composant, pour que la page vide ait la forme et la matière de celle qui arrive :
 * - `feed` et `grid` : 4 cartes de projet vides (`ProjectCardSkeleton`) dans les colonnes du Fil ;
 * - `member` : l'en-tête vide d'un membre (`MemberHeaderSkeleton`), puis la mosaïque de 4 petites
 *   cartes ; sur ordinateur, l'en-tête en colonne à gauche, comme la vraie page (`Columns`) ;
 * - `project` : le haut de la page d'un projet, la galerie vide (`ProjectCoverSkeleton`) et, à côté
 *   sur ordinateur, dessous ailleurs, l'en-tête : statut, titre, auteur, accroche et actions ;
 * - `list` : 5 lignes vides d'une liste (`SkeletonRows`) ;
 * - `form` : 3 champs et le bouton.
 * Sans `Loading` autour : `LoadingScreen` le pose, une fois pour toute la page.
 */
export type SkeletonPageShape = 'feed' | 'project' | 'member' | 'grid' | 'list' | 'form'

/** Les cartes d'une page vide : comme sur les planches de R16, quatre. */
const PAGE_CARDS = 4
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
      return <MemberPageShapes />
    case 'project':
      return <ProjectTopShapes />
    case 'form':
      return (
        <View style={{ gap: space.xl }}>
          {Array.from({ length: FORM_FIELDS }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: des champs identiques, jamais réordonnés.
            <TextFieldSkeleton key={index} />
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
 * R16 : chaque case dessine la carte de projet vide (`ProjectCardSkeleton`), qui choisit sa taille
 * comme la vraie carte (la compacte sous une grille de compactes sur ordinateur) quand `compact` ne
 * l'impose pas ; elle reçoit sa colonne, et sa lueur traverse ainsi la rangée.
 */
function FeedGridShapes({ count, compact = false }: { count: number; compact?: boolean }) {
  const { columns, probe } = useGridColumns()
  const rows = Math.ceil(count / columns)
  return (
    <View style={{ gap: space.lg }}>
      {Array.from({ length: rows }, (_, row) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: des rangées identiques, jamais réordonnées.
        <View key={row} style={{ flexDirection: 'row', gap: space.lg }}>
          {Array.from({ length: columns }, (_, column) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: une case est une place dans la rangée.
            <View key={column} style={{ flex: 1 }}>
              {row * columns + column < count ? (
                <ProjectCardSkeleton
                  column={column}
                  {...(compact ? { size: 'compact' as const } : null)}
                />
              ) : null}
            </View>
          ))}
        </View>
      ))}
      {probe}
    </View>
  )
}

/**
 * La page vide d'un membre (planches R16-Membre-1440 et 390) : son en-tête vide, puis la mosaïque
 * de ses projets, 4 petites cartes. Sur ordinateur, comme la vraie page (MemberScreen, R15) :
 * l'en-tête en colonne à gauche, de la largeur du profil, et la mosaïque à droite ; ailleurs,
 * l'en-tête centré au-dessus. La forme se décide comme la page, par la classe de taille : avant
 * l'hydratation, toutes deux prennent celle du téléphone, et rien ne saute à l'arrivée.
 */
function MemberPageShapes() {
  const column = useLayout().sizeClass === 'wide'
  const mosaic = <FeedGridShapes count={PAGE_CARDS} compact />
  if (column) {
    return (
      <Columns
        sideFirst
        sideWidth="profile"
        side={<MemberHeaderSkeleton layout="column" />}
        main={mosaic}
      />
    )
  }
  return (
    <View style={{ gap: space.xxl }}>
      <MemberHeaderSkeleton />
      {mosaic}
    </View>
  )
}

/** Les pastilles du statut et de la catégorie, au-dessus du titre d'un projet. */
const PROJECT_BADGES = [72, 56] as const
/** La pastille d'un statut (celle de la carte) : un peu plus basse qu'un contrôle. */
const BADGE_HEIGHT = 22
/** La photo de l'auteur, sous le titre. */
const AUTHOR_PHOTO = 32
/** Les actions de l'en-tête : « Suivre » l'auteur, puis « Suivre ce projet » et « Rejoindre les testeurs ». */
const FOLLOW_WIDTH = 72
const PROJECT_ACTIONS = [128, 152] as const

/**
 * L'en-tête vide d'un projet (planche R16-Projet-1440), aux places de l'en-tête qui arrive : les
 * pastilles du statut, le titre et sa date, l'auteur (sa photo, son nom, son pseudo, « Suivre » à
 * droite), deux lignes d'accroche, « Tester la démo » (le grand bouton), l'adresse de la démo, puis
 * les deux actions plus discrètes. Les lignes ont la hauteur des lignes écrites (`TextLineShape`).
 */
function ProjectHeaderShapes() {
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {PROJECT_BADGES.map((width) => (
            <Shape key={width} height={BADGE_HEIGHT} width={width} round />
          ))}
        </View>
        <TextLineShape variant="title2" width="70%" />
        <TextLineShape variant="caption" width="45%" />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          minHeight: layout.touchTarget,
        }}
      >
        <Shape height={AUTHOR_PHOTO} width={AUTHOR_PHOTO} round />
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <TextLineShape variant="callout" width="35%" />
          <TextLineShape variant="caption" width="25%" />
        </View>
        <Shape height={layout.controlHeight.small} width={FOLLOW_WIDTH} round />
      </View>
      <View>
        <TextLineShape variant="body" width="90%" />
        <TextLineShape variant="body" width="55%" />
      </View>
      <View style={{ gap: space.sm }}>
        <Shape height={layout.controlHeight.regular} width="80%" round />
        <TextLineShape variant="caption" width="55%" />
      </View>
      <View style={{ gap: space.sm, alignItems: 'flex-start' }}>
        {PROJECT_ACTIONS.map((width) => (
          <Shape key={width} height={layout.controlHeight.small} width={width} round />
        ))}
      </View>
    </View>
  )
}

/**
 * Le haut vide de la page d'un projet (planche R16-Projet-1440) : la galerie vide
 * (`ProjectCoverSkeleton`, qui prend la hauteur de la galerie qui arrive) et l'en-tête vide. Sur
 * ordinateur, comme la vraie page (ProjectPage, R5a) : la galerie à gauche, l'en-tête dans la
 * colonne de droite (`Columns sideWidth="wide"`) ; ailleurs, l'un sous l'autre. Le bas de la page
 * (description, recette, commentaires) est la pièce de la page elle-même (`ProjectPageSkeleton`).
 */
function ProjectTopShapes() {
  const wide = useLayout().sizeClass === 'wide'
  if (wide) {
    return (
      <Columns
        sideWidth="wide"
        rows={[{ main: <ProjectCoverSkeleton />, side: <ProjectHeaderShapes /> }]}
      />
    )
  }
  return (
    <View style={{ gap: space.xl }}>
      <ProjectCoverSkeleton />
      <ProjectHeaderShapes />
    </View>
  )
}
