// La couche du toast, sur le web : elle est rendue directement dans <body>, hors de la page
// (un « portail » React : le composant reste dans l'arbre de React, avec ses contextes, mais son
// HTML va ailleurs dans le document).
// Pourquoi : le toast est collé en bas de la fenêtre (position: fixed). Or un parent qui porte une
// transformation CSS devient le cadre de ce « fixed » : c'est le cas du contenu de chaque
// ScrollView de react-native-web (translateZ(0)), et le toast se retrouvait tout en haut de la
// page défilée, hors de l'écran (mesuré dans le catalogue, R1). Depuis <body>, aucun parent ne le
// gêne, où que soit posé le fournisseur.
// Fichier en `.web.tsx` : le bundler le choisit pour le web seulement ; les téléphones prennent
// toastLayer.tsx.
import type { ReactNode } from 'react'
import { useHydrated } from './hydration'

// react-dom (dépendance de l'appli web) est installé sans ses types (@types/react-dom), et l'on
// n'ajoute pas de dépendance pour une seule fonction : on décrit ici celle qu'on utilise.
type PortalDom = { createPortal: (children: ReactNode, container: Element) => ReactNode }
const { createPortal } = require('react-dom') as PortalDom

export function ToastLayer({ children }: { children: ReactNode }) {
  // document n'existe pas au pré-rendu : la couche n'apparaît qu'une fois la page hydratée (un
  // toast ne vient de toute façon qu'après un geste).
  const hydrated = useHydrated()
  if (!hydrated || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

/** Sur le web, la couche est collée à la fenêtre (les types de React Native ignorent « fixed »). */
export const layerPosition = 'fixed'
