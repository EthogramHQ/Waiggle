// Les catégories d'un projet telles que l'interface les affiche : leur code, leur nom et leur icône,
// pour la feuille de publication (`CategoryPicker`), les cartes et la page d'un projet. Depuis R6b,
// les catégories vivent en base (un administrateur peut en créer) : leurs noms et leurs icônes
// viennent de l'API (`categories/api.ts`, GET /v1/categories), plus des traductions ni d'une table
// de l'appli.
import {
  CATEGORY_ICON_CHOICES,
  type Category,
  PROJECT_CATEGORIES,
  type ProjectCategory,
} from '@ruche/contracts'
import type { useTranslation } from 'react-i18next'
import type { IconName } from '../ui/Icon'

// La fonction `t` de react-i18next, pour traduire hors d'un composant.
type T = ReturnType<typeof useTranslation>['t']

/** Une catégorie telle qu'on l'affiche : son code, son nom dans la langue du membre, son icône. */
export type CategoryOption = { value: ProjectCategory; label: string; icon: IconName }

/** Une catégorie lue de l'API, sous la forme que prennent `CategoryPicker` et les cartes. */
export const optionOf = (category: Category): CategoryOption => ({
  value: category.code,
  label: category.name,
  icon: category.icon,
})

/** Toutes les catégories lues de l'API, dans l'ordre de la feuille (« Autre » en dernier). */
export const categoryOptions = (list: readonly Category[]): CategoryOption[] => list.map(optionOf)

// --- Passage de R6a à R6b : à retirer ---

/** Les codes des seize catégories de départ, les seuls que connaissent les traductions. */
type SeedCategory = (typeof PROJECT_CATEGORIES)[number]

/**
 * L'étiquette d'une catégorie de départ, tirée des traductions de R6a, comme avant R6b.
 *
 * @deprecated Les écrans passent à `categoryOf(useCategories().data?.categories, code)` puis
 * `optionOf` (tranche R6b) : `ProjectFormFields`, `ProjectFormPreview`, `SummaryCard`,
 * `ProjectHeader` et deux échantillons du catalogue l'appellent encore. Elle reste le temps qu'ils
 * changent, pour qu'ils ne tombent pas en attendant ; le dernier qui change la retire. Une
 * catégorie créée par un administrateur n'a ici ni nom ni icône à elle (nom vide, icône
 * « formes ») : la seule bonne source est l'API.
 */
export const categoryOption = (t: T, value: ProjectCategory): CategoryOption => {
  const seed = PROJECT_CATEGORIES.indexOf(value as SeedCategory)
  if (seed === -1) return { value, label: '', icon: 'shapes' }
  const code = value as SeedCategory
  // Le contrat range les icônes des seize catégories de départ dans leur ordre, en tête de la
  // liste des icônes permises (`CATEGORY_ICON_CHOICES`).
  return {
    value,
    label: t(($) => $.project.category[code]),
    icon: CATEGORY_ICON_CHOICES[seed] ?? 'shapes',
  }
}
