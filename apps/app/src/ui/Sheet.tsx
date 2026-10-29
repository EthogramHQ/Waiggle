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
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
}

type Props = Omit<PanelProps, 'layout' | 'maxHeight'> & {
  open: boolean
}

/** La poignée : ce qu'on saisit pour faire glisser la feuille vers le bas. */
const HANDLE = { width: 36, height: 5 }
/** L'espace gardé au-dessus de la feuille sur téléphone : on voit encore l'écran dessous. */
const SHEET_TOP_GAP = space.huge
/** Les marges autour du panneau sur ordinateur. */
const PANEL_MARGIN = space.xxxl

export function Sheet({ open, onClose, ...panel }: Props) {
  const { colors } = useTheme()
  const { sizeClass } = useLayout()
  const window = useWindowDimensions()
  const phone = sizeClass === 'compact'
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
            onClose={onClose}
            layout={phone ? 'phone' : 'desktop'}
            maxHeight={window.height - 2 * PANEL_MARGIN}
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
  onClose,
  closeLabel,
  layout: disposition,
  maxHeight,
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
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
          <IconButton icon="x" label={close} variant="plain" onPress={onClose} />
        </View>
      </View>
      <View style={{ gap: space.xs, paddingRight: layout.touchTarget + space.md }}>
        {/* Niveau 2 : la feuille s'ouvre par-dessus une page qui a déjà son titre. */}
        <Text variant="title2" heading={2} nativeID={titleId}>
          {title}
        </Text>
        {subtitle ? <Text tone="secondary">{subtitle}</Text> : null}
      </View>
    </View>
  )

  return (
    <View
      // Une boîte de dialogue modale, nommée par son titre. accessibilityViewIsModal : sur iOS,
      // VoiceOver reste dans la feuille. Pas d'`accessible` : il doit en atteindre chaque élément.
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      accessibilityViewIsModal
      style={
        phone
          ? { flex: 1, marginTop: insets.top + SHEET_TOP_GAP }
          : {
              alignSelf: 'center',
              width: '100%',
              maxWidth: layout.formWidth,
              paddingHorizontal: PANEL_MARGIN,
              ...(maxHeight === undefined ? null : { maxHeight }),
            }
      }
    >
      <Surface
        variant="sheet"
        radius="sheet"
        centered={!phone}
        padding="none"
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
    </View>
  )
}
