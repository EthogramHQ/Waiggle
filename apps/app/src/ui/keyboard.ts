// Le clavier sur le web, pour les interrupteurs (role « switch »). Un lecteur d'écran et les règles
// d'accessibilité attendent qu'un interrupteur s'active avec la barre d'espace. Or react-native-web
// ne le fait que pour les boutons (role « button ») : sur un interrupteur, l'espace faisait défiler
// la page. Ce petit objet ajoute la touche, une seule fois pour tous les interrupteurs.
import { Platform } from 'react-native'

type KeyEvent = { key: string; preventDefault: () => void }

/**
 * À étaler sur le Pressable d'un interrupteur (`{...spaceToggles(onPress, disabled)}`). onKeyDown
 * manque aux types de React Native (il n'existe que sur le web), d'où cet objet préparé ici.
 */
export const spaceToggles = (onPress: () => void, disabled = false): object =>
  Platform.OS === 'web'
    ? {
        onKeyDown: (event: KeyEvent) => {
          if (event.key !== ' ') return
          // preventDefault : l'espace ne fait plus défiler la page.
          event.preventDefault()
          if (!disabled) onPress()
        },
      }
    : {}
