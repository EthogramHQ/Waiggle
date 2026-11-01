// La recherche par mots (tranche R3) : demander à l'API les projets, les membres et les outils qui
// correspondent à un texte (GET /v1/search?q=…). L'écran attend lui-même que le membre ait fini de
// taper (250 ms) avant de changer le texte demandé ici ; ce hook ne fait que lire. Les écrans
// n'appellent que useSearch ; les tests le remplacent par un faux.
import { SearchQuery, SearchResults } from '@ruche/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

/** Le début de la clé de cache de la recherche ; la suite est le texte cherché. */
export const searchQueryKey = ['search'] as const

/**
 * Lit les résultats d'une recherche. Lève une ApiError en cas d'échec : `rateLimited` pour un 429
 * (trop de recherches), que l'écran dit à part.
 *
 * URLSearchParams encode le texte : une esperluette ou un « # » tapés restent du texte cherché, et
 * ne coupent pas l'adresse. `signal` : quand le texte change, React Query abandonne la demande
 * devenue inutile au lieu d'attendre sa réponse.
 */
export const getSearch = async (q: string, signal?: AbortSignal): Promise<SearchResults> => {
  const params = new URLSearchParams({ q })
  const result = await request(`/v1/search?${params.toString()}`, { signal }, SearchResults)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : les résultats pour `q`, déjà « posé » par l'écran (après les 250 ms sans frappe).
 *
 * - Rien n'est demandé tant que le texte n'est pas une recherche valable pour l'API (le schéma du
 *   contrat : de 2 à 80 caractères, au moins un mot de 2 lettres) : l'API répondrait 400, et une
 *   lettre seule ne compterait pas moins dans le quota.
 * - Pendant qu'une nouvelle recherche part, les résultats précédents restent affichés
 *   (`placeholderData`) : la liste ne clignote pas à chaque mot.
 * - Une recherche qui échoue n'est jamais réessayée d'elle-même (`retry: false`) : la personne
 *   retape ou touche « Réessayer ». Sinon, trois essais de 6 s laissaient « Recherche en cours… »
 *   22 s à l'écran (relecture de design de R3).
 * - Les mêmes lettres retapées dans la minute : la réponse déjà reçue suffit (`staleTime` par
 *   défaut de l'appli). Rien n'est gardé sur l'appareil : le cache vit en mémoire seulement.
 */
export const useSearch = (q: string) =>
  useQuery({
    queryKey: [...searchQueryKey, q],
    queryFn: ({ signal }) => getSearch(q, signal),
    enabled: SearchQuery.safeParse({ q }).success,
    placeholderData: keepPreviousData,
    retry: false,
  })
