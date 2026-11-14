// Qui voit une photo retirée seule par la modération (R9, 7d) : la règle, écrite une fois en
// JavaScript et une fois en SQL, côte à côte, pour toutes les lectures de photos (galerie,
// couverture verticale, photos des mises à jour, images du coin des testeurs).
//
// Une photo retirée garde sa ligne (`project_media` ou `tester_media`), marquée par son
// `removal_id` (relecture de sécurité P1 : sa ligne reste pour que l'auteur la retrouve, la
// remplace ou la supprime). Pour tout autre membre, elle n'existe plus : ni dans une liste, ni en
// couverture, ni par son adresse. Son auteur la voit encore, à sa place, et lit pourquoi dans
// `removedParts`.
//
// Deux lectures :
// - « à ce lecteur » (`viewerId` donné) : la galerie d'un projet, la frise des mises à jour, le
//   coin ; l'auteur y garde ses photos retirées ;
// - « à tous » (`viewerId` null) : ce qui représente le contenu ailleurs que sur sa page, la
//   couverture d'une carte ou d'une notification. Une photo retirée n'y est jamais, pas même pour
//   son auteur : la couverture est la 1re photo VISIBLE (relecture de sécurité P6), et l'auteur voit
//   sa carte comme les autres la voient.
import { type AnyColumn, eq, isNull, or, type SQL, sql } from 'drizzle-orm'

/** Ce que la règle lit d'une photo : sa marque de retrait. */
export type MediaMark = { removalId: string | null }

/**
 * La règle en JavaScript : vrai si la photo se montre. `viewer` : qui regarde (`viewerId`) et
 * l'auteur de la photo (`ownerId` : l'auteur du projet pour une photo de projet ou de mise à jour,
 * le déposant pour une image du coin) ; null : « à tous », pour une couverture.
 */
export const mediaShownTo = (
  media: MediaMark,
  viewer: { ownerId: string; viewerId: string } | null,
) => media.removalId === null || (viewer !== null && viewer.ownerId === viewer.viewerId)

/**
 * La même règle en SQL, pour un `where` : `removal_id is null or <auteur> = $viewer`, ou
 * `removal_id is null` seul pour « à tous » (`viewer` null). L'identifiant du lecteur entre comme
 * paramètre lié, jamais collé au texte. Aucun index propre : la condition filtre les quelques
 * photos qu'un autre index a déjà trouvées (project_media_project_idx, project_media_update_idx,
 * la clé unique de storage_key).
 */
export const visibleMedia = (
  removalId: AnyColumn,
  viewer: { ownerId: AnyColumn; viewerId: string } | null,
): SQL => {
  const notRemoved = isNull(removalId)
  if (viewer === null) return notRemoved
  return or(notRemoved, eq(viewer.ownerId, viewer.viewerId)) ?? notRemoved
}

/**
 * « À tous », pour une requête écrite en SQL brut (la miniature d'une notification) : `alias` est
 * le nom donné à `project_media` dans cette requête. Un nom écrit dans notre code, jamais une entrée
 * du client : `sql.raw` le colle tel quel.
 */
export const mediaOnCoversSql = (alias: 'm'): SQL => sql.raw(`${alias}.removal_id is null`)
