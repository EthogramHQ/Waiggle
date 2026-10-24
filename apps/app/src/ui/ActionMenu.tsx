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
// action à l'autre (Début et Fin : la première et la dernière), Entrée ou Espace choisit, Échap ou
// Tab referme. Une fois le menu fermé, le focus revient au bouton « … », sans faire défiler la page.
import { borders, layout, radii, space } from '@ruche/brand'
import { useEffect, useRef, useState } from 'react'
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

export function ActionMenu({ items, label, variant = 'plain' }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
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

  // Le menu a quitté la page (web) : le focus revient au bouton, puis l'action choisie part.
  const closed = () => {
    focusWithoutScroll(trigger.current)
    const action = chosen.current
    chosen.current = null
    action?.()
  }

  // Le fond invisible : le toucher ferme le menu, sauf la seconde tape d'une double tape sur « … ».
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
              focusWithoutScroll(actions.current[target])
            } else if (event.key === ' ') {
              event.preventDefault()
              choose(item)
            } else if (event.key === 'Tab') {
              // Tab quitte le menu : il se ferme, et le focus revient au bouton « … ».
              event.preventDefault()
              hide()
            }
          },
        }
      : {}

  // Où poser le menu : sous le bouton, aligné sur son bord droit s'il est dans la moitié droite de
  // l'écran (sur son bord gauche sinon), sans jamais sortir de l'écran. S'il manque de place en
  // bas, au-dessus du bouton ; s'il en manque des deux côtés (texte très agrandi), contre le haut,
  // et il défile.
  const width = Math.min(MENU_WIDTH, window.width - 2 * EDGE)
  const maxHeight = window.height - 2 * EDGE
  const position = (() => {
    if (!anchor || menuHeight === null) return null
    const alignRight = anchor.x + anchor.width / 2 > window.width / 2
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
        label={label ?? t('actionMenu.label')}
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
          {/* Le fond invisible qui couvre l'écran : le toucher ferme le menu. Hors de la touche
              Tab (tabIndex -1) : au clavier, Échap ferme. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('actionMenu.close')}
            onPress={dismiss}
            {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            accessibilityRole="menu"
            aria-label={label ?? t('actionMenu.label')}
            onLayout={(event: LayoutChangeEvent) => setMenuHeight(event.nativeEvent.layout.height)}
            style={{
              position: 'absolute',
              width,
              maxHeight,
              left: position?.left ?? EDGE,
              top: position?.top ?? EDGE,
              // Transparent tant qu'il n'est pas à sa place (le premier dessin, le temps de mesurer).
              opacity: position ? 1 : 0,
            }}
          >
            <Surface variant="panel" radius="group" padding="xs">
              {/* Plus haut que l'écran (texte très agrandi) : la liste défile dans le menu. */}
              <ScrollView bounces={false} style={{ maxHeight: maxHeight - 2 * space.xs }}>
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
                        actions.current[index] = node
                      }}
                      accessibilityRole="menuitem"
                      accessibilityLabel={item.label}
                      onPress={() => choose(item)}
                      {...keys(index, item)}
                      // L'anneau de focus se dessine à l'intérieur de l'action : le menu rogne
                      // ce qui dépasse de ses coins.
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
        </View>
      </Modal>
    </>
  )
}
