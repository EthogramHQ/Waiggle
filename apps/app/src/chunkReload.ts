// Le rechargement de la page quand un morceau de l'appli manque (tranche R13, sorti de
// `navigation/lazyScreen.tsx` en R18) : les écrans à la demande (`lazyScreen`) et l'anglais à la
// demande (`preparePageLanguage`, `src/i18n.ts`) partagent la même mémoire, une seule clé par
// adresse. Ainsi, ensemble, ils ne rechargent jamais une adresse plus d'une fois.
import { Platform } from 'react-native'

// Ce que le navigateur prête ici, décrit sans dépendre des types du DOM (le code tourne aussi sur
// téléphone, où ni `location` ni `sessionStorage` n'existent).
type Browser = {
  navigator?: { onLine?: boolean }
  location?: { pathname: string; reload: () => void }
  sessionStorage?: {
    getItem: (key: string) => string | null
    setItem: (key: string, value: string) => void
    removeItem: (key: string) => void
  }
}

// La clé qui se souvient, le temps de l'onglet (sessionStorage), qu'une adresse a déjà été
// rechargée pour un morceau introuvable.
const reloadKey = (pathname: string) => `waiggle.chunkReload:${pathname}`

/**
 * Un morceau introuvable, sur le web : le plus souvent, un onglet ouvert avant une mise en ligne
 * demande un fichier qui n'existe plus (son nom change à chaque construction). Recharger la page
 * donne la nouvelle version. Une seule fois par adresse : si le morceau manque encore, c'est un vrai
 * défaut, et l'appelant prend le relais (l'écran de secours de la route, ou la page en français)
 * sinon la page se rechargerait sans fin. Hors ligne, jamais : le navigateur remplacerait l'appli
 * par sa propre page d'erreur ; l'écran de secours, lui, garde l'appli et propose « Réessayer »
 * (relecture de design du 17/11). Rend vrai si la page se recharge.
 *
 * `web` dit si l'appli tourne dans un navigateur ; par défaut, la plateforme lue à l'appel. L'entrée
 * de l'appli (`preparePageLanguage`) donne celle qu'elle a lue à son chargement.
 */
export const reloadOnce = (web: boolean = Platform.OS === 'web'): boolean => {
  if (!web) return false
  const { navigator, location, sessionStorage } = globalThis as Browser
  if (navigator?.onLine === false) return false
  if (!location || !sessionStorage) return false
  try {
    const key = reloadKey(location.pathname)
    if (sessionStorage.getItem(key) !== null) return false
    sessionStorage.setItem(key, '1')
  } catch {
    // Stockage refusé (navigation privée stricte) : sans mémoire, pas de rechargement, qui
    // pourrait boucler.
    return false
  }
  location.reload()
  return true
}

/** Le morceau est arrivé : l'adresse pourra se recharger de nouveau après une autre mise en ligne. */
export const forgetReload = () => {
  if (Platform.OS !== 'web') return
  const { location, sessionStorage } = globalThis as Browser
  try {
    if (location && sessionStorage) sessionStorage.removeItem(reloadKey(location.pathname))
  } catch {
    // Rien à oublier si le stockage est refusé.
  }
}
