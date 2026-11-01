// « La carte qui devient la page » (R4, le mouvement) : quand le membre touche la carte d'un projet,
// sa photo s'agrandit depuis la place qu'elle occupait dans le fil jusqu'à devenir le haut de la page
// du projet, et le reste de la page apparaît en fondu dessous. Au retour par le bouton « Retour » de
// la page, la photo se replie dans sa carte, si la carte est encore là ; sinon, la page s'efface en
// fondu. Avec « Réduire les animations », tout se fait en fondu.
//
// Comment ça marche, en quatre pièces :
// - `CoverTransitionProvider`, posé une fois au-dessus des pages (la racine de la navigation), garde
//   les cartes affichées, le cadre de la dernière photo touchée et l'état de chaque page qui arrive ;
// - `useCoverSource(id)`, pour la carte : un `ref` à poser sur la vue de sa photo, et `capture(then)`
//   au toucher, qui mesure la photo dans la fenêtre (`measureInWindow`), confie ce cadre au
//   fournisseur, puis ouvre la page (`then`) ;
// - `useCoverTarget(id)`, pour la page : `arrival` (grandir depuis le cadre de la carte, ou un
//   fondu), `departure()` (se replier vers ce cadre, ou un fondu) et `leave(then)`, qui joue ce
//   retour puis quitte la page ;
// - `CoverArrival`, autour de la photo de la page, qui l'anime, et `CoverFade`, autour de chacun des
//   autres morceaux de la page, qui les fait apparaître en fondu.
//
// La photo qui vole est la vraie photo de la page (pas une copie) : elle garde sa place dans la page,
// et seule une transformation (déplacement, agrandissement) la fait partir du cadre de la carte. Pour
// que l'image ne soit pas étirée pendant le vol, on fait comme la technique « FLIP » du web : la boîte
// extérieure prend la forme du cadre du moment (et rogne ce qui dépasse), la boîte intérieure annule
// la déformation, si bien que la photo grandit toujours dans ses proportions.
//
// Pendant le vol, la photo est cachée au lecteur d'écran et ne prend pas le doigt ; à l'arrivée, le
// focus du clavier va au titre de la page (sur le web), pour que la lecture reparte du haut.
//
// Sur le web, l'API View Transitions du navigateur n'est pas utilisée : la page du projet ne dessine
// sa photo qu'une fois le projet lu, et le navigateur photographie la page juste après la navigation,
// donc l'écran de chargement. La même mesure sert partout.
import { type Radius, radii, springs } from '@ruche/brand'
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Platform, type View } from 'react-native'
import Animated, {
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { type Focusable, focusWithoutScroll } from './focus'
import { fade, useCalmMotion } from './theme/motion'

/** Un cadre dans la fenêtre, en points : sa position (coin en haut à gauche) et sa taille. */
export type Frame = { x: number; y: number; width: number; height: number }

/** Ce qu'on peut mesurer dans la fenêtre : une vue de React Native (et la fausse vue des tests). */
export type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void
}

/** L'arrivée de la page : grandir depuis le cadre d'une carte, ou apparaître en fondu. */
export type CoverArrivalPlan = { kind: 'grow'; from: Frame } | { kind: 'fade' }
/** Le départ de la page : se replier vers le cadre de la carte, ou s'effacer en fondu. */
export type CoverDeparturePlan = { kind: 'shrink'; to: Frame } | { kind: 'fade' }

const FADE = { kind: 'fade' } as const

// Les délais, en millisecondes.
/** Une page qui arrive plus tard que ça après le toucher (projet long à lire) ne part pas de la carte. */
const PENDING_MAX = 5000
/** La mesure de la carte ne répond pas (vue retirée entre-temps) : on ouvre la page quand même. */
const MEASURE_MAX = 150
/** Le ressort « open » est posé à ce moment-là (environ 0,45 s pour 98 % du chemin). */
const GROW_LANDED = 560
/** Le ressort « close » arrive presque à la carte : on peut quitter la page. */
const SHRINK_DONE = 420
/** Les fondus d'entrée et de sortie. */
const FADE_IN = 320
const FADE_OUT = 160
/** Filet de sécurité : la photo n'est jamais mesurée (rendu sans mise en page) ; elle se pose. */
const LAND_MAX = 1500

