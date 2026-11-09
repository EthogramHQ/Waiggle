// La feuille (tranche R2) : une tâche à part qui vient par-dessus l'écran (changer d'adresse,
// supprimer son compte, modifier son profil). Sur téléphone, elle monte du bas et prend presque
// toute la hauteur, avec une poignée en haut, un bouton « Fermer » à côté (pour qui ne peut pas la
// faire glisser : WCAG 2.5.7) et son titre ; sur ordinateur, un panneau centré sur un fond voilé.
// Dans les deux cas, son contenu défile si besoin, et un pied (`footer`) peut rester collé en bas,
// pour l'action principale.
//
// Pour les lecteurs d'écran et le clavier, c'est une boîte de dialogue modale (`dialog`,
// `aria-modal`), nommée par son titre (`aria-labelledby`) ; elle s'ouvre par un Modal de React
// Native, qui sur le web enferme la touche Tab dans la feuille (focus trap), donne le focus à son
// premier élément à l'ouverture (ici « Fermer », dessiné en premier) et le rend à l'élément qui
// l'avait avant à la fermeture (le bouton d'origine) ; Échap ferme, comme le bouton retour sur
// Android. Toucher le voile ferme aussi. (Relecture juridique du plan, jur-15.) Sur le web, c'est la
// couche du Modal qui porte le rôle et le nom, pour n'avoir qu'une boîte de dialogue.
//
// Relecture de l'interface (R2) : le voile a la garde de double tape de Dialog ; `busy` refuse
// toute fermeture pendant une action qui ne s'arrête plus ; Échap ne ferme qu'une fois ; sur iOS,
// le clavier ne cache plus le pied collé.
//
// Tranche R5b (la feuille des commentaires), pour toutes les feuilles :
// - un titre avec son nombre (`titleCount`, « Commentaires 6 »), lu « Commentaires, 6 commentaires » ;
// - `initialFocusRef` : le focus arrive où la feuille l'attend (le champ de « Écrire un
//   commentaire »), au lieu de « Fermer » ;
// - Échap et Tab ne sont pris que s'ils viennent du panneau et n'ont pas déjà servi (la liste des
//   mentions, un menu, une confirmation ouverts dedans les gardent pour eux) ;
// - « Réduire les animations » : la feuille de téléphone paraît par un fondu, sans monter ;
// - on la ferme aussi en la glissant vers le bas par sa tête (décision D1 de Louis), sauf pendant
//   une action en cours (`busy`).
//
// Tranche R6a (la feuille de publication), pour toutes les feuilles, chaque prop facultative :
// - `closeGuard` : la feuille a des changements à ne pas perdre. Toute demande de fermeture
//   (« Annuler », « Fermer », Échap, voile, retour d'Android, glisser) l'appelle au lieu de
//   `onClose` ; l'écran demande alors « Abandonner ce projet ? ». Une feuille glissée revient en
//   place au lieu de partir. `busy` l'emporte sur tout : rien n'est appelé pendant une action ;
// - `action` et `cancelLabel` : l'action de la feuille (« Publier ») et « Annuler ». Sur téléphone,
//   dans la tête (« Annuler » à gauche, à la place de la croix ; l'action à droite), et le message
//   d'un envoi juste dessous ; sur ordinateur, au pied, après la phrase `footerNote` ;
// - `aside` : la colonne d'à côté est maintenant **dans** la feuille, à droite du contenu, sous la
//   même tête et au-dessus du même pied (l'aperçu de la carte) ;
// - une feuille ouverte par-dessus une autre (« Catégorie et outils ») est la seule à se fermer
//   (Échap, retour d'Android) : la pile des feuilles ouvertes, plus bas.
import { borders, durations, layout, radii, space } from '@ruche/brand'
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './Button'
import { CountedTitle } from './CountedTitle'
import { type Focusable, focusTarget, focusWithoutScroll } from './focus'
import { IconButton } from './IconButton'
import { inLayerAbove, layerStillOpening, openModalLayer, sameLayer } from './modalLayers'
import { Notice, type NoticeAction } from './Notice'
import { SheetHeader } from './SheetHeader'
import { Surface } from './Surface'
import { type SheetReveal, useSheetReveal } from './sheetReveal'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { holdPageTaps, useTapsAllowed } from './tapGuard'
import { useHydrated } from './theme/hydration'
import { useLayout } from './theme/layout'
import { spring, useCalmMotion } from './theme/motion'
import { useTheme } from './theme/ThemeProvider'

type PanelProps = {
  title: string
  /**
   * Un nombre après le titre (« Commentaires 6 », R5b), dessiné par CountedTitle, une espace
   * ordinaire entre les deux : à 200 % de texte, le nombre passe entier à la ligne. `spoken` est ce
   * nombre en toutes lettres (« 6 commentaires ») : la feuille se lit « Commentaires, 6 commentaires ».
   * Avec 0, le titre seul.
   */
  titleCount?: { count: number; spoken: string }
  /** Une phrase sous le titre (« Voici ce qui disparaît avec lui. »). */
  subtitle?: string
  children: ReactNode
  /** Les boutons collés en bas de la feuille (l'action principale, puis « Annuler »). */
  footer?: ReactNode
  /**
   * Le message d'un envoi (« Mot de passe incorrect. », « Profil enregistré. »), posé en tête du
   * pied collé, juste au-dessus du bouton touché : toujours en vue, quel que soit l'endroit où la
   * feuille a défilé. Écrit sous un champ du bas, il restait caché par le pied, et le membre ne
   * savait pas pourquoi rien ne se passait (relecture de design R2, B2). Une alerte (`role="alert"`)
   * pour une erreur, lue dès qu'elle paraît ; `polite` pour une confirmation. Le pied grandit vers
   * le haut : sur téléphone et dans un panneau à sa hauteur maximale, le bouton ne bouge pas.
   */
  notice?: SheetNotice | null | undefined
  /**
   * Le niveau du titre : 2 (par défaut) pour une feuille ouverte par-dessus une page qui a déjà son
   * titre ; 1 pour une feuille qui est toute la page (son adresse à elle : /settings/profile).
   */
  heading?: 1 | 2
  /**
   * Un décor à droite du titre (les photos du membre et de ses projets, sur la feuille de
   * suppression) : caché aux lecteurs d'écran, il ne porte jamais un bouton ni un texte à lire.
   */
  decoration?: ReactNode
  /**
   * Sur ordinateur, une colonne à droite de la feuille, dans la même boîte de dialogue (l'aperçu de
   * sa page pendant qu'on modifie son profil). Absente sur téléphone, et quand la fenêtre n'a pas
   * la place de la poser à côté.
   */
  aside?: ReactNode
  onClose: () => void
  /**
   * Le nom du bouton « Fermer », pour le catalogue seulement (un outil de développement, absent de
   * l'appli publiée) ; les écrans laissent la feuille le traduire.
   */
  closeLabel?: string
  /**
   * Téléphone (du bas, pleine hauteur) ou ordinateur (panneau centré). La feuille le déduit de la
   * largeur de l'écran ; le catalogue montre les deux.
   */
  layout: 'phone' | 'desktop'
  /** La hauteur disponible, pour que le panneau d'ordinateur ne dépasse pas de la fenêtre. */
  maxHeight?: number
  /** Pour Sheet : le bouton « Fermer » (où le focus arrive) et la feuille (où Tab tourne). */
  closeRef?: Ref<View>
  panelRef?: Ref<View>
  /** Pour Sheet : les touches de la feuille sur le web (Échap, Tab). */
  keys?: object
  /**
   * Pendant une action qui ne s'arrête plus (la suppression du compte), la feuille refuse de se
   * fermer : « Fermer » est inactif, et Échap, le voile et le retour Android ne font rien. Sinon
   * « Annuler » mentirait : l'action continuerait derrière la feuille fermée (relecture B1).
   */
  busy?: boolean
  /**
   * Pour Sheet, sur le web : l'identifiant du titre, déjà donné au nom de la couche (le Modal de
   * react-native-web est la boîte de dialogue). La feuille ne se déclare pas alors une seconde fois.
   */
  titleId?: string
  /**
   * Une feuille courte (« Partager », R5a) : sur téléphone, elle a la hauteur de son contenu, collée
   * en bas, au lieu de prendre toute la hauteur (des centaines de points vides entre le contenu et
   * le bouton), et son titre est plus petit, comme sur la planche. Elle défile quand même si le
   * contenu dépasse la fenêtre. Les autres feuilles (formulaires, suppression) gardent la pleine
   * hauteur.
   */
  compact?: boolean
  /**
   * Pour Sheet, sur téléphone : ce qui fait suivre le doigt à la tête de la feuille (la poignée,
   * « Fermer » et le titre), pour la glisser vers le bas.
   */
  dragHandlers?: object
  /**
   * Ce que l'écran reçoit pour amener un élément dans la zone qui défile, et l'y garder quand elle
   * rétrécit (le pied qui grandit, le clavier qui sort : voir sheetReveal.ts). Les autres feuilles ne
   * le demandent pas.
   */
  revealRef?: Ref<SheetReveal>
  /**
   * Le titre de la feuille, pour y poser le focus quand rien d'autre n'est là (la liste relue est
   * vide, la feuille n'a pas de champ : R6b). Pas de la tête à action (téléphone, `action`) : seules
   * les feuilles à titre simple ou à nombre (« Commentaires 6 ») la reçoivent.
   */
  titleRef?: Ref<Focusable>
  /**
   * L'action de la feuille (« Publier », « Enregistrer », « OK », R6a) : dans la tête sur téléphone,
   * à droite ; au pied sur ordinateur, en dernier. Voir `SheetAction`.
   */
  action?: SheetAction
  /**
   * « Annuler » (R6a) : sur téléphone, un bouton texte à gauche de la tête, à la place de la croix ;
   * sur ordinateur, un bouton à côté de l'action (la croix reste en haut). Il demande la fermeture
   * comme les autres voies : par `closeGuard` s'il y en a un.
   */
  cancelLabel?: string
  /**
   * Une phrase à côté des boutons du pied, sur ordinateur (« Les membres de {{appName}} verront ce
   * projet… », R6a) ; sur téléphone, où l'action est dans la tête, à la fin du contenu.
   */
  footerNote?: ReactNode
}

