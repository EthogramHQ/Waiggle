// Le nom, le dessin et la matière d'un sceau, d'après son code : la règle commune à « Ma récolte »,
// à l'étagère de la page d'un membre et aux avis de l'Activité, pour qu'un même sceau ait partout
// le même nom et la même icône.
import {
  type Category,
  type MILESTONE_SEALS,
  SEALS,
  type SealCode,
  type SealMatter,
  sealCategory,
} from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import { useTranslation } from 'react-i18next'
import { useCategories } from '../categories/api'
import type { IconName } from '../ui/Icon'

type T = ReturnType<typeof useTranslation>['t']

/** Le code d'un sceau de palier (« first_feedback »), la clé de son nom. */
type MilestoneSeal = (typeof MILESTONE_SEALS)[number]['code'] | 'scout_founder'

export type SealLook = { name: string; icon: IconName; matter: SealMatter }

/**
 * Un sceau connu d'avance (`SEALS` du contrat) a son nom et son icône. Le sceau d'une catégorie
 * créée ensuite par un administrateur n'a pas de texte à nous : il prend le NOM de la catégorie
 * (lu avec `useCategories`) dans la phrase `categoryOther`, et l'icône de la catégorie ; tant que la
 * liste n'est pas lue (ou si le code n'y est pas), la phrase garde le code et l'icône est « shapes ».
 * Cire crème, comme les autres catégories.
 */
export const sealOf = (
  code: SealCode,
  t: T,
  categories: readonly Category[] | undefined,
): SealLook => {
  const known = SEALS.find((seal) => seal.code === code)
  const category = sealCategory(code)
  const name =
    category === null
      ? t(($) => $.game.seals[code as MilestoneSeal])
      : known
        ? t(($) => $.game.seals.category[code as keyof Translation['game']['seals']['category']])
        : t(($) => $.game.seals.categoryOther, {
            category: categories?.find((one) => one.code === category)?.name ?? category,
          })
  // L'icône vient du contrat (une chaîne : un test vérifie que chacune existe dans Icon).
  const icon = (known?.icon ??
    categories?.find((one) => one.code === category)?.icon ??
    'shapes') as IconName
  return { name, icon, matter: known?.matter ?? 'cream' }
}

/**
 * Hook : `sealOf` déjà lié à la langue et aux catégories lues. Les catégories viennent de React
 * Query (une lecture partagée par toute l'appli) : un sceau de catégorie nouvelle se nomme dès
 * qu'elles arrivent.
 */
export const useSealOf = () => {
  const { t } = useTranslation()
  const categories = useCategories().data?.categories
  return (code: SealCode): SealLook => sealOf(code, t, categories)
}
