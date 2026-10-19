// Poser le focus du clavier sur un élément, sur le web, sans faire défiler la page jusqu'à lui.
// Sert quand l'élément qui avait le focus disparaît (une note supprimée, un champ refermé) : le focus
// va sur un voisin logique au lieu de retomber tout en haut de la page, et la page reste où elle est
// (preventScroll), là où la personne lisait. Sur téléphone, il n'y a pas de clavier à suivre : rien.
import { Platform } from 'react-native'

// Le peu du navigateur dont on a besoin : un élément qu'on peut focaliser. (Les types de React
// Native ne décrivent pas la page web.)
type WebNode = { focus?: (options?: { preventScroll?: boolean }) => void }

/** Focalise `node` (une ref de View ou de Pressable) sans défilement. Vrai si c'était possible. */
export const focusWithoutScroll = (node: unknown): boolean => {
  if (Platform.OS !== 'web' || !node) return false
  const element = node as WebNode
  if (!element.focus) return false
  element.focus({ preventScroll: true })
  return true
}
