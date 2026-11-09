// Lire les catégories des projets (tranche R6b) : depuis que les administrateurs peuvent en créer,
// leurs noms et leurs icônes vivent en base, plus dans les traductions de l'appli. Toute l'appli les
// lit ici : la feuille « Catégorie et outils », les étiquettes des cartes, les filtres d'Explorer et
// de la recherche. Les écrans n'appellent que ce hook ; les tests simulent le réseau (`api/client`).
import { type Category, CategoryList } from '@ruche/contracts'
import { resolveLanguage } from '@ruche/i18n'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

/**
 * La clé de cache des catégories : une liste par langue (« Cuisine » en français, « Cooking » en
 * anglais). Changer de langue lit l'autre liste au lieu de montrer les noms de la précédente. Sans
 * langue, la clé désigne les deux listes à la fois : pour les relire toutes (une catégorie créée).
 */
export const categoriesQueryKey = (language?: string) =>
  language === undefined ? (['categories'] as const) : (['categories', language] as const)

/**
 * Le temps pendant lequel la liste lue reste bonne sans être redemandée : une heure. Une catégorie
 * naît rarement (un administrateur la crée) ; l'écran qui la crée relit la liste lui-même, et une
 * carte qui porte un code encore inconnu la redemande une fois.
 */
const CATEGORIES_STALE_MS = 60 * 60_000

/**
 * GET /v1/categories : toutes les catégories, dans l'ordre de la feuille (« Autre » en dernier),
 * nommées dans `language`. La langue part dans l'en-tête `Accept-Language`, que l'API lit pour
 * choisir les noms : celle que le membre a choisie dans l'appli, pas celle du navigateur. Lève une
 * ApiError en cas d'échec, comme les autres lectures.
 */
export const getCategories = async (language: string): Promise<CategoryList> => {
  const result = await request(
    '/v1/categories',
    { headers: { 'Accept-Language': language } },
    CategoryList,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : les catégories, dans la langue de l'appli. useQuery les lit une fois et les garde en cache
 * (toutes les cartes d'un fil partagent la même lecture). `resolveLanguage` ramène une variante
 * régionale (« en-US ») à une langue que l'API connaît.
 */
export const useCategories = () => {
  const { i18n } = useTranslation()
  const language = resolveLanguage([i18n.language])
  return useQuery({
    queryKey: categoriesQueryKey(language),
    queryFn: () => getCategories(language),
    staleTime: CATEGORIES_STALE_MS,
  })
}

/**
 * La catégorie d'un code dans une liste lue (`useCategories().data?.categories`), ou `undefined`
 * quand la liste n'est pas encore là, que le projet n'a pas de catégorie, ou que le code n'y est pas
 * (une catégorie créée après la lecture). Dans ces trois cas, l'écran ne montre aucune étiquette :
 * jamais le code brut (« knitting ») à la place d'un nom.
 */
export const categoryOf = (
  list: readonly Category[] | undefined,
  code: string | null | undefined,
): Category | undefined =>
  code === null || code === undefined ? undefined : list?.find((one) => one.code === code)
