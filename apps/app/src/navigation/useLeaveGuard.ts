// Garder ce qui est tapé quand la page s'en va sans geste de l'écran (R6a, relecture du plan ui-I2) :
// le retour du navigateur, le geste de retour d'iOS ou le bouton Retour d'Android retirent la page
// de la pile sans passer par ses boutons. Ce hook les arrête tant qu'il y a des changements, et
// laisse l'écran demander d'abord (« Abandonner ce projet ? »).
//
// Deux voies :
// - `beforeRemove` : un événement de la navigation (Expo Router, qui repose sur React Navigation),
//   envoyé juste avant qu'une page quitte la pile. `preventDefault()` l'annule ; l'action gardée
//   (`event.data.action`) se rejoue ensuite par `navigation.dispatch`, si le membre abandonne.
//   (`usePreventRemove` n'existe pas dans expo-router 6 : on écoute l'événement soi-même.)
// - `beforeunload` (web) : le navigateur va fermer l'onglet ou recharger la page. On ne peut pas y
//   poser notre fenêtre ; on demande seulement au navigateur la sienne (« Quitter le site ? »).
import { useNavigation } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

/** L'action de navigation arrêtée (un retour), à rejouer si le membre abandonne. */
export type HeldAction = { type: string }

type Navigation = ReturnType<typeof useNavigation>
type BeforeRemoveEvent = { preventDefault: () => void; data: { action: HeldAction } }
// Les types de la navigation ne disent pas `beforeRemove` sur toutes les piles : on décrit ici le
// peu qu'on en lit.
type Listening = {
  addListener: (type: 'beforeRemove', listener: (event: BeforeRemoveEvent) => void) => () => void
  dispatch: (action: HeldAction) => void
}

/** Le peu de la fenêtre du navigateur que lit le hook (les types de React Native l'ignorent). */
type BrowserWindow = {
  addEventListener: (type: 'beforeunload', listener: (event: UnloadEvent) => void) => void
  removeEventListener: (type: 'beforeunload', listener: (event: UnloadEvent) => void) => void
}
type UnloadEvent = { preventDefault: () => void; returnValue?: unknown }

/**
 * Hook : arrête la sortie de la page tant que `dirty` est vrai, et appelle `onHeld(action)` à la
 * place. Rend `release()`, à appeler juste avant un départ voulu (publier, « Abandonner ») : plus
 * rien n'est arrêté ensuite ; et `proceed(action)`, qui relâche et rejoue l'action arrêtée.
 */
export const useLeaveGuard = (dirty: boolean, onHeld: (action: HeldAction) => void) => {
  const navigation = useNavigation() as Navigation & Listening
  const leaving = useRef(false)
  // Les dernières valeurs, lues par l'écouteur posé une seule fois (une `ref` garde sa valeur d'un
  // affichage à l'autre sans en provoquer un).
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const heldRef = useRef(onHeld)
  heldRef.current = onHeld

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current || !dirtyRef.current) return
        event.preventDefault()
        heldRef.current(event.data.action)
      }),
    [navigation],
  )

  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || typeof window === 'undefined') return
    const page = window as unknown as BrowserWindow
    const onUnload = (event: UnloadEvent) => {
      if (leaving.current) return
      event.preventDefault()
      // Les navigateurs plus anciens attendent aussi une valeur ici pour poser leur question.
      event.returnValue = ''
    }
    page.addEventListener('beforeunload', onUnload)
    return () => page.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  return {
    release: () => {
      leaving.current = true
    },
    proceed: (action: HeldAction) => {
      leaving.current = true
      navigation.dispatch(action)
    },
  }
}
