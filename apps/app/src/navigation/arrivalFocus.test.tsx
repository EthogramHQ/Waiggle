// Tests du focus à l'arrivée sur une page (R18, scénario « Le focus à l'arrivée sur une page ») : au
// clavier ou au lecteur d'écran, une page ouverte par un lien, une ligne, une tuile, une carte ou un
// onglet donne le focus à son titre (le lecteur d'écran le lit, le Tab suivant reprend sous lui) ;
// au Retour, le focus revient sur ce qui avait mené là. La première page de la visite et les
// feuilles gardent le comportement du navigateur.
//
// Le module testé, `navigation/arrivalFocus.ts`, a quatre fonctions (API fixée au plan) :
// `rememberOrigin()` (l'élément actif, retenu avant le passage), `focusArrival()` (après le passage,
// le titre de niveau 1 de la page arrivée), `useArrivalTitle(ref, focused)` (le titre d'un `Screen`,
// voir ui/Screen.arrivalFocus.test.tsx) et `resetArrivalFocus()` (l'état remis à zéro).
//
// **La fausse page web.** Jest n'a pas de navigateur : ce fichier en prête un petit, fidèle sur ce
// qui compte ici (voir `createPage`) :
// - des éléments rangés en arbre, avec leurs attributs, `querySelector(All)`, `closest`, `matches`
//   (sélecteurs : balise, `#id`, `.classe`, `[attr]`, `[attr="v"]`, `:not(…)`, `:focus`, descendant,
//   `>` ; un autre sélecteur lève une erreur qui le nomme), `contains`, `isConnected` ;
// - un titre de `Text heading={1}` rendu comme react-native-web le rend : `<h1 role="heading"
//   aria-level="1">` ;
// - `focus()` ne prend que sur un élément du document, visible, et focalisable (lien, bouton, champ,
//   ou `tabindex` posé) : un titre sans `tabindex` ne le prend pas, comme dans un navigateur ;
// - une page cachée (`display: none`, l'écran resté monté sous la page ouverte) mesure 0, n'a aucun
//   rectangle et rend le focus à `body` ;
// - `MutationObserver`, `getComputedStyle`, `requestAnimationFrame` (faux minuteurs) existent.
//
// **La fausse navigation.** Les actions viennent du vrai `router` d'Expo Router (relecture de
// sécurité de R17, S1) et passent par le vrai relais (navigation/passageRelay.ts) et le vrai moteur
// des passages (ui/pageTransition.web.ts, avec l'API View Transitions). `routingQueue.add`, au bout,
// est remplacée par une petite appli (`createApp`) qui change la page affichée, l'adresse et
// `history.state`, comme le ferait Expo Router.
import { act, render } from '@testing-library/react-native'
import type { RefObject } from 'react'
import { Platform, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { CoverArrival, CoverTransitionProvider, useCoverSource } from '../ui/coverTransition'
import type { Focusable } from '../ui/focus'
import * as topEngine from '../ui/pageTransition'
import { markHydrated } from '../ui/theme/hydration'
import * as topArrival from './arrivalFocus'

jest.mock('../ui/pageTransition', () => jest.requireActual('../ui/pageTransition.web'))
jest.mock('react-native-reanimated', () => {
  const actual =
    jest.requireActual<typeof import('react-native-reanimated')>('react-native-reanimated')
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
  }
})

type Engine = typeof import('../ui/pageTransition.web')
type Arrival = typeof import('./arrivalFocus')
type Queue = typeof import('expo-router/build/global-state/routingQueue').routingQueue
type Router = typeof import('expo-router/build/global-state/router').router

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

/** Le temps passe (faux minuteurs), les promesses suivent. */
const wait = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms)
  await flush()
}

// ---------------------------------------------------------------------------------------------
// La fausse page web
// ---------------------------------------------------------------------------------------------

type Attr = { name: string; op: string | undefined; value: string | undefined }
type Compound = {
  tag: string | undefined
  id: string | undefined
  classes: string[]
  attrs: Attr[]
  nots: Complex[][]
  pseudos: string[]
}
type Step = { compound: Compound; combinator: ' ' | '>' | null }
type Complex = Step[]

const unsupported = (selector: string): never => {
  throw new Error(`fausse page : sélecteur non compris « ${selector} »`)
}

