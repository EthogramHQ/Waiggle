// Petites mises en forme pour afficher un projet.

/**
 * La date courte (« 12 oct. », « 12 oct. 2025 ») vit désormais avec les dates relatives, dans
 * `ui/relativeDate.ts` (R4) : un composant de `src/ui` ne peut rien importer d'un domaine, alors
 * que les domaines lisent `src/ui`. On la réexporte ici le temps que ses appelants passent à
 * `RelativeTime`.
 */
export { shortDate } from '../ui/relativeDate'

/** L'écart au-delà duquel un projet compte comme « mis à jour » après sa publication. */
const UPDATE_GRACE_MS = 60_000

/**
 * Vrai si le projet a changé plus d'une minute après sa création (R5a, la ligne de dates sous le
 * titre : « Publié le 3 oct. · Mis à jour hier »). La minute de grâce : l'API écrit `updatedAt` en
 * même temps que les photos, juste après la création ; sans elle, chaque projet neuf dirait
 * « Mis à jour » le jour même de sa publication.
 */
export const changedAfterCreation = (createdAt: string, updatedAt: string): boolean =>
  Date.parse(updatedAt) - Date.parse(createdAt) > UPDATE_GRACE_MS

/** Le nom du site d'une adresse : « https://carnet.example.com/demo » → « carnet.example.com ». */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
