// La Goutte repliée ou non (tranche R20) : un état partagé par la Goutte (scout/ScoutDrop) et par la
// feuille « Ton retour », dont le menu « ⋯ » propose « Replier la Goutte ». Replier depuis la
// feuille, c'est retrouver la languette sur la page d'en dessous.
//
// L'état vit en mémoire, le temps de la session de l'appli (scénario : « la Goutte se replie pour
// la session ») : rien n'est écrit sur le compte ni dans l'appareil ; l'appli relancée, la Goutte
// est de retour. Un petit « magasin » de module, lu par `useSyncExternalStore` : le hook de React
// qui branche un composant sur une valeur gardée hors de React, et le redessine quand elle change.
import { useSyncExternalStore } from 'react'

let folded = false
const listeners = new Set<() => void>()

const set = (value: boolean) => {
  if (folded === value) return
  folded = value
  for (const listener of listeners) listener()
}

/** Replie la Goutte en languette (un appui long, ou « Replier la Goutte » dans la feuille). */
export const foldDrop = () => set(true)

/** Rouvre la Goutte (la languette touchée). */
export const unfoldDrop = () => set(false)

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const read = () => folded
// Au pré-rendu du web, la Goutte est toujours ouverte (et ne se montre de toute façon qu'après
// l'hydratation, pour un membre connecté).
const readOnServer = () => false

/** Hook : la Goutte est-elle repliée ? */
export const useDropFolded = (): boolean => useSyncExternalStore(subscribe, read, readOnServer)
