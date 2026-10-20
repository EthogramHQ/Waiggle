// Lire les notifications du membre (tranche 6b) : le nombre de la cloche, relu seul chaque minute et
// au retour sur l'appli ; la liste, page par page ; et « vu », qui remet la cloche à zéro. Les écrans
// n'appellent que ces hooks ; leurs tests les remplacent par de faux résultats.
import { NotificationPage, UnreadCount } from '@ruche/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'

/** Toutes les clés de cache des notifications commencent par « notifications ». */
export const notificationsQueryKey = ['notifications'] as const
const unreadKey = ['notifications', 'unread'] as const
const listKey = ['notifications', 'list'] as const

/** Toutes les minutes, la cloche redemande son nombre (comme le bandeau des nouveautés du fil). */
const UNREAD_INTERVAL_MS = 60_000

/** Le nombre de la cloche : les groupes nouveaux, 10 au plus (l'appli écrit « 9+ »). */
export const getUnreadCount = async (): Promise<number> => {
  const result = await request('/v1/notifications/unread', {}, UnreadCount)
  if (!result.ok) throw new ApiError(result.error)
  return result.data.count
}

// L'adresse d'une page. Le curseur est un texte opaque rendu par l'API avec la page précédente ;
// URLSearchParams l'encode : il reste un paramètre, sans pouvoir changer le reste de l'adresse.
const pathOf = (cursor?: string) => {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ''
  return `/v1/notifications${query}`
}

/** Une page de notifications. Lève une ApiError en cas d'échec, comme les autres lectures. */
export const getNotificationPage = async (cursor?: string): Promise<NotificationPage> => {
  const result = await request(pathOf(cursor), {}, NotificationPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : le nombre de nouveautés, pour la cloche. 0 tant qu'il n'est pas arrivé, s'il n'a pas pu
 * être lu, ou si `enabled` est faux (personne n'est connecté : on ne demande rien).
 * refetchInterval relit toutes les minutes, mais seulement quand l'appli est au premier plan ;
 * refetchOnWindowFocus relit au retour sur l'appli (un onglet retrouvé, ou le téléphone qui
 * revient au premier plan : voir api/query-client.ts) si le nombre a plus d'une minute.
 */
export const useUnreadCount = (enabled = true): number => {
  const query = useQuery({
    queryKey: unreadKey,
    queryFn: getUnreadCount,
    enabled,
    staleTime: UNREAD_INTERVAL_MS,
    refetchInterval: UNREAD_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
  return enabled ? (query.data ?? 0) : 0
}

/**
 * Hook : la liste des notifications, 20 par 20, de la plus récente à la plus ancienne.
 * useInfiniteQuery garde les pages déjà lues, dans l'ordre, et sait demander la suivante :
 * getNextPageParam lit le curseur de la dernière page (undefined : c'est fini).
 * La liste ne se relit jamais d'elle-même (ni au retour sur l'appli, ni au retour du réseau) :
 * une notification arrivée entre-temps ne vient pas pousser celle qu'on allait toucher. Et elle
 * n'est pas gardée en cache une fois l'écran quitté (gcTime 0) : rouvrir l'écran relit tout, avec
 * l'état « nouveau » à jour, au lieu d'afficher l'ancienne liste puis de la remplacer.
 */
export const useNotifications = (enabled = true) =>
  useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => getNotificationPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** PUT /v1/notifications/seen : tout ce qui est arrivé jusqu'à `upTo` (l'heure du serveur) est vu. */
export const putSeen = async (upTo: string): Promise<void> => {
  const result = await requestWithoutBody('/v1/notifications/seen', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upTo }),
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook : `markSeen(upTo)` dit à l'API ce que le membre a vu, et remet la cloche à zéro tout de
 * suite, sans attendre sa réponse (ouvrir l'écran remet le nombre à zéro, décision du 20/10/2026).
 * Si l'API refuse, on relit le vrai nombre.
 */
export const useMarkSeen = (): { markSeen: (upTo: string) => void } => {
  const queryClient = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: putSeen,
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: unreadKey })
    },
  })
  const markSeen = useCallback(
    (upTo: string) => {
      // Au toucher, pas dans onMutate : la cloche passe à zéro dans le même instant. Une lecture
      // du nombre déjà en route est annulée, pour qu'elle n'écrive pas l'ancien nombre par-dessus.
      void queryClient.cancelQueries({ queryKey: unreadKey })
      queryClient.setQueryData<number>(unreadKey, 0)
      mutate(upTo)
    },
    [queryClient, mutate],
  )
  return { markSeen }
}
