// Le focus à l'arrivée sur une page, sur le web (R18, scénario « Le focus à l'arrivée sur une
// page ») : au clavier ou au lecteur d'écran, une page ouverte par un lien, une ligne, une tuile, une
// carte ou un onglet donne le focus à son titre de niveau 1. Le lecteur d'écran lit ce titre, et le
// Tab suivant reprend sous lui, au lieu de repartir du haut du document. Au Retour, le focus revient
// sur ce qui avait mené là (la carte, le lien), s'il est encore dans la page.
//
// Qui appelle quoi :
// - le relais des passages (navigation/passageRelay.ts) voit chaque navigation de l'appli : il
//   appelle `rememberOrigin(kind)` juste avant le passage (l'élément qui a le focus, l'« origine »),
//   puis `focusArrival()` quand le passage est fini (`afterPassage`) ; au Retour du navigateur
//   (`popstate`), il appelle `focusAfterPopState()` ;
// - `Screen` donne son titre par `useArrivalTitle(ref, focused)` : la page affichée est connue sans
//   chercher (une page restée montée dessous ne compte pas) ;
// - la carte qui devient la page (ui/coverTransition.tsx) garde son vol, et cède le focus au module :
//   `focusArrivalTitle` ne focalise pas une seconde fois un titre déjà focalisé, et `returnFocus` est
//   le « nouvel essai borné » qui rend le focus à une carte encore cachée.
//
// Les règles (plan R18, choix 8) :
// - la première page de la visite (pré-rendue, le navigateur y pose le focus lui-même) et les
//   passages `none` (une feuille, qui garde son propre focus) ne prennent rien ;
// - l'origine est rangée **par entrée d'historique** (`history.state.id`, posé par la navigation) :
//   au Retour vers cette entrée, elle reprend le focus si elle est encore dans le document
//   (`isConnected`) ; une origine retirée (la page démontée, une carte redessinée) est oubliée, et
//   c'est le titre qui le prend ;
// - le titre est cherché sur la page arrivée : visible, hors d'une feuille ou d'une fenêtre
//   (`aria-modal`), et pas un des titres déjà visibles au départ (ceux de la page qu'on quitte, ou
//   d'un en-tête commun). S'il n'est pas encore là (page en chargement, route chargée à la demande),
//   le module l'attend, au plus `ARRIVAL_MAX` ;
// - **rien n'est pris si le focus est déjà ailleurs** que sur la page entière (`body`) ou sur
//   l'origine : un champ de recherche qui se focalise lui-même, ou le membre qui a déjà tapé Tab ;
// - le titre reçoit `tabindex="-1"` s'il ne l'a pas (focalisable sans devenir une étape de Tab),
//   puis le focus sans faire défiler la page (`preventScroll`, comme `focusWithoutScroll`). L'anneau,
//   lui, ne se montre qu'au clavier (`:focus-visible`, ui/theme/document.ts).
//
// Sur iOS et Android, rien : la pile native place déjà le lecteur d'écran sur la page qui arrive.
// Hors du navigateur (pré-rendu, tests sans page), rien non plus, et jamais d'erreur. Le web se
// reconnaît ici à sa page (`document`), pas à `Platform.OS` : l'arrivée se joue bien après le
// chargement, et `Platform` se relit à chaque appel ; la page, elle, n'existe que dans un navigateur.
import { type RefObject, useEffect } from 'react'
import { Platform } from 'react-native'
import { type Focusable, focusWithoutScroll } from './focus'
import { type PassageKind, visitStarted } from './pageTransition'
import { isHydrated } from './theme/hydration'

/** Le temps au bout duquel on n'attend plus le titre d'une page (une route qui n'arrive pas). */
export const ARRIVAL_MAX = 8000
/** L'intervalle entre deux essais pendant l'attente. */
const ARRIVAL_STEP = 50

/**
 * Le « nouvel essai borné » de la carte (R4, R14) : au retour, le fil caché sous la page (la pile
 * garde les pages quittées en `display: none`) redevient visible un peu après la navigation ; on
 * essaie de focaliser la carte tous les `REFOCUS_STEP`, pendant `REFOCUS_MAX` au plus.
 */
const REFOCUS_STEP = 50
const REFOCUS_MAX = 1000

/** Les titres de niveau 1, tels que react-native-web rend `Text heading={1}` (ou un vrai `<h1>`). */
const HEADING = 'h1, [role="heading"][aria-level="1"]'
/** Ce qui est posé par-dessus la page : une feuille, une fenêtre de confirmation. */
const OVERLAY = '[aria-modal="true"], [role="dialog"], [role="alertdialog"]'

