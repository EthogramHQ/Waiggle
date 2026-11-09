// La recherche par mots (tranche R3) : demander à l'API les projets, les membres et les outils qui
// correspondent à un texte (GET /v1/search?q=…). L'écran attend lui-même que le membre ait fini de
// taper (250 ms) avant de changer le texte demandé ici ; ce hook ne fait que lire. Les écrans
// n'appellent que useSearch ; les tests le remplacent par un faux.
//
// R6b : la recherche peut ne garder, dans le groupe Projets, que ceux d'une catégorie
// (`&category=cooking`) ; les membres et les outils trouvés ne changent pas.
import { SearchQuery, SearchResults } from '@ruche/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

/** Le début de la clé de cache de la recherche ; la suite est le texte cherché, puis la catégorie. */
export const searchQueryKey = ['search'] as const

/**
 * Lit les résultats d'une recherche. Lève une ApiError en cas d'échec : `rateLimited` pour un 429
 * (trop de recherches), que l'écran dit à part.
 *
 * URLSearchParams encode le texte : une esperluette ou un « # » tapés restent du texte cherché, et
 * ne coupent pas l'adresse. `signal` : quand le texte change, React Query abandonne la demande
 * devenue inutile au lieu d'attendre sa réponse. Sans catégorie, le paramètre n'est pas envoyé du
 * tout (plutôt que « &category= » vide, que l'API refuserait).
 */
export const getSearch = async (
  q: string,
  category: string | undefined,
  signal?: AbortSignal,
): Promise<SearchResults> => {
  const params = new URLSearchParams({ q, ...(category === undefined ? null : { category }) })
  const result = await request(`/v1/search?${params.toString()}`, { signal }, SearchResults)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : les résultats pour `q`, déjà « posé » par l'écran (après les 250 ms sans frappe), et, s'il
 * y en a une, la catégorie des projets à garder (un code déjà vérifié par l'écran).
 *
 * - Rien n'est demandé tant que la demande n'est pas valable pour l'API (le schéma du contrat : de 2
 *   à 80 caractères, au moins un mot de 2 lettres, un code de catégorie bien formé) : l'API
 *   répondrait 400, et une lettre seule ne compterait pas moins dans le quota.
 * - La catégorie fait partie de la clé de cache : « carn » dans « Cuisine » et « carn » partout sont
 *   deux réponses différentes. Choisir deux fois la même catégorie ne redemande donc rien.
 * - Pendant qu'une nouvelle recherche part (un mot de plus, une autre catégorie), les résultats
 *   précédents restent affichés (`placeholderData`) : la liste ne clignote pas.
 * - Une recherche qui échoue n'est jamais réessayée d'elle-même (`retry: false`) : la personne
 *   retape ou touche « Réessayer ». Sinon, trois essais de 6 s laissaient « Recherche en cours… »
 *   22 s à l'écran (relecture de design de R3).
 * - Les mêmes lettres retapées dans la minute : la réponse déjà reçue suffit (`staleTime` par
 *   défaut de l'appli). Rien n'est gardé sur l'appareil : le cache vit en mémoire seulement.
 */
export const useSearch = (q: string, category?: string) =>
  useQuery({
    queryKey: [...searchQueryKey, q, category ?? null],
    queryFn: ({ signal }) => getSearch(q, category, signal),
    enabled: SearchQuery.safeParse({ q, category }).success,
    placeholderData: keepPreviousData,
    retry: false,
  })
