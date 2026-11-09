// La pastille de couleur de chaque réponse à « Facile à refaire ? » (R6a) : vert, jaune, rouge.
// Passée à `Choices` (`dot`, la feuille de publication) et à `RecipeFact` (`dot`, la page d'un
// projet), pour que les deux disent la même chose de la même couleur.
//
// Elle vit dans `src/ui` (relecture R6a) : seuls les composants choisissent des couleurs. Avant, la
// table était dans `projects/categories.ts`, hors des composants, et typée `string` : une faute de
// frappe passait le typage. `Record<ProjectDifficulty, ColorName>` refuse un nom de couleur qui
// n'existe pas, et une réponse oubliée si le contrat en gagne une.
import type { ColorName } from '@ruche/brand'
import type { ProjectDifficulty } from '@ruche/contracts'

/** Des noms de couleur du design, jamais seuls porteurs du sens : le texte dit tout. */
export const DIFFICULTY_DOTS: Record<ProjectDifficulty, ColorName> = {
  easy: 'success',
  medium: 'amber',
  hard: 'danger',
}
