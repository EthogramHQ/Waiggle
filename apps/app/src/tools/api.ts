// Lire la liste des outils cités par les projets publics (R3 : « Outils populaires » d'Explorer et
// la page « Tous les outils »). Les écrans n'appellent que ce hook ; les tests le remplacent par un
// faux résultat.
import { ToolList } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

/** La clé de cache de la liste : une seule liste, partagée par Explorer et « Tous les outils ». */
export const toolsQueryKey = ['tools'] as const

/**
 * GET /v1/tools : les outils, du plus cité au moins cité, chacun avec son nombre de projets
 * publics. Lève une ApiError en cas d'échec, comme les autres lectures.
 */
export const getTools = async (): Promise<ToolList> => {
  const result = await request('/v1/tools', {}, ToolList)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la liste des outils. useQuery la lit une fois, la garde en cache (Explorer puis « Tous les
 * outils » ne la redemandent pas) et la relit quand elle a vieilli.
 */
export const useTools = () => useQuery({ queryKey: toolsQueryKey, queryFn: getTools })