/** Une carte affichée : son projet et la vue de sa photo (null quand elle n'est plus là). */
type Entry = { id: string; node: Measurable | null }

/**
 * L'état d'une page qui arrive, partagé par sa photo (`CoverArrival`) et ses autres morceaux
 * (`CoverFade`). Les « valeurs partagées » de Reanimated (`makeMutable`) vivent sur le fil des
 * animations : les changer ne redessine pas React, seulement les styles animés qui les lisent.
 */
type Stage = {
  /** Le vol de la photo : 0 au cadre de la carte, 1 à sa place dans la page. */
  progress: SharedValue<number>
  /** L'opacité de la photo (0 avant sa mesure, pour ne pas la voir un instant à sa place). */
  photo: SharedValue<number>
  /** L'opacité du reste de la page. */
  rest: SharedValue<number>
  /** L'arrivée est jouée : une photo remontée ensuite (passage en colonnes) ne la rejoue pas. */
  arrived: boolean
  /** Les `CoverArrival` montés pour ce projet ; l'état s'oublie quand il n'y en a plus. */
  users: number
}

/** Ce qu'une photo de page sait faire au départ : jouer le plan, puis appeler `then`. */
type Leaver = (plan: CoverDeparturePlan, then: () => void) => void

type Store = {
  /** Les cartes affichées, sur toutes les pages montées (le fil reste monté sous le projet). */
  entries: Set<Entry>
  /** Le dernier cadre confié par la carte de chaque projet. */
  frames: Map<string, Frame>
  /** La carte qui vient d'être touchée, en attente de sa page, et quand. */
  pending: { id: string; at: number } | null
  stages: Map<string, Stage>
  leavers: Map<string, Leaver>
}

// Un contexte React : une valeur rendue disponible à tous les composants placés dessous, sans la
// passer de main en main. Ici, le magasin des cadres ; null hors du fournisseur (catalogue, tests
// d'écran), où tout se passe comme une navigation simple.
const CoverContext = createContext<Store | null>(null)

/** Le fournisseur, à poser une fois au-dessus des pages (autour de la navigation). */
export function CoverTransitionProvider({ children }: { children: ReactNode }) {
  // Un objet gardé tel quel d'un affichage à l'autre (useState sans setter) : le changer ne
  // redessine personne, ce qui convient, car seuls les gestes (toucher, retour) le lisent.
  const [store] = useState<Store>(() => ({
    entries: new Set(),
    frames: new Map(),
    pending: null,
    stages: new Map(),
    leavers: new Map(),
  }))
  return <CoverContext.Provider value={store}>{children}</CoverContext.Provider>
}

/** L'état de la page de ce projet, créé à la première demande (photo ou autre morceau). */
const stageOf = (store: Store, id: string): Stage => {
  let stage = store.stages.get(id)
  if (!stage) {
    stage = {
      progress: makeMutable(0),
      photo: makeMutable(0),
      rest: makeMutable(0),
      arrived: false,
      users: 0,
    }
    store.stages.set(id, stage)
  }
  return stage
}

/**
 * Hook de la carte : `ref` se pose sur la vue autour de sa photo ; `capture(then)` se donne au
 * toucher, à la place de la navigation, qu'il appelle une fois la photo mesurée. Sans fournisseur,
 * avec « Réduire les animations » ou sans photo mesurable, `then` tout de suite.
 */
