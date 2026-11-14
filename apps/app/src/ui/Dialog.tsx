// Une fenêtre de confirmation, au centre de l'écran sur un voile : pour une action qu'on ne peut pas
// défaire (supprimer un projet). Elle apparaît par un fondu et se ferme avec « Annuler », la touche
// Échap (ordinateur) ou le bouton retour (Android).
//
// Quand elle ne tient pas dans l'écran (un téléphone tourné en paysage, un texte agrandi à 200 %,
// un champ de plusieurs lignes), elle défile : sans cela, son titre sortait par le haut et ses
// boutons par le bas, hors d'atteinte (relecture de la tranche 7a). Toute la couche défile, voile
// compris : on la fait glisser du doigt ou à la molette n'importe où, et la marge autour de la
// fenêtre reste visible en haut comme en bas.
//
// Avec `guardTaps`, ses boutons ignorent les tapes pendant TAP_GUARD_MS après l'ouverture : la
// fenêtre s'ouvre souvent sous le doigt qui vient de toucher l'action (« Bloquer » d'un menu), et la
// seconde tape d'une double tape tombait sur sa confirmation (relecture de design, tranche 7b).
//
// R6a (la fenêtre qui supprime un projet) :
// - `busy` : pendant l'action, ni le voile, ni Échap, ni le retour d'Android ne la ferment. Fermée
//   au milieu, elle laisserait croire que rien ne se passe, et le focus se perdrait ;
// - `error` : l'échec de l'action se lit dans la fenêtre, en alerte, et la fenêtre reste ouverte
//   (on peut réessayer, ou annuler) ;
// - sur le web, la boîte de dialogue est nommée par son titre et décrite par son message ;
// - Échap ne la ferme que si la touche a été enfoncée pendant qu'elle était ouverte : la touche
//   relâchée d'une Échap qui fermait autre chose (la feuille d'où vient la fenêtre) n'est pas un
//   geste pour elle.
//
// Correction après les relectures de R6a (ui-B2, ui-C1) :
// - sur le web, le voile n'est plus un arrêt de Tab : c'était un `<div tabindex=0>` sans rôle ni
//   nom, grand comme l'écran, où Entrée fermait la fenêtre. Il n'est plus focalisable du tout (voir
//   plus bas) ; le clic dessus ferme toujours ;
// - `initialFocusRef` : le bouton qui reçoit le focus à l'ouverture (« Continuer », le geste qui ne
//   perd rien), posé par la fenêtre une fois son contenu monté, au lieu d'être relancé par l'écran
//   à chaque image.
//
// Correction après la contre-visite du design (R6a, N1) : ouverte depuis une feuille (« Supprimer
// ce projet ? » dans « Modifier »), la fenêtre finissait avec le focus sur « Supprimer ». Deux
// Modal, deux pièges à focus : celui de la feuille reprenait le focus posé sur « Annuler » pendant le
// fondu, puis celui de la fenêtre, devenu actif, l'envoyait sur son premier bouton. Sur le web, la
// fenêtre entre donc dans la pile des couches ouvertes (`modalLayers`, que la feuille lit pour lui
// laisser ce focus), et, son ouverture finie (`onShow`), repose le focus sur `initialFocusRef` s'il
// n'est plus chez elle.
//
// Correction après la relecture de design de R9 (la fenêtre « Bloquer », longue) : ses boutons
// restent en vue. Sur un écran assez haut (`PINNED_MIN_HEIGHT`), la fenêtre ne dépasse jamais de
// l'écran : son haut (image, titre, citation, texte) défile **dans** la fenêtre, avec le fondu des
// feuilles quand il reste du texte plus bas, et le message d'échec et les boutons restent collés en
// bas, comme le pied d'une feuille. « Bloquer » et « Annuler » étaient sous le pli à 390 × 844 et à
// 1440 × 900. Sur un écran bas (téléphone en paysage), toute la couche défile, comme avant : un pied
// collé y mangerait presque toute la hauteur.
import { layout, space } from '@ruche/brand'
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { type Focusable, focusWithoutScroll, holdsFocus, moveReaderTo } from './focus'
import { openModalLayer, sameLayer } from './modalLayers'
import { Notice } from './Notice'
import { QuotedContent } from './QuotedContent'
import { Surface } from './Surface'
import { SheetFade, useBelowFold } from './sheetFade'
import { Text } from './Text'
import { useTapsAllowed } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