/** Coupe au niveau supérieur (hors crochets, parenthèses et guillemets). */
const splitTop = (text: string, separator: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (depth === 0 && c === separator) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

const parseCompound = (text: string, whole: string): Compound => {
  const compound: Compound = {
    tag: undefined,
    id: undefined,
    classes: [],
    attrs: [],
    nots: [],
    pseudos: [],
  }
  let rest = text
  const eat = (pattern: RegExp): RegExpExecArray | null => {
    const found = pattern.exec(rest)
    if (found) rest = rest.slice(found[0].length)
    return found
  }
  const tag = eat(/^(\*|[a-zA-Z][\w-]*)/)
  if (tag && tag[1] !== '*') compound.tag = tag[1]?.toLowerCase()
  while (rest.length > 0) {
    const id = eat(/^#([\w-]+)/)
    if (id) {
      compound.id = id[1]
      continue
    }
    const cls = eat(/^\.([\w-]+)/)
    if (cls) {
      compound.classes.push(cls[1] ?? '')
      continue
    }
    const attr = eat(/^\[\s*([\w-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]/)
    if (attr) {
      compound.attrs.push({
        name: (attr[1] ?? '').toLowerCase(),
        op: attr[2],
        value: attr[3] ?? attr[4] ?? attr[5],
      })
      continue
    }
    if (rest.startsWith(':not(')) {
      let depth = 0
      let end = -1
      for (let i = 4; i < rest.length; i++) {
        if (rest[i] === '(') depth++
        else if (rest[i] === ')') {
          depth--
          if (depth === 0) {
            end = i
            break
          }
        }
      }
      if (end < 0) unsupported(whole)
      compound.nots.push(parseList(rest.slice(5, end)))
      rest = rest.slice(end + 1)
      continue
    }
    const pseudo = eat(/^:(focus-visible|focus-within|focus)/)
    if (pseudo) {
      compound.pseudos.push(pseudo[1] ?? '')
      continue
    }
    unsupported(whole)
  }
  return compound
}

const parseComplex = (source: string): Complex => {
  const steps: Step[] = []
  const text = source.trim()
  let pending: ' ' | '>' | null = null
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === ' ') {
      if (steps.length > 0 && pending === null) pending = ' '
      i++
      continue
    }
    if (c === '>') {
      pending = '>'
      i++
      continue
    }
    if (c === '+' || c === '~') unsupported(source)
    let j = i
    let depth = 0
    let quote: string | null = null
    while (j < text.length) {
      const d = text[j]
      if (quote) {
        if (d === quote) quote = null
      } else if (d === '"' || d === "'") quote = d
      else if (d === '[' || d === '(') depth++
      else if (d === ']' || d === ')') depth--
      else if (depth === 0 && (d === ' ' || d === '>' || d === '+' || d === '~')) break
      j++
    }
    steps.push({
      compound: parseCompound(text.slice(i, j), source),
      combinator: steps.length > 0 ? (pending ?? ' ') : null,
    })
    pending = null
    i = j
  }
  return steps
}

const parseList = (text: string): Complex[] => splitTop(text, ',').map(parseComplex)

/** Les balises que Tab atteint et qui prennent le focus d'elles-mêmes. */
const NATIVE_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea'])

type Listener = (event: { type: string; target: unknown }) => void
type Rect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
  x: number
  y: number
}
const NO_RECT: Rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 }

/** Un élément de la fausse page. */
class FakeElement {
  readonly nodeType = 1
  readonly localName: string
  readonly tagName: string
  readonly nodeName: string
  parentElement: FakeElement | null = null
  readonly children: FakeElement[] = []
  readonly attributes = new Map<string, string>()
  readonly style: Record<string, unknown> & {
    setProperty: (name: string, value: string) => void
    removeProperty: (name: string) => void
  }
  /** Le texte propre de l'élément (sans celui de ses enfants). */
  text = ''
  /** Chaque appel de `focus()`, réussi ou non. */
  readonly focus: jest.Mock<void, [{ preventScroll?: boolean }?]>
  readonly page: FakePage

  constructor(page: FakePage, tag: string) {
    this.page = page
    this.localName = tag.toLowerCase()
    this.tagName = tag.toUpperCase()
    this.nodeName = this.tagName
    const style: Record<string, unknown> = {}
    this.style = Object.assign(style, {
      setProperty: (name: string, value: string) => {
        style[name] = value
      },
      removeProperty: (name: string) => {
        delete style[name]
      },
    })
    this.focus = jest.fn(() => page.focusOn(this))
  }

  get parentNode() {
    return this.parentElement
  }
  get childNodes() {
    return this.children
  }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  get ownerDocument() {
    return this.page.document
  }
  get id() {
    return this.getAttribute('id') ?? ''
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('')
  }
  get innerText() {
    return this.textContent
  }
  get isConnected(): boolean {
    let at: FakeElement | null = this
    while (at) {
      if (at === this.page.html) return true
      at = at.parentElement
    }
    return false
  }
  get tabIndex(): number {
    const value = this.getAttribute('tabindex')
    if (value !== null) return Number(value)
    return this.nativelyFocusable() ? 0 : -1
  }
  set tabIndex(value: number) {
    this.setAttribute('tabindex', String(value))
  }

  nativelyFocusable(): boolean {
    if (this.localName === 'a') return this.hasAttribute('href')
    return NATIVE_FOCUSABLE.has(this.localName) && !this.hasAttribute('disabled')
  }
  focusable(): boolean {
    return this.nativelyFocusable() || this.hasAttribute('tabindex')
  }
  /** Visible : dans le document, sans ancêtre caché (`display: none`, `hidden`). */
  visible(): boolean {
    if (!this.isConnected) return false
    let at: FakeElement | null = this
    while (at) {
      if (at.style.display === 'none' || at.hasAttribute('hidden')) return false
      at = at.parentElement
    }
    return true
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name.toLowerCase())
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name.toLowerCase(), String(value))
    this.page.changed()
  }
  removeAttribute(name: string) {
    this.attributes.delete(name.toLowerCase())
    this.page.changed()
  }
  toggleAttribute(name: string, force?: boolean) {
    const on = force ?? !this.hasAttribute(name)
    if (on) this.setAttribute(name, '')
    else this.removeAttribute(name)
    return on
  }

  getBoundingClientRect(): Rect {
    if (!this.visible()) return NO_RECT
    return { top: 120, bottom: 160, left: 16, right: 374, width: 358, height: 40, x: 16, y: 120 }
  }
  getClientRects(): Rect[] {
    return this.visible() ? [this.getBoundingClientRect()] : []
  }
  checkVisibility(): boolean {
    return this.visible()
  }
  get offsetParent() {
    return this.visible() ? (this.parentElement ?? this.page.body) : null
  }
  get offsetWidth() {
    return this.getBoundingClientRect().width
  }
  get offsetHeight() {
    return this.getBoundingClientRect().height
  }

  blur() {
    if (this.page.active === this) this.page.focusOn(null)
  }
  contains(other: unknown): boolean {
    let at = other instanceof FakeElement ? other : null
    while (at) {
      if (at === this) return true
      at = at.parentElement
    }
    return false
  }
  /** Les descendants, dans l'ordre du document. */
  descendants(): FakeElement[] {
    const all: FakeElement[] = []
    const walk = (node: FakeElement) => {
      for (const child of node.children) {
        all.push(child)
        walk(child)
      }
    }
    walk(this)
    return all
  }
  matches(selector: string): boolean {
    return matchesList(this, parseList(selector))
  }
  closest(selector: string): FakeElement | null {
    const list = parseList(selector)
    let at: FakeElement | null = this
    while (at) {
      if (matchesList(at, list)) return at
      at = at.parentElement
    }
    return null
  }
  querySelectorAll(selector: string): FakeElement[] {
    const list = parseList(selector)
    return this.descendants().filter((node) => matchesList(node, list))
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }
  compareDocumentPosition(other: FakeElement): number {
    if (other === this) return 0
    if (this.contains(other)) return 20 // CONTAINED_BY | FOLLOWING
    if (other.contains(this)) return 10 // CONTAINS | PRECEDING
    const order = this.page.html.descendants()
    return order.indexOf(other) > order.indexOf(this) ? 4 : 2
  }

  appendChild(child: FakeElement): FakeElement {
    child.detach()
    child.parentElement = this
    this.children.push(child)
    this.page.changed()
    return child
  }
  append(...nodes: FakeElement[]) {
    for (const node of nodes) this.appendChild(node)
  }
  insertBefore(child: FakeElement, before: FakeElement | null): FakeElement {
    if (!before) return this.appendChild(child)
    child.detach()
    child.parentElement = this
    this.children.splice(this.children.indexOf(before), 0, child)
    this.page.changed()
    return child
  }
  removeChild(child: FakeElement): FakeElement {
    child.remove()
    return child
  }
  remove() {
    this.detach()
    this.page.changed()
  }
  private detach() {
    const parent = this.parentElement
    if (!parent) return
    parent.children.splice(parent.children.indexOf(this), 1)
    this.parentElement = null
    // Un élément retiré emporte le focus avec lui : il retombe sur `body`.
    if (this.page.active && this.contains(this.page.active)) this.page.focusOn(null)
  }

  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true
  }
}