export function useCoverSource(id: string) {
  const store = useContext(CoverContext)
  const calm = useCalmMotion()
  const entry = useRef<Entry>({ id, node: null })
  entry.current.id = id

  // La carte s'inscrit tant qu'elle est affichée : au retour, « la carte est encore là » se lit ici.
  useEffect(() => {
    if (!store) return
    const mine = entry.current
    store.entries.add(mine)
    return () => {
      store.entries.delete(mine)
    }
  }, [store])

  const ref = useCallback((node: Measurable | null) => {
    entry.current.node = node
  }, [])

  const capture = useCallback(
    (then: () => void) => {
      const node = entry.current.node
      if (!store) {
        then()
        return
      }
      if (calm || !node) {
        // Rien à faire grandir, mais la page sait qu'elle vient d'une carte : son titre prendra le
        // focus après le fondu (une adresse ouverte directement, elle, laisse le focus en haut).
        store.pending = { id, at: Date.now() }
        then()
        return
      }
      // Une seule ouverture, que la mesure réponde ou que le délai passe d'abord.
      let done = false
      const open = (frame: Frame | null) => {
        if (done) return
        done = true
        if (frame) store.frames.set(id, frame)
        else store.frames.delete(id)
        store.pending = { id, at: Date.now() }
        then()
      }
      const late = setTimeout(() => open(null), MEASURE_MAX)
      node.measureInWindow((x, y, width, height) => {
        clearTimeout(late)
        // Une vue cachée répond un cadre vide : rien à faire grandir.
        open(width > 0 && height > 0 ? { x, y, width, height } : null)
      })
    },
    [store, calm, id],
  )

  return { ref, capture }
}

/**
 * Hook de la page : comment elle arrive, comment elle partira, et `leave(then)` pour partir (le
 * bouton « Retour » de la page). L'arrivée se décide au premier affichage et ne change plus.
 */
export function useCoverTarget(id: string) {
  const store = useContext(CoverContext)
  const calm = useCalmMotion()
  // useState avec une fonction : calculée une seule fois, au premier affichage de la page. Seule la
  // carte de ce projet, touchée à l'instant, la fait grandir.
  // `fromCard` : la page vient d'une carte touchée à l'instant (le focus ira à son titre).
  const [{ arrival, fromCard }] = useState<{ arrival: CoverArrivalPlan; fromCard: boolean }>(() => {
    const pending = store?.pending
    const touched =
      pending !== null && pending !== undefined && pending.id === id
        ? Date.now() - pending.at <= PENDING_MAX
        : false
    const frame = store?.frames.get(id)
    if (!store || calm || !frame || !touched) return { arrival: FADE, fromCard: touched }
    return { arrival: { kind: 'grow', from: frame }, fromCard: true }
  })

  // La carte touchée a trouvé sa page : une autre ouverture de ce projet (un lien, plus tard) ne
  // repartira pas de cette carte. Dans un effet, après l'affichage : toutes les vues de la page
  // montées dans le même affichage ont lu la même arrivée.
  useEffect(() => {
    if (store?.pending?.id === id) store.pending = null
  }, [store, id])

  const departure = useCallback((): CoverDeparturePlan => {
    const frame = store?.frames.get(id)
    if (!store || calm || !frame) return FADE
    // La carte est-elle encore affichée ? Le fil a pu se recharger pendant la visite.
    for (const entry of store.entries) {
      if (entry.id === id && entry.node) return { kind: 'shrink', to: frame }
    }
    return FADE
  }, [store, calm, id])

  const leave = useCallback(
    (then: () => void) => {
      const leaver = store?.leavers.get(id)
      if (!leaver) {
        then()
        return
      }
      leaver(departure(), then)
    },
    [store, id, departure],
  )

  return { arrival, departure, leave, fromCard }
}

type ArrivalProps = {
  id: string
  /** Le titre de la page, qui reçoit le focus à l'arrivée (web). */
  focusOnArrival?: RefObject<Focusable | null>
  /** L'arrondi de la photo, gardé pendant le vol (la boîte qui rogne le reprend). */
  radius?: Radius
  children: ReactNode
}

/** Ce que rend le style animé quand rien ne bouge : aucune transformation. */
const still = [{ translateX: 0 }, { translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }]

/**
 * Autour de la photo de la page : la fait grandir depuis le cadre de la carte (ou apparaître en
 * fondu), et la replie au départ. Hors du fournisseur, rend la photo telle quelle.
 */
