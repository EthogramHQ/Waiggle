// Sur le web, chaque page est préparée à l'avance sur le serveur (« pré-rendue »), sans navigateur :
// le serveur ne connaît ni la taille de la fenêtre, ni le mode clair ou sombre du visiteur, ni sa
// langue. Au chargement, React « hydrate » la page : il vérifie que son premier affichage est
// identique au HTML préparé, puis prend le relais. S'il diffère, React se plaint, redessine tout, et
// peut même laisser des styles faux. On affiche donc d'abord exactement la version du serveur, puis
// la vraie (nuit, largeur d'ordinateur…) juste après.
//
// Le signal « la page est hydratée » est donné par l'écran lui-même (voir Screen.tsx) : React hydrate
// le contenu d'une page après la mise en page racine, c'est donc le dernier à être prêt.
import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'

// Sur téléphone, rien n'est pré-rendu : on est « hydraté » d'emblée.
let hydrated = Platform.OS !== 'web'
const listeners = new Set<() => void>()

/** Appelée une fois le contenu de la page affiché dans le navigateur. */
export const markHydrated = () => {
  if (hydrated) return
  hydrated = true
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Hook : vrai une fois la page hydratée. useSyncExternalStore branche le composant sur une valeur
 * extérieure à React (ici la variable `hydrated`) ; le troisième argument est la valeur à utiliser
 * pendant le pré-rendu et l'hydratation : faux, comme sur le serveur.
 */
export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => Platform.OS !== 'web',
  )
