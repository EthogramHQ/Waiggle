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
// Android. Toucher le voile ferme aussi. (Relecture juridique du plan, jur-15.)
import { borders, layout, radii, space } from '@ruche/brand'
import { type ReactNode, type Ref, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { focusWithoutScroll } from './focus'
import { IconButton } from './IconButton'
import { Surface } from './Surface'
import { Text } from './Text'
import { useLayout } from './theme/layout'
import { useTheme } from './theme/ThemeProvider'

type PanelProps = {
  title: string
  /** Une phrase sous le titre (« Voici ce qui disparaît avec lui. »). */
  subtitle?: string
  children: ReactNode
  /** Les boutons collés en bas de la feuille (l'action principale, puis « Annuler »). */
  footer?: ReactNode
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
}

type Props = Omit<PanelProps, 'layout' | 'maxHeight' | 'closeRef' | 'panelRef' | 'keys'> & {
  open: boolean
}

type KeyEvent = { key: string; shiftKey?: boolean; preventDefault: () => void }

// Le peu du navigateur dont Tab a besoin : les éléments de la feuille qu'on peut atteindre, dans
// l'ordre du document. (Les types de React Native ne décrivent pas la page web.)
type WebElement = {
  tabIndex: number
  hasAttribute: (name: string) => boolean
  getClientRects: () => { length: number }
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

export function Sheet({ open, onClose, aside, ...panel }: Props) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  const window = useWindowDimensions()
  const phone = sizeClass === 'compact'
  const closeRef = useRef<View>(null)
  const panelRef = useRef<View>(null)
  // L'élément qui avait le focus avant l'ouverture (le bouton d'origine) : il le retrouve à la
  // fermeture, sans faire défiler la page.
  const opener = useRef<unknown>(null)

  // useEffect : à l'ouverture (web), on retient qui avait le focus et on le pose sur « Fermer »,
  // le premier élément de la feuille ; à la fermeture, on le rend. Le Modal de react-native-web
  // fait de même de son côté : les deux gestes se recouvrent, sans se gêner.
  useEffect(() => {
    if (Platform.OS !== 'web') return
    if (open) {
      opener.current = activeElement()
      focusWithoutScroll(closeRef.current)
      return
    }
    const back = opener.current
    opener.current = null
    if (back) focusWithoutScroll(back)
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
    focusWithoutScroll(nodes[next])
  }

  // Les touches de la feuille (web) : Échap ferme, Tab reste dedans. Les touches montent depuis
  // l'élément qui a le focus jusqu'à la feuille.
  const keys =
    Platform.OS === 'web'
      ? {
          onKeyDown: (event: KeyEvent) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            } else if (event.key === 'Tab') {
              event.preventDefault()
              trapTab(event.shiftKey === true)
            }
          },
        }
      : {}

  return (
    // Modal : une couche au-dessus de tout l'écran. onRequestClose = retour Android ou Échap. Sur
    // téléphone, la feuille glisse du bas ; sur ordinateur, le panneau paraît par un fondu.
    <Modal
      visible={open}
      transparent
      animationType={phone ? 'slide' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center' }}>
        {/* La feuille d'abord, le voile ensuite : en s'ouvrant, la couche (web) pose le focus sur
            son premier élément atteignable, qui doit être dans la feuille. zIndex garde la feuille
            au-dessus du voile, dessiné après elle. */}
        <View style={{ zIndex: 1, flex: phone ? 1 : 0, justifyContent: 'flex-end' }}>
          <SheetPanel
            {...panel}
            // La colonne d'à côté, seulement si la fenêtre a la place de la poser.
            {...(aside !== undefined && !phone && window.width >= ASIDE_ROOM ? { aside } : null)}
            onClose={onClose}
            layout={phone ? 'phone' : 'desktop'}
            maxHeight={window.height - 2 * PANEL_MARGIN}
            closeRef={closeRef}
            panelRef={panelRef}
            keys={keys}
          />
        </View>
        {/* Toucher le voile ferme la feuille, comme « Fermer ». Caché aux lecteurs d'écran (ils
            ont le bouton) et hors de la touche Tab. */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onClose}
          {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>
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
}: PanelProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const phone = disposition === 'phone'
  // useId : un identifiant stable entre le serveur et le navigateur, pour nommer la feuille par
  // son titre.
  const titleId = `${useId()}-title`
  const close = closeLabel ?? t(($) => $.common.close)

  const header = (
    <View style={{ gap: space.md }}>
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
          <Text variant="title2" heading={heading} nativeID={titleId}>
            {title}
          </Text>
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
  // La feuille elle-même : son en-tête, son contenu qui défile, son pied collé.
  const surface = (
    <Surface
      variant="sheet"
      radius="sheet"
      centered={!phone}
      padding="none"
      // Téléphone : toute la hauteur sous l'écart du haut ; ordinateur : jusqu'à la hauteur permise.
      // Le contenu défile alors dans la feuille, et le pied reste en vue.
      fit={phone ? 'fill' : 'shrink'}
      {...(phone ? { shadow: 'card' as const } : null)}
    >
      <View style={{ flexShrink: 1, ...(phone ? { flex: 1 } : null) }}>
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md }}>{header}</View>
        {/* Le contenu défile dans la feuille, le titre et le pied restant en place.
              keyboardShouldPersistTaps : un bouton touché pendant que le clavier est ouvert agit du
              premier coup. */}
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{
            paddingHorizontal: space.xl,
            paddingTop: space.xl,
            paddingBottom: footer ? space.xl : insets.bottom + space.xxl,
            gap: space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? (
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
            {footer}
          </View>
        ) : null}
      </View>
    </Surface>
  )

  return (
    <View
      // Une boîte de dialogue modale, nommée par son titre. accessibilityViewIsModal : sur iOS,
      // VoiceOver reste dans la feuille. Pas d'`accessible` : il doit en atteindre chaque élément.
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      accessibilityViewIsModal
      {...(panelRef ? { ref: panelRef } : null)}
      {...keys}
      style={
        phone
          ? { flex: 1, marginTop: insets.top + SHEET_TOP_GAP }
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