const matchesCompound = (node: FakeElement, compound: Compound): boolean => {
  if (compound.tag && node.localName !== compound.tag) return false
  if (compound.id !== undefined && node.id !== compound.id) return false
  const classes = (node.getAttribute('class') ?? '').split(/\s+/)
  if (compound.classes.some((name) => !classes.includes(name))) return false
  for (const { name, op, value } of compound.attrs) {
    const actual = node.getAttribute(name)
    if (actual === null) return false
    const expected = value ?? ''
    if (op === '=' && actual !== expected) return false
    if (op === '~=' && !actual.split(/\s+/).includes(expected)) return false
    if (op === '^=' && !actual.startsWith(expected)) return false
    if (op === '$=' && !actual.endsWith(expected)) return false
    if (op === '*=' && !actual.includes(expected)) return false
    if (op === '|=' && actual !== expected && !actual.startsWith(`${expected}-`)) return false
  }
  if (compound.nots.some((list) => matchesList(node, list))) return false
  for (const pseudo of compound.pseudos) {
    const active = node.page.active
    if (pseudo === 'focus-within' ? !node.contains(active) : active !== node) return false
  }
  return true
}

const matchesComplex = (node: FakeElement, steps: Complex, at: number): boolean => {
  const step = steps[at]
  if (!step || !matchesCompound(node, step.compound)) return false
  if (at === 0) return true
  if (step.combinator === '>') {
    return node.parentElement !== null && matchesComplex(node.parentElement, steps, at - 1)
  }
  for (let up = node.parentElement; up; up = up.parentElement) {
    if (matchesComplex(up, steps, at - 1)) return true
  }
  return false
}

const matchesList = (node: FakeElement, list: Complex[]): boolean =>
  list.some((steps) => matchesComplex(node, steps, steps.length - 1))

type FakeObserver = { callback: (records: unknown[], observer: unknown) => void; on: boolean }

/** La fausse page : `<html>`, `<body>`, le focus, et un `startViewTransition` si `api`. */
const createPage = (api: boolean) => {
  const observers = new Set<FakeObserver>()
  const documentListeners = new Map<string, Set<Listener>>()
  const finishes: (() => void)[] = []
  let notifying = false

  const page = {
    active: null as FakeElement | null,
    html: null as unknown as FakeElement,
    body: null as unknown as FakeElement,
    document: null as unknown as Record<string, unknown>,
    /** Le focus passe à cet élément (ou à `body`), s'il peut le prendre. */
    focusOn(target: FakeElement | null) {
      if (target && !(target.visible() && target.focusable())) return
      const before = page.active
      if (before === target) return
      page.active = target
      for (const listener of documentListeners.get('focusout') ?? []) {
        listener({ type: 'focusout', target: before ?? page.body })
      }
      for (const listener of documentListeners.get('focusin') ?? []) {
        listener({ type: 'focusin', target: target ?? page.body })
      }
    },
    /** Un changement de l'arbre : les `MutationObserver` l'apprennent un peu après. */
    changed() {
      if (notifying || observers.size === 0) return
      notifying = true
      void Promise.resolve().then(() => {
        notifying = false
        for (const observer of [...observers]) {
          if (observer.on) observer.callback([{ type: 'childList' }], observer)
        }
      })
    },
    observers,
    finishes,
  }
  type FakePageType = typeof page
  const html = new FakeElement(page as FakePageType as never, 'html')
  const body = new FakeElement(page as never, 'body')
  page.html = html
  page.body = body
  html.children.push(body)
  body.parentElement = html

  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  const startViewTransition = jest.fn((arg: (() => unknown) | { update: () => unknown }) => {
    const update = typeof arg === 'function' ? arg : arg.update
    let finish: () => void = () => {}
    const end = new Promise<void>((resolve) => {
      finish = resolve
    })
    finishes.push(finish)
    const done = Promise.resolve().then(() => update())
    return {
      updateCallbackDone: done.then(() => {}),
      ready: done.then(() => {}),
      finished: done.then(() => end),
      skipTransition: finish,
    }
  })
  page.document = {
    nodeType: 9,
    documentElement: html,
    body,
    get activeElement() {
      return page.active ?? body
    },
    hasFocus: () => true,
    querySelector: (selector: string) => html.querySelector(selector),
    querySelectorAll: (selector: string) => html.querySelectorAll(selector),
    getElementById: (id: string) => html.querySelector(`#${id}`),
    contains: (node: unknown) => html.contains(node),
    createElement: (tag: string) => new FakeElement(page as never, tag),
    addEventListener: (type: string, listener: Listener) => {
      const set = documentListeners.get(type) ?? new Set<Listener>()
      set.add(listener)
      documentListeners.set(type, set)
    },
    removeEventListener: (type: string, listener: Listener) => {
      documentListeners.get(type)?.delete(listener)
    },
    defaultView: null,
    matchMedia,
    ...(api ? { startViewTransition } : {}),
  }
  return { ...page, page, matchMedia, startViewTransition }
}