// Le peu du navigateur que lit le module. (Les types de React Native ne décrivent pas la page web ;
// un faux `document` de test peut n'en avoir qu'une partie : tout est lu avec prudence.)
type WebElement = {
  isConnected: boolean
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  closest?: (selector: string) => unknown
  checkVisibility?: () => boolean
  getClientRects?: () => ArrayLike<unknown>
}
type WebDocument = {
  activeElement?: unknown
  body?: unknown
  documentElement?: unknown
  querySelectorAll?: (selector: string) => unknown
}

/** Le document du navigateur ; aucun pendant le pré-rendu ou dans un test sans page. */
const pageDocument = (): WebDocument | null => {
  const doc = (globalThis as { document?: unknown }).document
  return typeof doc === 'object' && doc !== null ? (doc as WebDocument) : null
}

/** Vrai pour un élément de la page (pas une vue native de test, ni un objet quelconque). */
const isElement = (value: unknown): value is WebElement =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { isConnected?: unknown }).isConnected === 'boolean' &&
  typeof (value as { getAttribute?: unknown }).getAttribute === 'function'

/** Visible : ni lui ni un ancêtre en `display: none` (une page restée montée sous la page ouverte). */
const isVisible = (element: WebElement): boolean => {
  if (!element.isConnected) return false
  if (typeof element.checkVisibility === 'function') return element.checkVisibility()
  if (typeof element.getClientRects === 'function') return element.getClientRects().length > 0
  return true
}

/** Dans une feuille ou une fenêtre posée par-dessus la page ? */
const inOverlay = (element: WebElement): boolean => Boolean(element.closest?.(OVERLAY))

/** Les titres de niveau 1 visibles hors d'une feuille, dans l'ordre du document. */
const visibleHeadings = (doc: WebDocument): WebElement[] => {
  let found: unknown[] = []
  try {
    const list = doc.querySelectorAll?.(HEADING)
    found = list ? Array.from(list as ArrayLike<unknown>) : []
  } catch {
    // Un faux document de test qui ne comprend pas ce sélecteur : aucun titre.
    found = []
  }
  return found.filter(
    (node): node is WebElement => isElement(node) && isVisible(node) && !inOverlay(node),
  )
}

/** La clé de l'entrée d'historique affichée : son `id` (navigation), sinon son adresse. */
const entryKey = (): string | null => {
  const scope = globalThis as {
    history?: { state?: unknown }
    location?: { pathname?: unknown }
  }
  const state = scope.history?.state as { id?: unknown } | null | undefined
  if (state && (typeof state.id === 'string' || typeof state.id === 'number')) {
    return String(state.id)
  }
  const path = scope.location?.pathname
  return typeof path === 'string' ? path : null
}

/** Le passage en préparation (entre `rememberOrigin` et `focusArrival`) ou en cours d'arrivée. */
type Arrival = {
  /** L'élément qui avait le focus au départ : son focus ne compte pas comme « déjà posé ». */
  origin: unknown
  /** Les titres visibles au départ : ceux de la page qu'on quitte, jamais visés. */
  stale: Set<unknown>
  /** Un Retour : l'origine rangée pour l'entrée arrivée reprend le focus. */
  back: boolean
}

// L'état du module, pour toute la visite.
/** L'origine de chaque entrée d'historique : l'élément qui avait le focus quand on l'a quittée. */
const origins = new Map<string, unknown>()
/** Les titres que donnent les `Screen` affichés (`useArrivalTitle`), le dernier monté à la fin. */
const titles: RefObject<Focusable | null>[] = []
/** Le passage retenu par `rememberOrigin`, que `focusArrival` fera arriver. */
let prepared: Arrival | null = null
/** L'arrivée en cours (ses essais), et la dernière jouée (lue par `focusArrivalTitle`). */
let pending: { arrival: Arrival; timer: ReturnType<typeof setTimeout> | null; at: number } | null =
  null
let last: Arrival | null = null

/** Vrai sur le web, la page hydratée et la première page de la visite posée. */
const ready = (): boolean => pageDocument() !== null && isHydrated() && visitStarted()

/** Le focus, sans faire défiler la page jusqu'à l'élément (comme `focusWithoutScroll`). */
const focusQuietly = (node: unknown) => {
  const focus = (node as { focus?: unknown }).focus
  if (typeof focus === 'function') focus.call(node, { preventScroll: true })
}

/**
 * Le focus est-il libre ? Oui sur la page entière (`body`), sur l'origine du passage, ou sur un
 * élément qui n'est plus visible (la page qu'on quitte). Ailleurs, quelqu'un l'a posé : la page
 * arrivée elle-même (un champ en `autoFocus`), ou le membre (Tab) ; on ne le lui reprend pas.
 */