/** Le contenu que vise l'action, rappelé sous le titre : sa sorte et le début de son texte. */
export type DialogQuote = {
  /** La sorte de contenu, déjà traduite (« Commentaire »). */
  label: string
  /** Le texte, montré tel quel (texte brut, jamais de lien), trois lignes au plus. */
  text: string
}

type Props = {
  visible: boolean
  title: string
  /**
   * Le texte sous le titre. Une liste : un paragraphe par élément, alignés à gauche (au-delà d'une
   * phrase ou deux, un texte centré se lit mal : chaque ligne commence ailleurs).
   */
  message?: string | string[]
  /**
   * R9 : un texte plus riche que des paragraphes (un résumé en gras, des puces : `KeyPoints`), sous
   * le message ou à sa place. Il fait partie de ce qui décrit la fenêtre (web), comme le message.
   */
  body?: ReactNode
  /**
   * Les boutons ignorent les tapes juste après l'ouverture (TAP_GUARD_MS) : pour une fenêtre qui
   * s'ouvre là où l'on vient de toucher (un menu, un bouton à la même hauteur que sa confirmation).
   * Le clavier, lui, agit tout de suite : Entrée est un geste voulu, pas un rebond du doigt.
   */
  guardTaps?: boolean
  /** Une image au-dessus du titre (facultatif). */
  illustration?: ReactNode
  /**
   * Le contenu visé, rappelé en citation sous le titre (« Retirer ce contenu ? » : lequel ?). La
   * fenêtre couvre la carte qu'on vient de toucher : on vérifie ici qu'on agit sur le bon.
   */
  quote?: DialogQuote | undefined
  /** Les boutons, de l'action principale à « Annuler ». */
  children: ReactNode
  onDismiss: () => void
  /**
   * Appelée une fois la fenêtre tout à fait disparue (web et iOS), après son fondu. C'est le moment
   * de poser le focus ailleurs si l'élément qui l'avait ouverte n'existe plus (une note supprimée) :
   * avant, la fenêtre garde le focus pour elle.
   */
  onClosed?: () => void
  /**
   * Une action est en cours (la suppression part au serveur) : ni le voile, ni Échap, ni le retour
   * d'Android ne ferment la fenêtre. Les boutons, eux, sont ceux de l'écran : il met l'action
   * principale en `loading` et rend « Annuler » inactif.
   */
  busy?: boolean
  /**
   * L'échec de l'action, déjà traduit (« Impossible de supprimer ce projet. Réessaie. ») : une
   * alerte dans la fenêtre, au-dessus des boutons, lue dès qu'elle paraît. La fenêtre reste ouverte.
   */
  error?: string | undefined
  /**
   * Le contrôle qui reçoit le focus à l'ouverture (un bouton de la fenêtre). Sans lui, le premier
   * bouton le reçoit sur le web (le piège à focus du Modal) ; sur téléphone, le lecteur d'écran
   * part du titre.
   */
  initialFocusRef?: RefObject<Focusable | null>
}

/**
 * Pose le focus sur `target` quand le contenu de la fenêtre paraît. Rendu **dans** la fenêtre :
 * sur le web, le Modal monte son contenu quelques images après `visible`, et la `ref` du bouton
 * n'existe qu'alors. Sur le web, on attend encore une image : le piège à focus du Modal (un parent,
 * dont l'effet passe après celui-ci) retient d'abord qui avait le focus avant l'ouverture, pour le
 * lui rendre à la fermeture ; focaliser plus tôt lui ferait retenir le bouton de la fenêtre.
 */
function FocusOnShow({ target }: { target: RefObject<Focusable | null> }) {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      moveReaderTo(target.current)
      return
    }
    const frame = requestAnimationFrame(() => focusWithoutScroll(target.current))
    return () => cancelAnimationFrame(frame)
  }, [target])
  return null
}

/**
 * Les propriétés du voile sur le web : caché aux lecteurs d'écran, et hors du focus. Un `Pressable`
 * de react-native-web reçoit toujours un `tabindex` (0, ou -1) : même à -1, le piège à focus du
 * Modal, qui essaie `focus()` sur chaque élément de la fenêtre, le choisissait à l'ouverture ou en
 * bouclant (mesuré : la fenêtre de suppression s'ouvrait le focus sur le voile). Sur le web, le voile
 * est donc une simple vue, qui ferme au clic (`onClick`, que react-native-web transmet au `<div>`
 * mais que les types de React Native ignorent, d'où l'objet).
 */
const webScrim = (onPress: (() => void) | undefined): object => ({
  'aria-hidden': true,
  onClick: onPress,
})