/**
 * L'action d'une feuille (R6a). `disabled` : grisée (« Enregistrer » tant que rien n'a changé) ;
 * avec `focusableWhenDisabled`, elle reste atteignable par Tab et se décrit par le message de la
 * feuille (`notice` : « Rien à enregistrer pour l'instant. »). `busy` : en cours (un envoi), elle
 * montre son chargement et ne se touche plus.
 */
export type SheetAction = {
  label: string
  onPress: () => void
  disabled?: boolean
  busy?: boolean
  focusableWhenDisabled?: boolean
}

/** Le message du pied d'une feuille : son texte, son ton, et s'il coupe la parole (alerte) ou non. */
export type SheetNotice = {
  message: string
  tone?: 'error' | 'info' | 'success'
  polite?: boolean
  /**
   * Un lien après le message, dans le même cadre (« Me reconnecter » après « Connecte-toi pour
   * continuer. », R6a) : un échec qui ne se règle pas en réessayant a son issue (`Notice action`).
   */
  action?: NoticeAction | undefined
}

type Props = Omit<
  PanelProps,
  'layout' | 'maxHeight' | 'closeRef' | 'panelRef' | 'keys' | 'titleId' | 'dragHandlers'
> & {
  open: boolean
  /**
   * Où poser le focus à l'ouverture (le champ, pour « Écrire un commentaire ») ; sans lui, ou s'il
   * n'est pas encore là, « Fermer ». Sur le web, sans défilement ; sur téléphone, une fois la
   * feuille montée (le clavier s'ouvre alors avec elle).
   */
  initialFocusRef?: RefObject<{ focus: () => void } | null>
  /**
   * La feuille a quelque chose à ne pas perdre (R6a) : toute demande de fermeture l'appelle au lieu
   * de `onClose`, qui ne part plus que de l'écran (après « Abandonner »). Sans lui, `onClose`.
   */
  closeGuard?: () => void
  /**
   * Web : l'élément qui reçoit le focus à la fermeture, à la place de l'ouvreur, lu au moment de
   * fermer (R6b, u8f). Pour un ouvreur parti avec ce que la feuille a décidé : la carte décidée
   * montre son résultat à la place de ses boutons ; retrouvé par son nom, l'ouvreur aurait été le
   * bouton de même nom de la carte voisine. Rien (null) : l'ouvreur, comme sans cette prop.
   */
  returnFocusTo?: () => unknown
}

type KeyEvent = {
  key: string
  shiftKey?: boolean
  repeat?: boolean
  preventDefault: () => void
  /** Déjà prise plus bas (un champ, une liste) : l'événement de React, puis celui du navigateur. */
  defaultPrevented?: boolean
  isDefaultPrevented?: () => boolean
  /** L'élément d'où vient la touche (web). */
  target?: unknown
  nativeEvent?: { defaultPrevented?: boolean; target?: unknown }
}

/** Le peu d'une touche du navigateur que la feuille relit au relâchement d'Échap. */
type BrowserKey = { key?: string; defaultPrevented?: boolean }
type WebDocument = {
  addEventListener?: (type: string, listener: (event: BrowserKey) => void, capture: boolean) => void
  removeEventListener?: (
    type: string,
    listener: (event: BrowserKey) => void,
    capture: boolean,
  ) => void
}

// Le peu de `window` qu'écoute la feuille : le focus qui arrive dans une couche du dessus.
type FocusEventLike = { target?: unknown; stopImmediatePropagation?: () => void }
type WebWindow = {
  addEventListener?: (
    type: string,
    listener: (event: FocusEventLike) => void,
    capture: boolean,
  ) => void
  removeEventListener?: (
    type: string,
    listener: (event: FocusEventLike) => void,
    capture: boolean,
  ) => void
}

// Le peu du navigateur dont Tab a besoin : les éléments de la feuille qu'on peut atteindre, dans
// l'ordre du document. (Les types de React Native ne décrivent pas la page web.)
type WebElement = {
  tabIndex: number
  hasAttribute: (name: string) => boolean
  closest: (selector: string) => unknown
  getClientRects: () => { length: number }
  focus: () => void
}
type WebRoot = { querySelectorAll?: (selector: string) => ArrayLike<WebElement> }
const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]'

