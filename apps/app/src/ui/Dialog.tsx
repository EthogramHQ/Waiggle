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
import { borders, layout, space } from '@ruche/brand'
import { type ReactNode, useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { Surface } from './Surface'
import { Text } from './Text'
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
}

/** Le nombre de lignes du texte rappelé : de quoi le reconnaître, sans pousser les boutons loin. */
const QUOTE_LINES = 3

/**
 * Le temps, après l'ouverture, pendant lequel une fenêtre `guardTaps` ignore les tapes (décision du
 * 25/10/2026) : la seconde tape d'une double tape arrive vers 150 à 250 ms ; une tape vers 700 ms
 * est un geste à part, qui passe.
 */
export const TAP_GUARD_MS = 600

/**
 * Hook : vrai quand les boutons peuvent recevoir une tape. Sans garde, toujours ; avec, à partir de
 * TAP_GUARD_MS après chaque ouverture (la garde repart à la réouverture).
 */
function useTapsAllowed(visible: boolean, guarded: boolean) {
  const [allowed, setAllowed] = useState(false)
  // useEffect : un minuteur posé à l'ouverture, et retiré si la fenêtre se ferme avant (ou si le
  // composant quitte l'écran), pour ne pas changer l'état d'une fenêtre déjà fermée.
  useEffect(() => {
    if (!visible || !guarded) {
      setAllowed(false)
      return
    }
    const timer = setTimeout(() => setAllowed(true), TAP_GUARD_MS)
    return () => clearTimeout(timer)
  }, [visible, guarded])
  return !guarded || allowed
}

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
}: Props) {
  const { colors } = useTheme()
  const tapsAllowed = useTapsAllowed(visible, guardTaps)
  const paragraphs = typeof message === 'string' ? [message] : message
  // Une phrase ou deux, centrées sous le titre ; plusieurs paragraphes, à gauche.
  const align = paragraphs.length > 1 ? 'left' : 'center'
  return (
    // Modal : une couche au-dessus de tout l'écran. onRequestClose = retour Android ou Échap.
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      {...(onClosed ? { onDismiss: onClosed } : null)}
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
              garde, la seconde tape d'une double tape qui tombe à côté ne la referme pas. */}
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={tapsAllowed ? onDismiss : undefined}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            accessibilityViewIsModal // les lecteurs d'écran restent dans la fenêtre
            style={{ width: '100%', maxWidth: layout.formWidth - 120 }}
          >
            <Surface variant="sheet" radius="sheet" padding="xxl" gap="lg" centered>
              {illustration ? <View style={{ alignItems: 'center' }}>{illustration}</View> : null}
              {/* Niveau 2 : la fenêtre s'ouvre par-dessus une page qui a déjà son titre. */}
              <Text variant="heading" align="center" heading={2}>
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
              {/* Les paragraphes plus serrés entre eux qu'avec le titre et les boutons. */}
              <View style={{ gap: space.md }}>
                {paragraphs.map((paragraph, index) => (
                  // Le rang comme clé : deux paragraphes peuvent dire la même chose, et leur liste
                  // ne change pas pendant que la fenêtre est ouverte.
                  // biome-ignore lint/suspicious/noArrayIndexKey: liste fixe, voir ci-dessus.
                  <Text key={index} tone="secondary" align={align}>
                    {paragraph}
                  </Text>
                ))}
              </View>
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