/**
 * La hauteur d'écran (points) à partir de laquelle les boutons peuvent rester collés en bas de la
 * fenêtre. En dessous (un téléphone en paysage : 390 points), deux boutons et leur marge
 * prendraient presque tout : le texte n'aurait plus qu'une fente pour défiler.
 *
 * Cette hauteur ne suffit pas : à 320 × 568 avec le texte à 200 %, les boutons font à eux seuls
 * plus de la moitié de l'écran et la zone du texte tombait à 198 points (contre-visite de R9). Les
 * boutons ne sont donc collés que si leur hauteur **mesurée** laisse à la zone du texte au moins la
 * moitié de l'écran (`PINNED_TEXT_SHARE`) ; sinon toute la couche défile, titre et boutons ensemble.
 */
const PINNED_MIN_HEIGHT = 480
/** La part de l'écran que la zone du texte doit garder pour que les boutons soient collés. */
const PINNED_TEXT_SHARE = 0.5
/** La marge autour de la fenêtre (celle de la couche qui défile). */
const DIALOG_MARGIN = space.xl

/** Le peu d'une touche du navigateur que la fenêtre lit (les types de React Native l'ignorent). */
type BrowserKey = { key?: string; preventDefault?: () => void }
type WebDocument = {
  addEventListener?: (type: string, listener: (event: BrowserKey) => void, capture: boolean) => void
  removeEventListener?: (
    type: string,
    listener: (event: BrowserKey) => void,
    capture: boolean,
  ) => void
}

/**
 * Hook : Échap a-t-elle été enfoncée pendant que la fenêtre est ouverte ? (web seulement)
 *
 * Le Modal de react-native-web ferme sur Échap **relâchée** (`keyup`). Or la touche peut avoir été
 * enfoncée avant que la fenêtre n'existe : Échap ferme la feuille « Publier », qui demande alors
 * « Abandonner ce projet ? » ; la touche relâchée arrivait à cette nouvelle fenêtre et la refermait
 * aussitôt, sans que personne ait rien choisi (relecture du plan R6a, ui-B3). On écoute donc la
 * touche enfoncée sur tout le document, à la descente (`capture`, avant tout élément de la page),
 * comme `lastEscape` de la feuille ; au relâchement, seule une touche notée ici compte.
 *
 * La touche est aussi marquée « déjà servie » (`preventDefault`) : une feuille ouverte dessous, qui
 * relit ce marquage au relâchement, sait qu'Échap était pour la fenêtre et ne se ferme pas avec.
 *
 * Rend une fonction qui dit, une seule fois, si la touche relâchée a été enfoncée ici.
 */
const useEscapePressedHere = (visible: boolean): (() => boolean) => {
  const pressed = useRef(false)
  useEffect(() => {
    pressed.current = false
    if (!visible || Platform.OS !== 'web') return
    const page = (globalThis as { document?: WebDocument }).document
    if (!page?.addEventListener) return
    const note = (event: BrowserKey) => {
      if (event.key !== 'Escape') return
      pressed.current = true
      event.preventDefault?.()
    }
    page.addEventListener('keydown', note, true)
    return () => page.removeEventListener?.('keydown', note, true)
  }, [visible])
  return () => {
    const was = pressed.current
    pressed.current = false
    return was
  }
}

// La garde elle-même vit dans tapGuard.ts, partagée avec la feuille (Sheet) ; son délai reste
// lisible ici, où les tests le cherchent.
export { TAP_GUARD_MS } from './tapGuard'

