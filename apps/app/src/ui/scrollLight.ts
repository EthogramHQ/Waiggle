// La lumière au défilement (R4, « Le mouvement ») : pendant que le membre fait défiler le fil, la
// lumière d'ambiance prend la couleur de la photo de la carte qui passe au milieu de l'écran.
//
// Deux pièces :
// - le canal de défilement de l'écran (`ScreenScrollContext`) : Screen y diffuse chaque défilement de
//   sa zone qui défile, et un composant posé dedans s'y abonne. FeedList, enfant de Screen, ne peut
//   pas passer de gestionnaire au `onScroll` de son parent : il écoute par ce canal ;
// - `useScrollLight(items)`, à appeler dans un enfant de Screen (jamais dans le corps de l'écran :
//   c'est Screen qui rend le fournisseur de la lumière, relecture ui-B5). Il rend `cardRef(id)`, à
//   poser sur chaque carte : au défilement, il mesure les cartes et donne à la lumière le résumé
//   flou (thumbhash) de celle dont le centre est le plus proche du milieu de la fenêtre.
//
// Le fondu entre deux couleurs est celui de la lumière (`lightFade`, AmbientLightSoft) ; « Réduire
// les animations » la rend immobile, mais sa couleur suit toujours la carte du milieu. Quand l'appli
// passe en arrière-plan, la lumière s'arrête déjà d'elle-même (AppState, AmbientLightSoft).
import { createContext, type RefObject, useCallback, useContext, useEffect, useRef } from 'react'
import { Dimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useAmbient } from './theme/ambient'

/** Un défilement de la zone qui défile de l'écran. */
export type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>

type ScrollListener = (event: ScrollEvent) => void

/** Ce que Screen offre aux composants posés dedans. */
export type ScreenScroll = {
  /** S'abonner aux défilements ; renvoie de quoi se désabonner. */
  subscribe: (listener: ScrollListener) => () => void
  /**
   * Vrai dès qu'un composant de l'écran (le fil) a donné sa couleur à la lumière : la source posée
   * par Screen lui-même (`thumbhash`, la lumière miel) ne reprend alors plus la main (ui-B5).
   */
  lightHeld: RefObject<boolean>
  /**
   * Remonte la zone qui défile tout en haut (RF, ui-5 : le bouton des nouveautés posé sous la barre
   * fixe). Un défilement animé, ou un saut avec « Réduire les animations ».
   */
  toTop: () => void
  /**
   * Fait défiler la zone qui défile jusqu'à `y`, d'un saut (sans animation). Pour la barre du haut
   * qui suit le contenu (RF, correction après relecture) : quand un de ses éléments reçoit le focus
   * alors que la page a défilé, elle n'est plus dans l'écran, et le navigateur ne sait pas l'y
   * ramener (elle n'est pas dans la zone qui défile) ; elle redescend la page juste assez.
   */
  jumpTo: (y: number) => void
  /**
   * Fait défiler la zone qui défile jusqu'à sa fin, d'un saut (R7b, K11 : un fil s'ouvre sur son
   * dernier message). Facultatif : un canal fait à la main (un test) peut ne pas l'offrir.
   */
  toEnd?: () => void
  /**
   * La hauteur du haut de la fenêtre couverte par la barre fixe (0 quand la barre suit le contenu,
   * ou qu'il n'y en a pas). Tenue à jour par Screen ; la lumière qui suit le défilement compte son
   * « milieu de l'écran » dans la place qui reste dessous (ui-15).
   */
  coveredTop: RefObject<number>
}

// Hors d'un Screen (catalogue, test d'un composant seul) : rien ne défile, personne n'écoute.
export const ScreenScrollContext = createContext<ScreenScroll | null>(null)

/**
 * Hook de Screen : fabrique son canal de défilement. Rend la valeur à donner au contexte et la
 * fonction à brancher sur le `onScroll` de sa zone qui défile (qui prévient aussi `onScroll`, la
 * prop de l'écran). `toTop` : ce que fait `ScreenScroll.toTop()` (remonter la zone qui défile) ;
 * `jumpTo` : ce que fait `ScreenScroll.jumpTo(y)` ; sans eux (le catalogue), rien.
 */
