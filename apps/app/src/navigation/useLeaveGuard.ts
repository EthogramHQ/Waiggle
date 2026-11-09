// Garder ce qui est tapé quand la page s'en va sans geste de l'écran (R6a, relecture du plan ui-I2) :
// le retour du navigateur, le geste de retour d'iOS ou le bouton Retour d'Android retirent la page
// de la pile sans passer par ses boutons. Ce hook les arrête tant qu'il y a des changements, et
// laisse l'écran demander d'abord (« Abandonner ce projet ? »).
//
// Trois voies :
// - `beforeRemove` (téléphone) : un événement de la navigation (Expo Router, qui repose sur React
//   Navigation), envoyé juste avant qu'une page quitte la pile. `preventDefault()` l'annule ;
//   l'action gardée (`event.data.action`) se rejoue ensuite par `navigation.dispatch`, si le membre
//   abandonne. (`usePreventRemove` n'existe pas dans expo-router 6 : on écoute l'événement soi-même.)
// - une étape de plus dans l'historique (web, décision de Louis du 9/11/2026) : le bouton Retour du
//   navigateur n'envoie pas `beforeRemove`. Il change d'entrée d'historique, le navigateur envoie
//   `popstate`, et Expo Router remet alors toute la pile d'un coup (`resetRoot` dans son
//   `useLinking`) : la feuille partait sans demander. Tant qu'il y a des changements, on pose donc
//   une entrée de plus, à la même adresse (`history.pushState`). Le Retour la consomme sans changer
//   d'adresse ; on arrête son `popstate` avant Expo Router, on la remet, et on demande.
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
  addEventListener: {
    (type: 'beforeunload', listener: (event: UnloadEvent) => void): void
    (type: 'popstate', listener: (event: PopEvent) => void, capture: boolean): void
  }
  removeEventListener: {
    (type: 'beforeunload', listener: (event: UnloadEvent) => void): void
    (type: 'popstate', listener: (event: PopEvent) => void, capture: boolean): void
  }
  history: {
    readonly state: unknown
    pushState: (state: unknown, title: string, url?: string) => void
    back: () => void
  }
  location: { readonly href: string }
}
type UnloadEvent = { preventDefault: () => void; returnValue?: unknown }
type PopEvent = { stopImmediatePropagation: () => void }

/** Le retour arrêté sur le web : le même que celui d'un bouton « Retour » de l'appli. */
const BROWSER_BACK: HeldAction = { type: 'GO_BACK' }

/** La marque de notre entrée dans `history.state`, à côté de l'identifiant qu'y range Expo Router. */
const STEP_MARK = 'waiggleLeaveGuard'

/**
 * Le temps laissé au navigateur pour retirer l'étape (`history.back()` est asynchrone : le
 * `popstate` arrive quelques millisecondes plus tard). Au-delà, on la tient pour retirée : un départ
 * voulu n'attend jamais sans fin.
 */
const STEP_REMOVAL_MS = 250

/** La fenêtre du navigateur, sur le web seulement ; `null` sur téléphone et au pré-rendu. */
const browserWindow = (): BrowserWindow | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  const page = window as unknown as Partial<BrowserWindow>
  return page.history && page.location ? (page as BrowserWindow) : null
}

const isMarked = (state: unknown) =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[STEP_MARK] === true

/**
 * L'étape de plus dans l'historique, posée et retirée selon `want()`. Trois états : aucune étape,
 * l'étape posée (le navigateur est dessus), l'étape en cours de retrait (`history.back()` lancé,
 * son `popstate` pas encore arrivé). Un changement demandé pendant un retrait attend sa fin : deux
 * déplacements de l'historique lancés ensemble se mêlent dans certains navigateurs.
 */
