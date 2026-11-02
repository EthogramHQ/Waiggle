// Ce qu'on ne montre qu'une fois par appareil (R5a : l'aide de l'éventail des réactions, « Touche
// une réaction pour la poser… » et « J'ai compris »). Comme la suspension vue
// (suspensionMemory.ts), c'est rangé dans le stockage de l'appareil (localStorage sur le web), pas
// sur le compte : le téléphone et l'ordinateur ont chacun le leur.
//
// Ce réglage d'interface ne quitte jamais l'appareil (relecture du plan, sec-B8 et jur-10) : on
// range toujours la même constante, sans identifiant, date ni compteur, et l'on compare la valeur
// lue à cette constante (une valeur rangée par autre chose ne vaut pas « vu »). Le module n'importe
// que le stockage : il ne parle ni à l'API ni au réseau.
//
// Le stockage peut manquer (navigation privée, stockage plein ou refusé) : rien n'échoue, et l'aide
// s'affiche (« pas encore vu »). Contrairement à suspensionMemory.ts, aucune mémoire de secours pour
// la visite : mieux vaut revoir une aide d'une phrase que la perdre sans l'avoir comprise (ui-9).
import AsyncStorage from '@react-native-async-storage/async-storage'

/** Ce qui peut n'être montré qu'une fois par appareil. Un nom de plus pour une autre aide. */
export type OnceName = 'reaction-fan-help'

/** La valeur rangée pour « déjà vu » : une constante, la même pour tous et à tout moment. */
export const ONCE_SEEN = 'seen'

/** Le nom de la case du stockage : un préfixe commun, pour qu'on les reconnaisse. */
const keyOf = (name: OnceName) => `once:${name}`

/** Vrai seulement si cet appareil a déjà noté `name` ; une panne du stockage répond « pas vu ». */
export const hasSeen = async (name: OnceName): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(keyOf(name))) === ONCE_SEEN
  } catch {
    return false
  }
}

/** Note `name` comme vu sur cet appareil. Un refus du stockage n'empêche rien. */
export const noteSeen = async (name: OnceName): Promise<void> => {
  try {
    await AsyncStorage.setItem(keyOf(name), ONCE_SEEN)
  } catch {
    // Rien à faire : l'aide reviendra à la prochaine ouverture, c'est tout.
  }
}
