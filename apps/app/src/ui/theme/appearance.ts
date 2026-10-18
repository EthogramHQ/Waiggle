// L'apparence choisie sur cet appareil : « Automatique » (suit le réglage clair / sombre de
// l'appareil), « Jour » ou « Nuit ». Le choix est gardé dans le stockage local de l'appareil
// (localStorage sur le web) et pas sur le compte : le téléphone et l'ordinateur ont chacun le leur.
import AsyncStorage from '@react-native-async-storage/async-storage'

export const appearances = ['auto', 'day', 'night'] as const
export type Appearance = (typeof appearances)[number]

// Le nom sous lequel le choix est rangé dans le stockage de l'appareil.
const STORAGE_KEY = 'appearance'

// Ce qu'on relit du stockage peut avoir été modifié à la main (sur le web, n'importe qui peut écrire
// dans son localStorage) : on vérifie que c'est bien une des trois valeurs avant de s'en servir.
const isAppearance = (value: unknown): value is Appearance =>
  typeof value === 'string' && (appearances as readonly string[]).includes(value)

/** Le choix mémorisé, ou « Automatique » s'il n'y en a pas (ou s'il est illisible). */
export const loadAppearance = async (): Promise<Appearance> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY)
    return isAppearance(stored) ? stored : 'auto'
  } catch {
    // Stockage indisponible (navigation privée, par exemple) : on reste en automatique.
    return 'auto'
  }
}

/** Mémorise le choix. Un échec n'empêche rien : l'apparence change quand même pour cette visite. */
export const saveAppearance = async (appearance: Appearance): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, appearance)
  } catch {
    // Rien à faire : le choix ne sera simplement pas retenu à la prochaine ouverture.
  }
}