const createBackStep = (page: BrowserWindow, onBack: () => void) => {
  let step: 'none' | 'kept' | 'removing' = 'none'
  let wanted = false
  // L'entrée sous notre étape (celle de la feuille), pour reconnaître le Retour d'un seul pas.
  let under: unknown = null
  let timer: ReturnType<typeof setTimeout> | undefined
  // Les départs qui attendent que l'étape soit retirée (`settled`).
  let waiting: (() => void)[] = []

  const settle = () => {
    if (step !== 'none' || wanted) return
    const ready = waiting
    waiting = []
    for (const go of ready) go()
  }
  const removed = () => {
    clearTimeout(timer)
    step = 'none'
    sync()
  }
  const sync = () => {
    if (wanted && step === 'none') {
      under = page.history.state
      // Une copie de l'entrée de la feuille, marquée : Expo Router y lit le même identifiant, et
      // croit toujours être sur la feuille.
      const state = typeof under === 'object' && under !== null ? under : {}
      page.history.pushState({ ...state, [STEP_MARK]: true }, '', page.location.href)
      step = 'kept'
    } else if (!wanted && step === 'kept') {
      step = 'removing'
      page.history.back()
      timer = setTimeout(removed, STEP_REMOVAL_MS)
    }
    settle()
  }
  // Écouté « à la capture » (troisième argument à `true`) : sur la fenêtre, ces écouteurs passent
  // avant les autres, quel que soit l'ordre de pose ; `stopImmediatePropagation` empêche alors
  // celui d'Expo Router d'entendre le déplacement.
  const onPopState = (event: PopEvent) => {
    if (step === 'removing') {
      // Notre propre retrait : rien à montrer, rien à dire à Expo Router.
      event.stopImmediatePropagation()
      removed()
      return
    }
    if (step !== 'kept') return
    step = 'none'
    const landed = page.history.state
    // Un Retour de plusieurs pas (le menu du bouton) passe au-delà de la feuille : on ne sait pas
    // y revenir, on le laisse partir.
    const onePace =
      !isMarked(landed) && JSON.stringify(landed ?? null) === JSON.stringify(under ?? null)
    if (!wanted || !onePace) {
      wanted = false
      settle()
      return
    }
    event.stopImmediatePropagation()
    // L'étape remise aussitôt : un second Retour, même rapide, demande encore.
    sync()
    onBack()
  }
  page.addEventListener('popstate', onPopState, true)
  // Une entrée marquée laissée par une vie précédente de la page (rechargée sur l'étape) : on la
  // reprend, pour la retirer si rien n'est à garder.
  if (isMarked(page.history.state)) step = 'kept'

  return {
    want: (next: boolean) => {
      wanted = next
      sync()
    },
    /** Une promesse tenue quand aucune étape ne reste (tout de suite s'il n'y en a pas). */
    settled: () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve)
        settle()
      }),
    dispose: () => {
      clearTimeout(timer)
      page.removeEventListener('popstate', onPopState, true)
      // Une page qui disparaît n'attend plus rien.
      wanted = false
      step = 'none'
      settle()
    },
  }
}

/**
 * Hook : arrête la sortie de la page tant que `dirty` est vrai, et appelle `onHeld(action)` à la
 * place. Rend `release()`, à appeler juste avant un départ voulu (publier, « Abandonner ») : plus
 * rien n'est arrêté ensuite, et sa promesse est tenue quand l'étape de plus du web est retirée (le
 * départ l'attend, sinon il ne reculerait que jusqu'à la feuille) ; et `proceed(action)`, qui
 * relâche puis rejoue l'action arrêtée.
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
  const backStep = useRef<ReturnType<typeof createBackStep> | null>(null)

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (leaving.current || !dirtyRef.current) return
        event.preventDefault()
        heldRef.current(event.data.action)
      }),
    [navigation],
  )

  // Posé avant l'effet qui suit `dirty` : au premier affichage, l'étape existe déjà quand il tourne.
  useEffect(() => {
    const page = browserWindow()
    if (!page) return
    const keeper = createBackStep(page, () => heldRef.current(BROWSER_BACK))
    backStep.current = keeper
    return () => {
      keeper.dispose()
      backStep.current = null
    }
  }, [])

  useEffect(() => {
    backStep.current?.want(dirty && !leaving.current)
  }, [dirty])

  useEffect(() => {
    if (!dirty) return
    const page = browserWindow()
    if (!page) return
    const onUnload = (event: UnloadEvent) => {
      if (leaving.current) return
      event.preventDefault()
      // Les navigateurs plus anciens attendent aussi une valeur ici pour poser leur question.
      event.returnValue = ''
    }
    page.addEventListener('beforeunload', onUnload)
    return () => page.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const release = (): Promise<void> => {
    leaving.current = true
    const keeper = backStep.current
    if (!keeper) return Promise.resolve()
    keeper.want(false)
    return keeper.settled()
  }

  return {
    release,
    proceed: (action: HeldAction) => {
      const done = release()
      // Sur téléphone, aucune étape : l'action part tout de suite, comme avant.
      if (backStep.current) void done.then(() => navigation.dispatch(action))
      else navigation.dispatch(action)
    },
  }
}
