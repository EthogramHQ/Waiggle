// Petites mises en forme pour afficher un projet.

/**
 * La date courte (« 12 oct. », « 12 oct. 2025 ») vit désormais avec les dates relatives, dans
 * `ui/relativeDate.ts` (R4) : un composant de `src/ui` ne peut rien importer d'un domaine, alors
 * que les domaines lisent `src/ui`. On la réexporte ici le temps que ses appelants passent à
 * `RelativeTime`.
 */
export { shortDate } from '../ui/relativeDate'

/** Le nom du site d'une adresse : « https://carnet.example.com/demo » → « carnet.example.com ». */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
