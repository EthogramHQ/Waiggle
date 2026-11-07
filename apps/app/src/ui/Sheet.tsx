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
import { borders, durations, layout, radii, space } from '@ruche/brand'
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
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
import { CountedTitle } from './CountedTitle'
import { focusWithoutScroll } from './focus'
import { IconButton } from './IconButton'
import { Notice } from './Notice'
import { Surface } from './Surface'
import { Text } from './Text'
import { holdPageTaps, useTapsAllowed } from './tapGuard'
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
}

/** Le message du pied d'une feuille : son texte, son ton, et s'il coupe la parole (alerte) ou non. */
export type SheetNotice = {
  message: string
  tone?: 'error' | 'info' | 'success'
  polite?: boolean
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

// Le peu du navigateur dont Tab a besoin : les éléments de la feuille qu'on peut atteindre, dans
// l'ordre du document. (Les types de React Native ne décrivent pas la page web.)
type WebElement = {
  tabIndex: number
  hasAttribute: (name: string) => boolean
  getClientRects: () => { length: number }
  focus: () => void
}
type WebRoot = { querySelectorAll?: (selector: string) => ArrayLike<WebElement> }
const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]'

/** L'élément qui a le focus dans la page, sur le web ; null ailleurs ou sans document. */
const activeElement = (): unknown =>
  (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null

/** La poignée : ce qu'on saisit pour faire glisser la feuille vers le bas. */
const HANDLE = { width: 36, height: 5 }
/** L'espace gardé au-dessus de la feuille sur téléphone : on voit encore l'écran dessous. */
const SHEET_TOP_GAP = space.huge
/** Les marges autour du panneau sur ordinateur. */
const PANEL_MARGIN = space.xxxl
/** La colonne posée à droite du panneau (`aside`), et l'écart entre les deux. */
const ASIDE_WIDTH = layout.sideColumn + space.xxl
const ASIDE_GAP = space.xxl
/** La largeur de fenêtre qu'il faut pour poser la colonne à côté du panneau. */
const ASIDE_ROOM = layout.formWidth + ASIDE_GAP + ASIDE_WIDTH + 2 * PANEL_MARGIN

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

export function Sheet({ open, onClose, aside, busy = false, initialFocusRef, ...panel }: Props) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  const window = useWindowDimensions()
  const phone = sizeClass === 'compact'
  // « Réduire les animations » : la feuille de téléphone paraît par un fondu, au lieu de monter du
  // bas de l'écran (un grand déplacement).
  const calm = useCalmMotion()
  const closeRef = useRef<View>(null)
  const panelRef = useRef<View>(null)
  // L'élément qui avait le focus avant l'ouverture (le bouton d'origine) : il le retrouve à la
  // fermeture, sans faire défiler la page.
  const opener = useRef<unknown>(null)
  // useId : un identifiant stable entre le serveur et le navigateur, pour nommer la feuille par son
  // titre (sur le web, c'est la couche du Modal qui porte ce nom : voir plus bas).
  const titleId = `${useId()}-title`
  // La garde contre la double tape (celle de Dialog) : la feuille s'ouvre souvent sous le doigt qui
  // vient de toucher « Modifier » ou « Supprimer mon compte », et la seconde tape tombait sur le
  // voile, qui la refermait aussitôt (un retour arrière, pour une feuille qui a son adresse).
  const tapsAllowed = useTapsAllowed(open, true)
  // Échap a deux voies sur le web : l'onKeyDown de la feuille (touche enfoncée) et l'écoute du
  // Modal de react-native-web (touche relâchée), qui appelle onRequestClose. Sans ce drapeau,
  // onClose partait deux fois : deux retours arrière, qui quittaient aussi la page d'avant.
  const escapeHandled = useRef(false)

  // Toute demande de fermeture passe ici : pendant une action qui ne s'arrête plus (`busy`), elle
  // est refusée, quelle que soit la voie (« Fermer », Échap, voile, retour Android).
  const requestClose = () => {
    if (busy) return
    onClose()
  }

  // useEffect : à l'ouverture (web), on retient qui avait le focus et on le pose sur l'élément
  // attendu (`initialFocusRef`, le champ d'un commentaire), sinon sur « Fermer », le premier
  // élément de la feuille ; à la fermeture, on le rend. Le Modal de react-native-web pose d'abord
  // le focus sur le premier élément (son effet passe avant celui-ci) : le nôtre arrive ensuite, au
  // bon endroit, toujours dans la feuille.
  useEffect(() => {
    escapeHandled.current = false
    if (Platform.OS !== 'web') return
    if (open) {
      opener.current = activeElement()
      const wanted = initialFocusRef?.current
      if (!wanted || !focusWithoutScroll(wanted)) focusWithoutScroll(closeRef.current)
      return
    }
    const back = opener.current
    opener.current = null
    if (back) focusWithoutScroll(back)
  }, [open, initialFocusRef])

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
            element.getClientRects().length > 0,
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
  const now = useRef({ busy, open, calm, close: requestClose, height: window.height })
  now.current = { busy, open, calm, close: requestClose, height: window.height }
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
      {...named}
    >
      {/* KeyboardAvoidingView : sur iOS, la couche se raccourcit de la hauteur du clavier quand il
          s'ouvre, comme dans Screen ; le pied collé (« Enregistrer », « Envoyer ») remonte
          au-dessus de lui, et le contenu défile dans la place qui reste, jusqu'aux champs du bas
          (relecture juridique jur-15, WCAG 2.4.11). Android redimensionne la fenêtre de lui-même,
          le web aussi. */}
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center' }}
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
            {...(aside !== undefined && !phone && window.width >= ASIDE_ROOM ? { aside } : null)}
            onClose={requestClose}
            busy={busy}
            layout={phone ? 'phone' : 'desktop'}
            maxHeight={window.height - 2 * PANEL_MARGIN}
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
}: PanelProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const phone = disposition === 'phone'
  // useId : un identifiant stable entre le serveur et le navigateur, pour nommer la feuille par
  // son titre (celui de Sheet, quand la couche du Modal porte déjà le nom).
  const ownTitleId = `${useId()}-title`
  const titleId = givenTitleId ?? ownTitleId
  // La couche du Modal (web) est déjà la boîte de dialogue : la feuille n'en redéclare pas une.
  const dialog =
    givenTitleId === undefined
      ? { role: 'dialog' as const, 'aria-modal': true, 'aria-labelledby': titleId }
      : null
  const close = closeLabel ?? t(($) => $.common.close)
  // Le pied collé existe dès qu'il a des boutons ou un message à montrer.
  const pinned = Boolean(footer) || Boolean(notice)

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
      {...(compact ? null : { variant: 'title2' as const })}
    />
  ) : (
    <Text variant={compact ? 'heading' : 'title2'} heading={heading} nativeID={titleId}>
      {title}
    </Text>
  )

  const header = (
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
        {phone ? (
          // La poignée, au centre ; décorative (le bouton « Fermer » fait le même geste).
          <View
            aria-hidden
            style={{
              width: HANDLE.width,
              height: HANDLE.height,
              borderRadius: radii.pill,
              backgroundColor: colors.line,
            }}
          />
        ) : null}
        {/* « Fermer », à côté de la poignée, au bord droit : le premier élément atteignable de la
            feuille, où le focus arrive à l'ouverture. */}
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
      </View>
      {/* Le titre et, à sa droite, le décor (s'il y en a un). Sans décor, la rangée garde à droite
          la place du bouton « Fermer », pour que les deux bords du titre restent alignés. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          ...(decoration ? null : { paddingRight: layout.touchTarget + space.md }),
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

  // Sur ordinateur, avec une colonne à côté : la feuille et la colonne forment une rangée, dans la
  // même boîte de dialogue ; la feuille garde sa largeur de formulaire et sa hauteur maximale.
  const beside = aside !== undefined && !phone
  // Une feuille courte sur téléphone : la hauteur de son contenu (voir `compact`).
  const hug = compact && phone
  // La feuille elle-même : son en-tête, son contenu qui défile, son pied collé.
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
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>{header}</View>
        {/* Le contenu défile dans la feuille, le titre et le pied restant en place.
              keyboardShouldPersistTaps : un bouton touché pendant que le clavier est ouvert agit du
              premier coup. */}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{
            paddingHorizontal: space.xl,
            paddingTop: space.xl,
            // Une feuille courte rapproche son contenu du bouton collé : moins de 32 points entre
            // le dernier bloc et le bouton (décision de Louis du 2/11).
            paddingBottom: pinned ? (compact ? space.lg : space.xl) : insets.bottom + space.xxl,
            gap: space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
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
            {notice ? (
              <Notice
                message={notice.message}
                tone={notice.tone ?? 'error'}
                polite={notice.polite ?? false}
              />
            ) : null}
            {footer}
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
              maxWidth: beside
                ? layout.formWidth + ASIDE_GAP + ASIDE_WIDTH + 2 * PANEL_MARGIN
                : layout.formWidth,
              paddingHorizontal: PANEL_MARGIN,
              ...(maxHeight === undefined ? null : { maxHeight }),
              ...(beside
                ? { flexDirection: 'row' as const, alignItems: 'center' as const, gap: ASIDE_GAP }
                : null),
            }
      }
    >
      {beside ? (
        // La feuille, à gauche : elle prend la place qui reste à côté de la colonne, sans dépasser
        // la hauteur de la fenêtre (une hauteur en nombre : un pourcentage ne se calculerait pas
        // dans une rangée sans hauteur fixe).
        <View
          style={{
            flex: 1,
            minWidth: 0,
            ...(maxHeight === undefined ? null : { maxHeight }),
          }}
        >
          {surface}
        </View>
      ) : (
        surface
      )}
      {beside ? <View style={{ width: ASIDE_WIDTH }}>{aside}</View> : null}
    </View>
  )
}
