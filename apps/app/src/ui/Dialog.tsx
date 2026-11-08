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
import { borders, layout, space } from '@ruche/brand'
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { Notice } from './Notice'
import { Surface } from './Surface'
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
  message: string | string[]
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
}

/** Le nombre de lignes du texte rappelé : de quoi le reconnaître, sans pousser les boutons loin. */
const QUOTE_LINES = 3

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
  message,
  guardTaps = false,
  illustration,
  quote,
  children,
  onDismiss,
  onClosed,
  busy = false,
  error,
}: Props) {
  const { colors } = useTheme()
  const tapsAllowed = useTapsAllowed(visible, guardTaps)
  const escapePressedHere = useEscapePressedHere(visible)
  // Les identifiants du titre et du message, uniques dans la page : la boîte de dialogue s'y réfère
  // pour son nom et sa description (web).
  const titleId = useId()
  const messageId = useId()
  const paragraphs = typeof message === 'string' ? [message] : message
  // Une phrase ou deux, centrées sous le titre ; plusieurs paragraphes, à gauche.
  const align = paragraphs.length > 1 ? 'left' : 'center'

  // Le Modal appelle onRequestClose au retour d'Android, et sur le web quand Échap est relâchée.
  // Pendant l'action, rien ne ferme. Sur le web, une Échap enfoncée ailleurs ne ferme pas non plus.
  const onRequestClose = () => {
    const pressedHere = escapePressedHere()
    if (busy) return
    if (Platform.OS === 'web' && !pressedHere) return
    onDismiss()
  }

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
              une action (`busy`), aucune tape ne la referme. */}
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={tapsAllowed && !busy ? onDismiss : undefined}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            accessibilityViewIsModal // les lecteurs d'écran restent dans la fenêtre
            style={{ width: '100%', maxWidth: layout.formWidth - 120 }}
          >
            <Surface variant="sheet" radius="sheet" padding="xxl" gap="lg" centered>
              {illustration ? <View style={{ alignItems: 'center' }}>{illustration}</View> : null}
              {/* Niveau 2 : la fenêtre s'ouvre par-dessus une page qui a déjà son titre. */}
              <Text variant="heading" align="center" heading={2} nativeID={titleId}>
                {title}
              </Text>
              {quote ? (
                // Le contenu visé, souligné d'un trait de miel à gauche comme une citation (la
                // carte de la modération, une note). Aligné à gauche : c'est un texte qu'on lit.
                <View
                  style={{
                    gap: space.xxs,
                    borderLeftWidth: borders.quote,
                    borderLeftColor: colors.honey,
                    paddingLeft: space.md,
                  }}
                >
                  <Text variant="caption" weight={600} tone="muted">
                    {quote.label}
                  </Text>
                  <Text numberOfLines={QUOTE_LINES} breakAnywhere>
                    {quote.text}
                  </Text>
                </View>
              ) : null}
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
              </View>
              {/* L'échec de l'action, juste au-dessus des boutons : on le lit, puis on réessaie ou
                  on annule sans chercher. Une alerte (`Notice`), lue dès qu'elle paraît. */}
              {error ? <Notice message={error} /> : null}
              {/* pointerEvents « none » pendant la garde : une tape traverse les boutons et tombe
                  sur la fenêtre elle-même, qui n'en fait rien (sur le web comme sur téléphone). */}
              <View style={{ gap: space.md, pointerEvents: tapsAllowed ? 'auto' : 'none' }}>
                {children}
              </View>
            </Surface>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
