// Le menu « … » (tranche 7b) : les actions secondaires d'une page (« Signaler ce profil »,
// « Bloquer ») derrière un seul bouton rond, au lieu d'un bouton ou d'un lien chacune (décision du
// 24/10/2026). Le bouton ouvre une petite liste flottante, posée juste sous lui (ou au-dessus s'il
// manque de place en bas), sur téléphone comme sur ordinateur : on la voit naître du bouton touché.
//
// La liste vit dans une couche au-dessus de l'écran (Modal), avec un fond invisible qui couvre tout
// le reste : toucher à côté ferme le menu sans rien faire (« Fermer le menu », pour les lecteurs
// d'écran), Échap aussi (ordinateur), comme le bouton retour (Android). Choisir une action ferme le
// menu, puis la fait.
//
// Au clavier (web) : à l'ouverture, le focus va sur la première action ; les flèches passent d'une
// action à l'autre (Début et Fin : la première et la dernière), Entrée ou Espace choisit, Échap
// referme. Une fois le menu fermé, le focus revient au bouton « … », sans faire défiler la page.
// Tab referme aussi le menu, et le focus continue son chemin : au contrôle qui suit « … » dans la
// page, comme si le menu, posé juste après son bouton, venait d'être traversé (modèle du bouton de
// menu) ; Maj+Tab revient au bouton « … », le contrôle qui le précède (relecture 7b).
import { borders, layout, radii, space } from '@ruche/brand'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { focusWithoutScroll } from './focus'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import { Surface } from './Surface'
import { Text } from './Text'
import { insetFocus } from './theme/document'
import { useTheme } from './theme/ThemeProvider'

/** Une action du menu. */
export type ActionMenuItem = {
  label: string
  onPress: () => void
  /** danger : une action qui retire ou coupe quelque chose (« Bloquer »), écrite en rouge. */
  tone?: 'default' | 'danger'
  /** Une icône devant le libellé (facultatif) : le drapeau de « Signaler ». */
  icon?: IconName
}

type Props = {
  items: ActionMenuItem[]
  /** Le nom du bouton, lu par les lecteurs d'écran : « Plus d'actions » par défaut. */
  label?: string
  /** glass : sur une image ou une lumière ; plain (par défaut) : sur une surface. */
  variant?: 'plain' | 'glass'
  /**
   * De quel côté du bouton le menu s'aligne. Sans réglage : sur son bord droit s'il est dans la
   * moitié droite de l'écran, sur son bord gauche sinon. end : toujours sur son bord droit, le menu
   * s'ouvrant vers la gauche, pour un « … » posé au bout d'une rangée : il reste au-dessus de sa
   * colonne au lieu de couvrir la voisine (la colonne latérale d'un projet, relecture 7b).
   */
  align?: 'end'
}

/** La largeur du menu, en points : de quoi lire « Signaler ce profil » sur une ligne. */
const MENU_WIDTH = 260
/** L'écart entre le bouton et le menu. */
const GAP = space.xs
/** La marge gardée entre le menu et les bords de l'écran. */
const EDGE = space.lg
/**
 * Pendant ce temps après l'ouverture, une tape sur le bouton « … » (sous le fond invisible) ne
 * referme pas le menu : c'est la seconde tape d'une double tape, pas un geste pour le fermer.
 */
const DOUBLE_TAP_MS = 500

type Rect = { x: number; y: number; width: number; height: number }
type KeyEvent = { key: string; shiftKey?: boolean; preventDefault: () => void }
type PressEvent = { nativeEvent?: { pageX?: number; pageY?: number } }

// Le peu du navigateur dont on a besoin pour Tab : les éléments de la page qu'on peut atteindre,
// dans l'ordre du document, et leur place par rapport au bouton « … ». (Les types de React Native
// ne décrivent pas la page web.)
type WebElement = {
  tabIndex: number
  focus: () => void
  hasAttribute: (name: string) => boolean
  closest: (selector: string) => unknown
  getClientRects: () => { length: number }
  compareDocumentPosition: (other: WebElement) => number
}
type WebDocument = { querySelectorAll: (selector: string) => ArrayLike<WebElement> }
/** Node.DOCUMENT_POSITION_FOLLOWING : l'autre élément vient après celui-ci dans la page. */
const FOLLOWING = 4
const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * Sur le web, le premier élément que Tab atteindrait après `node` : atteignable (tabIndex ≥ 0),
 * actif, affiché (une page restée dessous dans la pile de navigation est cachée), hors d'une zone
 * cachée aux lecteurs d'écran. Rien s'il n'y en a pas (le bouton est le dernier de la page).
 */
