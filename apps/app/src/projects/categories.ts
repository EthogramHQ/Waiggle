// Les catégories d'un projet telles que l'interface les affiche : leur code, leur nom et leur icône,
// pour la feuille de publication (`CategoryPicker`), les cartes et la page d'un projet. Depuis R6b,
// les catégories vivent en base (un administrateur peut en créer) : leurs noms et leurs icônes
// viennent de l'API (`categories/api.ts`, GET /v1/categories), plus des traductions ni d'une table
// de l'appli.
import type { Category, ProjectCategory } from '@ruche/contracts'
import type { IconName } from '../ui/Icon'

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