export function Dialog({
  visible,
  title,
  message = [],
  body,
  guardTaps = false,
  illustration,
  quote,
  children,
  onDismiss,
  onClosed,
  busy = false,
  error,
  initialFocusRef,
}: Props) {
  const { colors } = useTheme()
  // La hauteur de l'écran : assez haut, et des boutons assez courts, ils restent collés en bas de
  // la fenêtre, qui ne dépasse jamais (voir `PINNED_MIN_HEIGHT`). `buttonsHeight` : la hauteur
  // mesurée du bloc des boutons (`null` : pas encore mesuré, on colle comme avant). Elle suit la
  // taille du texte ; elle ne dépend ni du message d'échec (hors du bloc), ni du mode (la largeur
  // des boutons est la même collés ou non) : aucune boucle.
  const screenHeight = useWindowDimensions().height
  const [buttonsHeight, setButtonsHeight] = useState<number | null>(null)
  // Ce qui reste à la zone du texte : l'écran, moins la marge autour de la fenêtre, le bas de son
  // remplissage, l'écart au-dessus des boutons, et les boutons eux-mêmes.
  const textRoom =
    buttonsHeight === null
      ? screenHeight
      : screenHeight - 2 * DIALOG_MARGIN - space.xxl - space.lg - buttonsHeight
  const pinned = screenHeight >= PINNED_MIN_HEIGHT && textRoom >= screenHeight * PINNED_TEXT_SHARE
  const measureButtons = (event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout
    // Une mesure à 0 (vue pas encore dessinée) ne dit rien.
    if (height > 0) setButtonsHeight(height)
  }
  // Le fondu du bas de la zone qui défile, tant qu'il reste du texte plus bas (celui des feuilles).
  const fold = useBelowFold()
  const tapsAllowed = useTapsAllowed(visible, guardTaps)
  const escapePressedHere = useEscapePressedHere(visible)
  // Les identifiants du titre et du message, uniques dans la page : la boîte de dialogue s'y réfère
  // pour son nom et sa description (web).
  const titleId = useId()
  const messageId = useId()
  // La fenêtre elle-même (sa boîte) : la pile des couches y cherche les éléments qui reçoivent le
  // focus, et l'ouverture finie vérifie que le focus y est encore.
  const boxRef = useRef<View>(null)
  const layerId = useId()

  // Sur le web, ouverte, la fenêtre est une couche de la pile (voir `modalLayers`) : une feuille
  // ouverte dessous ne lui reprend pas le focus pendant son fondu d'ouverture.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return
    return openModalLayer(layerId, (node) => sameLayer(boxRef.current, node))
  }, [visible, layerId])

  // L'ouverture finie (web : fin du fondu ; le Modal devient alors la couche active et son piège à
  // focus se met au travail), le focus revient sur le contrôle attendu s'il a quitté la fenêtre. Un
  // focus déjà déplacé dans la fenêtre (Tab pendant le fondu) est gardé.
  const onShow =
    Platform.OS === 'web' && initialFocusRef
      ? {
          onShow: () => {
            if (!holdsFocus(boxRef.current)) focusWithoutScroll(initialFocusRef.current)
          },
        }
      : null
  const paragraphs = typeof message === 'string' ? [message] : message
  // Une phrase ou deux, centrées sous le titre ; plusieurs paragraphes, à gauche.
  const align = paragraphs.length > 1 ? 'left' : 'center'
  // Le haut de la fenêtre, qui défile quand les boutons sont collés.
  const top = (
    <DialogTop
      illustration={illustration}
      title={title}
      titleId={titleId}
      quote={quote}
      messageId={messageId}
      paragraphs={paragraphs}
      align={align}
      body={body}
    />
  )

  // Le Modal appelle onRequestClose au retour d'Android, et sur le web quand Échap est relâchée.
  // Pendant l'action, rien ne ferme. Sur le web, une Échap enfoncée ailleurs ne ferme pas non plus.
  const onRequestClose = () => {
    const pressedHere = escapePressedHere()
    if (busy) return
    if (Platform.OS === 'web' && !pressedHere) return
    onDismiss()
  }
  // Le voile ferme comme « Annuler », sauf pendant la garde et pendant l'action.
  const closeByScrim = tapsAllowed && !busy ? onDismiss : undefined

  // Sur le web, react-native-web pose ces propriétés sur la boîte de dialogue elle-même
  // (`role="dialog"`, `aria-modal`) : le lecteur d'écran annonce « Supprimer « … » ?, boîte de
  // dialogue », puis le message. Elles manquent aux types de React Native, d'où l'objet.
  const named: object =
    Platform.OS === 'web' ? { 'aria-labelledby': titleId, 'aria-describedby': messageId } : {}

  return (
    // Modal : une couche au-dessus de tout l'écran. onRequestClose = retour Android ou Échap.
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      {...onShow}
      {...(onClosed ? { onDismiss: onClosed } : null)}
      {...named}
    >
      <View style={{ flex: 1, backgroundColor: colors.scrim }}>
        {/* ScrollView : la couche défile si la fenêtre est plus haute que l'écran. Son contenu fait
            au moins la hauteur de l'écran (flexGrow) : une fenêtre courte reste centrée.
            keyboardShouldPersistTaps : sur téléphone, un bouton touché pendant que le clavier est
            ouvert agit du premier coup, au lieu de seulement fermer le clavier. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Toucher le voile ferme la fenêtre, comme « Annuler ». Il est posé dans la zone qui
              défile, sous la fenêtre : il suit le défilement et couvre toute la hauteur. Pendant la
              garde, la seconde tape d'une double tape qui tombe à côté ne la referme pas ; pendant
              une action (`busy`), aucune tape ne la referme. Caché aux lecteurs d'écran, et jamais
              focalisable sur le web (`webScrim`) : le clavier a « Annuler » et Échap. */}
          {Platform.OS === 'web' ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              {...webScrim(closeByScrim)}
              style={{ position: 'absolute', inset: 0 }}
            />
          ) : (
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no"
              onPress={closeByScrim}
              style={{ position: 'absolute', inset: 0 }}
            />
          )}
          <View
            ref={boxRef}
            accessibilityViewIsModal // les lecteurs d'écran restent dans la fenêtre
            style={{
              width: '100%',
              maxWidth: layout.formWidth - 120,
              // Boutons collés : la fenêtre tient dans l'écran, marges comprises ; son haut défile.
              ...(pinned ? { maxHeight: screenHeight - 2 * DIALOG_MARGIN } : null),
            }}
          >
            <Surface
              variant="sheet"
              radius="sheet"
              padding="xxl"
              gap="lg"
              centered
              {...(pinned ? { fit: 'shrink' as const } : null)}
            >
              {pinned ? (
                // minHeight 0 : la zone peut être moins haute que son contenu, qui défile alors. La
                // zone déborde dans la marge de la fenêtre (marges négatives, rendues en dedans) :
                // l'anneau de focus d'un lien du texte n'est pas rogné au bord, et le texte défile
                // jusqu'au bord haut de la fenêtre.
                <View style={{ flexShrink: 1, minHeight: 0 }}>
                  <ScrollView
                    style={{ flexShrink: 1, marginHorizontal: -space.xxl, marginTop: -space.xxl }}
                    contentContainerStyle={{
                      paddingHorizontal: space.xxl,
                      paddingTop: space.xxl,
                      gap: space.lg,
                    }}
                    scrollEventThrottle={16}
                    onScroll={fold.onScroll}
                    onLayout={fold.onLayout}
                    onContentSizeChange={fold.onContentSizeChange}
                    keyboardShouldPersistTaps="handled"
                  >
                    {top}
                  </ScrollView>
                  {fold.more ? <SheetFade /> : null}
                </View>
              ) : (
                top
              )}
              {/* L'échec de l'action, juste au-dessus des boutons : on le lit, puis on réessaie ou
                  on annule sans chercher. Une alerte (`Notice`), lue dès qu'elle paraît. */}
              {error ? <Notice message={error} /> : null}
              {/* pointerEvents « none » pendant la garde : une tape traverse les boutons et tombe
                  sur la fenêtre elle-même, qui n'en fait rien (sur le web comme sur téléphone). */}
              <View
                onLayout={measureButtons}
                style={{ gap: space.md, pointerEvents: tapsAllowed ? 'auto' : 'none' }}
              >
                {children}
              </View>
              {initialFocusRef ? <FocusOnShow target={initialFocusRef} /> : null}
            </Surface>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