const nextTabbable = (node: unknown): WebElement | null => {
  const document = (globalThis as { document?: WebDocument }).document
  if (Platform.OS !== 'web' || !document || !node) return null
  const from = node as WebElement
  return (
    Array.from(document.querySelectorAll(TABBABLE)).find(
      (element) =>
        element !== from &&
        (from.compareDocumentPosition(element) & FOLLOWING) !== 0 &&
        element.tabIndex >= 0 &&
        !element.hasAttribute('disabled') &&
        element.closest('[aria-hidden="true"], [inert]') === null &&
        element.getClientRects().length > 0,
    ) ?? null
  )
}

export function ActionMenu({ items, label, variant = 'plain', align }: Props) {
  const { t } = useTranslation()
  const window = useWindowDimensions()
  const [open, setOpen] = useState(false)
  // Où est le bouton dans la fenêtre, et quelle taille a le menu : de quoi le poser. Tant que
  // l'un des deux manque (le premier dessin), le menu reste transparent : il n'apparaît jamais
  // ailleurs pour sauter ensuite à sa place.
  const [anchor, setAnchor] = useState<Rect | null>(null)
  const [menuHeight, setMenuHeight] = useState<number | null>(null)
  const trigger = useRef<View>(null)
  const actions = useRef<(View | null)[]>([])
  // Vrai entre l'ouverture et la fermeture : une double tape sur une action ne la fait qu'une fois.
  const opened = useRef(false)
  const openedAt = useRef(0)
  // Sur le web, l'action choisie attend que le menu ait quitté la page (voir `closed`).
  const chosen = useRef<(() => void) | null>(null)
  // Sur le web, vrai quand Tab a fermé le menu : le focus ira au contrôle qui suit « … ».
  const tabbedOut = useRef(false)

  const measure = () => {
    trigger.current?.measureInWindow?.((x, y, width, height) => setAnchor({ x, y, width, height }))
  }

  const show = () => {
    opened.current = true
    openedAt.current = Date.now()
    setAnchor(null)
    setMenuHeight(null)
    setOpen(true)
    measure()
  }

  const hide = () => {
    opened.current = false
    setOpen(false)
  }

  const choose = (item: ActionMenuItem) => {
    if (!opened.current) return
    hide()
    // Sur le web, l'action attend la fin de la fermeture : le focus est alors revenu au bouton
    // « … », et une fenêtre ouverte par l'action (« Bloquer @lea ? ») le lui rendra en se fermant.
    // Ailleurs, pas de focus clavier à suivre : l'action part tout de suite.
    if (Platform.OS === 'web') chosen.current = item.onPress
    else item.onPress()
  }

  // Tab (web) : le menu se ferme, et le focus ira plus loin que « … » (voir `closed`) ; Maj+Tab
  // le rend seulement au bouton.
  const leave = (forward: boolean) => {
    tabbedOut.current = forward
    hide()
  }

  // Le menu a quitté la page (web) : le focus revient au bouton, puis l'action choisie part. Après
  // Tab, il va au contrôle suivant, comme une vraie tabulation (la page peut défiler jusqu'à lui) ;
  // s'il n'y en a pas, il reste au bouton.
  const closed = () => {
    const next = tabbedOut.current ? nextTabbable(trigger.current) : null
    tabbedOut.current = false
    if (next) next.focus()
    else focusWithoutScroll(trigger.current)
    const action = chosen.current
    chosen.current = null
    action?.()
  }

  // Le fond invisible : le toucher ferme le menu, sauf la seconde tape d'une double tape sur « … ».
  // Cette seconde tape ne ferme rien, mais le navigateur donne le focus à ce qu'elle touche (le
  // fond, sans rôle visible : « Fermer le menu ») : on le rend à la première action, où l'ouverture
  // l'avait posé (relecture de design 7b).
  const dismiss = (event?: PressEvent) => {
    const at = event?.nativeEvent
    if (
      anchor &&
      at?.pageX !== undefined &&
      at.pageY !== undefined &&
      Date.now() - openedAt.current < DOUBLE_TAP_MS &&
      at.pageX >= anchor.x &&
      at.pageX <= anchor.x + anchor.width &&
      at.pageY >= anchor.y &&
      at.pageY <= anchor.y + anchor.height
    ) {
      focusWithoutScroll(actions.current[0])
      return
    }
    hide()
  }

  // L'écran tourne ou la fenêtre change de taille pendant que le menu est ouvert : on le repose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la taille de la fenêtre compte.
  useEffect(() => {
    if (open) measure()
  }, [window.width, window.height])

  // À l'ouverture, sur le web, le focus va sur la première action (le menu est une liste de choix,
  // pas une page à parcourir), une fois le menu posé dans la page.
  useEffect(() => {
    if (!open || Platform.OS !== 'web') return
    const frame = requestAnimationFrame(() => focusWithoutScroll(actions.current[0]))
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Où poser le menu : sous le bouton, aligné sur son bord droit s'il est dans la moitié droite de
  // l'écran ou si l'écran le demande (`align`), sur son bord gauche sinon, sans jamais sortir de
  // l'écran. S'il manque de place en bas, au-dessus du bouton ; s'il en manque des deux côtés
  // (texte très agrandi), contre le haut, et il défile.
  const width = Math.min(MENU_WIDTH, window.width - 2 * EDGE)
  const maxHeight = window.height - 2 * EDGE
  const position = (() => {
    if (!anchor || menuHeight === null) return null
    const alignRight = align === 'end' || anchor.x + anchor.width / 2 > window.width / 2
    const wanted = alignRight ? anchor.x + anchor.width - width : anchor.x
    const left = Math.max(EDGE, Math.min(wanted, window.width - EDGE - width))
    const below = anchor.y + anchor.height + GAP
    const height = Math.min(menuHeight, maxHeight)
    const top =
      below + height <= window.height - EDGE
        ? below
        : anchor.y - GAP - height >= EDGE
          ? anchor.y - GAP - height
          : EDGE
    return { left, top }
  })()

  return (
    <>
      <IconButton
        ref={trigger}
        icon="dots-three"
        label={label ?? t(($) => $.actionMenu.label)}
        variant={variant}
        expanded={open}
        hasMenu
        onPress={show}
      />
      <Modal
        visible={open}
        transparent
        // Sans fondu : le menu apparaît et disparaît d'un coup, comme ceux du système, et le focus
        // revient au bouton dès la fermeture (un fondu le garderait encore dans la couche).
        animationType="none"
        onRequestClose={hide}
        {...(Platform.OS === 'web' ? { onDismiss: closed } : null)}
      >
        <View style={{ flex: 1 }}>
          {/* Le menu d'abord, le fond ensuite : en s'ouvrant, la couche (web) pose le focus sur
              son premier élément atteignable, qui doit être la première action. zIndex garde le
              menu au-dessus du fond, dessiné après lui. */}
          <View
            onLayout={(event: LayoutChangeEvent) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              position: 'absolute',
              zIndex: 1,
              width,
              maxHeight,
              left: position?.left ?? EDGE,
              top: position?.top ?? EDGE,
              // Transparent tant qu'il n'est pas à sa place (le premier dessin, le temps de mesurer).
              opacity: position ? 1 : 0,
            }}
          >
            <ActionMenuList
              label={label ?? t(($) => $.actionMenu.label)}
              items={items}
              onChoose={choose}
              onLeave={leave}
              actions={actions}
              maxHeight={maxHeight}
            />
          </View>
          {/* Le fond invisible qui couvre l'écran : le toucher ferme le menu. Hors de la touche
              Tab (tabIndex -1) : au clavier, Échap ferme. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(($) => $.actionMenu.close)}
            onPress={dismiss}
            {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
            style={{ position: 'absolute', inset: 0 }}
          />
        </View>
      </Modal>
    </>
  )
}

type ListProps = {
  /** Le nom du menu, lu par les lecteurs d'écran (le même que celui du bouton). */
  label: string
  items: ActionMenuItem[]
  onChoose: (item: ActionMenuItem) => void
  /**
   * Tab, sur le web : on quitte le menu (il se ferme) ; `forward` vrai pour Tab, faux pour Maj+Tab.
   */
  onLeave?: (forward: boolean) => void
  /** Où ranger les actions, pour y poser le focus (la première à l'ouverture, les flèches). */
  actions?: RefObject<(View | null)[]>
  /** La hauteur au-delà de laquelle la liste défile. */
  maxHeight?: number
}

/**
 * La liste des actions, telle qu'elle flotte sous le bouton « … ». Exportée pour le catalogue, qui
 * la montre ouverte sans couche par-dessus la page ; les écrans passent par ActionMenu.
 */
export function ActionMenuList({ label, items, onChoose, onLeave, actions, maxHeight }: ListProps) {
  const { colors } = useTheme()
  const own = useRef<(View | null)[]>([])
  const refs = actions ?? own

  // Les touches d'une action, sur le web. react-native-web ne choisit à l'Espace que les boutons ;
  // les flèches et Tab sont propres à un menu.
  const keys = (index: number, item: ActionMenuItem) =>
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            const last = items.length - 1
            const target =
              event.key === 'ArrowDown'
                ? index === last
                  ? 0
                  : index + 1
                : event.key === 'ArrowUp'
                  ? index === 0
                    ? last
                    : index - 1
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : null
            if (target !== null) {
              event.preventDefault()
              focusWithoutScroll(refs.current[target])
            } else if (event.key === ' ') {
              event.preventDefault()
              onChoose(item)
            } else if (event.key === 'Tab' && onLeave) {
              // Tab quitte le menu : il se ferme, et l'écran pose le focus là où la tabulation
              // mène (le contrôle après « … », ou « … » lui-même avec Maj). Le geste par défaut
              // reste empêché : le navigateur le ferait tourner dans la couche du menu, qui part.
              event.preventDefault()
              onLeave(event.shiftKey !== true)
            }
          },
        }
      : {}

  return (
    // role « menu » : le lecteur d'écran annonce une liste d'actions, nommée comme son bouton. Pas
    // d'`accessible` : sur iOS, VoiceOver doit atteindre chaque action.
    <View accessibilityRole="menu" aria-label={label}>
      <Surface variant="panel" radius="group" padding="xs">
        {/* Plus haut que l'écran (texte très agrandi) : la liste défile dans le menu. */}
        <ScrollView
          bounces={false}
          style={maxHeight === undefined ? undefined : { maxHeight: maxHeight - 2 * space.xs }}
        >
          {items.map((item, index) => (
            <View key={item.label}>
              {/* Un trait fin entre deux actions, en retrait des coins arrondis. */}
              {index > 0 ? (
                <View
                  style={{
                    height: borders.hairline,
                    backgroundColor: colors.line,
                    marginHorizontal: space.md,
                  }}
                />
              ) : null}
              <Pressable
                ref={(node) => {
                  refs.current[index] = node
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                onPress={() => onChoose(item)}
                {...keys(index, item)}
                // L'anneau de focus se dessine à l'intérieur de l'action : le menu rogne ce qui
                // dépasse de ses coins.
                {...insetFocus}
                style={({ pressed }) => ({
                  minHeight: layout.touchTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  borderRadius: radii.small,
                  ...(pressed ? { backgroundColor: colors.surfaceGrouped } : null),
                })}
              >
                {item.icon ? (
                  <Icon
                    name={item.icon}
                    size={20}
                    tone={item.tone === 'danger' ? 'danger' : 'secondary'}
                  />
                ) : null}
                {/* flexShrink : un libellé long, ou très agrandi, passe à la ligne. */}
                <View style={{ flexShrink: 1 }}>
                  <Text
                    weight={500}
                    tone={item.tone === 'danger' ? 'danger' : 'default'}
                    selectable={false}
                  >
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </Surface>
    </View>
  )
}
