// L'adresse qui attend sa vérification (tranche R2, jur-9) : l'inscription la pose ici, et la page
// « Vérifie ta boîte mail » la lit. Elle ne voyage plus dans l'adresse de la page (/check-email?email=…),
// où elle resterait dans l'historique du navigateur et les journaux du serveur.
// Un simple état partagé, hors de React, gardé en mémoire seulement : rien n'est écrit sur
// l'appareil. useSyncExternalStore (un hook de React) redessine les écrans qui le lisent quand il
// change.
import { useSyncExternalStore } from 'react'

let pendingEmail: string | null = null
const listeners = new Set<() => void>()

/** Pose (ou efface, avec null) l'adresse qui attend sa vérification. */
export const setPendingEmail = (email: string | null): void => {
  pendingEmail = email
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const read = () => pendingEmail
// Pendant la préparation de la page web (serveur), aucune adresse : elle n'existe que dans l'appli.
const readOnServer = () => null

/** Hook : l'adresse qui attend sa vérification, ou null. */
export const usePendingEmail = (): string | null =>
  useSyncExternalStore(subscribe, read, readOnServer)
