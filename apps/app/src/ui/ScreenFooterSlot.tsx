// Un pied d'écran posé depuis le contenu (R7b, K12 : le compositeur du testeur, dans l'onglet
// « Retours » du coin). La prop `footer` de Screen suffit quand l'écran connaît son pied ; ici, le
// pied naît loin de Screen, au fond d'un onglet (`Tabs`) et d'un fil (`TesterThreadView`), et ne
// vit que tant que cet onglet est affiché.
//
// Trois pièces :
// - Screen fabrique la « place » du pied (`useScreenFooterSlot`) et la donne à son contenu par un
//   contexte (un canal que tout composant posé dedans peut lire, sans passer par chaque parent) ;
// - `ScreenFooterSlot`, posé dans le contenu, y envoie ses enfants. Sur téléphone et tablette, ils
//   sont dessinés par Screen dans son pied collé en bas (`ScreenFooterOutlet`), au-dessus du
//   clavier ; sur ordinateur, ils restent à leur place dans le contenu, comme le `footer` de Screen ;
// - `ScreenFooterOutlet`, dans Screen, dessine ce que la place a reçu.
//
// Les enfants sont envoyés après chaque affichage (`useLayoutEffect`, avant que l'écran soit
// peint) : seul l'emplacement du pied se redessine, pas tout l'écran. Hors d'un Screen (catalogue,
// test d'un composant seul), il n'y a pas de place : les enfants restent où ils sont.
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

type Slot = {
  /** Vrai : Screen colle le pied en bas (téléphone, tablette) ; faux : il suit le contenu. */
  pinned: boolean
  /** Le pied du dernier affichage, à dessiner dans l'emplacement. */
  put: (node: ReactNode) => void
  /** Un pied arrive ; la fonction rendue dit qu'il est parti. */
  claim: () => () => void
  subscribe: (listener: () => void) => () => void
  read: () => ReactNode
}

const ScreenFooterSlotContext = createContext<Slot | null>(null)

/**
 * Hook de Screen : la place du pied posé depuis le contenu. `pinned` : Screen colle son pied en bas
 * de l'écran. Rend la valeur du contexte, son fournisseur, et `filled` (un pied est posé : Screen
 * réserve sa place et suit le clavier).
 */
export function useScreenFooterSlot(pinned: boolean) {
  const [filled, setFilled] = useState(false)
  // Une mémoire qui survit aux affichages sans en provoquer : le pied et qui le dessine.
  const store = useRef({ node: null as ReactNode, listeners: new Set<() => void>() }).current
  const slot = useMemo<Slot>(() => {
    const notify = () => {
      for (const listener of store.listeners) listener()
    }
    return {
      pinned,
      put: (node) => {
        if (store.node === node) return
        store.node = node
        notify()
      },
      claim: () => {
        setFilled(true)
        return () => {
          store.node = null
          notify()
          setFilled(false)
        }
      },
      subscribe: (listener) => {
        store.listeners.add(listener)
        return () => {
          store.listeners.delete(listener)
        }
      },
      read: () => store.node,
    }
  }, [pinned, store])
  return { slot, filled, Provider: ScreenFooterSlotContext.Provider }
}

/** Dans Screen : dessine le pied que le contenu a posé. */
export function ScreenFooterOutlet({ slot }: { slot: Slot }) {
  // `useSyncExternalStore` : se redessine quand la place reçoit un autre pied, et seulement alors.
  const node = useSyncExternalStore(slot.subscribe, slot.read, slot.read)
  return <>{node}</>
}

/**
 * Pose ses enfants dans le pied de l'écran : collés en bas sur téléphone et tablette, à leur place
 * sur ordinateur (et hors d'un Screen). Un seul par écran.
 */
export function ScreenFooterSlot({ children }: { children: ReactNode }) {
  const slot = useContext(ScreenFooterSlotContext)
  const away = slot?.pinned === true
  useLayoutEffect(() => {
    if (!slot?.pinned) return
    return slot.claim()
  }, [slot])
  // Après chaque affichage : le pied à jour (le texte tapé, l'envoi en cours).
  useLayoutEffect(() => {
    if (slot?.pinned) slot.put(children)
  })
  return away ? null : <>{children}</>
}
