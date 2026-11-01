// L'inclinaison d'une carte sous la souris (R4, « Le mouvement ») : sur ordinateur, quand la souris
// passe sur une carte, la carte s'incline un peu vers elle (4 degrés au plus, `tilt` de
// @ruche/brand) et un reflet suit le pointeur sur sa photo ; elle se remet à plat quand la souris
// part. C'est une réponse à un geste, jamais un mouvement qui démarre seul.
//
// Rien ailleurs :
// - au toucher (un doigt ne survole pas : la carte pencherait sous le doigt au moment de la tape) ;
// - au clavier (une carte atteinte par Tab ne bouge pas : aucun gestionnaire de focus ni de touche) ;
// - avec « Réduire les animations » (`useCalmMotion`) ;
// - sur téléphone (pas de souris) ;
// - avant l'hydratation de la page web : le serveur ne connaît pas le pointeur du visiteur, et la
//   page doit d'abord être identique à son HTML pré-rendu (`useHydrated`).
//
// La carte touchée devient la page du projet (`coverTransition`) : sa photo est mesurée au toucher.
// `flatten()` la remet à plat tout de suite, sans ressort, juste avant cette mesure : sinon le cadre
// mesuré serait celui d'une carte penchée, et la photo de la page partirait d'un cadre faux.
import { durations, springs, tilt as tiltToken } from '@ruche/brand'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, type ViewProps } from 'react-native'
import { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useHydrated } from './theme/hydration'
import { useCalmMotion } from './theme/motion'

/**
 * L'état d'une carte : ses deux angles en degrés (`rotateX` autour de l'axe horizontal, `rotateY`
 * autour de l'axe vertical), la place du reflet en part de la carte (0 à 1, de gauche à droite et
 * de haut en bas), et `hover`, 1 quand la souris est dessus (le reflet n'apparaît qu'alors).
 */
export type TiltState = {
  rotateX: number
  rotateY: number
  glareX: number
  glareY: number
  hover: number
}

/** À plat, le reflet au centre et éteint. */
const FLAT: TiltState = { rotateX: 0, rotateY: 0, glareX: 0.5, glareY: 0.5, hover: 0 }

/** La question posée au navigateur : le pointeur principal est-il fin (une souris, un pavé) ? */
const FINE_POINTER = '(pointer: fine)'

/** Borne une part de la carte entre 0 et 1 (un pointeur peut passer un peu au-delà du bord). */
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * Le calcul pur : le pointeur à (x, y), en part de la carte ((0,5 ; 0,5) au centre), donne les
 * angles et la place du reflet. La carte se tourne vers le pointeur, comme une surface qui le
 * regarde : à droite, son bord droit s'éloigne (rotateY positif) ; en bas, son bord bas s'éloigne
 * (rotateX négatif). Au bord, l'angle vaut `tilt.maxDegrees`, jamais plus, même au-delà.
 */
export const tiltAt = (x: number, y: number): Omit<TiltState, 'hover'> => {
  const glareX = clamp01(x)
  const glareY = clamp01(y)
  const max = tiltToken.maxDegrees
  return {
    // « + 0 » change un éventuel -0 en 0 : au centre, la carte est exactement à plat.
    rotateX: -(glareY - 0.5) * 2 * max + 0,
    rotateY: (glareX - 0.5) * 2 * max + 0,
    glareX,
    glareY,
  }
}

/**
 * Hook : le pointeur principal est-il fin ? `matchMedia` ne se lit qu'une fois la page hydratée
 * (`active`), et l'on écoute ses changements (une tablette à laquelle on branche une souris).
 */
