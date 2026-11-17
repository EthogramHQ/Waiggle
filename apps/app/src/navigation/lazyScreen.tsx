// Les écrans rares et lourds (modération, éditeur de projet, réglages, coin des testeurs) se
// chargent quand on les ouvre, pas avec l'accueil (tranche R13, « Le premier chargement »).
//
// `import('…/SettingsScreen')`, contrairement à un `import` en tête de fichier, demande un module
// au moment où la ligne s'exécute et rend une promesse. Sur le web, la construction du site range ce
// module (et tout ce qu'il est seul à utiliser) dans un « morceau » à part : un second fichier
// JavaScript, que le navigateur ne télécharge qu'à ce moment-là. Le script de l'accueil s'allège
// d'autant. Sur téléphone, tout reste dans l'appli installée : la promesse se tient aussitôt.
//
// Pourquoi pas `React.lazy` et `<Suspense>` (relecture du plan R13, décisions 2 et 3) :
// - au pré-rendu, un `React.lazy` laisse dans le HTML une frontière « en suspens » (`<!--$!-->`),
//   que React refait entièrement au client (erreur 419) : la page clignote et perd son hydratation.
//   Ici, le serveur et l'hydratation montrent la page de chargement (`LoadingScreen`), et l'écran
//   n'est demandé qu'une fois la page hydratée (`useHydrated()`) ;
// - `React.lazy` garde un échec en mémoire : « Réessayer » de l'écran de secours relancerait la
//   même erreur sans redemander le morceau. Ici, un échec s'oublie, et un nouvel essai redemande.
import { type ComponentType, useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { LoadingScreen } from '../screens/states'
import { useHydrated } from '../ui/theme/hydration'

export type LazyScreenOptions = {
  /** La largeur de la page de chargement, celle de l'écran qu'elle précède (`LoadingScreen`). */
  width?: 'form' | 'page'
  /**
   * Une feuille posée sur la page d'avant (`sheetRoute` de `app/_layout.tsx`) : ouverte dans
   * l'appli, rien ne s'affiche pendant son morceau, et la page d'avant reste visible dessous,
   * au lieu d'un squelette plein écran qui la cacherait un instant. Ouverte par un lien direct (le
   * pré-rendu, puis l'hydratation), la page de chargement, comme pour un écran.
   */
  sheet?: boolean
}

// Ce que le navigateur prête ici, décrit sans dépendre des types du DOM (le code tourne aussi sur
// téléphone, où ni `location` ni `sessionStorage` n'existent).
type Browser = {
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
 * défaut, et l'écran de secours de la route prend le relais (sinon la page se rechargerait sans
 * fin). Rend vrai si la page se recharge.
 */
const reloadOnce = (): boolean => {
  if (Platform.OS !== 'web') return false
  const { location, sessionStorage } = globalThis as Browser
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
const forgetReload = () => {
  if (Platform.OS !== 'web') return
  const { location, sessionStorage } = globalThis as Browser
  try {
    if (location && sessionStorage) sessionStorage.removeItem(reloadKey(location.pathname))
  } catch {
    // Rien à oublier si le stockage est refusé.
  }
}

/**
 * Fabrique le composant d'une route dont l'écran se charge à la demande. À appeler une fois, en tête
 * du fichier de route :
 * `export default lazyScreen(() => import('…/SettingsScreen').then((m) => m.SettingsScreen))`.
 */
export function lazyScreen<P extends object>(
  load: () => Promise<ComponentType<P>>,
  options: LazyScreenOptions = {},
): ComponentType<P> {
  // L'écran, une fois arrivé, sert à toutes les visites suivantes (rien à attendre) ; la promesse en
  // cours, partagée si deux pages le demandent à la fois ; oubliée si elle échoue.
  let loaded: ComponentType<P> | null = null
  let pending: Promise<ComponentType<P>> | null = null
  const fetchScreen = () => {
    pending ??= load().then(
      (screen) => {
        loaded = screen
        forgetReload()
        return screen
      },
      (error: unknown) => {
        pending = null
        throw error
      },
    )
    return pending
  }

  // biome-ignore lint/correctness/noComponentHookFactories: la fabrique s'appelle une fois par fichier de route, au chargement du module, jamais pendant un rendu : le composant garde la même identité d'un rendu à l'autre.
  function LazyScreen(props: P) {
    const hydrated = useHydrated()
    // L'écran déjà arrivé (une seconde visite) s'affiche d'emblée. `useState(() => …)` : la fonction
    // donne la valeur de départ ; un composant passé seul serait pris pour cette fonction.
    const [screen, setScreen] = useState<ComponentType<P> | null>(() => loaded)
    const [failure, setFailure] = useState<{ error: unknown } | null>(null)
    // La page était-elle déjà hydratée à l'arrivée sur cette route (navigation dans l'appli), ou
    // l'est-elle devenue ensuite (lien direct, page pré-rendue) ?
    const [openedInApp] = useState(hydrated)

    useEffect(() => {
      if (!hydrated || screen) return
      // `live` : la route a pu être quittée avant l'arrivée du morceau ; on n'écrit plus son état.
      let live = true
      fetchScreen().then(
        (next) => {
          if (live) setScreen(() => next)
        },
        (error: unknown) => {
          // Pendant un rechargement, la page de chargement reste à l'écran.
          if (live && !reloadOnce()) setFailure({ error })
        },
      )
      return () => {
        live = false
      }
    }, [hydrated, screen])

    // Lancer l'erreur pendant le rendu la confie à l'écran de secours de la route (`ErrorBoundary`),
    // avec « Réessayer » : il recrée ce composant, qui redemande le morceau.
    if (failure) throw failure.error
    if (hydrated && screen) {
      const Screen = screen
      return <Screen {...props} />
    }
    if (options.sheet && openedInApp) return null
    return <LoadingScreen width={options.width ?? 'form'} />
  }
  return LazyScreen
}