/** Le haut de la fenêtre : son image, son titre, la citation, son texte. */
function DialogTop({
  illustration,
  title,
  titleId,
  quote,
  messageId,
  paragraphs,
  align,
  body,
}: {
  illustration: ReactNode
  title: string
  titleId: string
  quote: DialogQuote | undefined
  messageId: string
  paragraphs: string[]
  align: 'left' | 'center'
  body: ReactNode
}) {
  return (
    <>
      {illustration ? <View style={{ alignItems: 'center' }}>{illustration}</View> : null}
      {/* Niveau 2 : la fenêtre s'ouvre par-dessus une page qui a déjà son titre. */}
      <Text variant="heading" align="center" heading={2} nativeID={titleId}>
        {title}
      </Text>
      {/* Le contenu visé, en citation (voir QuotedContent), aligné à gauche : c'est un texte qu'on lit. */}
      {quote ? <QuotedContent label={quote.label} text={quote.text} /> : null}
      {/* Les paragraphes plus serrés entre eux qu'avec le titre et les boutons. Leur bloc
                  porte l'identifiant qui décrit la boîte de dialogue (web). */}
      <View nativeID={messageId} style={{ gap: space.md }}>
        {paragraphs.map((paragraph, index) => (
          // Le rang comme clé : deux paragraphes peuvent dire la même chose, et leur liste
          // ne change pas pendant que la fenêtre est ouverte.
          // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe, voir ci-dessus.
          <Text key={index} tone="secondary" align={align}>
            {paragraph}
          </Text>
        ))}
        {body}
      </View>
    </>
  )
}
