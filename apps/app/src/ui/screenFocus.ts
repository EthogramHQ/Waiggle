// Cet écran est-il celui qui est affiché ? (tranche R3). Sur le web, Expo Router garde les pages
// quittées montées sous la page ouverte : quand l'onglet actif est touché de nouveau, seul l'écran
// affiché doit remonter en haut (ui/Screen.tsx). La réponse vient de `useIsFocused` d'Expo Router.
//
// Depuis RF (« la fluidité »), le module donne aussi le signal « la route devient affichée » :
// `useScreenShownCount()`, le nombre de fois où la route de l'écran est devenue affichée (0 avant
// sa première arrivée, puis +1 à chaque arrivée, aller et retour). Un nombre qui monte est un
// événement : deux écrans n'ont pas à comparer deux booléens lus au même instant (relecture du plan,
// ui-11). Il sert au fondu des pages (ui/ScreenFade.tsx), à la goutte de la barre et à `Screen`.
//
// Hors d'un navigateur (le catalogue monté seul, un test qui affiche un écran sans routeur, ou qui
// remplace expo-router par un faux sans ces fonctions), `useIsFocused` et `useRoute` lèvent une
// erreur : l'écran est alors « affiché », et l'a été une fois, ce qui est le cas.
import { useIsFocused, useRoute } from 'expo-router'
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

/**
 * Ce que le module retient d'une route : combien de fois elle est devenue affichée, si elle l'est
 * en ce moment, et qui veut savoir quand le nombre change.
 */
type RouteRecord = {
  count: number
  shown: boolean
  listeners: Set<() => void>
  /** L'abonnement, créé une fois : useSyncExternalStore se réabonnerait s'il changeait. */
  subscribe: (listener: () => void) => () => void
}

const newRecord = (count = 0): RouteRecord => {
  const listeners = new Set<() => void>()
  return {
    count,
    shown: count > 0,
    listeners,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Les routes vues depuis le chargement, par leur clé (Expo Router en donne une par page empilée :
 * ouvrir deux fois le même projet donne deux clés). Une route n'est jamais oubliée : quand un écran
 * se démonte puis se remonte dans la même route (la fin d'un chargement, le passage de 1 100 px),
 * le nombre doit rester le même. Une clé et un nombre par page visitée : quelques octets.
 */
const routes = new Map<string, RouteRecord>()

const recordOf = (key: string): RouteRecord => {
  let record = routes.get(key)
  if (!record) {
    record = newRecord()
    routes.set(key, record)
  }
  return record
}

// Hors d'un navigateur : une route qui est affichée, et l'a été une fois. Rien ne la change.
const outside = newRecord(1)

/**
 * Une route « de démonstration », pour le catalogue : un morceau d'écran qui se comporte comme une
 * page de la pile (affichée ou non, `focused`), avec son propre nombre d'arrivées. Le remonter
 * (une autre `key`) en fait une route neuve.
 */
type Scope = { focused: boolean; record: RouteRecord }
const ScopeContext = createContext<Scope | null>(null)

/** Hook : la réponse du routeur seul, `null` hors d'un navigateur. */
const useRouteFocused = (): boolean | null => {
  try {
    // Un hook appelé dans un try, ce que la règle des hooks refuse d'ordinaire : permis ici, car
    // l'issue ne change pas d'un rendu à l'autre (un composant est toujours dans un navigateur, ou
    // toujours hors de lui), et React compte donc les mêmes hooks à chaque rendu. Expo Router ne
    // donne aucun autre moyen de savoir s'il y a un navigateur (son NavigationContext n'est pas
    // exporté).
    // biome-ignore lint/correctness/useHookAtTopLevel: l'issue du try est la même à chaque rendu (voir ci-dessus)
    return useIsFocused()
  } catch {
    return null
  }
}

/** Hook : la clé de la route de l'écran, `null` hors d'un navigateur. */
const useRouteKey = (): string | null => {
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: même raison que useRouteFocused
    return useRoute().key
  } catch {
    return null
  }
}

/** Hook : vrai si l'écran est celui qui est affiché, ou s'il n'y a pas de navigateur autour. */
export const useScreenFocused = (): boolean => {
  const scope = useContext(ScopeContext)
  const focused = useRouteFocused()
  return (focused ?? true) && (scope?.focused ?? true)
}

/**
 * Hook : le nombre de fois où la route de l'écran est devenue affichée. 0 au premier rendu d'une
 * route neuve, puis 1 dès son arrivée, 2 au retour sur elle, et ainsi de suite. Le nombre est
 * celui de la route, pas du composant : un écran monté plus tard dans la même visite (la fin d'un
 * chargement) lit le même nombre, sans le faire monter. Hors d'un navigateur : 1. Un routeur qui
 * dit si la page est affichée sans donner sa clé (un faux `useIsFocused` de test) : le nombre des
 * arrivées vues par ce composant.
 *
 * Le passage à 1 se fait dans un `useLayoutEffect` (un effet que React lance après avoir posé
 * l'écran, mais avant que le navigateur le dessine) : le nouveau nombre redessine aussitôt ceux qui
 * le lisent, avant la première image. Un composant qui veut agir à l'arrivée compare donc le nombre
 * reçu au précédent ; l'opacité posée à ce rendu-là est celle de la première image.
 */
export const useScreenShownCount = (): number => {
  const scope = useContext(ScopeContext)
  const routeFocused = useRouteFocused()
  const focused = useScreenFocused()
  const key = useRouteKey()
  // Le nombre propre au composant, quand un routeur dit si la page est affichée sans donner sa clé
  // (un test qui remplace `useIsFocused` d'expo-router, sans `useRoute`) : il compte alors les
  // arrivées que ce composant voit lui-même.
  const [own] = useState(newRecord)
  const record = scope
    ? scope.record
    : key !== null
      ? recordOf(key)
      : routeFocused === null
        ? outside
        : own
  // useSyncExternalStore branche le composant sur une valeur gardée hors de React (le nombre de la
  // route) : quand le nombre change, tous ceux qui le lisent sont redessinés ensemble. Le troisième
  // argument est la valeur du pré-rendu et de l'hydratation (web) : 0, rien n'a encore été affiché.
  const count = useSyncExternalStore(
    record.subscribe,
    () => record.count,
    () => (record === outside ? 1 : 0),
  )
  useLayoutEffect(() => {
    if (record === outside) return
    if (!focused) {
      record.shown = false
      return
    }
    // Plusieurs écrans d'une même route voient l'arrivée au même rendu : le premier compte, les
    // autres trouvent la route déjà marquée affichée.
    if (record.shown) return
    record.shown = true
    record.count += 1
    for (const listener of [...record.listeners]) listener()
  }, [focused, record])
  return count
}

/**
 * Une route de démonstration (le catalogue) : ce qui est posé dedans croit être une page de la pile,
 * affichée si `focused`. Elle a son propre nombre d'arrivées ; la remonter (une autre `key`) en fait
 * une route neuve, comme une page qu'on ouvre.
 */
export function ScreenRouteScope({ focused, children }: { focused: boolean; children: ReactNode }) {
  const [record] = useState(newRecord)
  const value = useMemo(() => ({ focused, record }), [focused, record])
  return createElement(ScopeContext.Provider, { value }, children)
}