const isFree = (doc: WebDocument, active: unknown, arrival: Arrival | null): boolean => {
  if (active === null || active === undefined) return true
  if (active === doc.body || active === doc.documentElement) return true
  if (arrival && active === arrival.origin) return true
  return isElement(active) && !isVisible(active)
}

/** Ce que l'arrivée vise : l'origine de l'entrée (au Retour), sinon le titre de la page arrivée. */
const targetOf = (doc: WebDocument, arrival: Arrival): unknown => {
  if (arrival.back) {
    const key = entryKey()
    const origin = key === null ? undefined : origins.get(key)
    // Jamais l'élément d'où l'on part (l'adresse n'a pas encore changé), ni une origine retirée du
    // document : celle-là n'est même pas essayée.
    if (origin !== undefined && origin !== arrival.origin) {
      if (!isElement(origin)) return origin
      if (origin.isConnected) return isVisible(origin) ? origin : null
    }
  }
  // Le titre donné par le `Screen` affiché, du plus récent au plus ancien.
  for (let i = titles.length - 1; i >= 0; i--) {
    const node = titles[i]?.current
    if (!node || arrival.stale.has(node)) continue
    if (!isElement(node)) return node
    if (isVisible(node) && !inOverlay(node)) return node
  }
  // Sinon, le premier titre de niveau 1 visible de la page (HiveScreen, MemberHeader, ToolHeader,
  // une page d'état…), hors de ceux déjà là au départ.
  return visibleHeadings(doc).find((heading) => !arrival.stale.has(heading)) ?? null
}

/** Rend un titre focalisable sans en faire une étape de Tab (`tabindex="-1"`), s'il ne l'est pas. */
const makeFocusable = (node: unknown) => {
  if (isElement(node) && node.getAttribute('tabindex') === null) node.setAttribute('tabindex', '-1')
}

const stopPending = () => {
  if (pending?.timer) clearTimeout(pending.timer)
  pending = null
}

/** Un essai : poser le focus sur la cible si elle est là, sinon réessayer un peu plus tard. */
const attempt = () => {
  const current = pending
  if (!current) return
  current.timer = null
  const doc = pageDocument()
  if (!doc) {
    stopPending()
    return
  }
  const { arrival } = current
  const active = doc.activeElement
  // Quelqu'un a posé le focus pendant l'attente (la page, le membre) : rien n'est repris.
  if (!isFree(doc, active, arrival)) {
    stopPending()
    return
  }
  const target = targetOf(doc, arrival)
  if (target) {
    if (active === target) {
      stopPending()
      return
    }
    if (target !== origins.get(entryKey() ?? '')) makeFocusable(target)
    focusQuietly(target)
    // Pris (le navigateur le dit par `activeElement`), ou une vue hors du navigateur : un seul essai.
    if (!isElement(target) || doc.activeElement === target) {
      stopPending()
      return
    }
  }
  if (Date.now() - current.at >= ARRIVAL_MAX) {
    stopPending()
    return
  }
  current.timer = setTimeout(attempt, ARRIVAL_STEP)
}

/** Lance l'arrivée de ce passage (une seule à la fois : la plus récente l'emporte). */
const start = (arrival: Arrival) => {
  stopPending()
  last = arrival
  pending = { arrival, timer: null, at: Date.now() }
  attempt()
}

/** Ce qui a le focus maintenant, et les titres visibles : la photo du départ d'un passage. */
const snapshot = (doc: WebDocument, back: boolean): Arrival => {
  const active = doc.activeElement
  return {
    origin: active === doc.body ? null : (active ?? null),
    stale: new Set(visibleHeadings(doc)),
    back,
  }
}

/**
 * Retient l'origine d'un passage, juste avant qu'il parte (le relais des passages) : l'élément qui
 * a le focus, rangé pour l'entrée d'historique qu'on quitte. `kind` dit si c'est un Retour (l'origine
 * de l'entrée arrivée reprendra le focus) ; un passage `none` ne retient rien.
 */
export const rememberOrigin = (kind: PassageKind = 'deeper'): void => {
  prepared = null
  if (kind === 'none' || !ready()) return
  const doc = pageDocument()
  if (!doc) return
  // Les origines retirées du document (leur page démontée) sont oubliées.
  for (const [key, node] of origins) {
    if (isElement(node) && !node.isConnected) origins.delete(key)
  }
  const arrival = snapshot(doc, kind === 'back')
  const key = entryKey()
  if (key !== null) {
    if (isElement(arrival.origin)) origins.set(key, arrival.origin)
    else origins.delete(key)
  }
  prepared = arrival
}

