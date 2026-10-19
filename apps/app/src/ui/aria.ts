// Des liens entre éléments pour les lecteurs d'écran, sur le web. `aria-describedby` dit qu'un
// élément est décrit par un autre : un lien « Note de Léa sur Mon agent de recettes » est décrit
// par le texte de la note, un bouton « Supprimer la note » par la note qu'il supprime. Le lecteur
// d'écran lit le nom, puis la description. react-native-web transmet cette propriété au navigateur ;
// elle manque aux types de React Native (et n'existe pas sur téléphone), d'où cet objet préparé ici.
import { Platform } from 'react-native'

/**
 * À étaler sur l'élément décrit (`{...describedBy(id)}`) ; `id` est le `nativeID` du texte qui le
 * décrit. Sans identifiant, ou hors du web, rien.
 */
export const describedBy = (id: string | undefined): object =>
  Platform.OS === 'web' && id ? { 'aria-describedby': id } : {}

/**
 * À étaler sur un bouton qui reste enfoncé une fois touché (une réaction posée) : `aria-pressed`
 * sur le web, que react-native-web transmet au navigateur (le lecteur d'écran dit « activé ») ;
 * sur téléphone, l'état « sélectionné », que React Native sait annoncer.
 */
export const pressed = (value: boolean): object =>
  Platform.OS === 'web' ? { 'aria-pressed': value } : { accessibilityState: { selected: value } }
