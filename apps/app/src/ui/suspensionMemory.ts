// La dernière suspension vue sur cet appareil (tranche 7c, décision de Louis du 27/10/2026) : le
// bandeau d'un compte suspendu se montre déplié à la première visite après une suspension nouvelle
// ou changée (début, fin), puis replié sur les pages suivantes. Comme l'apparence
// (theme/appearance.ts), c'est rangé dans le stockage de l'appareil (localStorage sur le web), pas
// sur le compte : le téléphone et l'ordinateur ont chacun le leur.
//
// Le stockage peut manquer (navigation privée, stockage plein) : rien n'échoue pour autant. On se
// souvient alors de la suspension pour la visite en cours seulement (une variable du module), et le
// bandeau se déplie à nouveau à la prochaine ouverture de l'appli.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Suspension } from '@ruche/contracts'

// Le nom sous lequel la suspension vue est rangée dans le stockage de l'appareil.
const STORAGE_KEY = 'suspension-seen'

/** La suspension vue pendant cette visite : le repli quand le stockage ne répond pas. */
let seenThisVisit: string | null = null

/**
 * Ce qui identifie une suspension pour le membre : son début et sa fin. Une suspension prolongée ou
 * raccourcie (même début, autre fin) compte comme changée, et se montre à nouveau dépliée.
 */
export const suspensionSignature = ({ since, endsAt }: Pick<Suspension, 'since' | 'endsAt'>) =>
  `${since}|${endsAt ?? 'indefinite'}`

/** Vrai si cette suspension n'a pas encore été vue sur cet appareil. */
export const isNewSuspension = async (signature: string): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) !== signature
  } catch {
    // Stockage indisponible : on s'en tient à ce qu'on a vu pendant cette visite.
    return seenThisVisit !== signature
  }
}

/** Note la suspension comme vue. Un échec n'empêche rien : elle sera seulement redépliée plus tard. */
export const noteSuspensionSeen = async (signature: string): Promise<void> => {
  seenThisVisit = signature
  try {
    await AsyncStorage.setItem(STORAGE_KEY, signature)
  } catch {
    // Rien à faire : la variable du module suffit pour cette visite.
  }
}