export function CoverArrival({ id, focusOnArrival, radius, children }: ArrivalProps) {
  const store = useContext(CoverContext)
  const { arrival, fromCard } = useCoverTarget(id)
  const stage = store ? stageOf(store, id) : null
  // En vol : caché au lecteur d'écran et sans prise au doigt. Hors du fournisseur, jamais.
  const [flying, setFlying] = useState(() => Boolean(stage && !stage.arrived))
  const box = useRef<View>(null)
  const mounted = useRef(true)
  // Les valeurs de secours, quand il n'y a pas de fournisseur (les hooks s'appellent toujours, dans
  // le même ordre : c'est la règle des hooks de React).
  const idle = useSharedValue(1)
  const progress = stage?.progress ?? idle
  const photo = stage?.photo ?? idle
  const rest = stage?.rest ?? idle
  const from = useSharedValue<Frame | null>(arrival.kind === 'grow' ? arrival.from : null)
  const to = useSharedValue<Frame | null>(null)
  const measured = useRef(false)
  const landed = useRef(false)
  const leaving = useRef(false)
  // Le titre à focaliser, lu au moment de l'arrivée (la ref peut changer entre-temps).
  const title = useRef(focusOnArrival)
  title.current = focusOnArrival

  /** La photo est posée : elle redevient lisible et touchable, et le focus va au titre. */
  const land = useCallback(() => {
    if (landed.current || !stage || !mounted.current) return
    landed.current = true
    stage.arrived = true
    progress.value = 1
    photo.value = 1
    rest.value = 1
    setFlying(false)
    // Seulement venue d'une carte : une page ouverte par son adresse garde le focus en haut, comme
    // toute page qui se charge.
    if (fromCard && Platform.OS === 'web') focusWithoutScroll(title.current?.current)
  }, [stage, progress, photo, rest, fromCard])

  // L'état de la page compte ses photos ; il s'oublie après la dernière (un peu plus tard : une
  // photo qui passe d'une colonne à l'autre est retirée puis remontée dans le même affichage).
  useEffect(() => {
    if (!store || !stage) return
    stage.users += 1
    return () => {
      stage.users -= 1
      setTimeout(() => {
        if (stage.users === 0 && store.stages.get(id) === stage) store.stages.delete(id)
      }, 0)
    }
  }, [store, stage, id])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // L'arrivée. Le fondu part tout de suite ; le vol attend la mesure de la photo (onLayout plus bas).
  // Un filet de sécurité pose la photo si cette mesure ne vient jamais.
  useEffect(() => {
    if (!stage || stage.arrived) return
    if (arrival.kind === 'fade') {
      photo.value = fade(1)
      rest.value = fade(1)
      const timer = setTimeout(land, FADE_IN)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(land, LAND_MAX)
    return () => clearTimeout(timer)
  }, [stage, arrival.kind, photo, rest, land])

  // Le vol commence quand la photo connaît sa place dans la fenêtre.
  const onLayout = () => {
    if (!stage || stage.arrived || arrival.kind !== 'grow' || measured.current) return
    measured.current = true
    box.current?.measureInWindow((x, y, width, height) => {
      if (!mounted.current || landed.current) return
      to.value = { x, y, width, height }
      progress.value = 0
      photo.value = 1
      progress.value = withSpring(1, springs.open)
      rest.value = fade(1, 'medium')
      setTimeout(land, GROW_LANDED)
    })
  }

  // Le départ, que `useCoverTarget(id).leave` demande au bouton « Retour » de la page.
  useEffect(() => {
    if (!store || !stage) return
    const leaver: Leaver = (plan, then) => {
      if (leaving.current) return
      leaving.current = true
      let done = false
      const finish = () => {
        if (done) return
        done = true
        then()
        // La page n'a pas été quittée (rien avant elle) : elle revient comme elle était.
        setTimeout(() => {
          if (!mounted.current) return
          leaving.current = false
          progress.value = 1
          photo.value = 1
          rest.value = 1
          setFlying(false)
        }, 1000)
      }
      if (plan.kind === 'fade') {
        photo.value = fade(0, 'quick')
        rest.value = fade(0, 'quick')
        setTimeout(finish, FADE_OUT)
        return
      }
      // La photo a pu défiler depuis l'arrivée : on reprend sa place du moment.
      setTimeout(finish, SHRINK_DONE + 400)
      box.current?.measureInWindow((x, y, width, height) => {
        if (done) return
        to.value = { x, y, width, height }
        from.value = plan.to
        setFlying(true)
        progress.value = withSpring(0, springs.close)
        rest.value = fade(0, 'quick')
        setTimeout(finish, SHRINK_DONE)
      })
    }
    store.leavers.set(id, leaver)
    return () => {
      if (store.leavers.get(id) === leaver) store.leavers.delete(id)
    }
  }, [store, stage, id, progress, photo, rest, from, to])

  // La boîte extérieure prend le cadre du moment (entre la carte et la page) ; translate et scale se
  // font autour du centre de la photo, à sa place dans la page.
  const outer = useAnimatedStyle(() => {
    const start = from.value
    const end = to.value
    if (!start || !end || end.width === 0 || end.height === 0) {
      return { opacity: photo.value, transform: still }
    }
    const p = progress.value
    const width = start.width + (end.width - start.width) * p
    const height = start.height + (end.height - start.height) * p
    const x = start.x + (end.x - start.x) * p
    const y = start.y + (end.y - start.y) * p
    return {
      opacity: photo.value,
      transform: [
        { translateX: x + width / 2 - (end.x + end.width / 2) },
        { translateY: y + height / 2 - (end.y + end.height / 2) },
        { scaleX: width / end.width },
        { scaleY: height / end.height },
      ],
    }
  })
  // La boîte intérieure annule la déformation : la photo grandit d'un seul facteur, celui qui
  // couvre tout le cadre (comme `contentFit="cover"`), et la boîte extérieure rogne le reste.
  const inner = useAnimatedStyle(() => {
    const start = from.value
    const end = to.value
    if (!start || !end || end.width === 0 || end.height === 0) return { transform: still }
    const p = progress.value
    const scaleX = (start.width + (end.width - start.width) * p) / end.width
    const scaleY = (start.height + (end.height - start.height) * p) / end.height
    const cover = Math.max(scaleX, scaleY)
    return {
      transform: [
        { translateX: 0 },
        { translateY: 0 },
        { scaleX: scaleX > 0 ? cover / scaleX : 1 },
        { scaleY: scaleY > 0 ? cover / scaleY : 1 },
      ],
    }
  })
  if (!stage) return <>{children}</>
  return (
    <Animated.View
      ref={box}
      onLayout={onLayout}
      // Pendant le vol, la photo est un décor : cachée au lecteur d'écran (iOS, Android, web) et
      // traversée par le doigt. pointerEvents en propriété, jamais en style (le web l'ignorerait).
      pointerEvents={flying ? 'none' : 'auto'}
      accessibilityElementsHidden={flying}
      importantForAccessibility={flying ? 'no-hide-descendants' : 'auto'}
      aria-hidden={flying || undefined}
      style={[
        outer,
        flying ? { overflow: 'hidden', borderRadius: radius ? radii[radius] : 0 } : null,
      ]}
    >
      <Animated.View style={inner}>{children}</Animated.View>
    </Animated.View>
  )
}

/**
 * Autour d'un morceau de la page qui n'est pas la photo (titre, informations, journal) : il apparaît
 * en fondu pendant que la photo grandit, et s'efface au départ. Hors du fournisseur, rien.
 */
export function CoverFade({ id, children }: { id: string; children: ReactNode }) {
  const store = useContext(CoverContext)
  const stage = store ? stageOf(store, id) : null
  const idle = useSharedValue(1)
  const rest = stage?.rest ?? idle
  const style = useAnimatedStyle(() => ({ opacity: rest.value }))
  if (!stage) return <>{children}</>
  return <Animated.View style={style}>{children}</Animated.View>
}
