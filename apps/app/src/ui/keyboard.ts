// Le clavier sur le web, là où react-native-web ne le gère pas de lui-même. Il ne déclenche `onPress`
// au clavier que pour les boutons (role « button ») :
// - un interrupteur (role « switch ») doit s'activer avec la barre d'espace, comme l'attendent les
//   lecteurs d'écran ; sans aide, l'espace faisait défiler la page ;
// - un lien dessiné sans adresse (role « link » : une carte, une étiquette, un lien dans un texte)
//   doit s'ouvrir avec Entrée, comme un vrai lien ; sans aide, Entrée ne faisait rien ;
// - un champ qu'on peut refermer (la note d'un projet) se referme avec Échap, comme « Annuler ».
// Ces petits objets ajoutent la touche, une fois pour tous les composants concernés.
import { Platform } from 'react-native'

type KeyEvent = { key: string; repeat?: boolean; preventDefault: () => void }

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

/**
 * À étaler sur un champ qu'on peut refermer (`<TextField {...escapeCloses(onCancel, busy)} />`) :
 * Échap, tapé dans le champ, le referme comme « Annuler ». Sur le champ lui-même, par onKeyPress :
 * react-native-web empêche les touches d'un champ de remonter plus haut.
 */
export const escapeCloses = (onClose: () => void, disabled = false): object =>
  Platform.OS === 'web'
    ? {
        onKeyPress: (event: { nativeEvent: KeyEvent }) => {
          if (event.nativeEvent.key !== 'Escape' || disabled) return
          event.nativeEvent.preventDefault()
          onClose()
        },
      }
    : {}

/**
 * À étaler sur un lien sans adresse (`{...enterActivates(onPress, disabled)}`) : Entrée l'ouvre,
 * comme un vrai lien. Seulement Entrée : sur un lien, la barre d'espace fait défiler la page, et
 * c'est ce qu'on attend. Une touche gardée enfoncée (repeat) n'ouvre pas dix fois la même page.
 */
export const enterActivates = (onPress: () => void, disabled = false): object =>
  Platform.OS === 'web'
    ? {
        onKeyDown: (event: KeyEvent) => {
          if (event.key !== 'Enter' || event.repeat) return
          event.preventDefault()
          if (!disabled) onPress()
        },
      }
    : {}
