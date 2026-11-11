// La visionneuse d'une image (R7b, relecture de design B1 et B2) : une image d'un membre (la capture
// d'un retour, la photo d'un appel), ouverte en entier par-dessus l'écran, sur un voile sombre.
// L'image tient dans l'écran sans rien perdre (`contain`) ; « Fermer » en haut à droite, la touche
// Échap (ordinateur), le retour d'Android ou une tape à côté de l'image la referment.
//
// Comme la fenêtre de confirmation (`Dialog`), elle ignore les tapes de ses 600 premières
// millisecondes (`useTapsAllowed`) : la seconde tape d'une double tape sur la vignette tomberait
// sinon sur le voile et la refermerait aussitôt. Le clavier, lui, agit tout de suite.
//
// L'image reste en mémoire seulement (`cachePolicy="memory"`, relecture de sécurité du plan, A4) :
// une image d'un coin privé ne s'écrit jamais dans le cache disque de l'appareil, ouverte en grand
// pas plus qu'en vignette.
//
// Focus : à l'ouverture, sur « Fermer » (le seul contrôle) ; à la fermeture, le piège à focus du
// Modal (web) le rend à la vignette qui l'avait. Sur téléphone, c'est `OpenableImage` qui y ramène
// le lecteur d'écran.
import { space } from '@ruche/brand'
import { Image } from 'expo-image'
import { type RefObject, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { focusWithoutScroll, moveReaderTo } from './focus'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import { useTapsAllowed } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  visible: boolean
  /** L'image, prête à dessiner (en-tête de session compris sur téléphone). */
  source: ImageSource
  /** Son nom lu : la visionneuse le porte aussi (« Capture d'écran jointe au retour d'Inès »). */
  label: string
  onDismiss: () => void
}

/**
 * Pose le focus sur « Fermer » quand le contenu paraît. Rendu dans le Modal : sur le web, son
 * contenu monte quelques images après `visible`, et l'image d'après laisse d'abord le piège à focus
 * retenir la vignette qui avait le focus, pour le lui rendre à la fermeture (comme `Dialog`).
 */
function FocusOnShow({ target }: { target: RefObject<View | null> }) {
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

export function ImageViewer({ visible, source, label, onDismiss }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const tapsAllowed = useTapsAllowed(visible, true)
  const closeRef = useRef<View>(null)
  const closeByTap = tapsAllowed ? onDismiss : undefined

  return (
    // Modal : une couche au-dessus de tout l'écran ; onRequestClose = retour d'Android, ou Échap
    // relâchée sur le web. Sur le web, la boîte de dialogue porte le nom de l'image.
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      {...(Platform.OS === 'web' ? ({ 'aria-label': label } as object) : null)}
    >
      <View style={{ flex: 1, backgroundColor: colors.scrim }} accessibilityViewIsModal>
        {/* Le voile : une tape à côté de l'image ferme, après la garde. Caché aux lecteurs d'écran
            et jamais focalisable sur le web (simple vue qui ferme au clic, comme celui de Dialog). */}
        {Platform.OS === 'web' ? (
          <View
            {...({ 'aria-hidden': true, onClick: closeByTap } as object)}
            style={{ position: 'absolute', inset: 0 }}
          />
        ) : (
          <Pressable
            accessibilityElementsHidden
            importantForAccessibility="no"
            onPress={closeByTap}
            style={{ position: 'absolute', inset: 0 }}
          />
        )}
        {/* L'image, dans la zone sûre de l'écran, sous « Fermer » : elle tient entière. La vue
            laisse passer les tapes à côté de l'image vers le voile (`box-none`). */}
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            paddingTop: insets.top + space.xxl * 2,
            paddingBottom: insets.bottom + space.xl,
            paddingHorizontal: space.lg,
          }}
        >
          <Image
            source={source}
            // En mémoire seulement : jamais écrite sur le disque de l'appareil (sécurité A4).
            cachePolicy="memory"
            contentFit="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            style={{ flex: 1 }}
          />
        </View>
        {/* Pendant la garde, une tape traverse « Fermer » sans le déclencher (comme Dialog). */}
        <View
          pointerEvents={tapsAllowed ? 'auto' : 'none'}
          style={{ position: 'absolute', top: insets.top + space.md, right: space.md }}
        >
          <IconButton
            ref={closeRef}
            icon="x"
            label={t(($) => $.common.close)}
            onPress={onDismiss}
          />
        </View>
        {visible ? <FocusOnShow target={closeRef} /> : null}
      </View>
    </Modal>
  )
}
