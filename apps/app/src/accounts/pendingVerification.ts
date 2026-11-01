// L'adresse qui attend sa vérification (tranche R2, relecture juridique jur-9) : l'inscription la
// confie ici juste avant d'ouvrir « Vérifie ta boîte mail », qui la lit. Elle ne passe plus par
// l'adresse de la page (`/check-email?email=…`) : une adresse e-mail dans une URL reste dans
// l'historique du navigateur et les journaux, et n'importe qui pouvait fabriquer un lien qui
// affichait un autre texte (« Ton compte est bloqué, appelle le… »).
//
// Un petit magasin en mémoire, hors de React. Sur le web, il est aussi recopié dans le
// `sessionStorage` de l'onglet : la page rechargée retrouve l'adresse, et elle s'efface quand on
// ferme l'onglet. Ce stockage n'appartient qu'à notre site et à cet onglet : rien ne peut l'y
// glisser par un lien. Sur téléphone, la mémoire de l'appli suffit.
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

/** Le nom de la case dans le sessionStorage du navigateur. */
export const PENDING_EMAIL_KEY = 'waiggle.pendingEmail'

// Le peu du sessionStorage dont on a besoin (les types de React Native ne décrivent pas la page web).
type SessionStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Le sessionStorage de l'onglet, sur le web ; rien ailleurs (ou s'il est refusé). */
const storage = (): SessionStorage | null => {
  if (Platform.OS !== 'web') return null
  try {
    return (globalThis as { sessionStorage?: SessionStorage }).sessionStorage ?? null
  } catch {
    // Un navigateur qui interdit le stockage (navigation privée stricte) lève une erreur.
    return null
  }
}

let pending: string | null = null
// Le sessionStorage n'est lu qu'une fois, au premier besoin, dans le navigateur.
let loaded = false
const listeners = new Set<() => void>()

const read = (): string | null => {
  if (!loaded) {
    loaded = true
    try {
      pending = storage()?.getItem(PENDING_EMAIL_KEY) ?? pending
    } catch {
      // Stockage illisible : on garde ce qu'on a en mémoire.
    }
  }
  return pending
}

/** Retient l'adresse à vérifier (null l'oublie), et prévient les écrans qui l'affichent. */
export const setPendingEmail = (email: string | null) => {
  loaded = true
  try {
    if (email === null) storage()?.removeItem(PENDING_EMAIL_KEY)
    else storage()?.setItem(PENDING_EMAIL_KEY, email)
  } catch {
    // Stockage plein ou refusé : la mémoire suffit pour cette visite.
  }
  if (pending === email) return
  pending = email
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Hook : l'adresse qui attend sa vérification, ou null. useSyncExternalStore branche le composant
 * sur une valeur extérieure à React et le redessine quand elle change (la feuille « Changer
 * d'adresse » la remplace) ; le troisième argument sert au pré-rendu de la page web, qui ne connaît
 * pas le visiteur : aucune adresse, puis celle de l'onglet une fois la page hydratée.
 */
export const usePendingEmail = (): string | null =>
  useSyncExternalStore(subscribe, read, () => null)
