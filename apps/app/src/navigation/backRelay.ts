// Entendre le Retour du navigateur (`popstate`) AVANT Expo Router (R6a, correction C5-E2).
// Sur la fenêtre elle-même, Chromium appelle les écouteurs dans l'ordre où ils ont été posés, « à la
// capture » ou non (mesuré en R6a, U5e) : un écouteur posé à l'ouverture d'une feuille passerait
// après celui d'Expo Router, posé au démarrage, qui remettrait la pile avant qu'on ait rien dit.
//
// Ce module pose donc UN relais sur la fenêtre, dès son chargement. Il est importé par `index.ts`
// avant `expo-router/entry` : l'ordre des imports est l'ordre d'exécution, donc celui des
// écouteurs. Les feuilles ne posent plus d'écouteur : elles s'inscrivent auprès du relais
// (`listenPopState`). `useLeaveGuard` l'importe aussi, mais ce n'est pas lui qui garantit l'ordre.
import { Platform } from 'react-native'

/** Le `popstate` tel que le relais le lit : on peut l'arrêter pour les écouteurs suivants. */
export type PopEvent = { stopImmediatePropagation: () => void }

/** Le peu de la fenêtre que lit le relais (les types de React Native ignorent le navigateur). */
export type RelayWindow = {
  addEventListener: (
    type: 'popstate',
    listener: (event: PopEvent) => void,
    capture: boolean,
  ) => void
  removeEventListener: (
    type: 'popstate',
    listener: (event: PopEvent) => void,
    capture: boolean,
  ) => void
}

let relayWindow: RelayWindow | null = null
const popHandlers = new Set<(event: PopEvent) => void>()
const relayPopState = (event: PopEvent) => {
  for (const handler of [...popHandlers]) handler(event)
}

/** Pose le relais de `popstate` sur cette fenêtre (au chargement du module ; les tests, sur un faux). */
export const listenBeforeRouter = (page: RelayWindow) => {
  if (relayWindow === page) return
  relayWindow?.removeEventListener('popstate', relayPopState, true)
  relayWindow = page
  page.addEventListener('popstate', relayPopState, true)
}

/** Écoute `popstate` par le relais s'il est posé sur cette fenêtre, sinon directement (plus tard). */
export const listenPopState = (page: RelayWindow, handler: (event: PopEvent) => void) => {
  if (relayWindow === page) {
    popHandlers.add(handler)
    return () => {
      popHandlers.delete(handler)
    }
  }
  page.addEventListener('popstate', handler, true)
  return () => page.removeEventListener('popstate', handler, true)
}

// Au chargement : sur le web seulement (ni téléphone, ni pré-rendu, où `window` n'existe pas).
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const page = window as unknown as Partial<RelayWindow>
  if (page.addEventListener && page.removeEventListener) listenBeforeRouter(page as RelayWindow)
}
