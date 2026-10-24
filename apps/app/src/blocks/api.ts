// Bloquer un membre, le débloquer, et la liste « Membres bloqués » (tranche 7b). Bloquer change
// beaucoup de choses à l'écran (la page du membre, le fil, les commentaires, les projets, les
// notifications) : une fois le geste fait, tout cela se relit. Pas de mise à jour optimiste ici,
// contrairement à « Suivre » : le geste passe par une confirmation, et l'écran attend la réponse.
// Les écrans n'appellent que ces hooks ; leurs tests les remplacent.
import { BlockedPage } from '@ruche/contracts'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { notificationsQueryKey } from '../notifications/api'

/** La clé de cache de la liste « Membres bloqués ». */
export const blocksQueryKey = ['blocks'] as const

const blockPath = (memberId: string) => `/v1/members/${encodeURIComponent(memberId)}/block`

// Ce que le blocage change, à relire après le geste. ['comments'] et ['project'] sont des débuts de
// clé : React Query relit toutes celles qui commencent ainsi (les commentaires et les pages de
// chaque projet en cache), car on ne sait pas où apparaissaient les contenus de l'autre.
const touchedBy = (memberId: string) => [
  ['member', memberId],
  feedQueryKey,
  ['comments'],
  ['project'],
  notificationsQueryKey,
  blocksQueryKey,
]

/** Le geste commun : PUT pour bloquer, DELETE pour débloquer ; tout se relit s'il a réussi. */
const useBlockChange = (method: 'PUT' | 'DELETE') => {
  const queryClient = useQueryClient()
  return useCallback(
    async (memberId: string): Promise<ApiResult<null>> => {
      const result = await requestWithoutBody(blockPath(memberId), { method })
      if (result.ok) {
        for (const queryKey of touchedBy(memberId)) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }
      return result
    },
    [queryClient, method],
  )
}

/** Hook : `block(memberId)` bloque le membre (PUT /v1/members/{id}/block, 204). */
export const useBlock = () => ({ block: useBlockChange('PUT') })

/** Hook : `unblock(memberId)` le débloque (DELETE, même adresse, 204). */
export const useUnblock = () => ({ unblock: useBlockChange('DELETE') })

// L'adresse d'une page ; le curseur reste un paramètre (URLSearchParams l'encode).
const withCursor = (path: string, cursor?: string) =>
  cursor ? `${path}?${new URLSearchParams({ cursor }).toString()}` : path

/** Une page de la liste (GET /v1/me/blocks). Lève une ApiError en cas d'échec. */
export const getBlockedPage = async (cursor?: string): Promise<BlockedPage> => {
  const result = await request(withCursor('/v1/me/blocks', cursor), {}, BlockedPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : les membres que j'ai bloqués, 50 par 50, du plus récent au plus ancien. */
export const useBlockedMembers = () =>
  useInfiniteQuery({
    queryKey: blocksQueryKey,
    queryFn: ({ pageParam }) => getBlockedPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
