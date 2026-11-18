// Le moteur des passages de page sur le web (R17, scénario « Les passages de page ») : il entoure
// chaque navigation de l'appli (le relais navigation/passageRelay.ts la lui confie) d'un passage
// visible, sans jamais la retenir plus de quelques centaines de millisecondes.
//
// **Les View Transitions.** Les navigateurs récents savent animer un changement de page eux-mêmes :
// `document.startViewTransition(rappel)` photographie la page telle qu'elle est (l'« ancienne »
// image), joue le rappel, qui change la page, attend la promesse qu'il rend, photographie la page
// nouvelle, puis anime de l'une à l'autre. Pendant l'animation, la page est recouverte d'un arbre
// de « pseudo-éléments » que le CSS peut viser : `::view-transition-old(nom)` (l'ancienne image),
// `::view-transition-new(nom)` (la nouvelle), regroupés par `::view-transition-group(nom)`. Un
// élément reçoit son propre nom par la propriété CSS `view-transition-name` : il est photographié à
// part (la barre du haut, la photo d'une carte). Les règles de ces animations sont écrites depuis
// les jetons, dans ui/theme/document.ts. L'objet rendu par `startViewTransition` a trois promesses :
// `updateCallbackDone` (le rappel a fini), `ready` (l'animation commence) et `finished` (elle est
// finie, ou abandonnée).
//
// **Sans l'API** (un navigateur plus ancien), la page qui arrive fond d'elle-même (ui/ScreenFade.tsx,
// qui lit `arrivalStyle()`) : en montant de 12 points vers une page plus profonde, sur place entre
// deux onglets, et pas du tout au retour (la page d'avant est déjà prête).
//
// Les règles du plan (R17) :
// - aucun passage avant l'hydratation, ni pour la première page de la visite (elle est pré-rendue),
//   ni vers une feuille ou depuis elle (`none`) : la navigation part tout de suite ;
// - la navigation (`mutate`) part une seule fois, quoi qu'il arrive au passage (relecture de
//   sécurité S2) : un passage qui échoue ou que le navigateur refuse ne bloque rien ;
// - le navigateur attend la page qui arrive (`passageArrived`, ui/screenFocus.ts) 250 ms au plus,
//   pour ne pas photographier une page vide, sans retenir le membre ;
// - une seconde navigation pendant un passage attend sa fin, sans seconde animation (jamais deux
//   `startViewTransition` à la fois) ;
// - le Retour du navigateur (`popstate`) n'ajoute rien à l'animation du navigateur : la page d'avant
//   est là tout de suite. Le `popstate` qui suit notre propre retour (`history.go(-1)` d'Expo
//   Router) n'en est pas un.
import type { ArrivalStyle, PassageKind, SharedCover } from './pageTransition'
import { isHydrated } from './theme/hydration'

export type { ArrivalStyle, PassageKind, SharedCover } from './pageTransition'

/** Le peu d'un style d'élément que lit le moteur (celui du navigateur, ou un faux de test). */
type PassageStyle = {
  setProperty?: (name: string, value: string) => void
  removeProperty?: (name: string) => unknown
  viewTransitionName?: string
}

/** Un élément de la page, comme le moteur le voit : son style et sa place dans la fenêtre. */
type PassageElement = {
  style: PassageStyle
  getBoundingClientRect: () => { top: number; bottom: number; height: number }
}

/** Ce que rend `startViewTransition` : les trois promesses du passage, et de quoi l'abréger. */
type ViewTransition = {
  updateCallbackDone?: Promise<unknown>
  ready?: Promise<unknown>
  finished?: Promise<unknown>
  skipTransition?: () => void
}

type MediaList = { matches: boolean }

/**
 * Le peu du `document` que lit le moteur. Les types de React Native ignorent le navigateur ; les
 * tests en donnent un faux (`setPassageDocument`), qui a l'API ou non.
 */
export type PassageDocument = {
  documentElement: {
    setAttribute: (name: string, value: string) => void
    removeAttribute: (name: string) => void
  }
  querySelector: (selector: string) => unknown
  querySelectorAll?: (selector: string) => ArrayLike<unknown>
  defaultView?: {
    matchMedia?: (query: string) => MediaList
    innerHeight?: number
  } | null
  startViewTransition?: (update: () => Promise<void>) => ViewTransition
}