/**
 * Après le passage (`afterPassage`) : donne le focus à la page arrivée, si `rememberOrigin` a
 * retenu ce passage. Au Retour, à l'origine de l'entrée si elle est encore là ; sinon au titre de
 * niveau 1 de la page, attendu s'il n'est pas encore là.
 */
export const focusArrival = (): void => {
  const arrival = prepared
  prepared = null
  if (!arrival) return
  start(arrival)
}

/**
 * Le Retour (ou l'Avance) du navigateur (`popstate`, par le relais) : la page d'une autre entrée
 * revient. Notre propre Retour, déjà retenu par `rememberOrigin`, n'en ajoute pas un second.
 */
export const focusAfterPopState = (): void => {
  if (prepared || !ready()) return
  // Le `popstate` qui suit notre propre Retour, quand le passage est déjà fini (sans l'API des
  // passages, il finit tout de suite) : l'arrivée en cours le couvre déjà.
  if (pending?.arrival.back && Date.now() - pending.at < REFOCUS_MAX) return
  const doc = pageDocument()
  if (!doc) return
  // L'adresse a déjà changé : rien n'est rangé pour l'entrée qu'on quitte.
  start(snapshot(doc, true))
}

/**
 * Le titre d'un `Screen` affiché, donné au module : c'est lui qui prend le focus à l'arrivée (une
 * page restée montée dessous, `focused` faux, ne le donne pas).
 */
export function useArrivalTitle(ref: RefObject<Focusable | null>, focused: boolean): void {
  useEffect(() => {
    // Sur téléphone aussi (rien n'y lit cette liste) : un `Screen` n'a pas à savoir où il est.
    if (!focused) return
    titles.push(ref)
    return () => {
      const at = titles.lastIndexOf(ref)
      if (at >= 0) titles.splice(at, 1)
    }
  }, [ref, focused])
}

/**
 * La carte qui devient la page (ui/coverTransition.tsx) donne le titre du projet à la fin de son
 * vol. Le module l'a sans doute déjà focalisé (`focusArrival`) : rien de plus. Sinon, il le
 * focalise, sauf si le focus a été posé ailleurs entre-temps.
 */
export const focusArrivalTitle = (node: unknown): void => {
  if (Platform.OS !== 'web' || !node) return
  const doc = pageDocument()
  if (doc) {
    const active = doc.activeElement
    if (active === node || !isFree(doc, active, last)) return
  }
  stopPending()
  makeFocusable(node)
  focusWithoutScroll(node)
}

/**
 * Rend le focus à `link` (le lien d'une carte), sans défilement. Un élément caché ne prend pas le
 * focus : on réessaie jusqu'à ce qu'il l'ait (le navigateur le dit par `document.activeElement`), ou
 * que le délai passe. Hors du navigateur, un seul essai.
 *
 * `shown` (R14) est appelé une fois, quand la carte est de nouveau à l'écran : son lien a pris le
 * focus (un élément caché ne le prend pas), le membre a déjà mis le focus ailleurs, ou le délai
 * est passé. Le rebond attend ce moment : joué sous une page encore cachée, il ne se verrait pas.
 */
export const returnFocus = (link: unknown, shown?: () => void): void => {
  if (Platform.OS !== 'web') return
  if (!link) {
    shown?.()
    return
  }
  const started = Date.now()
  const doc = pageDocument()
  // Le focus au moment du retour (le bouton « Retour ») : s'il part ailleurs que sur la page entière
  // pendant l'attente (le membre a déjà tapé Tab), on ne le lui reprend pas.
  const before = doc?.activeElement ?? null
  // Déjà rendu (par l'arrivée du module) : un second focus ne servirait à rien.
  if (doc && before === link) {
    shown?.()
    return
  }
  const tryOnce = () => {
    if (doc) {
      const now = doc.activeElement
      if (now !== before && now !== doc.body && now !== null && now !== undefined) {
        shown?.()
        return
      }
    }
    focusWithoutScroll(link)
    const done = !doc || doc.activeElement === link
    if (!done && Date.now() - started < REFOCUS_MAX) setTimeout(tryOnce, REFOCUS_STEP)
    else shown?.()
  }
  tryOnce()
}

/** Remet l'état du module à zéro (entre deux tests) : rien n'attend plus, rien n'est retenu. */
export const resetArrivalFocus = (): void => {
  stopPending()
  prepared = null
  last = null
  origins.clear()
  titles.length = 0
}