type FakePage = ReturnType<typeof createPage>['page']

/** Fabrique un élément : `el(page, 'a', { href: '/x' }, 'Texte')`. */
const el = (
  page: FakePage,
  tag: string,
  attributes: Record<string, string> = {},
  ...content: (FakeElement | string)[]
): FakeElement => {
  const element = new FakeElement(page as never, tag)
  for (const [name, value] of Object.entries(attributes)) element.attributes.set(name, value)
  for (const part of content) {
    if (typeof part === 'string') element.text += part
    else element.appendChild(part)
  }
  return element
}

/** Un titre comme react-native-web rend `Text heading={level}`. */
const heading = (page: FakePage, level: 1 | 2, text: string, attributes = {}) =>
  el(page, `h${level}`, { role: 'heading', 'aria-level': String(level), ...attributes }, text)

// ---------------------------------------------------------------------------------------------
// La fausse appli : ses pages, l'adresse, l'historique
// ---------------------------------------------------------------------------------------------

type PopListener = (event: { stopImmediatePropagation: () => void }) => void
type Entry = { id: string; path: string; view: FakeElement; sheet: boolean }

/** Ce que dessine chaque adresse dans sa page (la page est vide si l'adresse n'y est pas). */
type Routes = Record<string, (page: FakePage, view: FakeElement) => void>

const SHEETS = new Set(['/hives/new'])

const routes: Routes = {
  '/feed': (page, view) => {
    view.append(
      heading(page, 1, 'Fil', { tabindex: '-1' }),
      el(page, 'a', { href: '/projects/p1', role: 'link' }, 'Carnet de cafés'),
      el(page, 'a', { href: '/projects/p3', role: 'link' }, 'Potager connecté'),
    )
  },
  '/explore': (page, view) => {
    view.append(
      heading(page, 1, 'Explorer'),
      el(page, 'a', { href: '/projects/p1', role: 'link' }, 'Carnet de cafés'),
    )
  },
  '/projects/p1': (page, view) => {
    view.append(
      el(page, 'button', { 'aria-label': 'Retour' }),
      heading(page, 1, 'Carnet de cafés'),
      el(page, 'button', {}, 'Suivre'),
      el(page, 'a', { href: '/members/m1', role: 'link' }, 'Inès Morel'),
    )
  },
  // La page d'un projet encore en chargement : son squelette, sans titre (il vient ensuite).
  '/projects/p2': (page, view) => {
    view.append(
      el(page, 'button', { 'aria-label': 'Retour' }),
      el(page, 'div', { role: 'progressbar', 'aria-label': 'Chargement' }),
    )
  },
  '/search': (page, view) => {
    const field = el(page, 'input', { type: 'search', 'aria-label': 'Rechercher' })
    view.append(heading(page, 1, 'Recherche'), field)
    // Le champ se donne le focus lui-même en arrivant (`autoFocus`).
    field.focus()
  },
  '/hives': (page, view) => {
    view.append(
      heading(page, 1, 'Ruches', { tabindex: '-1' }),
      el(page, 'button', {}, 'Créer une ruche'),
    )
  },
  '/hives/new': (page, view) => {
    view.append(
      heading(page, 1, 'Nouvelle ruche'),
      el(page, 'input', { 'aria-label': 'Nom de la ruche' }),
    )
  },
  // Les pages dont le titre de niveau 1 ne vient pas de `Screen` (UI-1) : la ruche (HiveScreen), le
  // membre (MemberHeader), l'outil (ToolHeader), la page d'état (`StateMessage level={1}`). Un
  // lien et un titre de niveau 2 l'entourent : seul le niveau 1 compte.
  '/hives/h1': (page, view) => {
    view.append(
      el(page, 'a', { href: '/hives', role: 'link' }, 'Ruches'),
      el(page, 'div', {}, heading(page, 1, 'Ma ruche Famille')),
      heading(page, 2, 'Ses projets'),
    )
  },
  '/members/m1': (page, view) => {
    view.append(
      el(page, 'button', { 'aria-label': 'Retour' }),
      el(page, 'div', {}, el(page, 'img', { alt: '' }), heading(page, 1, 'Inès Morel')),
      heading(page, 2, 'Ses projets'),
    )
  },
  '/tools/t1': (page, view) => {
    view.append(
      el(page, 'button', { 'aria-label': 'Retour' }),
      el(page, 'header', {}, heading(page, 1, 'Claude Code')),
      heading(page, 2, 'Projets faits avec'),
    )
  },
  '/projects/gone': (page, view) => {
    view.append(
      el(page, 'div', { role: 'img', 'aria-label': '' }),
      heading(page, 1, "Ce projet n'existe plus"),
      el(page, 'a', { href: '/feed', role: 'link' }, 'Retour au Fil'),
    )
  },
}