/** L'élément qui a le focus dans la page, sur le web ; null ailleurs ou sans document. */
const activeElement = (): unknown =>
  (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null

/** Le focus s'est-il perdu (web) : sur la page elle-même, ou sur un élément qui n'y est plus ? */
const focusLost = (): boolean => {
  const page = (globalThis as { document?: { body?: unknown } }).document
  const active = activeElement() as { isConnected?: boolean } | null
  return active === null || active === page?.body || active.isConnected === false
}

// L'ouvreur retenu à l'ouverture peut ne plus être dans la page à la fermeture : sur téléphone, le
// « + » de la barre d'onglets est redessiné quand la page de la feuille se ferme (un autre élément,
// le même nom), et le focus retombait sur `body` (R6a, design-C1). On le retrouve alors par son nom
// parmi les boutons et liens visibles de la page.
type FoundElement = {
  isConnected?: boolean
  getAttribute?: (name: string) => string | null
  getClientRects?: () => { length: number }
}
const OPENERS = 'a, button, [role="button"], [role="link"]'

/** Le nom d'un élément du navigateur (`aria-label`), pour le retrouver plus tard ; sinon null. */
const nameOf = (element: unknown): string | null =>
  (element as FoundElement | null)?.getAttribute?.('aria-label') ?? null

/**
 * L'élément à qui rendre le focus : `node` s'il est encore dans la page (ou si on ne sait pas), sinon
 * le premier élément visible de même nom, sinon `node`.
 */
const reachableOpener = (node: unknown, name: string | null): unknown => {
  if ((node as FoundElement | null)?.isConnected !== false || !name) return node
  const page = (
    globalThis as { document?: { querySelectorAll?: (selector: string) => ArrayLike<unknown> } }
  ).document
  const candidates = page?.querySelectorAll?.(OPENERS)
  const same = candidates
    ? Array.from(candidates).find(
        (element) =>
          nameOf(element) === name &&
          ((element as FoundElement).getClientRects?.().length ?? 0) > 0,
      )
    : undefined
  return same ?? node
}

// Une feuille ouverte par son adresse (un lien, la barre d'adresse, « Publier » d'un e-mail) n'a
// pas d'ouvreur : à l'ouverture, le focus était sur la page elle-même (`body`). À la fermeture, on
// le rendait à `body`, c'est-à-dire nulle part : Tab repartait du haut (contre-visite du design R6a,
// S2). Le focus va alors au titre principal de la page qui reste, sinon à son premier repère
// (le contenu, l'en-tête, la navigation), sans faire défiler la page.
type PageElement = FoundElement & {
  closest?: (selector: string) => unknown
}
const LANDINGS = [
  'h1, [role="heading"][aria-level="1"]',
  'main, [role="main"], header, [role="banner"], nav, [role="navigation"]',
]
/** Ce qui n'est pas « la page qui reste » : une couche (la feuille qui part), un contenu caché. */
const NOT_THE_PAGE = '[aria-modal="true"], [inert], [aria-hidden="true"]'

/** L'élément est-il la page elle-même (personne n'avait le focus avant la feuille) ? */
const isPageItself = (node: unknown): boolean => {
  const page = (globalThis as { document?: { body?: unknown; documentElement?: unknown } }).document
  return node == null || node === page?.body || node === page?.documentElement
}

/** Le titre principal de la page qui reste, sinon son premier repère ; null s'il n'y en a pas. */
const pageLanding = (): unknown => {
  const page = (
    globalThis as {
      document?: { querySelectorAll?: (selector: string) => ArrayLike<unknown> | undefined }
    }
  ).document
  for (const selector of LANDINGS) {
    const list = page?.querySelectorAll?.(selector)
    if (!list) continue
    const found = Array.from(list).find((element) => {
      const candidate = element as PageElement
      return (candidate.getClientRects?.().length ?? 0) > 0 && !candidate.closest?.(NOT_THE_PAGE)
    })
    if (found) return found
  }
  return null
}

/** Pose le focus sur la place d'arrivée de la page (rendue focalisable, hors de Tab). */
const focusPageLanding = (): boolean => {
  const landing = pageLanding()
  return landing ? focusWithoutScroll(focusTarget(landing)) : false
}

/**
 * Rend le focus à la fermeture : à l'ouvreur (retrouvé par son nom s'il a été redessiné), ou, sans
 * ouvreur, au titre de la page qui reste.
 */
const giveFocusBack = (back: unknown, name: string | null): void => {
  if (isPageItself(back)) focusPageLanding()
  else focusWithoutScroll(reachableOpener(back, name))
}

/**
 * Rend le focus à la fermeture : à la place choisie par l'écran (`returnFocusTo`) s'il en donne une,
 * sinon comme `giveFocusBack`. Elle sert deux fois : à la fermeture, puis à la fin du fondu de sortie
 * si le focus s'est perdu entre-temps (voir `onDismiss` dans `Sheet`).
 */
const giveFocusTo = (chosen: unknown, back: unknown, name: string | null): void => {
  if (chosen && focusWithoutScroll(chosen)) return
  giveFocusBack(back, name)
}

/**
 * Cache aux pièges à focus des couches qui se ferment le focus que la feuille rend à sa fermeture
 * (R6b, U2, des-C5). Pendant les fondus de sortie, le piège de chaque Modal de react-native-web
 * reste actif : celui d'une fenêtre fermée en même temps que la feuille (« Rattacher » confirmé)
 * ramenait chez lui le focus posé sur le résultat de la carte (« Rattacher », puis « Annuler »), et le
 * résultat ne l'avait qu'à la fin du fondu ; un lecteur d'écran lisait « Annuler » entre les deux.
 * On écoute donc le focus sur `window`, à la descente : le navigateur nous appelle avant les pièges,
 * posés sur le document (comme l'écoute des couches du dessus, plus bas). Un focus qui arrive sur
 * l'une des places données (`given` : celle choisie par l'écran, l'ouvreur) ne leur est pas
 * transmis, et il y reste ; tout autre focus passe. Rend de quoi retirer l'écoute (fin du fondu,
 * réouverture, disparition), ou null s'il n'y a rien à garder (hors du web).
 */
const keepFocusGiven = (given: readonly unknown[]): (() => void) | null => {
  const page = globalThis as unknown as WebWindow
  const targets: unknown[] = given.filter((node) => node != null)
  if (Platform.OS !== 'web' || targets.length === 0 || !page.addEventListener) return null
  const keep = (event: FocusEventLike) => {
    if (targets.includes(event.target)) event.stopImmediatePropagation?.()
  }
  page.addEventListener('focus', keep, true)
  return () => page.removeEventListener?.('focus', keep, true)
}

/**
 * Une feuille de téléphone qui a son adresse disparaît avec sa page, sans passer par « fermée » :
 * l'effet de fermeture ne tourne pas, et le focus restait sur `body`. Après le démontage, on rend
 * donc le focus à l'ouvreur (retrouvé par son nom si la barre a été redessinée), le temps que la
 * page d'avant reparaisse : quelques essais rapprochés, qui s'arrêtent dès que le focus est quelque
 * part (la page d'arrivée l'a pris : on ne le lui reprend pas). Sans ouvreur (feuille ouverte par
 * son adresse), ou si l'ouvreur n'est jamais revenu, le titre de la page qui reste.
 */
const RESTORE_TRIES = 8
const RESTORE_EVERY_MS = 100
const restoreAfterUnmount = (back: unknown, name: string | null, left = RESTORE_TRIES): void => {
  setTimeout(() => {
    if (!focusLost()) return
    if (!isPageItself(back)) {
      const target = reachableOpener(back, name)
      if ((target as FoundElement | null)?.isConnected !== false) {
        focusWithoutScroll(target)
        return
      }
    }
    // Le dernier essai, ou une feuille sans ouvreur : la page qui reste, si elle est déjà là.
    const lastTry = left <= 1
    if ((isPageItself(back) || lastTry) && focusPageLanding()) return
    if (!lastTry) restoreAfterUnmount(back, name, left - 1)
  }, RESTORE_EVERY_MS)
}

/** La poignée : ce qu'on saisit pour faire glisser la feuille vers le bas. */
const HANDLE = { width: 36, height: 5 }
/** L'espace gardé au-dessus de la feuille sur téléphone : on voit encore l'écran dessous. */
const SHEET_TOP_GAP = space.huge
/** Les marges autour du panneau sur ordinateur. */
const PANEL_MARGIN = space.xxxl
/**
 * La fenêtre avec sa colonne d'à côté (`aside`), d'après la planche R6-Publier-Desktop : 1 120
 * points en tout, dont un aperçu de 420 (le contenu a le reste, 656). Le contenu garde 480 points
 * au moins : en deçà, la colonne n'est plus posée à côté (voir `useSheetAside`) ; la fenêtre
 * rétrécit avec l'écran, la colonne gardant sa largeur.
 */
const BESIDE_WIDTH = 1120
const BESIDE_CONTENT_MIN = 480
/** La colonne d'à côté : l'aperçu (420) et la marge à sa droite (celle du contenu, à gauche). */
const ASIDE_PREVIEW = 420
const ASIDE_WIDTH = ASIDE_PREVIEW + space.xl
const ASIDE_GAP = space.xxl
/** La largeur de fenêtre qu'il faut pour poser la colonne à côté du panneau. */
const ASIDE_ROOM = BESIDE_CONTENT_MIN + ASIDE_GAP + ASIDE_WIDTH + 2 * PANEL_MARGIN

/**
 * Hook : vrai si une feuille ouverte maintenant poserait sa colonne `aside` à côté du contenu
 * (ordinateur, fenêtre assez large). L'écran y lit où mettre ce qu'il range dans la colonne (la
 * feuille de publication, R6a : « Qui peut le voir ? »), pour que rien ne disparaisse entre deux.
 */
export const useSheetAside = (): boolean => {
  const { sizeClass } = useLayout()
  const window = useWindowDimensions()
  return sizeClass !== 'compact' && window.width >= ASIDE_ROOM
}

// Le glisser vers le bas (téléphone, D1). Le doigt doit d'abord descendre de quelques points pour
// que la feuille le suive : une tape sur « Fermer », un peu tremblée, reste une tape. Au lâcher, la
// feuille se ferme si elle a assez descendu, ou si le doigt filait vers le bas ; sinon elle remonte.
// Les 8 points d'un geste hésitant ne ferment rien.
/** Ce que le doigt descend avant que la feuille le suive (points). */
const DRAG_SLOP = 6
/** Une descente de plus que cela ferme la feuille (points). */
const DRAG_CLOSE_DISTANCE = 120
/** Un doigt qui file vers le bas plus vite que cela (points par milliseconde)… */
const DRAG_CLOSE_SPEED = 0.5
/** … ferme aussi, passé ces quelques points (un lancer). */
const DRAG_FLICK_MIN = 24

/** Le geste a-t-il fini assez bas, ou assez vite, pour fermer la feuille ? */
const dragCloses = ({ dy, vy }: Pick<PanResponderGestureState, 'dy' | 'vy'>) =>
  dy > DRAG_CLOSE_DISTANCE || (vy > DRAG_CLOSE_SPEED && dy > DRAG_FLICK_MIN)

/** La touche a-t-elle déjà servi plus bas (la liste des mentions qui se ferme, un menu) ? */
const alreadyHandled = (event: KeyEvent) =>
  event.defaultPrevented === true ||
  event.isDefaultPrevented?.() === true ||
  event.nativeEvent?.defaultPrevented === true

// La pile des feuilles ouvertes, de la plus ancienne à celle du dessus (R6a). « Catégorie et
// outils » s'ouvre par-dessus « Nouveau projet » : Échap, le retour d'Android ou le voile ne ferment
// alors que la feuille du dessus. Sur le web, les touches de la seconde remontent l'arbre de React
// jusqu'à la première (une couche dans une autre) ; sur Android, le système peut prévenir les deux.
// Chaque feuille se demande donc, au moment du geste, si elle est en haut de la pile. Un module
// plutôt qu'un contexte React : la seconde feuille peut être rendue à côté de la première, pas
// dedans. (Au catalogue, les feuilles dessinées dans la page, `SheetPanel`, n'y entrent pas.)
const openSheets: string[] = []
/** La feuille `id` est-elle celle du dessus (ou la seule) ? */
const onTop = (id: string) => openSheets.length === 0 || openSheets[openSheets.length - 1] === id

// Le clavier à l'écran d'un navigateur de téléphone (R6b, U15). `window.visualViewport` est la zone
// que le membre voit réellement : quand le clavier s'ouvre, elle rétrécit (sa `height`) et peut se
// décaler (`offsetTop`) si le navigateur fait défiler la page pour amener le champ en vue. Selon le
// navigateur, la fenêtre « de mise en page » (celle où une couche `position: fixed` se calcule) suit
// ou non : la méta `interactive-widget=resizes-content` (`app/+html.tsx`) le demande à Chrome, mais
// Safari sur iPhone l'ignore. Sans cette mesure, la feuille gardait toute la hauteur de la fenêtre
// de mise en page, et son pied (le champ « Écrire un commentaire ») restait sous le clavier. La
// feuille prend donc la hauteur du `visualViewport`, seulement quand il est plus court que la
// fenêtre : clavier fermé, ou navigateur qui redimensionne déjà la page, rien ne change.
// Rien sur iOS et Android natifs (React Native gère le clavier : `KeyboardAvoidingView`), et rien
// avant `useHydrated()` : le pré-rendu ne connaît pas le navigateur.
type VisualViewportLike = {
  height: number
  offsetTop: number
  addEventListener: (type: 'resize' | 'scroll', listener: () => void) => void
  removeEventListener: (type: 'resize' | 'scroll', listener: () => void) => void
}
/** La zone visible quand le clavier la rétrécit : sa hauteur et son décalage ; sinon null. */
type VisibleArea = { height: number; top: number }

/** Hook : la zone visible de la page web, tant qu'elle est plus courte que la fenêtre ; sinon null. */
const useVisibleArea = (): VisibleArea | null => {
  const hydrated = useHydrated()
  const [measured, setMeasured] = useState<VisibleArea | null>(null)
  useEffect(() => {
    if (Platform.OS !== 'web' || !hydrated) return
    const viewport = (globalThis as { visualViewport?: VisualViewportLike }).visualViewport
    if (!viewport) return
    // La fenêtre de mise en page : `innerHeight` (celle de `useWindowDimensions` ne convient pas,
    // react-native-web la lit lui-même dans `visualViewport` : elle rétrécit avec le clavier, et
    // la comparaison ne verrait jamais d'écart). Un point d'écart (arrondis) n'est pas un clavier.
    const read = () => {
      const layoutHeight = (globalThis as { innerHeight?: number }).innerHeight ?? 0
      setMeasured(
        viewport.height < layoutHeight - 1
          ? { height: viewport.height, top: viewport.offsetTop }
          : null,
      )
    }
    read()
    viewport.addEventListener('resize', read)
    viewport.addEventListener('scroll', read)
    return () => {
      viewport.removeEventListener('resize', read)
      viewport.removeEventListener('scroll', read)
    }
  }, [hydrated])
  return measured
}

export function Sheet({
  open,
  onClose,
  closeGuard,
  aside,
  busy = false,
  initialFocusRef,
  returnFocusTo,
  ...panel
}: Props) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  const window = useWindowDimensions()
  const phone = sizeClass === 'compact'
  const besideRoom = useSheetAside()
  // Le clavier à l'écran du web : la zone visible, quand il la rétrécit (voir `useVisibleArea`).
  const visible = useVisibleArea()
  // « Réduire les animations » : la feuille de téléphone paraît par un fondu, au lieu de monter du
  // bas de l'écran (un grand déplacement).
  const calm = useCalmMotion()
  const closeRef = useRef<View>(null)
  const panelRef = useRef<View>(null)
  // L'élément qui avait le focus avant l'ouverture (le bouton d'origine) : il le retrouve à la
  // fermeture, sans faire défiler la page.
  const opener = useRef<unknown>(null)
  // Le même, gardé jusqu'à la fin du fondu de sortie (voir `onDismiss`, plus bas) ; dans une boîte,
  // car il peut être vide (la page elle-même : voir `giveFocusBack`) alors que la feuille a été
  // fermée.
  const returnTo = useRef<{ node: unknown } | null>(null)
  // La feuille a-t-elle été ouverte ? Seule une vraie fermeture rend le focus.
  const shown = useRef(false)
  // Son nom, pour le retrouver s'il a été redessiné entre-temps (voir `reachableOpener`).
  const openerName = useRef<string | null>(null)
  // La place choisie par l'écran (`returnFocusTo`), la dernière reçue : la fin du fondu la relit
  // après que l'écran a été redessiné.
  const returnFocusRef = useRef(returnFocusTo)
  returnFocusRef.current = returnFocusTo
  // L'écoute qui cache aux pièges le focus rendu à la fermeture (voir `keepFocusGiven`) : de quoi la
  // retirer, à la fin du fondu de sortie.
  const keptFocus = useRef<(() => void) | null>(null)
  // useId : un identifiant stable entre le serveur et le navigateur, pour nommer la feuille par son
  // titre (sur le web, c'est la couche du Modal qui porte ce nom : voir plus bas).
  const sheetId = useId()
  const titleId = `${sheetId}-title`
  // La garde contre la double tape (celle de Dialog) : la feuille s'ouvre souvent sous le doigt qui
  // vient de toucher « Modifier » ou « Supprimer mon compte », et la seconde tape tombait sur le
  // voile, qui la refermait aussitôt (un retour arrière, pour une feuille qui a son adresse).
  const tapsAllowed = useTapsAllowed(open, true)
  // Échap a deux voies sur le web : l'onKeyDown de la feuille (touche enfoncée) et l'écoute du
  // Modal de react-native-web (touche relâchée), qui appelle onRequestClose. Sans ce drapeau,
  // onClose partait deux fois : deux retours arrière, qui quittaient aussi la page d'avant.
  const escapeHandled = useRef(false)

  // La feuille entre dans la pile en s'ouvrant, et en sort en se fermant (ou en disparaissant).
  useEffect(() => {
    if (!open) return
    openSheets.push(sheetId)
    return () => {
      const index = openSheets.lastIndexOf(sheetId)
      if (index !== -1) openSheets.splice(index, 1)
    }
  }, [open, sheetId])

  // Sur le web, la feuille ouverte entre aussi dans la pile des couches modales (`modalLayers`), avec
  // les fenêtres de confirmation, et laisse son focus à une couche ouverte par-dessus elle (R6a,
  // contre-visite du design, N1). Le piège à focus du Modal de react-native-web ramène dans la
  // feuille tout focus posé hors d'elle, tant qu'elle est la couche active ; or la fenêtre ouverte
  // dessus (« Supprimer ce projet ? ») ne devient active qu'à la fin de son fondu. Entre-temps, son
  // « Annuler » perdait le focus au profit de la feuille, puis la fenêtre l'envoyait sur son premier
  // bouton, « Supprimer ». On écoute donc le focus sur `window`, à la descente : le navigateur nous
  // appelle avant les pièges, posés sur le document. Un focus arrivé dans une couche du dessus qui
  // s'ouvre encore ne leur est pas transmis (`stopImmediatePropagation`) : il reste où il est. Une
  // fois la couche du dessus active, on laisse tout passer : c'est son piège qui décide (il retient
  // le dernier élément focalisé pour faire boucler Maj+Tab).
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return
    const closeLayer = openModalLayer(sheetId, (node) => sameLayer(panelRef.current, node))
    const page = globalThis as unknown as WebWindow
    const guard = (event: FocusEventLike) => {
      if (inLayerAbove(sheetId, event.target) && layerStillOpening(event.target)) {
        event.stopImmediatePropagation?.()
      }
    }
    page.addEventListener?.('focus', guard, true)
    return () => {
      closeLayer()
      page.removeEventListener?.('focus', guard, true)
    }
  }, [open, sheetId])

  // Toute demande de fermeture passe ici : pendant une action qui ne s'arrête plus (`busy`), elle
  // est refusée, quelle que soit la voie (« Fermer », Échap, voile, retour Android, glisser) ;
  // `busy` l'emporte même sur `closeGuard` (R6a, ui-I3). Une feuille couverte par une autre ne se
  // ferme pas : la demande est pour celle du dessus. Avec `closeGuard`, c'est lui qui décide
  // (« Abandonner ce projet ? ») ; `onClose` ne part alors que de l'écran.
  const requestClose = () => {
    if (busy || !onTop(sheetId)) return
    if (closeGuard) closeGuard()
    else onClose()
  }

  // useEffect : à l'ouverture (web), on retient qui avait le focus et on le pose sur l'élément
  // attendu (`initialFocusRef`, le champ d'un commentaire), sinon sur « Fermer », le premier
  // élément de la feuille ; à la fermeture, on le rend. Le Modal de react-native-web pose d'abord
  // le focus sur le premier élément (son effet passe avant celui-ci) : le nôtre arrive ensuite, au
  // bon endroit, toujours dans la feuille. Sans ouvreur (ouverte par son adresse), le focus va au
  // titre de la page qui reste (`giveFocusBack`).
  useEffect(() => {
    escapeHandled.current = false
    if (Platform.OS !== 'web') return
    if (open) {
      shown.current = true
      opener.current = activeElement()
      openerName.current = nameOf(opener.current)
      const wanted = initialFocusRef?.current
      if (!wanted || !focusWithoutScroll(wanted)) focusWithoutScroll(closeRef.current)
      return
    }
    // Une feuille jamais ouverte n'a rien à rendre (montée fermée, elle ne prend pas le focus).
    if (!shown.current) return
    shown.current = false
    const back = opener.current
    opener.current = null
    returnTo.current = { node: back }
    const chosen = returnFocusRef.current?.()
    // Le focus que la feuille va poser, caché aux pièges des couches qui se ferment (voir
    // `keepFocusGiven`), jusqu'à la fin de son fondu.
    keptFocus.current?.()
    keptFocus.current = keepFocusGiven([chosen, back])
    giveFocusTo(chosen, back, openerName.current)
  }, [open, initialFocusRef])

  // Rouverte, la feuille ne cache plus rien ; démontée, elle retire son écoute.
  useEffect(() => {
    if (!open) return
    keptFocus.current?.()
    keptFocus.current = null
  }, [open])
  useEffect(
    () => () => {
      keptFocus.current?.()
      keptFocus.current = null
    },
    [],
  )

  // Démontée encore ouverte (la page de la feuille se ferme, sur téléphone) : voir
  // `restoreAfterUnmount`. `opener` n'est plein que tant que la feuille est ouverte.
  useEffect(
    () => () => {
      if (Platform.OS === 'web' && opener.current) {
        restoreAfterUnmount(opener.current, openerName.current)
      }
    },
    [],
  )

  // Le Modal du web garde la feuille le temps de son fondu de sortie, et le focus avec elle : en
  // disparaissant, elle le laissait parfois sur la page (`body`), où la feuille de dessous le
  // reprenait par sa tête au lieu de la ligne touchée (« Catégorie », R6a, ui-I10). À la fin
  // (`onDismiss`), on le rend donc encore au bouton d'origine, seulement s'il s'est perdu : un focus
  // posé ailleurs entre-temps (la page d'arrivée) est gardé. Pendant ce fondu, le piège à focus du
  // Modal est encore actif : il ramène dans la feuille tout focus posé hors d'elle, celui de la
  // fermeture compris. La place choisie par l'écran (`returnFocusTo`) passe donc aussi ici, sinon
  // le bouton retrouvé par son nom l'emportait (R6b, u8f : celui de la carte voisine).
  const onDismiss =
    Platform.OS === 'web'
      ? {
          onDismiss: () => {
            // Le fondu est fini, les pièges de la feuille aussi : le focus n'a plus à leur être caché.
            keptFocus.current?.()
            keptFocus.current = null
            const back = returnTo.current
            returnTo.current = null
            if (back && focusLost()) {
              giveFocusTo(returnFocusRef.current?.(), back.node, openerName.current)
            }
          },
        }
      : null

  // Sur téléphone (iOS, Android), le champ attendu reçoit le focus quand la feuille a fini de
  // paraître (`onShow` du Modal) : plus tôt, la fenêtre n'existe pas encore, et le clavier ne
  // s'ouvrirait pas.
  const onShow =
    Platform.OS !== 'web' && initialFocusRef
      ? { onShow: () => initialFocusRef.current?.focus() }
      : null

  // La dernière Échap enfoncée, lue au relâchement (web). Un champ de react-native-web arrête la
  // touche enfoncée avant qu'elle n'atteigne la feuille (`stopPropagation`) : la liste des mentions
  // qui s'y ferme sur Échap, la feuille ne le voit pas. Mais la touche relâchée arrive au Modal, qui
  // fermait la feuille avec la liste. On écoute donc la touche enfoncée sur le document, à la
  // descente (`capture`, avant le champ), et on garde l'événement : au relâchement, il dit si
  // quelqu'un l'a déjà prise (`defaultPrevented`, posé entre-temps par le champ).
  const lastEscape = useRef<BrowserKey | null>(null)
  useEffect(() => {
    lastEscape.current = null
    if (!open || Platform.OS !== 'web') return
    const page = (globalThis as { document?: WebDocument }).document
    if (!page?.addEventListener) return
    const note = (event: BrowserKey) => {
      if (event.key === 'Escape') lastEscape.current = event
    }
    page.addEventListener('keydown', note, true)
    return () => page.removeEventListener?.('keydown', note, true)
  }, [open])

  // Tab (web) : le focus tourne dans la feuille. Après le dernier élément, le premier ; avant le
  // premier (Maj+Tab), le dernier. Sans page web à parcourir, « Fermer ».
  const trapTab = (backwards: boolean) => {
    const root = panelRef.current as unknown as WebRoot | null
    const nodes = root?.querySelectorAll
      ? Array.from(root.querySelectorAll(TABBABLE)).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.hasAttribute('disabled') &&
            element.getClientRects().length > 0 &&
            // Une zone `inert` (les copies mesurées de ReadMore) a une boîte, mais `focus()` y échoue
            // sans rien dire : le focus restait sur place, et Tab n'avançait plus (R5b, des-C1).
            !element.closest('[inert]'),
        )
      : []
    if (nodes.length === 0) {
      focusWithoutScroll(closeRef.current)
      return
    }
    const index = nodes.indexOf(activeElement() as WebElement)
    const last = nodes.length - 1
    const next = backwards
      ? index <= 0
        ? last
        : index - 1
      : index === -1 || index === last
        ? 0
        : index + 1
    // Un focus ordinaire, cette fois : le navigateur fait défiler le contenu de la feuille jusqu'à
    // l'élément atteint. Avec `preventScroll`, Tab posait le focus sur un bouton resté sous le
    // pied (« Télécharger mes données », dans la feuille de suppression : HORS ÉCRAN, batterie de
    // R2). Seul le contenu de la feuille défile : la page dessous est cachée par le voile.
    nodes[next]?.focus()
  }

  // La touche vient-elle du panneau de la feuille ? Un menu « … » ou une confirmation ouverts
  // par-dessus sont d'autres couches de la page (d'autres Modal), mais leurs touches remontent
  // l'arbre de React jusqu'ici : sans ce test, Échap dans le menu fermait aussi la feuille, et Tab
  // y était ramené dans la feuille. `contains` est celui du navigateur ; sans lui (téléphone), ou
  // sans élément d'origine, la touche est à la feuille.
  const fromPanel = (event: KeyEvent) => {
    const panelNode = panelRef.current as unknown as {
      contains?: (node: unknown) => boolean
    } | null
    const origin = event.target ?? event.nativeEvent?.target
    if (typeof panelNode?.contains !== 'function' || origin == null) return true
    return panelNode.contains(origin)
  }

  // Les touches de la feuille (web) : Échap ferme, Tab reste dedans. Les touches montent depuis
  // l'élément qui a le focus jusqu'à la feuille ; seules les siennes comptent, et pas celles qu'un
  // élément dedans a déjà prises (la liste des mentions, fermée par Échap : ui-B1 de R5b).
  const keys =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            if (event.key !== 'Escape' && event.key !== 'Tab') return
            if (!fromPanel(event)) return
            if (alreadyHandled(event)) {
              // La touche relâchée, qui suit, n'est pas non plus pour la feuille.
              if (event.key === 'Escape') escapeHandled.current = true
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              // La touche relâchée arrivera aussi au Modal : elle est déjà prise en compte.
              escapeHandled.current = true
              // Une touche tenue enfoncée se répète : un seul geste, une seule fermeture.
              if (!event.repeat) requestClose()
            } else if (event.key === 'Tab') {
              event.preventDefault()
              trapTab(event.shiftKey === true)
            }
          },
        }
      : {}

  // Une tape sur le voile. Pendant une action `busy`, rien. Pendant la garde d'ouverture, elle ne
  // ferme rien, mais sur le web elle a déjà pris le focus (le voile est une `div` focalisable,
  // `tabIndex` -1) : on le rend à « Fermer », pour que Tab reparte de la feuille (relecture R5a,
  // une double tape sur « Partager »). Hors garde, elle ferme, et la page dessous ignore les tapes
  // un moment : la seconde tape d'une double tape y tomberait (le « Retour » de la page, qui
  // fermait la feuille puis quittait la page : mesuré à 390 et 1280 px).
  const onScrimPress = busy
    ? undefined
    : () => {
        if (!tapsAllowed) {
          if (Platform.OS === 'web') focusWithoutScroll(closeRef.current)
          return
        }
        requestClose()
        holdPageTaps()
      }

  // Le Modal appelle onRequestClose au retour d'Android, et sur le web quand Échap est relâchée.
  // Une Échap déjà prise par la feuille (touche enfoncée) n'y compte pas une seconde fois, ni une
  // Échap qu'un élément de la feuille a gardée pour lui (la liste des mentions).
  const onRequestClose = () => {
    const pressed = lastEscape.current
    lastEscape.current = null
    if (escapeHandled.current) {
      escapeHandled.current = false
      return
    }
    if (pressed?.defaultPrevented === true) return
    requestClose()
  }

  // Le glisser vers le bas (téléphone, D1). useSharedValue : une valeur que Reanimated lit sur le
  // fil des animations ; la feuille descend avec le doigt (`translateY`), sans repasser par React.
  const offset = useSharedValue(0)
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }))
  // Le geste est créé une fois (PanResponder, plus bas) : il lit ici l'état du moment (`busy`
  // change pendant un envoi, la fermeture et la hauteur de la fenêtre aussi).
  const guarded = closeGuard !== undefined
  const now = useRef({ busy, open, calm, guarded, close: requestClose, height: window.height })
  now.current = { busy, open, calm, guarded, close: requestClose, height: window.height }
  // Après une fermeture demandée par le geste, si la feuille est encore ouverte un moment plus
  // tard (la fermeture n'a pas eu lieu), elle remonte : jamais une feuille ouverte hors de l'écran.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
    },
    [],
  )
  // useLayoutEffect : avant que la feuille ne soit dessinée, elle repart de sa place (elle a pu se
  // fermer glissée à mi-hauteur).
  useLayoutEffect(() => {
    if (open) offset.value = 0
  }, [open, offset])

  // PanResponder : le système de réponse au toucher de React Native. La tête de la feuille demande
  // le doigt dès qu'il descend franchement (à la descente, `Capture`, avant « Fermer » qu'il a pu
  // toucher en premier) ; elle suit alors le doigt, puis, au lâcher, se ferme ou remonte.
  const drag = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        !now.current.busy && gesture.dy > DRAG_SLOP && gesture.dy > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        // Pendant une action en cours, la feuille ne bouge pas : un glissement ne ferme rien.
        if (now.current.busy) return
        offset.value = Math.max(0, gesture.dy)
      },
      onPanResponderRelease: (_event, gesture) => {
        const state = now.current
        if (state.busy || !dragCloses(gesture)) {
          offset.value = spring(0)
          return
        }
        // Avec `closeGuard` (R6a, ui-I3), la feuille ne part pas : elle remonte aussitôt à sa
        // place, et la question (« Abandonner ce projet ? ») s'ouvre par-dessus. Partie à mi-écran,
        // elle laisserait le formulaire hors de vue pendant qu'on y répond.
        if (state.guarded) {
          offset.value = spring(0)
          state.close()
          return
        }
        // La feuille continue de descendre, et se ferme. Avec « Réduire les animations », elle
        // reste où le doigt l'a laissée, et la couche disparaît par son fondu.
        if (!state.calm) offset.value = withTiming(state.height, { duration: durations.quick })
        state.close()
        if (settleTimer.current) clearTimeout(settleTimer.current)
        settleTimer.current = setTimeout(() => {
          if (now.current.open) offset.value = spring(0)
        }, durations.slow)
      },
      // Un autre geste a pris le doigt (le système, un défilement) : la feuille remonte.
      onPanResponderTerminate: () => {
        offset.value = spring(0)
      },
    }),
  ).current

  // Sur le web, le Modal de react-native-web est déjà une boîte de dialogue modale (`role="dialog"`,
  // `aria-modal`), sans nom : on le nomme par le titre, et la feuille ne s'en déclare pas une
  // seconde à l'intérieur (deux dialogues imbriqués, dont l'extérieur sans nom : relecture C4). Les
  // types de React Native ne connaissent pas cet attribut du web, d'où l'objet à part.
  const named = Platform.OS === 'web' ? ({ 'aria-labelledby': titleId } as object) : null

  return (
    // Modal : une couche au-dessus de tout l'écran. onRequestClose = retour Android ou Échap. Sur
    // téléphone, la feuille glisse du bas (par un fondu avec « Réduire les animations ») ; sur
    // ordinateur, le panneau paraît par un fondu.
    <Modal
      visible={open}
      transparent
      animationType={phone && !calm ? 'slide' : 'fade'}
      onRequestClose={onRequestClose}
      {...onShow}
      {...onDismiss}
      {...named}
    >
      {/* KeyboardAvoidingView : sur iOS, la couche se raccourcit de la hauteur du clavier quand il
          s'ouvre, comme dans Screen ; le pied collé (« Enregistrer », « Envoyer ») remonte
          au-dessus de lui, et le contenu défile dans la place qui reste, jusqu'aux champs du bas
          (relecture juridique jur-15, WCAG 2.4.11). Android redimensionne la fenêtre de lui-même,
          le web aussi. */}
      <KeyboardAvoidingView
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          // Clavier à l'écran sur le web : la couche prend la zone visible (pas de `flex: 0`, dont
          // la base web est nulle) ; son pied reste au-dessus du clavier.
          ...(visible
            ? {
                flexGrow: 0,
                flexShrink: 0,
                flexBasis: 'auto',
                height: visible.height,
                marginTop: visible.top,
              }
            : null),
        }}
        enabled={Platform.OS === 'ios'}
        {...(Platform.OS === 'ios' ? { behavior: 'padding' as const } : null)}
      >
        {/* La feuille d'abord, le voile ensuite : en s'ouvrant, la couche (web) pose le focus sur
            son premier élément atteignable, qui doit être dans la feuille. zIndex garde la feuille
            au-dessus du voile, dessiné après elle.
            pointerEvents « box-none » (en propriété : en style, react-native-web ne laisse pas
            passer les clics) : cette couche couvre l'écran (téléphone) ou toute la largeur
            (ordinateur), et prenait pour elle les tapes posées à côté de la feuille ; elles
            n'arrivaient jamais au voile, et le focus partait sur la page (essai de R5a, feuille
            Partager, 390 et 1280 px). Seule la feuille les reçoit, le reste va au voile.
            Sur téléphone, cette couche descend avec le doigt qui glisse la feuille (`dragStyle`). */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            phone
              ? { zIndex: 1, flex: 1, justifyContent: 'flex-end' }
              : {
                  // Sur ordinateur, la couche a la hauteur du panneau (base « auto »), sans
                  // dépasser la fenêtre. Pas de `flex: 0` : sur le web, il devient `flex: 0 1 0%`,
                  // une base nulle, et la couche tombait à 0 point de haut ; le panneau, calé en bas
                  // d'une couche vide posée au milieu, sortait alors par le haut de l'écran (la
                  // moitié de la feuille du profil au-dessus du bord, à 1440×900 : mesuré par
                  // `boundingBox` du dialogue, y = -386).
                  zIndex: 1,
                  flexGrow: 0,
                  flexShrink: 1,
                  flexBasis: 'auto',
                  minHeight: 0,
                  maxHeight: '100%',
                  justifyContent: 'center',
                },
            phone ? dragStyle : null,
          ]}
        >
          <SheetPanel
            {...panel}
            // La colonne d'à côté, seulement si la fenêtre a la place de la poser.
            {...(aside !== undefined && besideRoom ? { aside } : null)}
            onClose={requestClose}
            busy={busy}
            layout={phone ? 'phone' : 'desktop'}
            maxHeight={(visible?.height ?? window.height) - 2 * PANEL_MARGIN}
            closeRef={closeRef}
            panelRef={panelRef}
            keys={keys}
            {...(Platform.OS === 'web' ? { titleId } : null)}
            // Sur ordinateur, le panneau centré ne se glisse pas : « Fermer », Échap et le voile.
            {...(phone ? { dragHandlers: drag.panHandlers } : null)}
          />
        </Animated.View>
        {/* Toucher le voile ferme la feuille, comme « Fermer ». Caché aux lecteurs d'écran (ils
            ont le bouton) et hors de la touche Tab. Pendant la garde, la seconde tape d'une
            double tape n'y fait rien ; pendant une action `busy`, aucune tape. */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onScrimPress}
          {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
          style={{ position: 'absolute', inset: 0 }}
        />
      </KeyboardAvoidingView>
    </Modal>
  )
}

