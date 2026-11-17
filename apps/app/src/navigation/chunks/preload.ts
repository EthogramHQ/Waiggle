// Le morceau de l'éditeur de projet, demandé d'avance sur le web, au repos, une fois un membre
// connecté (tranche R13, relecture de l'interface du 17/11/2026).
//
// « Publier » (la barre d'onglets) et « Modifier » ou « Nouvelle mise à jour » (la page d'un projet)
// ouvrent des feuilles posées sur la page d'où l'on vient (`lazyScreen` avec `sheet`). Pendant que
// leur morceau arrive, rien ne s'affiche à leur place : sur un réseau lent, la tape semblait ne rien
// faire. Demandé d'avance, le morceau est déjà là quand on touche.
//
// Les feuilles des testeurs ne sont pas ici : elles s'ouvrent depuis le coin des testeurs, qui est
// dans leur propre morceau, déjà chargé. La fenêtre « Suspendre » non plus : réservée aux
// administrateurs, elle ne vaut pas d'être téléchargée par chaque membre.
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useMemberSession } from '../../accounts/session'
import { useHydrated } from '../../ui/theme/hydration'

// Le même `import()` que les routes : le navigateur garde le morceau, et la route, quand elle le
// demande à son tour, le reçoit aussitôt.
const loadEditor = () => import('./projectEditor')

// Ce que le navigateur prête pour attendre qu'il soit au repos (absent de Safari) ; décrit sans
// les types du DOM, le code tournant aussi sur téléphone.
type IdleBrowser = {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/** Au plus tard 3 s après l'hydratation, même si la page ne se repose jamais. */
const IDLE_TIMEOUT_MS = 3_000

/**
 * Demande le morceau de l'éditeur une fois la page hydratée et au repos, si un membre est connecté
 * (un visiteur n'ouvre jamais l'éditeur). Sur téléphone, rien : tout est déjà dans l'appli.
 */
export function useEditorPreload(
  signedIn: boolean,
  // Le chargement, remplaçable par un test (sous Jest, un vrai `import()` échoue).
  load: () => Promise<unknown> = loadEditor,
): void {
  const hydrated = useHydrated()
  useEffect(() => {
    if (Platform.OS !== 'web' || !hydrated || !signedIn) return
    // Un échec ici ne dit rien : la route redemandera le morceau, et saura le dire, elle.
    const preload = () => void load().catch(() => undefined)
    const browser = globalThis as IdleBrowser
    if (browser.requestIdleCallback) {
      const id = browser.requestIdleCallback(preload, { timeout: IDLE_TIMEOUT_MS })
      return () => browser.cancelIdleCallback?.(id)
    }
    const timer = setTimeout(preload, IDLE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [hydrated, signedIn, load])
}

/**
 * Composant invisible, posé une fois à la racine (`app/_layout.tsx`) : il suit la session et
 * demande le morceau dès qu'un membre est connecté. À part, pour qu'un changement de session ne
 * redessine que lui.
 */
export function EditorPreload() {
  useEditorPreload(useMemberSession().state === 'signedIn')
  return null
}