/** L'appli : une pile de pages dans `#root` ; une feuille s'ouvre par-dessus, à part. */
const createApp = (page: FakePage, window: FakeWindow) => {
  const root = el(page, 'div', { id: 'root' })
  // La barre d'onglets, hors des pages.
  const tabs = el(
    page,
    'nav',
    {},
    el(page, 'a', { href: '/feed', role: 'link' }, 'Fil'),
    el(page, 'a', { href: '/explore', role: 'link' }, 'Explorer'),
    el(page, 'a', { href: '/hives', role: 'link' }, 'Ruches'),
  )
  page.body.append(root, tabs)
  const entries: Entry[] = []
  let count = 0

  const current = () => entries[entries.length - 1]
  const settle = () => {
    const top = current()
    if (!top) return
    window.location.pathname = top.path
    window.history.state = { id: top.id }
    window.history.length = entries.length
  }

  const open = (path: string, mode: 'push' | 'replace') => {
    const sheet = SHEETS.has(path)
    const before = current()
    if (mode === 'replace' && before) {
      entries.pop()
      before.view.remove()
    } else if (before && !sheet) {
      // L'écran d'avant reste monté, caché sous la page ouverte.
      before.view.style.display = 'none'
      if (page.active && before.view.contains(page.active)) page.focusOn(null)
      page.changed()
    }
    count += 1
    const view = sheet
      ? el(page, 'div', { role: 'dialog', 'aria-modal': 'true' })
      : el(page, 'div', { 'data-page': path })
    if (sheet) page.body.appendChild(view)
    else root.appendChild(view)
    entries.push({ id: `entry-${count}`, path, view, sheet })
    settle()
    routes[path]?.(page, view)
  }

  /** Le Retour : la page du dessus s'en va, celle d'avant se montre de nouveau. */
  const back = () => {
    const top = entries.pop()
    top?.view.remove()
    const shown = current()
    if (shown) {
      shown.view.style.display = ''
      page.changed()
    }
    settle()
  }

  /** Ce que fait la navigation d'Expo Router d'une action déposée dans `routingQueue.add`. */
  const navigate = (action: unknown) => {
    const { type, payload } = action as {
      type: string
      payload?: { href?: string; options?: { event?: string } }
    }
    if (type === 'GO_BACK' || type === 'POP') return back()
    if (type !== 'ROUTER_LINK' || !payload?.href) return
    const event = payload.options?.event
    if (event === 'PRELOAD') return
    open(payload.href, event === 'REPLACE' ? 'replace' : 'push')
  }

  return {
    open,
    back,
    navigate,
    current,
    /** La vue d'une page de la pile. */
    view: (path: string) => entries.find((entry) => entry.path === path)?.view ?? null,
  }
}

/** Le premier élément de la page dont le texte est `text` (de cette balise). */
const find = (page: FakePage, tag: string, text: string): FakeElement => {
  const found = page.html
    .descendants()
    .find((node) => node.localName === tag && node.textContent === text)
  if (!found) throw new Error(`fausse page : aucun <${tag}> « ${text} »`)
  return found
}

type FakeWindow = {
  location: { pathname: string }
  history: { state: unknown; length: number }
  addEventListener: (type: string, listener: PopListener) => void
  removeEventListener: (type: string, listener: PopListener) => void
  matchMedia: (query: string) => unknown
  getComputedStyle: (node: FakeElement) => { display: string; visibility: string }
  innerHeight: number
  innerWidth: number
  requestAnimationFrame: (callback: (time: number) => void) => unknown
  cancelAnimationFrame: (handle: unknown) => void
}

// ---------------------------------------------------------------------------------------------
// Le chargement de l'appli, comme `index.ts`, sur la fausse page
// ---------------------------------------------------------------------------------------------

const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'MutationObserver',
  'getComputedStyle',
  'HTMLElement',
  'Element',
  'Node',
] as const
const originals = new Map(
  GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
)

let popListeners: PopListener[] = []
/** Les modules chargés par chaque visite (`load`), remis à zéro après chaque test. */
const loadedArrivals: Arrival[] = []

/** Le bouton ou le geste « retour » du navigateur, vu par les écouteurs de `popstate`. */
const firePopState = () => {
  for (const listener of [...popListeners]) listener({ stopImmediatePropagation: () => {} })
}

/** Pose la fausse page et sa fenêtre à la place du navigateur absent. */
const lendPage = (api: boolean) => {
  const created = createPage(api)
  const { page } = created
  popListeners = []
  const window: FakeWindow = {
    location: { pathname: '/' },
    history: { state: null, length: 1 },
    addEventListener: (type, listener) => {
      if (type === 'popstate') popListeners.push(listener)
    },
    removeEventListener: (type, listener) => {
      if (type === 'popstate') popListeners = popListeners.filter((other) => other !== listener)
    },
    matchMedia: created.matchMedia,
    getComputedStyle: (node) => ({
      display: node.visible() ? 'block' : 'none',
      visibility: 'visible',
    }),
    innerHeight: 844,
    innerWidth: 390,
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 16),
    cancelAnimationFrame: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  page.document.defaultView = window
  class FakeMutationObserver {
    private readonly entry: FakeObserver
    constructor(callback: FakeObserver['callback']) {
      this.entry = { callback, on: false }
    }
    observe() {
      this.entry.on = true
      page.observers.add(this.entry)
    }
    disconnect() {
      this.entry.on = false
      page.observers.delete(this.entry)
    }
    takeRecords() {
      return []
    }
  }
  const values: Record<(typeof GLOBALS)[number], unknown> = {
    window,
    document: page.document,
    location: window.location,
    history: window.history,
    MutationObserver: FakeMutationObserver,
    getComputedStyle: window.getComputedStyle,
    HTMLElement: FakeElement,
    Element: FakeElement,
    Node: FakeElement,
  }
  for (const name of GLOBALS) {
    Object.defineProperty(globalThis, name, {
      value: values[name],
      configurable: true,
      writable: true,
    })
  }
  const app = createApp(page, window)
  return { ...created, page, window, app }
}

