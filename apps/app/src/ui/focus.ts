// Poser le focus du clavier sur un élément, sur le web, sans faire défiler la page jusqu'à lui.
// Sert quand l'élément qui avait le focus disparaît (une note supprimée, un champ refermé) : le focus
// va sur un voisin logique au lieu de retomber tout en haut de la page, et la page reste où elle est
// (preventScroll), là où la personne lisait. Sur téléphone, il n'y a pas de clavier à suivre : rien.
// À l'inverse, revealWithoutJump fait venir dans l'écran un élément qui vient de s'ouvrir hors de vue.
import { Platform, type View } from 'react-native'

/**
 * Ce qu'un écran garde dans une ref pour y poser le focus plus tard (un Button, un TextLink) : les
 * écrans n'importent rien de react-native, ils passent par ce nom.
 */
export type Focusable = View

// Le peu du navigateur dont on a besoin : un élément qu'on peut focaliser, ou faire venir dans
// l'écran. (Les types de React Native ne décrivent pas la page web.)
type WebNode = {
  focus?: (options?: { preventScroll?: boolean }) => void
  scrollIntoView?: (options?: {
    block?: 'nearest' | 'center'
    behavior?: 'smooth' | 'auto'
  }) => void
}

/**
 * Amène un champ dans l'écran et lui donne le focus : pour un champ qu'il faut remplir avant
 * d'envoyer, resté loin sous le pied collé d'une feuille (« Confirme avec ton mot de passe », tout
 * en bas de la feuille de suppression : relecture de design R2, C2). Sur le web, le champ vient au
 * milieu de la zone qui défile (« center ») : son libellé et ce qui est écrit dessous se lisent
 * aussi, au lieu de rester collés au bord du pied ; en douceur, sauf avec « Réduire les animations »
 * (`calm`). Le focus est posé d'abord, sans défilement, pour que seul ce geste-là fasse défiler. Sur
 * téléphone, le focus ouvre le clavier, qui fait venir le champ.
 */
export const focusAndReveal = (node: unknown, calm: boolean) => {
  if (!node) return
  const element = node as WebNode
  if (Platform.OS !== 'web') {
    element.focus?.()
    return
  }
  element.focus?.({ preventScroll: true })
  element.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
}

/**
 * Fait venir `node` dans l'écran s'il en sort, sur le web : la page défile juste assez (« nearest »),
 * et pas du tout s'il est déjà visible. Pour un champ ouvert à la demande du membre (répondre au
 * bout d'un long fil) : il voit ce qu'il tape. En douceur, sauf si « Réduire les animations » est
 * activé (`calm`). Sur téléphone, le clavier de l'appareil fait déjà venir le champ : rien.
 */
export const revealWithoutJump = (node: unknown, calm: boolean) => {
  if (Platform.OS !== 'web' || !node) return
  ;(node as WebNode).scrollIntoView?.({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' })
}

/** Focalise `node` (une ref de View ou de Pressable) sans défilement. Vrai si c'était possible. */
export const focusWithoutScroll = (node: unknown): boolean => {
  if (Platform.OS !== 'web' || !node) return false
  const element = node as WebNode
  if (!element.focus) return false
  element.focus({ preventScroll: true })
  return true
}
