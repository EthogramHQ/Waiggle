// La feuille des catégories (tranche R6b) : sur téléphone, le bouton « Toutes les catégories » de la
// page d'un outil (et de la recherche) l'ouvre. Elle propose « Toutes les catégories », puis chaque
// catégorie reçue, avec son icône et son nombre de projets (« Cuisine 2 », lu « Cuisine, 2
// projets »).
//
// Choisir applique tout de suite : `onChange` reçoit le code (ou `null` pour « Toutes »), et c'est
// l'écran qui ferme la feuille et rend le focus à son bouton. Pas de « Annuler » ni de « OK » :
// rien n'est à confirmer, seul « Fermer » (la croix de la feuille) reste, avec Échap, le voile et le
// glissé vers le bas (relecture du plan, point 15). Le Retour du navigateur quitte la page : la
// feuille n'a pas d'adresse à elle.
import { useTranslation } from 'react-i18next'
import { FilterPills } from '../ui/FilterPills'
import type { IconName } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'

/** Une catégorie proposée : son code, son nom traduit, son icône, et son nombre de projets. */
export type CategoryFilterChoice = {
  code: string
  name: string
  icon: IconName
  /** Absent : aucun nombre affiché (la recherche ne le connaît pas toujours). */
  count?: number
}

type Props = {
  open: boolean
  /** Les catégories à proposer, dans l'ordre où les montrer (celles des projets seulement). */
  categories: readonly CategoryFilterChoice[]
  /** La catégorie choisie ; `null` : « Toutes les catégories ». */
  value: string | null
  /** Une catégorie touchée, ou `null` pour « Toutes ». L'écran applique et ferme. */
  onChange: (code: string | null) => void
  /** « Fermer », Échap, le voile : la feuille se ferme sans rien changer. */
  onClose: () => void
}

export function CategoryFilterSheet({ open, categories, value, onChange, onClose }: Props) {
  const { t } = useTranslation()
  const options = categories.map((category) => ({
    value: category.code,
    label: category.name,
    icon: category.icon,
    ...(category.count === undefined
      ? null
      : {
          count: category.count,
          // Le chiffre seul ne dirait rien à l'oreille : « Cuisine, 2 projets ».
          spokenLabel: t(($) => $.tool.categoryWithCount, {
            name: category.name,
            projects: t(($) => $.tools.projects, { count: category.count }),
          }),
        }),
  }))
  return (
    <Sheet open={open} title={t(($) => $.tool.categorySheetTitle)} onClose={onClose} compact>
      <FilterPills
        label={t(($) => $.tool.categoryLabel)}
        allLabel={t(($) => $.tool.allCategories)}
        value={value}
        options={options}
        onChange={onChange}
      />
    </Sheet>
  )
}