export function useScreenScrollChannel(
  onScroll?: (event: ScrollEvent) => void,
  toTop?: () => void,
  jumpTo?: (y: number) => void,
  toEnd?: () => void,
) {
  // Des « refs » : gardées d'un affichage à l'autre, sans rien redessiner quand elles changent.
  const listeners = useRef(new Set<ScrollListener>())
  const lightHeld = useRef(false)
  const coveredTop = useRef(0)
  const latestOnScroll = useRef(onScroll)
  latestOnScroll.current = onScroll
  const latestToTop = useRef(toTop)
  latestToTop.current = toTop
  const latestJumpTo = useRef(jumpTo)
  latestJumpTo.current = jumpTo
  const latestToEnd = useRef(toEnd)
  latestToEnd.current = toEnd

  const subscribe = useCallback((listener: ScrollListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])
  // Le même objet tant que l'écran est monté : les abonnés ne se réabonnent pas à chaque affichage.
  // `toTop` et `jumpTo` passent par des refs : les fonctions du dernier affichage, sans changer
  // l'objet.
  const channel = useRef<ScreenScroll>({
    subscribe,
    lightHeld,
    coveredTop,
    toTop: () => latestToTop.current?.(),
    jumpTo: (y) => latestJumpTo.current?.(y),
    toEnd: () => latestToEnd.current?.(),
  }).current

  const handleScroll = useCallback((event: ScrollEvent) => {
    latestOnScroll.current?.(event)
    for (const listener of listeners.current) listener(event)
  }, [])

  return { channel, handleScroll }
}

/** Ce qu'une carte offre pour être mesurée : sa place dans la fenêtre (une vue de React Native). */
export type MeasurableCard = {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void
}

type LitItem = { id: string; thumbhash?: string | null }

// Le défilement est lu au plus toutes les 120 ms (et une dernière fois à l'arrêt) : assez pour que
// la couleur suive le pouce, sans mesurer toutes les cartes à chaque image.
const READ_EVERY_MS = 120

/**
 * Hook : la lumière suit la carte au milieu de l'écran. `items` : les cartes affichées, dans
 * l'ordre, avec leur résumé flou (une carte sans photo laisse la lumière comme elle est).
 */
export function useScrollLight(items: readonly LitItem[]): {
  cardRef: (id: string) => (node: MeasurableCard | null) => void
} {
  const { setSource } = useAmbient()
  const scroll = useContext(ScreenScrollContext)
  // Les vues des cartes affichées, par identifiant.
  const cards = useRef(new Map<string, MeasurableCard>())
  // Les cartes du dernier affichage, lues au moment de la mesure (jamais une liste périmée).
  const latestItems = useRef(items)
  latestItems.current = items
  // La dernière carte qui a coloré la lumière : la même au milieu ne la relance pas.
  const litId = useRef<string | null>(null)
  // Un `ref` par carte, gardé d'un affichage à l'autre : React ne le rappelle pas à chaque fois.
  const refs = useRef(new Map<string, (node: MeasurableCard | null) => void>())

  const cardRef = useCallback((id: string) => {
    let ref = refs.current.get(id)
    if (!ref) {
      ref = (node) => {
        if (node) cards.current.set(id, node)
        else cards.current.delete(id)
      }
      refs.current.set(id, ref)
    }
    return ref
  }, [])

  // Mesure les cartes et colore la lumière de celle du milieu. Les mesures peuvent répondre plus
  // tard (sur le web, à la tâche suivante) : on décide quand toutes sont revenues.
  const readMiddle = useCallback(() => {
    const measured = [...cards.current]
    if (measured.length === 0) return
    // Le milieu de ce qu'on voit : sous la barre fixe (RF, ui-15), la carte « au milieu » est celle
    // du milieu de la place qui reste, pas celle du milieu de la fenêtre, à demi sous la barre.
    const covered = scroll?.coveredTop.current ?? 0
    const middle = covered + (Dimensions.get('window').height - covered) / 2
    const distances = new Map<string, number>()
    for (const [id, card] of measured) {
      card.measureInWindow((_x, y, _width, height) => {
        // Une carte cachée (page quittée, sur le web) mesure 0 : elle n'est pas candidate.
        distances.set(id, height > 0 ? Math.abs(y + height / 2 - middle) : Number.POSITIVE_INFINITY)
        if (distances.size < measured.length) return
        let nearest: string | null = null
        let best = Number.POSITIVE_INFINITY
        for (const [candidate, distance] of distances) {
          if (distance < best) {
            best = distance
            nearest = candidate
          }
        }
        const item = latestItems.current.find((entry) => entry.id === nearest)
        // Sans photo, la lumière reste celle de la dernière carte : pas de retour au miel en plein
        // défilement.
        if (!item?.thumbhash || item.id === litId.current) return
        litId.current = item.id
        if (scroll) scroll.lightHeld.current = true
        setSource({ thumbhash: item.thumbhash })
      })
    }
  }, [scroll, setSource])

  useEffect(() => {
    if (!scroll) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let pending = false
    // Lecture « au plus une fois par période » : la première tout de suite après la période, puis
    // une dernière après le dernier défilement, pour la carte où le membre s'est arrêté.
    const unsubscribe = scroll.subscribe(() => {
      pending = true
      if (timer) return
      timer = setTimeout(function tick() {
        if (!pending) {
          timer = null
          return
        }
        pending = false
        readMiddle()
        timer = setTimeout(tick, READ_EVERY_MS)
      }, READ_EVERY_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [scroll, readMiddle])

  return { cardRef }
}