/** L'attribut posé sur `<html>` pendant un passage : sa sorte, que lisent les règles CSS. */
export const PASSAGE_ATTRIBUTE = 'data-passage'

/** Le nom partagé par la photo de la carte et la couverture du projet pendant leur vol. */
const COVER_NAME = 'wg-cover'

/**
 * Le temps que le navigateur attend la page qui arrive avant de la photographier (le plan : 250 ms
 * au plus). Au-delà, il anime ce qu'il a : le membre n'est jamais retenu.
 */
export const PASSAGE_WAIT_MAX = 250

/**
 * Le filet : un passage dont le navigateur ne dit jamais la fin (`finished`) est abrégé au bout de
 * ce temps. Sinon, les navigations suivantes attendraient pour toujours (S2).
 */
const PASSAGE_NET_MS = 2000

/** Combien de temps une annonce (`announcePassage`) ou un `popstate` attendu restent valables. */
const NOTE_MS = 1000

/** La part de la photo d'une carte qui doit se voir, sous la barre du haut, pour qu'elle vole. */
const VISIBLE_SHARE = 0.75

let injected: PassageDocument | null = null

/** Le document du navigateur, ou celui des tests ; aucun pendant le pré-rendu. */
const currentDocument = (): PassageDocument | null => {
  if (injected) return injected
  if (typeof document === 'undefined') return null
  return document as unknown as PassageDocument
}

/** Pour les tests : le faux document sur lequel jouer les passages (`null` : le vrai). */
export const setPassageDocument = (doc: PassageDocument | null): void => {
  injected = doc
}

// L'état de la visite.
/** Une page est-elle déjà arrivée ? La première de la visite n'a pas de passage. */
let firstPageShown = false
/** Ce que doit faire la page qui arrive (lu par ScreenFade). La première page : rien. */
let style: ArrivalStyle = 'none'
/** L'annonce de la prochaine navigation, et jusqu'à quand elle vaut. */
let hint: { kind: PassageKind; until: number } | null = null
/** Le `popstate` attendu après notre propre retour, jusqu'à quand. */
let expectedPopUntil = 0
/** La photo confiée pour le prochain passage. */
let pendingCover: SharedCover | null = null

/** Le passage en cours : de quoi dire que la page est arrivée. */
type Passage = { arrived: () => void }
let current: Passage | null = null
/** Les navigations arrivées pendant le passage : elles partent à sa fin, sans animation. */
const waiting: (() => void)[] = []
/** Ce qui attend la fin du passage en cours (le focus du titre d'un projet, morceau C). */
const afterEnd: (() => void)[] = []

const noop = () => {}

/** Vrai si la personne a demandé moins de mouvement à son appareil. */
const reducesMotion = (doc: PassageDocument): boolean =>
  doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Ce que fait la page qui arrive sans l'API : fondre en montant, sur place, ou rien. */
const fallbackStyle = (kind: PassageKind): ArrivalStyle =>
  kind === 'deeper' ? 'fade-up' : kind === 'sibling' ? 'fade' : 'none'

const isElement = (value: unknown): value is PassageElement =>
  typeof value === 'object' &&
  value !== null &&
  'style' in value &&
  typeof (value as { getBoundingClientRect?: unknown }).getBoundingClientRect === 'function'

const nameElement = (element: PassageElement, name: string) => {
  if (element.style.setProperty) element.style.setProperty('view-transition-name', name)
  else element.style.viewTransitionName = name
}

const unnameElement = (element: PassageElement) => {
  if (element.style.removeProperty) element.style.removeProperty('view-transition-name')
  else element.style.viewTransitionName = ''
}

/**
 * Le bas de la barre du haut (`data-passage-bar`, ui/ScreenTopBar.tsx), dans la fenêtre : ce
 * qu'elle couvre ne compte pas comme visible. 0 sans barre (ou dans un faux document de test).
 */
const barBottom = (doc: PassageDocument, height: number): number => {
  const bars = doc.querySelectorAll ? Array.from(doc.querySelectorAll('[data-passage-bar]')) : []
  let bottom = 0
  for (const bar of bars) {
    if (!isElement(bar)) continue
    const rect = bar.getBoundingClientRect()
    // Une barre cachée (une page restée montée sous la page ouverte) mesure 0 ; une barre qui a
    // défilé hors de la fenêtre ne couvre rien.
    if (rect.height > 0 && rect.bottom > 0) bottom = Math.max(bottom, Math.min(rect.bottom, height))
  }
  return bottom
}

