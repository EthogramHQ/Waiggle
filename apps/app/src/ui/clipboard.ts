// Copier un texte dans le presse-papiers de l'appareil (tranche R5a : « Copier » d'un prompt,
// « Copier le lien » d'un projet). expo-clipboard parle au presse-papiers d'iOS, d'Android et du
// navigateur avec la même fonction. On ne fait qu'écrire : l'appli ne lit jamais le presse-papiers
// (relecture juridique jur-11 : il peut contenir n'importe quoi de la personne).
import * as Clipboard from 'expo-clipboard'

/**
 * Copie `text` tel quel. Rend vrai si la copie a réussi, faux si l'appareil l'a refusée (un
 * navigateur sans permission, une page pas au premier plan…) : l'appelant dit alors « Impossible
 * de copier » au lieu d'un « Copié » mensonger (relecture de l'interface ui-7).
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // setStringAsync rend un booléen sur le web, rien sur iOS et Android : seul un « false »
    // explicite dit un refus.
    const done: unknown = await Clipboard.setStringAsync(text)
    return done !== false
  } catch {
    return false
  }
}