const useFinePointer = (active: boolean) => {
  const [fine, setFine] = useState(false)
  useEffect(() => {
    if (!active) return
    const query = globalThis.matchMedia?.(FINE_POINTER)
    if (!query) return
    const update = () => setFine(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [active])
  return active && fine
}

/**
 * Ce que react-native-web donne à un gestionnaire de pointeur : l'événement du navigateur dans
 * `nativeEvent`, et l'élément de la page qui écoute (la carte) dans `currentTarget`.
 */
type WebPointerEvent = {
  nativeEvent: { pointerType?: string; clientX: number; clientY: number }
  currentTarget: {
    getBoundingClientRect: () => { left: number; top: number; width: number; height: number }
    style?: { transform: string }
  }
}

/** Les gestionnaires à poser sur la vue qui s'incline : la souris seulement, jamais le clavier. */
type TiltHandlers = Pick<ViewProps, 'onLayout' | 'onPointerMove' | 'onPointerLeave'>

/**
 * Hook : l'inclinaison d'une carte. Il rend :
 * - `handlers`, à poser sur la vue qui s'incline (vide quand l'inclinaison n'a pas lieu) ;
 * - `cardStyle`, le style animé de cette vue (perspective et angles) ;
 * - `glareStyle`, celui du reflet, une lueur de la taille de la carte qui se déplace avec le
 *   pointeur ;
 * - `tilt`, la cible actuelle (une valeur partagée de Reanimated : les styles la suivent par un
 *   ressort) ;
 * - `flatten()`, à plat tout de suite, avant de mesurer la carte ;
 * - `active`, vrai quand l'inclinaison a lieu (le reflet ne se dessine qu'alors).
 *
 * `wanted` : faux pour une carte qui n'est pas un lien (un aperçu ne réagit pas à la souris).
 */
export function useTilt(wanted = true) {
  const hydrated = useHydrated()
  const calm = useCalmMotion()
  const web = Platform.OS === 'web'
  const fine = useFinePointer(wanted && web && hydrated && !calm)
  const active = wanted && web && hydrated && !calm && fine

  // useSharedValue : une valeur que Reanimated lit sur le fil des animations ; la changer ne
  // redessine pas le composant, seuls les styles animés qui la lisent bougent.
  const tilt = useSharedValue<TiltState>(FLAT)
  // Vrai juste après `flatten()` : les styles prennent la cible sans ressort.
  const instant = useSharedValue(false)
  // La taille de la carte, pour déplacer le reflet en points.
  const size = useSharedValue({ width: 0, height: 0 })
  // Après `flatten()`, la carte reste à plat jusqu'à ce que la souris la quitte : la page s'ouvre,
  // et rien ne doit bouger sans un nouveau geste. Un `ref`, pas un état : rien à redessiner.
  const frozen = useRef(false)
  // L'élément de la page qui s'incline, retenu au passage de la souris (voir `flatten`).
  const node = useRef<WebPointerEvent['currentTarget'] | null>(null)

  // L'inclinaison s'arrête (« Réduire les animations » activé, souris débranchée) : à plat.
  useEffect(() => {
    if (!active) tilt.value = FLAT
  }, [active, tilt])

  const flatten = useCallback(() => {
    frozen.current = true
    instant.value = true
    tilt.value = FLAT
    // Sur le web, Reanimated n'écrit le nouveau style qu'à la prochaine image, alors que la mesure
    // de la photo (`measureInWindow` de react-native-web) part dans un minuteur de 0 ms, souvent
    // avant : la transformation est retirée ici, sur l'élément même. Reanimated y écrit ensuite
    // « à plat », qui revient au même.
    if (node.current?.style) node.current.style.transform = 'none'
  }, [tilt, instant])

  const handlers: TiltHandlers = active
    ? {
        onLayout: (event) => {
          const { width, height } = event.nativeEvent.layout
          size.value = { width, height }
        },
        onPointerMove: (event) => {
          const { nativeEvent, currentTarget } = event as unknown as WebPointerEvent
          // Un doigt ou un stylet posé sur l'écran d'un ordinateur tactile : la carte reste à plat.
          if (nativeEvent.pointerType !== 'mouse' && nativeEvent.pointerType !== 'pen') {
            tilt.value = FLAT
            return
          }
          if (frozen.current) return
          node.current = currentTarget
          const rect = currentTarget.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          instant.value = false
          tilt.value = {
            ...tiltAt(
              (nativeEvent.clientX - rect.left) / rect.width,
              (nativeEvent.clientY - rect.top) / rect.height,
            ),
            hover: 1,
          }
        },
        onPointerLeave: () => {
          frozen.current = false
          instant.value = false
          tilt.value = FLAT
        },
      }
    : {}

  // Les styles suivent la cible par le ressort « firm » (réponse immédiate, sans rebond visible),
  // ou la prennent tout de suite après `flatten()`. Sur téléphone, rien.
  const cardStyle = useAnimatedStyle(() => {
    if (!web) return {}
    const { rotateX, rotateY } = tilt.value
    const to = (degrees: number) =>
      instant.value ? `${degrees}deg` : withSpring(`${degrees}deg`, springs.firm)
    return {
      transform: [
        { perspective: tiltToken.perspective },
        { rotateX: to(rotateX) },
        { rotateY: to(rotateY) },
      ],
    }
  })

  const glareStyle = useAnimatedStyle(() => {
    if (!web) return {}
    const { glareX, glareY, hover } = tilt.value
    const { width, height } = size.value
    // La lueur est centrée sur la carte ; elle se décale jusqu'au pointeur.
    const dx = (glareX - 0.5) * width
    const dy = (glareY - 0.5) * height
    const move = (points: number) => (instant.value ? points : withSpring(points, springs.firm))
    return {
      opacity: instant.value ? hover : withTiming(hover, { duration: durations.quick }),
      transform: [{ translateX: move(dx) }, { translateY: move(dy) }],
    }
  })

  return { handlers, cardStyle, glareStyle, tilt, flatten, active }
}
