// Une fenêtre de confirmation, au centre de l'écran sur un voile : pour une action qu'on ne peut pas
// défaire (supprimer un projet). Elle apparaît par un fondu et se ferme avec « Annuler », la touche
// Échap (ordinateur) ou le bouton retour (Android).
import { layout, space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { Surface } from './Surface'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  visible: boolean
  title: string
  message: string
  /** Une image au-dessus du titre (facultatif). */
  illustration?: ReactNode
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

export function Dialog({
  visible,
  title,
  message,
  illustration,
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
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.xl,
          backgroundColor: colors.scrim,
        }}
      >
        {/* Toucher le voile ferme la fenêtre, comme « Annuler ». */}
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
            <Text tone="secondary" align="center">
              {message}
            </Text>
            <View style={{ gap: space.md }}>{children}</View>
          </Surface>
        </View>
      </View>
    </Modal>
  )
}