/** La part de cet élément qui se voit entre le bas de la barre du haut et le bas de la fenêtre. */
const visibleShare = (doc: PassageDocument, element: PassageElement, underBar: boolean): number => {
  const rect = element.getBoundingClientRect()
  if (rect.height <= 0) return 0
  const height = doc.defaultView?.innerHeight ?? 0
  const top = underBar ? barBottom(doc, height) : 0
  const seen = Math.min(rect.bottom, height) - Math.max(rect.top, top)
  return Math.max(0, seen) / rect.height
}

/** L'élément à l'arrivée de la photo : la carte d'origine (au retour), ou la couverture du projet. */
const coverTarget = (doc: PassageDocument, cover: SharedCover): PassageElement | null => {
  if (cover.to !== undefined) {
    return isElement(cover.to) && visibleShare(doc, cover.to, true) >= VISIBLE_SHARE
      ? cover.to
      : null
  }
  // L'identifiant vient de nos données (un projet) ; un guillemet casserait le sélecteur.
  if (/["\\]/.test(cover.id)) return null
  const found = doc.querySelector(`[data-cover-target="${cover.id}"]`)
  return isElement(found) && visibleShare(doc, found, false) > 0 ? found : null
}

/** Lance `task` sans qu'une erreur arrête ce qui suit ; l'erreur ressort ensuite, à part. */
const runSafely = (task: () => void) => {
  try {
    task()
  } catch (error) {
    setTimeout(() => {
      throw error
    }, 0)
  }
}

/** Joue la navigation `mutate`, entourée du passage de cette sorte. */
export const runPassage = (kind: PassageKind, mutate: () => void): void => {
  // Un passage en cours : la navigation attend sa fin, sans seconde animation.
  if (current) {
    waiting.push(mutate)
    return
  }
  const cover = pendingCover
  pendingCover = null
  const doc = currentDocument()
  // Pas de passage : une feuille, la même page, un préchargement ; avant l'hydratation (React
  // vérifie encore la page pré-rendue) ; la première page de la visite.
  if (kind === 'none' || !doc || !isHydrated() || !firstPageShown) {
    style = 'none'
    mutate()
    return
  }
  const start = doc.startViewTransition
  if (typeof start !== 'function') {
    style = fallbackStyle(kind)
    mutate()
    return
  }

  // La navigation, une seule fois, quoi qu'il arrive au passage (S2).
  let sent = false
  const send = () => {
    if (sent) return
    sent = true
    mutate()
  }
  // L'arrivée de la page, ou le délai : le navigateur la photographie alors.
  let arrive: () => void = noop
  const arrival = new Promise<void>((resolve) => {
    arrive = resolve
  })
  const wait = setTimeout(arrive, PASSAGE_WAIT_MAX)
  const passage: Passage = { arrived: arrive }
  current = passage
  style = 'vt'

  // La photo de la carte vole seulement si elle se voit bien, et jamais sous « Réduire les
  // animations ». Son nom est posé avant l'appel : le navigateur la photographie avec ce nom.
  const from =
    cover &&
    !reducesMotion(doc) &&
    isElement(cover.from) &&
    visibleShare(doc, cover.from, true) >= VISIBLE_SHARE
      ? cover.from
      : null
  let landing: PassageElement | null = null
  if (from) nameElement(from, COVER_NAME)
  doc.documentElement.setAttribute(PASSAGE_ATTRIBUTE, kind)

  let net: ReturnType<typeof setTimeout> | undefined
  let transition: ViewTransition | undefined
  let ended = false
  // La fin, dans tous les cas (fini, abandonné, refusé) : l'attribut et les noms retirés, la
  // navigation envoyée si le navigateur ne l'a pas fait, puis les navigations en attente, sans
  // animation.
  // L'ordre compte (S2) : le passage est d'abord déclaré fini, puis la navigation part. Une
  // navigation qui lève une erreur (ici, quand le navigateur a refusé le passage ou ne l'a jamais
  // joué) laissait sinon `data-passage` sur <html> et le moteur occupé pour toute la visite : `ended`
  // empêchait le filet de recommencer. Le `finally` (le bloc joué que `try` réussisse ou lève)
  // envoie quand même les navigations en attente ; l'erreur, elle, remonte ensuite comme sans passage.
  const end = () => {
    if (ended) return
    ended = true
    clearTimeout(wait)
    clearTimeout(net)
    doc.documentElement.removeAttribute(PASSAGE_ATTRIBUTE)
    if (current === passage) current = null
    const named = [from, landing]
    for (const element of named) if (element) runSafely(() => unnameElement(element))
    try {
      send()
    } finally {
      const next = waiting.splice(0)
      if (next.length > 0) style = 'none'
      for (const task of next) runSafely(task)
      for (const task of afterEnd.splice(0)) runSafely(task)
    }
  }

  try {
    transition = start.call(doc, () => {
      send()
      return arrival.then(() => {
        clearTimeout(wait)
        // La page est là : la photo passe de la carte à la couverture du projet (ou, au retour, de
        // la couverture à la carte), si elle se voit.
        if (!from || !cover) return
        unnameElement(from)
        landing = coverTarget(doc, cover)
        if (landing) nameElement(landing, COVER_NAME)
      })
    })
  } catch {
    // Le navigateur refuse (un autre passage, une page cachée) : la navigation part quand même,
    // avec le fondu de repli.
    style = fallbackStyle(kind)
    end()
    return
  }
  // Une promesse rejetée sans personne pour l'écouter s'afficherait en erreur : un passage
  // abandonné (une nouvelle page trop vite, un onglet caché) n'en est pas une.
  transition?.ready?.catch(noop)
  transition?.updateCallbackDone?.catch(noop)
  const finished = transition?.finished ?? Promise.resolve()
  finished.then(end, end)
  net = setTimeout(() => {
    transition?.skipTransition?.()
    end()
  }, PASSAGE_NET_MS)
}

/** Dit la sorte de la prochaine navigation, quand l'action seule ne suffit pas à la deviner. */
export const announcePassage = (kind: PassageKind): void => {
  hint = { kind, until: Date.now() + NOTE_MS }
}

/** L'annonce en attente, une seule fois (lue par le relais à la navigation suivante). */
export const takeHint = (): PassageKind | null => {
  const taken = hint
  hint = null
  return taken && Date.now() <= taken.until ? taken.kind : null
}

/** Appelée quand une page arrive (ui/screenFocus.ts) : le navigateur peut la photographier. */
export const passageArrived = (): void => {
  firstPageShown = true
  current?.arrived()
}

/** Ce que doit faire la page qui arrive (ui/ScreenFade.tsx). */
export const arrivalStyle = (): ArrivalStyle => style

/** Confie la photo d'une carte (ou de la couverture, au retour) au prochain passage. */
export const shareCover = (cover: SharedCover): void => {
  pendingCover = cover
}

/** Notre propre retour part : le `popstate` qui va suivre n'est pas le Retour du navigateur. */
export const expectPopState = (): void => {
  expectedPopUntil = Date.now() + NOTE_MS
}

/**
 * Un `popstate` (navigation/passageRelay.ts) : s'il n'est pas attendu, c'est le Retour du
 * navigateur, qui anime lui-même (ou rien) ; la page d'avant est là tout de suite.
 */
export const notePopState = (): void => {
  if (Date.now() <= expectedPopUntil) {
    expectedPopUntil = 0
    return
  }
  style = 'none'
}

/** Vrai pendant un passage (le relais ignore alors un second appui vers la même page). */
export const passageBusy = (): boolean => current !== null

/**
 * Vrai si le prochain passage sera animé par le navigateur : l'API existe, la page est hydratée
 * et la première page posée (la carte qui devient la page, ui/coverTransition.tsx).
 */
export const passagesAnimated = (): boolean => {
  const doc = currentDocument()
  return typeof doc?.startViewTransition === 'function' && isHydrated() && firstPageShown
}

/** Joue `task` à la fin du passage en cours, ou tout de suite s'il n'y en a pas. */
export const afterPassage = (task: () => void): void => {
  if (current) afterEnd.push(task)
  else task()
}
