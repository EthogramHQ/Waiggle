// Lire et traiter la file de modération (tranche 7a), réservée aux administrateurs : les
// signalements en attente, les contenus retirés, et les décisions (retirer, classer sans suite,
// rétablir). Les écrans n'appellent que ces hooks ; leurs tests les remplacent par de faux résultats.
// L'API refait la vérification « administrateur » à chaque requête : pour tout autre membre, ces
// routes répondent 404, comme une adresse qui n'existe pas.
import {
  ModerationDecision,
  type ModerationDecisionInput,
  ModerationQueuePage,
  RemovedPage,
} from '@ruche/contracts'
import { type InfiniteData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/** Toutes les clés de cache de la modération commencent par « moderation ». */
export const moderationQueryKey = ['moderation'] as const
const queueKey = ['moderation', 'queue'] as const
const removedKey = ['moderation', 'removed'] as const

// L'adresse d'une page. Le curseur est un texte opaque rendu par l'API avec la page précédente ;
// URLSearchParams l'encode : il reste un paramètre, sans pouvoir changer le reste de l'adresse.
const withCursor = (path: string, cursor?: string) =>
  cursor ? `${path}?${new URLSearchParams({ cursor }).toString()}` : path

/** Une page de la file (GET /v1/moderation/reports). Lève une ApiError en cas d'échec. */
export const getQueuePage = async (cursor?: string): Promise<ModerationQueuePage> => {
  const result = await request(
    withCursor('/v1/moderation/reports', cursor),
    {},
    ModerationQueuePage,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Une page des contenus retirés (GET /v1/moderation/removed). */
export const getRemovedPage = async (cursor?: string): Promise<RemovedPage> => {
  const result = await request(withCursor('/v1/moderation/removed', cursor), {}, RemovedPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

// Une erreur qui ne s'arrangera pas en réessayant (page inconnue, session expirée) : React Query
// ne relance pas la lecture. Les autres (réseau, serveur) ont droit à ses essais habituels.
const retry = (failures: number, error: unknown) =>
  !(error instanceof ApiError && (error.key === 'notFound' || error.key === 'unauthorized')) &&
  failures < 2

/**
 * Hook : la file, 20 cibles par 20, du signalement le plus ancien au plus récent (l'ordre de
 * l'API). useInfiniteQuery garde les pages déjà lues et sait demander la suivante. La file ne se
 * relit jamais seule (ni au retour sur l'onglet, ni au retour du réseau) : une carte ne vient pas
 * remplacer, sous le doigt, celle qu'on allait toucher.
 */
export const useModerationQueue = (enabled = true) =>
  useInfiniteQuery({
    queryKey: queueKey,
    queryFn: ({ pageParam }) => getQueuePage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    retry,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** Hook : les contenus retirés, du plus récent au plus ancien, pour pouvoir les rétablir. */
export const useRemovedItems = (enabled = true) =>
  useInfiniteQuery({
    queryKey: removedKey,
    queryFn: ({ pageParam }) => getRemovedPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    retry,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** POST /v1/moderation/decisions : la décision, telle que l'API l'a enregistrée. */
export const postDecision = (input: ModerationDecisionInput) =>
  request(
    '/v1/moderation/decisions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    ModerationDecision,
  )

/** Les pages d'une liste sans la cible donnée (même sorte, même identifiant). */
const without = <Item extends { target: { kind: string; id: string } }>(
  data: InfiniteData<{ items: Item[]; nextCursor: string | null }> | undefined,
  target: { kind: string; id: string },
) =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter(
        (item) => !(item.target.kind === target.kind && item.target.id === target.id),
      ),
    })),
  }

/**
 * Hook : `decide(input)` envoie une décision et rend son résultat (`{ ok, data }` ou
 * `{ ok: false, error }`), que l'écran annonce. Une décision réussie ôte la cible de sa liste
 * (la file pour retirer ou classer, les retirés pour rétablir) à l'arrivée de la réponse, sans
 * relire toute la file ; l'autre liste sera relue à sa prochaine ouverture. Une décision refusée
 * (prise entre-temps par quelqu'un d'autre, contenu disparu) fait relire la file, qui montre alors
 * l'état réel.
 */
export const useDecide = (): {
  decide: (input: ModerationDecisionInput) => Promise<ApiResult<ModerationDecision>>
} => {
  const queryClient = useQueryClient()
  const decide = useCallback(
    async (input: ModerationDecisionInput) => {
      const result = await postDecision(input)
      const touched = input.action === 'restore' ? removedKey : queueKey
      const other = input.action === 'restore' ? queueKey : removedKey
      if (result.ok) {
        // Une lecture de la liste déjà en route est annulée : elle remettrait la cible décidée.
        await queryClient.cancelQueries({ queryKey: touched })
        queryClient.setQueryData(touched, (data: Parameters<typeof without>[0]) =>
          without(data, input.target),
        )
        // L'autre liste a changé aussi (un contenu retiré y entre, un rétabli peut revenir dans la
        // file) : marquée périmée, elle se relira quand on l'ouvrira, pas sous les yeux.
        void queryClient.invalidateQueries({ queryKey: other, refetchType: 'none' })
      } else {
        void queryClient.invalidateQueries({ queryKey: touched })
      }
      return result
    },
    [queryClient],
  )
  return { decide }
}
