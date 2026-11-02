// Partager une page de Waiggle (tranche R5a, F-Pr1, F-Mb1) : fabriquer son adresse, savoir si
// l'appareil a un menu de partage, et lui passer cette adresse. La feuille « Partager »
// (`ShareSheet`) s'en sert ; le menu « … » d'un projet n'utilise que l'adresse.
//
// Deux règles des relectures du plan :
// - sec-B6 : l'identifiant est validé (`ProjectId`, `MemberId` du contrat) avant de fabriquer
//   l'adresse, et l'adresse est construite par `new URL` sur l'adresse publique de l'appli. Un
//   identifiant qui contiendrait « ../ », « ? » ou une adresse entière ne donne aucun lien ;
// - jur-4 : le menu de l'appareil ne reçoit que l'adresse. Ni le titre du projet, ni le nom de la
//   personne qui partage : rien de plus que ce que le lien lui-même dit.
import { MemberId, ProjectId } from '@ruche/contracts'
import { Platform, Share } from 'react-native'
import { webAppUrl } from '../config'

/** Ce qu'on partage : la page d'un projet, ou celle d'un membre, par son identifiant. */
export type ShareTarget = { kind: 'project' | 'member'; id: string }

/**
 * L'adresse publique de la page, sans paramètre ni ancre (rien ne dit qui a partagé), ou `null`
 * si l'identifiant n'en est pas un : on ne fabrique jamais un lien à partir d'un texte douteux.
 */
export function shareUrl(target: ShareTarget): string | null {
  // safeParse : la validation de Zod qui ne lance pas d'erreur, et rend `success` vrai ou faux.
  const valid =
    target.kind === 'project'
      ? ProjectId.safeParse(target.id).success
      : MemberId.safeParse(target.id).success
  if (!valid) return null
  const path = target.kind === 'project' ? `/projects/${target.id}` : `/members/${target.id}`
  return new URL(path, webAppUrl).href
}

/** Le peu du navigateur dont le partage a besoin (les types de React Native ne le décrivent pas). */
type WebNavigator = { share?: (data: { url: string }) => Promise<void> }

const webNavigator = (): WebNavigator | undefined =>
  (globalThis as { navigator?: WebNavigator }).navigator

/**
 * Vrai si l'appareil a un menu de partage : toujours sur téléphone (iOS, Android), et sur le web
 * seulement si le navigateur offre `navigator.share` (Safari, Chrome sur Android ; pas Firefox
 * sur ordinateur). Sur le web, la réponse dépend du navigateur : un composant ne s'en sert
 * qu'après l'hydratation (`useHydrated`, relecture ui-9), sinon la page pré-rendue et la page
 * hydratée ne dessineraient pas la même chose.
 */
export function canShareNatively(): boolean {
  if (Platform.OS !== 'web') return true
  return typeof webNavigator()?.share === 'function'
}

/** Le nom d'une erreur du navigateur (`DOMException`), ou rien. */
const errorName = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : undefined

/**
 * Ouvre le menu de partage de l'appareil avec l'adresse, et rien d'autre (jur-4). Sur téléphone,
 * `Share.share` de React Native, qui veut un `message` (Android) et un `url` (iOS) : les deux
 * reçoivent l'adresse. Sur le web, `navigator.share`.
 *
 * Fermer le menu sans rien choisir (`AbortError`), ou un navigateur qui refuse d'ouvrir le menu
 * (`NotAllowedError`), n'est pas une erreur à montrer ni à écrire dans un journal (sec-B6) : la
 * promesse se résout sans rien dire. Toute autre erreur remonte à l'appelant.
 */
export async function shareLink(url: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await Share.share({ message: url, url })
    return
  }
  const browser = webNavigator()
  if (typeof browser?.share !== 'function') return
  try {
    // Appelé sur `navigator` lui-même : séparée de lui, la fonction est refusée par le navigateur
    // (« Illegal invocation »).
    await browser.share({ url })
  } catch (error) {
    const name = errorName(error)
    if (name === 'AbortError' || name === 'NotAllowedError') return
    throw error
  }
}