const restoreGlobals = () => {
  for (const name of GLOBALS) {
    const original = originals.get(name)
    if (original) Object.defineProperty(globalThis, name, original)
    else delete (globalThis as Record<string, unknown>)[name]
  }
}

/**
 * Charge l'appli comme `index.ts` (le relais du Retour, puis celui des passages) sur la fausse page,
 * l'appli ouverte à `path`. La page est hydratée ; la première page de la visite est posée, sauf si
 * `firstShown` est faux.
 */
const load = ({
  path = '/feed',
  firstShown = true,
}: {
  path?: string
  firstShown?: boolean
} = {}) => {
  const lent = lendPage(true)
  if (path) lent.app.open(path, 'push')
  let loaded: { queue: Queue; router: Router; engine: Engine; arrival: Arrival } | undefined
  // Les modules déjà chargés par un test précédent sont oubliés (le moteur garderait sa première
  // page posée) ; ceux importés en haut du fichier gardent leur version.
  jest.resetModules()
  jest.isolateModules(() => {
    // Un moteur neuf pour chaque visite : `jest.requireActual` (la fabrique du haut du fichier)
    // rendrait le même module à chaque chargement, avec sa première page déjà posée.
    jest.doMock('../ui/pageTransition', () => require('../ui/pageTransition.web'))
    jest.replaceProperty(require('react-native').Platform, 'OS', 'web')
    const queue: Queue = require('expo-router/build/global-state/routingQueue').routingQueue
    jest.spyOn(queue, 'add').mockImplementation((action) => lent.app.navigate(action))
    const router: Router = require('expo-router/build/global-state/router').router
    const hydration = require('../ui/theme/hydration')
    const engine: Engine = require('../ui/pageTransition')
    require('./backRelay')
    require('./passageRelay')
    const arrival: Arrival = require('./arrivalFocus')
    arrival.resetArrivalFocus()
    loadedArrivals.push(arrival)
    engine.setPassageDocument(
      lent.page.document as unknown as Parameters<Engine['setPassageDocument']>[0],
    )
    hydration.markHydrated()
    if (firstShown) engine.passageArrived()
    loaded = { queue, router, engine, arrival }
  })
  if (!loaded) throw new Error('not loaded')
  const { engine } = loaded
  /** La page arrive (ui/screenFocus.ts le dit au moteur), puis le navigateur finit le passage. */
  const arrive = async () => {
    await flush()
    engine.passageArrived()
    await flush()
    for (const finish of lent.finishes.splice(0)) finish()
    await wait(1000)
  }
  return { ...loaded, ...lent, arrive }
}

/** Ce qui a le focus, dit en clair (l'élément entier ferait des écarts de milliers de lignes). */
const nameOf = (node: unknown): string => {
  if (!(node instanceof FakeElement)) return String(node)
  if (node.localName === 'body') return 'body'
  const name = node.textContent || node.getAttribute('aria-label') || ''
  return `${node.localName} « ${name} »${node.isConnected ? '' : ' (retiré du document)'}`
}
const focusedOn = (page: FakePage) => nameOf(page.document.activeElement)

/**
 * Le témoin des tests où rien ne doit bouger : dans une visite neuve, un lien du Fil donne bien le
 * focus au titre du projet. Sans lui, un module qui ne fait rien passerait ces tests.
 */
