// Une fenêtre de confirmation, au centre de l'écran sur un voile : pour une action qu'on ne peut pas
// défaire (supprimer un projet). Elle apparaît par un fondu et se ferme avec « Annuler », la touche
// Échap (ordinateur) ou le bouton retour (Android).
//
// Quand elle ne tient pas dans l'écran (un téléphone tourné en paysage, un texte agrandi à 200 %,
// un champ de plusieurs lignes), elle défile : sans cela, son titre sortait par le haut et ses
// boutons par le bas, hors d'atteinte (relecture de la tranche 7a). Toute la couche défile, voile
// compris : on la fait glisser du doigt ou à la molette n'importe où, et la marge autour de la
// fenêtre reste visible en haut comme en bas.
import { borders, layout, space } from '@ruche/brand'
import type { ReactNode } from 'react'
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
  message: string
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

export function Dialog({
  visible,
  title,
  message,
  illustration,
  quote,
  children,
  onDismiss,
  onClosed,
}: Props) {
  const { colors } = useTheme()
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
              défile, sous la fenêtre : il suit le défilement et couvre toute la hauteur. */}
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={onDismiss}
            style={{ position: 'absolute', inset: 0 }}
          />
          <View
            accessibilityViewIsModal // les lecteurs d'écran restent dans la fenêtre
            style={{ width: '100%', maxWidth: layout.formWidth - 120 }}
          >
            <Surface variant="sheet" radius="sheet" padding="xxl" gap="lg" centered>
              {illustration ? <View style={{ alignItems: 'center' }}>{illustration}</View> : null}
              <Text variant="heading" align="center" accessibilityRole="header">
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
              <Text tone="secondary" align="center">
                {message}
              </Text>
              <View style={{ gap: space.md }}>{children}</View>
            </Surface>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