/**
 * La feuille elle-même, sans la couche qui la pose sur l'écran. Exportée pour le catalogue, qui la
 * montre ouverte dans la page, dans ses deux dispositions ; les écrans passent par Sheet.
 */
export function SheetPanel({
  title,
  subtitle,
  children,
  footer,
  notice,
  heading = 2,
  decoration,
  aside,
  onClose,
  closeLabel,
  layout: disposition,
  maxHeight,
  closeRef,
  panelRef,
  keys,
  busy = false,
  titleId: givenTitleId,
  compact = false,
  titleCount,
  dragHandlers,
  revealRef,
  titleRef,
  action,
  cancelLabel,
  footerNote,
}: PanelProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const reveal = useSheetReveal(revealRef, useCalmMotion())
  const phone = disposition === 'phone'
  // useId : un identifiant stable entre le serveur et le navigateur, pour nommer la feuille par
  // son titre (celui de Sheet, quand la couche du Modal porte déjà le nom).
  const panelId = useId()
  const ownTitleId = `${panelId}-title`
  const titleId = givenTitleId ?? ownTitleId
  // L'identifiant du message de la feuille : il décrit l'action grisée (« Rien à enregistrer pour
  // l'instant. »), qu'on peut encore atteindre par Tab (R6a, ui-B5).
  const noticeId = `${panelId}-notice`
  // La couche du Modal (web) est déjà la boîte de dialogue : la feuille n'en redéclare pas une.
  const dialog =
    givenTitleId === undefined
      ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': titleId }
      : null
  const close = closeLabel ?? t(($) => $.common.close)
  // Sur téléphone, l'action monte dans la tête (« Annuler », le titre, « Publier ») ; le message
  // d'un envoi se pose alors juste sous la tête, près du bouton touché (ui-B2).
  const actionOnTop = phone && action !== undefined
  // Les boutons du pied, sur ordinateur : « Annuler » et l'action, après la phrase `footerNote`.
  const footerActions = !phone && (action !== undefined || cancelLabel !== undefined)
  // Le pied collé existe dès qu'il a des boutons ou un message à montrer.
  const noticeBelow = Boolean(notice) && !actionOnTop
  const pinned = Boolean(footer) || noticeBelow || footerActions

  // L'action grisée qu'on peut encore atteindre se décrit par le message de la feuille.
  const described =
    action?.disabled && action.focusableWhenDisabled && notice
      ? { describedById: noticeId, hint: notice.message }
      : null
  // `focusableWhenDisabled` n'est passé à Button que s'il est demandé (sa prop de R6a).
  const reachable = action?.focusableWhenDisabled ? { focusableWhenDisabled: true } : null

  // Le message de la feuille, sous la tête ou en tête du pied : dans une vue à son identifiant, pour
  // décrire l'action grisée.
  const noticeNode = notice ? (
    <View nativeID={noticeId}>
      <Notice
        message={notice.message}
        tone={notice.tone ?? 'error'}
        polite={notice.polite ?? false}
        action={notice.action}
      />
    </View>
  ) : null

  // Le titre : seul, ou suivi de son nombre (« Commentaires 6 »). Le même identifiant le relie au
  // nom de la boîte de dialogue, qui se lit alors avec le nombre en toutes lettres.
  const titleNode = titleCount ? (
    <CountedTitle
      title={title}
      count={titleCount.count}
      spokenCount={titleCount.spoken}
      separator="space"
      level={heading}
      nativeID={titleId}
      {...(titleRef ? { focusRef: titleRef } : null)}
      {...(compact ? null : { variant: 'title2' as const })}
    />
  ) : (
    <Text
      variant={compact ? 'heading' : 'title2'}
      heading={heading}
      nativeID={titleId}
      {...(titleRef ? { focusRef: titleRef } : null)}
    >
      {title}
    </Text>
  )

  // La poignée, au centre ; décorative (« Fermer » ou « Annuler » font le même geste).
  const handle = (
    <View
      aria-hidden
      style={{
        width: HANDLE.width,
        height: HANDLE.height,
        borderRadius: radii.pill,
        backgroundColor: colors.line,
      }}
    />
  )

  // La tête d'une feuille qui porte son action, sur téléphone (R6a, planches R6-Publier et
  // R6-Publier-Outils) : la poignée, puis « Annuler », le titre et l'action. Seules la poignée et le
  // titre se saisissent pour glisser : un glissé commencé sur « Publier » ou « Annuler » ne ferme
  // rien (ui-M1). Le focus arrive sur « Annuler » à l'ouverture ; sans lui, sur l'action (« OK »).
  const actionHeader =
    phone && action ? (
      <View style={{ gap: space.xs }}>
        <View
          {...dragHandlers}
          style={{ alignItems: 'center', justifyContent: 'center', minHeight: space.xl }}
        >
          {handle}
        </View>
        <SheetHeader
          title={title}
          heading={heading}
          titleId={titleId}
          {...(dragHandlers ? { dragHandlers } : null)}
          {...(cancelLabel
            ? {
                cancel: {
                  label: cancelLabel,
                  onPress: onClose,
                  disabled: busy,
                  ...(closeRef ? { ref: closeRef } : null),
                },
              }
            : null)}
          action={{
            label: action.label,
            onPress: action.onPress,
            loading: action.busy ?? false,
            disabled: action.disabled ?? false,
            ...reachable,
            ...described,
            ...(cancelLabel === undefined && closeRef ? { ref: closeRef } : null),
          }}
        />
      </View>
    ) : null

  const header = actionHeader ?? (
    // Sur téléphone, toute la tête de la feuille (poignée, « Fermer », titre) se saisit pour la
    // glisser vers le bas (`dragHandlers`, donnés par Sheet).
    <View style={{ gap: space.md }} {...dragHandlers}>
      {/* La rangée du haut a la hauteur du bouton « Fermer » (44) : il y tient entier, au lieu de
          déborder du coin arrondi de la feuille, et la poignée est centrée dans la même rangée. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: layout.touchTarget,
        }}
      >
        {phone ? handle : null}
        {/* « Fermer », à côté de la poignée, au bord droit : le premier élément atteignable de la
            feuille, où le focus arrive à l'ouverture. Sur téléphone, « Annuler » (R6a) le
            remplace, au bord gauche ; sur ordinateur, « Annuler » est au pied, et la croix reste. */}
        {phone && cancelLabel !== undefined ? (
          <View style={{ position: 'absolute', left: 0 }}>
            <TextLink
              label={cancelLabel}
              onPress={onClose}
              role="button"
              disabled={busy}
              {...(closeRef ? { ref: closeRef } : null)}
            />
          </View>
        ) : (
          <View style={{ position: 'absolute', right: 0 }}>
            <IconButton
              icon="x"
              label={close}
              variant="plain"
              onPress={onClose}
              // Pendant une action qui ne s'arrête plus, « Fermer » est inactif : il ne mentirait pas.
              disabled={busy}
              {...(closeRef ? { ref: closeRef } : null)}
            />
          </View>
        )}
      </View>
      {/* Le titre et, à sa droite, le décor (s'il y en a un). Sans décor, la rangée garde à droite
          la place du bouton « Fermer », pour que les deux bords du titre restent alignés. Sauf un
          titre avec son nombre : sa taille est calculée pour que son plus long mot tienne dans la
          largeur de la feuille (`wholeWords`), et « Commentaires » se coupait à 200 % de texte dans
          cette place en moins (R5b, des-C2) ; « Fermer » est dans la rangée du dessus. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          ...(decoration || titleCount ? null : { paddingRight: layout.touchTarget + space.md }),
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          {/* Niveau 2 : la feuille s'ouvre par-dessus une page qui a déjà son titre ; niveau 1
              quand la feuille est toute la page. */}
          {titleNode}
          {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
        </View>
        {decoration ? (
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {decoration}
          </View>
        ) : null}
      </View>
    </View>
  )

  // Sur ordinateur, avec une colonne à côté : le contenu et la colonne forment une rangée, dans la
  // feuille même, sous sa tête et au-dessus de son pied (R6a : le formulaire à gauche, l'aperçu à
  // droite). Chacun défile pour lui.
  const beside = aside !== undefined && !phone
  // Une feuille courte sur téléphone : la hauteur de son contenu (voir `compact`).
  const hug = compact && phone

  // Le contenu, qui défile dans la feuille, le titre et le pied restant en place.
  // keyboardShouldPersistTaps : un bouton touché pendant que le clavier est ouvert agit du premier
  // coup.
  const content = (
    <ScrollView
      {...(revealRef ? { ref: reveal.scroller, ...reveal.listProps } : null)}
      style={{ flexShrink: 1 }}
      contentContainerStyle={{
        paddingHorizontal: space.xl,
        paddingTop: space.xl - space.sm,
        // Une feuille courte rapproche son contenu du bouton collé : moins de 32 points entre
        // le dernier bloc et le bouton (décision de Louis du 2/11).
        paddingBottom: pinned ? (compact ? space.lg : space.xl) : insets.bottom + space.xxl,
        gap: space.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Une vue autour du contenu, pour y mesurer la place d'un élément à amener en vue. */}
      {revealRef ? (
        <View
          ref={reveal.content as Ref<View>}
          onLayout={reveal.onContentLayout}
          collapsable={false}
          style={{ gap: space.xl }}
        >
          {children}
        </View>
      ) : (
        children
      )}
      {/* Sur téléphone, la phrase du pied (« Les membres verront ce projet… ») finit le contenu :
          l'action est dans la tête, il n'y a pas de pied où la poser. */}
      {phone && footerNote ? footerNote : null}
    </ScrollView>
  )

  // Les boutons du pied sur ordinateur (R6a, planche R6-Publier-Desktop) : la phrase à gauche, qui
  // prend la place qui reste, puis « Annuler » et l'action. Ils passent à la ligne quand la place
  // manque (texte agrandi), la phrase d'abord seule sur sa ligne.
  const actionRow = footerActions ? (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: space.md,
      }}
    >
      {footerNote ? (
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: layout.sideColumn, minWidth: 0 }}>
          {footerNote}
        </View>
      ) : null}
      {cancelLabel !== undefined ? (
        <Button label={cancelLabel} variant="secondary" onPress={onClose} disabled={busy} />
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          loading={action.busy ?? false}
          disabled={action.disabled ?? false}
          {...described}
          {...reachable}
        />
      ) : null}
    </View>
  ) : null

  // La feuille elle-même : son en-tête, son contenu qui défile (et sa colonne), son pied collé.
  const surface = (
    <Surface
      variant="sheet"
      radius="sheet"
      centered={!phone}
      padding="none"
      // Téléphone : toute la hauteur sous l'écart du haut ; ordinateur : jusqu'à la hauteur permise.
      // Le contenu défile alors dans la feuille, et le pied reste en vue.
      fit={phone && !hug ? 'fill' : 'shrink'}
      {...(phone ? { shadow: 'card' as const } : null)}
    >
      <View style={{ flexShrink: 1, ...(phone && !hug ? { flex: 1 } : null) }}>
        {/* paddingBottom : la liste défilée passe sous la tête, et son texte ne touche pas le titre
            (R5b, des-A8). Le haut du contenu en rend autant : au repos, rien ne change de place.
            Avec l'action dans la tête, un trait la sépare du contenu, comme sur la planche. */}
        <View
          style={{
            paddingHorizontal: actionOnTop ? space.md : space.xl,
            paddingTop: actionOnTop ? space.xs : space.md,
            paddingBottom: space.sm,
            ...(actionOnTop
              ? { borderBottomWidth: borders.hairline, borderBottomColor: colors.line }
              : null),
          }}
        >
          {header}
        </View>
        {/* Avec l'action dans la tête : le message juste dessous, toujours en vue. */}
        {actionOnTop && noticeNode ? (
          <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>{noticeNode}</View>
        ) : null}
        {beside ? (
          // minHeight 0 : la rangée peut être moins haute que son contenu, qui défile alors.
          <View
            style={{ flexDirection: 'row', flexShrink: 1, minHeight: 0, gap: ASIDE_GAP - space.xl }}
          >
            {/* Deux vues de largeur fixée autour des zones qui défilent : la largeur posée sur une
                ScrollView de react-native-web n'était pas tenue (l'aperçu prenait 600 points et le
                formulaire 230, capture du catalogue à 1440 px). */}
            <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>{content}</View>
            <View style={{ width: ASIDE_WIDTH, flexGrow: 0, flexShrink: 0, minHeight: 0 }}>
              <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{
                  paddingRight: space.xl,
                  paddingTop: space.xl - space.sm,
                  paddingBottom: space.xl,
                }}
              >
                {aside}
              </ScrollView>
            </View>
          </View>
        ) : (
          content
        )}
        {pinned ? (
          <View
            style={{
              gap: space.md,
              paddingHorizontal: space.xl,
              paddingTop: space.md,
              paddingBottom: (phone ? insets.bottom : 0) + space.xl,
              borderTopWidth: borders.hairline,
              borderTopColor: colors.line,
            }}
          >
            {noticeBelow ? noticeNode : null}
            {footer}
            {actionRow}
          </View>
        ) : null}
      </View>
    </Surface>
  )

  return (
    <View
      // Une boîte de dialogue modale, nommée par son titre (sauf dans le Modal du web, qui l'est
      // déjà). accessibilityViewIsModal : sur iOS, VoiceOver reste dans la feuille. Pas
      // d'`accessible` : il doit en atteindre chaque élément.
      {...dialog}
      accessibilityViewIsModal
      {...(panelRef ? { ref: panelRef } : null)}
      {...keys}
      style={
        phone
          ? hug
            ? // Courte : la hauteur du contenu, qui rétrécit (et défile) si la fenêtre manque de place.
              { flexShrink: 1, marginTop: insets.top + SHEET_TOP_GAP }
            : { flex: 1, marginTop: insets.top + SHEET_TOP_GAP }
          : {
              alignSelf: 'center',
              width: '100%',
              // Avec la colonne, la feuille s'élargit jusqu'à la largeur de la planche ; le contenu
              // prend ce que la colonne laisse.
              maxWidth: beside ? BESIDE_WIDTH + 2 * PANEL_MARGIN : layout.formWidth,
              paddingHorizontal: PANEL_MARGIN,
              ...(maxHeight === undefined ? null : { maxHeight }),
            }
      }
    >
      {surface}
    </View>
  )
}
