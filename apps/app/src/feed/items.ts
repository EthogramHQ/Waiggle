// Les éléments d'un fil, sans rien d'autre : un fichier sans dépendance, que les écrans importent
// même quand leurs tests remplacent les requêtes (feed/api.ts) par de faux résultats.
import type { FeedItem } from '@ruche/contracts'

/** L'identifiant d'un élément du fil : celui du projet, ou celui de la note. */
export const feedItemId = (item: FeedItem) =>
  item.kind === 'note' ? item.note.id : item.project.id

/**
 * Le premier élément qui n'est pas du membre lui-même (R6a : ses projets entrent dans son fil, et
 * une note a pour auteur celui de son projet). C'est jusqu'à lui que le fil est marqué lu
 * (`useMarkFeedRead`) ; `undefined` si la liste n'a que les siens.
 */
export const firstOfOthers = (items: readonly FeedItem[] | undefined, viewerId: string) =>
  items?.find((item) => item.project.author.id !== viewerId)

/**
 * Où poser « Tu es à jour » dans le fil (R4, F-Fil5) : le rang du premier élément déjà vu, celui
 * dont la date ne dépasse pas la dernière lecture (`at ≤ readBefore`). La sphère se pose juste
 * avant lui, donc en tête si c'est le premier.
 *
 * Aucun élément déjà vu parmi ceux qu'on a :
 * - le fil est fini : la sphère va tout au bout (rang = nombre d'éléments) ;
 * - il reste une suite : on ne sait pas encore où elle irait, elle n'est nulle part (null). C'est
 *   aussi le cas d'une toute première visite (`readBefore` null) dont le fil continue.
 *
 * Les dates sont comparées comme des instants (`Date.parse`), pas comme des textes : deux écritures
 * d'un même instant (« Z » ou « +00:00 ») restent égales.
 */
export const upToDateIndex = (
  items: readonly FeedItem[],
  readBefore: string | null,
  hasMore: boolean,
): number | null => {
  if (readBefore !== null) {
    const limit = Date.parse(readBefore)
    const seen = items.findIndex((item) => Date.parse(item.at) <= limit)
    if (seen !== -1) return seen
  }
  return hasMore ? null : items.length
}