const witnessLink = async () => {
  const { router, page, arrive, arrival } = load()
  find(page, 'a', 'Carnet de cafés').focus()
  router.push('/projects/p1')
  await arrive()
  expect(focusedOn(page)).toBe(nameOf(find(page, 'h1', 'Carnet de cafés')))
  // La visite témoin s'arrête là : rien d'elle ne doit agir sur la suivante.
  arrival.resetArrivalFocus()
  jest.clearAllTimers()
  restoreGlobals()
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

afterEach(() => {
  // L'état de chaque visite chargée est remis à zéro (rien n'attend plus un titre), et les
  // minuteurs restants sont oubliés : rien d'un test ne tombe dans la page du suivant.
  for (const arrival of loadedArrivals.splice(0)) arrival.resetArrivalFocus()
  jest.clearAllTimers()
  restoreGlobals()
  topEngine.setPassageDocument?.(null)
  topArrival.resetArrivalFocus()
  jest.restoreAllMocks()
  jest.useRealTimers()
})

// ---------------------------------------------------------------------------------------------
// Les tests
// ---------------------------------------------------------------------------------------------

describe('the focus on arrival at a page (web)', () => {
  it('gives the focus to the page title after a link', async () => {
    const { router, page, arrive } = load()
    const card = find(page, 'a', 'Carnet de cafés')
    card.focus()
    expect(focusedOn(page)).toBe(nameOf(card)) // témoin

    router.push('/projects/p1')
    await arrive()

    const title = find(page, 'h1', 'Carnet de cafés')
    expect(focusedOn(page)).toBe(nameOf(title))
    // Focalisable sans devenir une étape de Tab, et sans faire défiler la page jusqu'à lui.
    expect(title.getAttribute('tabindex')).toBe('-1')
    expect(title.focus).toHaveBeenLastCalledWith(expect.objectContaining({ preventScroll: true }))
  })

  it('gives the focus to the page title after a tab change', async () => {
    const { router, page, arrive } = load()
    const tab = find(page, 'a', 'Explorer')
    tab.focus()

    router.push('/explore')
    await arrive()

    expect(focusedOn(page)).toBe(nameOf(find(page, 'h1', 'Explorer')))
  })

  it('leaves the first page of the visit to the browser', async () => {
    // La visite commence à « / », que l'accueil renvoie vers le Fil (un `<Redirect>`) : aucune page
    // n'est encore posée.
    const { router, engine, page, arrive } = load({ path: '/', firstShown: false })
    router.replace('/feed')
    await wait(3000)

    expect(focusedOn(page)).toBe(nameOf(page.body))

    // Témoin : la première page posée, le lien suivant donne bien le focus au titre.
    engine.passageArrived()
    find(page, 'a', 'Carnet de cafés').focus()
    router.push('/projects/p1')
    await arrive()
    expect(focusedOn(page)).toBe(nameOf(find(page, 'h1', 'Carnet de cafés')))
  })

  it('takes nothing on a passage to a sheet (none)', async () => {
    await witnessLink()
    const { router, page, arrive } = load({ path: '/hives' })
    const create = find(page, 'button', 'Créer une ruche')
    create.focus()

    router.push('/hives/new')
    await arrive()

    // La feuille garde son focus à elle (ici, elle n'en pose aucun) : rien ne va aux titres, ni
    // celui de la page dessous ni celui de la feuille.
    expect(focusedOn(page)).toBe(nameOf(create))
    expect(find(page, 'h1', 'Ruches').focus).not.toHaveBeenCalled()
    expect(find(page, 'h1', 'Nouvelle ruche').focus).not.toHaveBeenCalled()
  })

  it('gives the focus to the page title once it appears after the passage (page still loading)', async () => {
    const { router, page, app, arrive } = load()
    find(page, 'a', 'Carnet de cafés').focus()

    router.push('/projects/p2')
    await arrive()
    // Le squelette est là, pas encore le titre : le focus attend, sans aller ailleurs.
    expect(focusedOn(page)).toBe(nameOf(page.body))

    const view = app.view('/projects/p2')
    view?.querySelector('[role="progressbar"]')?.remove()
    view?.append(heading(page, 1, 'Potager connecté'), el(page, 'button', {}, 'Suivre'))
    await wait(500)

    expect(focusedOn(page)).toBe(nameOf(find(page, 'h1', 'Potager connecté')))
  })

  it('gives the focus to the level 1 heading of a page without a Screen title (hive, member, tool, state page)', async () => {
    const pages = [
      ['/hives/h1', 'Ma ruche Famille'],
      ['/members/m1', 'Inès Morel'],
      ['/tools/t1', 'Claude Code'],
      ['/projects/gone', "Ce projet n'existe plus"],
    ] as const
    // Chaque page dans une visite neuve (une appli chargée de nouveau, la même règle).
    const focused: string[] = []
    for (const [path, name] of pages) {
      const { router, page, arrive, arrival } = load()
      find(page, 'a', 'Carnet de cafés').focus()

      router.push(path)
      await arrive()

      // Pas le titre « Fil » de la page cachée dessous, ni un titre de niveau 2 : le niveau 1 de la
      // page arrivée, rendu focalisable hors de l'ordre de Tab.
      const title = find(page, 'h1', name)
      if (page.document.activeElement === title && title.getAttribute('tabindex') === '-1') {
        focused.push(name)
      }
      arrival.resetArrivalFocus()
      jest.clearAllTimers()
      restoreGlobals()
    }

    expect(focused).toEqual(pages.map(([, name]) => name))
  })

  it('leaves the focus in a field that the arrived page focused itself (search)', async () => {
    await witnessLink()
    const { router, page, arrive } = load()
    find(page, 'a', 'Carnet de cafés').focus()

    router.push('/search')
    await arrive()

    const field = find(page, 'input', '')
    expect(focusedOn(page)).toBe(nameOf(field))
    expect(find(page, 'h1', 'Recherche').focus).not.toHaveBeenCalled()
  })

  it('takes nothing back when the member has already moved the focus', async () => {
    await witnessLink()
    const { router, page, app, arrive } = load()
    find(page, 'a', 'Carnet de cafés').focus()

    router.push('/projects/p2')
    await arrive()
    // Pendant le chargement, le membre tape Tab : le focus est sur « Retour ».
    const back = app.view('/projects/p2')?.querySelector('button')
    back?.focus()
    expect(focusedOn(page)).toBe(nameOf(back)) // témoin

    app.view('/projects/p2')?.append(heading(page, 1, 'Potager connecté'))
    await wait(2000)

    expect(focusedOn(page)).toBe(nameOf(back))
  })

  it('gives up when the title does not appear within its bound', async () => {
    await witnessLink()
    const { router, page, app, arrive } = load()
    find(page, 'a', 'Carnet de cafés').focus()

    router.push('/projects/p2')
    await arrive()
    // Une minute plus tard (une route qui n'arrive pas), le titre paraît enfin : trop tard, le
    // focus n'est plus attendu.
    await wait(60_000)
    const title = heading(page, 1, 'Potager connecté')
    app.view('/projects/p2')?.append(title)
    await wait(2000)

    expect(focusedOn(page)).toBe(nameOf(page.body))
    expect(title.focus).not.toHaveBeenCalled()
  })

  it('ignores a level 1 heading inside a sheet', async () => {
    const { router, page, arrive } = load()
    // Une feuille encore dans le document (gardée pendant son fondu de sortie), avec son titre de
    // niveau 1, posée avant l'appli.
    const sheetTitle = heading(page, 1, 'Signaler')
    const sheet = el(page, 'div', { role: 'dialog', 'aria-modal': 'true' }, sheetTitle)
    page.body.insertBefore(sheet, page.body.firstElementChild)
    find(page, 'a', 'Carnet de cafés').focus()

    router.push('/projects/p1')
    await arrive()

    expect(focusedOn(page)).toBe(nameOf(find(page, 'h1', 'Carnet de cafés')))
    expect(sheetTitle.focus).not.toHaveBeenCalled()
  })
})

describe('the focus on Back (web)', () => {
  /** Du Fil, le lien « Carnet de cafés » ouvre le projet ; son titre a le focus. */
  const openProject = async () => {
    const loaded = load()
    const card = find(loaded.page, 'a', 'Carnet de cafés')
    card.focus()
    loaded.router.push('/projects/p1')
    await loaded.arrive()
    expect(focusedOn(loaded.page)).toBe(nameOf(find(loaded.page, 'h1', 'Carnet de cafés'))) // témoin
    return { ...loaded, card }
  }

  /** Le « Retour » de la page : `router.back()`, puis le `popstate` de son `history.go(-1)`. */
  const pageBack = async (loaded: Awaited<ReturnType<typeof openProject>>) => {
    loaded.queue.add({ type: 'GO_BACK' } as Parameters<Queue['add']>[0])
    await flush()
    firePopState()
    await loaded.arrive()
  }

  it('returns the focus to the link it came from on the page Back', async () => {
    const loaded = await openProject()

    await pageBack(loaded)

    expect(focusedOn(loaded.page)).toBe(nameOf(loaded.card))
  })

  it('returns the focus to the link it came from on the browser Back', async () => {
    const loaded = await openProject()

    // Le navigateur change d'entrée et le dit (`popstate`) ; l'appli redessine la page d'avant un
    // peu après.
    loaded.window.location.pathname = '/feed'
    loaded.window.history.state = { id: 'entry-1' } // l'entrée du Fil, la première de la visite
    firePopState()
    await wait(50)
    loaded.app.back()
    await wait(1000)

    expect(focusedOn(loaded.page)).toBe(nameOf(loaded.card))
  })

  it('returns the focus to the origin of each page, two pages deep', async () => {
    const loaded = await openProject()
    const author = find(loaded.page, 'a', 'Inès Morel')
    author.focus()
    loaded.router.push('/members/m1')
    await loaded.arrive()
    expect(focusedOn(loaded.page)).toBe(nameOf(find(loaded.page, 'h1', 'Inès Morel'))) // témoin

    await pageBack(loaded)
    expect(focusedOn(loaded.page)).toBe(nameOf(author))

    await pageBack(loaded)
    expect(focusedOn(loaded.page)).toBe(nameOf(loaded.card))
  })

  it('gives the focus to the title on Back when the origin is gone', async () => {
    const loaded = await openProject()
    // Pendant ce temps, le Fil s'est mis à jour : la carte d'origine a été redessinée (un autre
    // élément, le même nom).
    const feed = loaded.app.view('/feed')
    loaded.card.remove()
    feed?.append(el(loaded.page, 'a', { href: '/projects/p1', role: 'link' }, 'Carnet de cafés'))

    await pageBack(loaded)

    expect(focusedOn(loaded.page)).toBe(nameOf(find(loaded.page, 'h1', 'Fil')))
  })

  it('does not return the focus to an origin that left the page', async () => {
    const loaded = await openProject()
    loaded.card.remove()
    loaded.card.focus.mockClear()

    await pageBack(loaded)
    await wait(2000)

    // L'élément retiré n'est jamais visé (ni essai, ni nouvel essai) : le focus va au titre.
    expect(loaded.card.focus).not.toHaveBeenCalled()
    expect(focusedOn(loaded.page)).toBe(nameOf(find(loaded.page, 'h1', 'Fil')))
  })
})

// La carte qui devient la page (R4, R17) donnait elle-même le focus au titre du projet à la fin du
// passage. Le module le donne désormais à toute page : la carte lui cède le sien, et le titre n'est
// focalisé qu'une fois. Ce test monte la vraie carte (ui/coverTransition.tsx) et joue ce que fait le
// relais autour d'un passage (`rememberOrigin`, puis `focusArrival` après lui).
let source: ReturnType<typeof useCoverSource> | undefined

function Card() {
  const cover = useCoverSource('p1')
  source = cover
  return (
    <View
      ref={(view) =>
        cover.ref(view ? { measureInWindow: (callback) => callback(16, 240, 358, 220) } : null)
      }
    />
  )
}

function Stage({ page, title }: { page: boolean; title: RefObject<Focusable | null> }) {
  return (
    <CoverTransitionProvider>
      <Card />
      {page ? (
        <CoverArrival id="p1" focusOnArrival={title}>
          <View testID="page-photo" />
        </CoverArrival>
      ) : null}
    </CoverTransitionProvider>
  )
}

describe('the focus after a card with a photo (web)', () => {
  it('focuses the project title once, not twice, after a card with a photo', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const { page, app } = lendPage(true)
    app.open('/feed', 'push')
    const engine = topEngine as unknown as Engine
    engine.setPassageDocument(
      page.document as unknown as Parameters<Engine['setPassageDocument']>[0],
    )
    markHydrated()
    engine.passageArrived()
    find(page, 'a', 'Carnet de cafés').focus()

    const title = { current: null } as { current: Focusable | null }
    const view = await render(<Stage page={false} title={title} />)
    await act(async () =>
      source?.capture(() => {
        topArrival.rememberOrigin()
        engine.runPassage('deeper', () => app.open('/projects/p1', 'push'))
        engine.afterPassage(() => topArrival.focusArrival())
      }),
    )
    await flush()
    const projectTitle = find(page, 'h1', 'Carnet de cafés')
    // Le titre de la page d'un projet a sa `focusRef` (Text pose alors `tabIndex: -1`).
    projectTitle.tabIndex = -1
    title.current = projectTitle as unknown as Focusable
    await view.rerender(<Stage page title={title} />)
    await act(async () => {
      engine.passageArrived()
      await flush()
      for (const finish of page.finishes.splice(0)) finish()
      await wait(1000)
    })

    expect(focusedOn(page)).toBe(nameOf(projectTitle))
    expect(projectTitle.focus).toHaveBeenCalledTimes(1)
  })
})
