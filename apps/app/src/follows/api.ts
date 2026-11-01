// Suivre une personne ou un projet, et ne plus le suivre. L'écran change tout de suite (« mise à
// jour optimiste ») : on ne fait pas attendre le membre pour un geste aussi simple, et on revient en
// arrière si l'API refuse. Les écrans n'appellent que useFollow ; les tests le remplacent.
import type { FollowState } from '@ruche/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { projectQueryKey } from '../projects/hooks'

type Target = { kind: 'member' | 'project'; id: string }

// Un changement : suivre ou non, et la page d'avant, pour revenir en arrière si l'API refuse.
type Change = { follow: boolean; previous: FollowState | undefined }

// La page en cache dont on change l'état : celle du membre (members/api.ts) ou celle du projet.
const cacheKeyOf = ({ kind, id }: Target) =>
  kind === 'member' ? (['member', id] as const) : projectQueryKey(id)

const pathOf = ({ kind, id }: Target) =>
  `/v1/${kind === 'member' ? 'members' : 'projects'}/${encodeURIComponent(id)}/follow`

/** POST pour suivre, DELETE pour ne plus suivre. L'API répond 204, sans contenu. */
export const setFollow = async (target: Target, follow: boolean): Promise<void> => {
  const result = await requestWithoutBody(pathOf(target), { method: follow ? 'POST' : 'DELETE' })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook : `toggle` suit ou ne suit plus, selon l'état affiché à l'instant du toucher ; `error` dit si
 * le dernier changement a échoué, et `expired` si c'est parce que la session a expiré (réessayer
 * ne servirait à rien : il faut se reconnecter).
 */
export const useFollow = (target: Target) => {
  const queryClient = useQueryClient()
  const mutationKey = ['follow', target.kind, target.id]
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ follow }: Change) => setFollow(target, follow),
    // Une « portée » : les changements d'un même abonnement partent l'un après l'autre, jamais en
    // même temps. Deux touchers rapides font donc bien « suivre » puis « ne plus suivre », dans
    // cet ordre, côté serveur aussi.
    scope: { id: mutationKey.join(':') },
    // cancelQueries : une lecture de la page déjà en route ne doit pas écraser notre changement.
    onMutate: () => queryClient.cancelQueries({ queryKey: cacheKeyOf(target) }),
    // Refusé : la page revient à ce qu'elle était avant ce toucher.
    onError: (_error, { previous }) => {
      if (previous) queryClient.setQueryData(cacheKeyOf(target), previous)
    },
    // Une fois le dernier changement fait, on relit la page (le vrai nombre d'abonnés) et les fils.
    // Pas avant : relire entre deux touchers rapides ferait clignoter le bouton. isMutating compte
    // encore le changement qui se termine, d'où « 1 ».
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: cacheKeyOf(target) })
      void queryClient.invalidateQueries({ queryKey: feedQueryKey })
    },
  })
  const { mutate } = mutation
  // biome-ignore lint/correctness/useExhaustiveDependencies: la cible ne change qu'avec kind et id.
  const toggle = useCallback(
    (shown?: unknown) => {
      // La page change ici même, au toucher, avant tout envoi : un second toucher, même très rapide,
      // lit déjà le nouvel état (« suivi ») et demande donc l'inverse. On garde l'ancienne page pour
      // pouvoir revenir en arrière.
      const key = cacheKeyOf(target)
      const previous = queryClient.getQueryData<FollowState>(key)
      // `shown` : l'état que l'écran affiche, quand il ne vient pas de la page en cache (la pastille
      // « Suivre Nora » d'Explorer, R3, sans page de Nora lue : sans lui, retoucher « Tu suis Nora »
      // demanderait encore de suivre). Seul un vrai booléen compte : un bouton peut passer son
      // événement de toucher à `onPress={toggle}`.
      const follow = !(typeof shown === 'boolean' ? shown : (previous?.isFollowed ?? false))
      if (previous) {
        queryClient.setQueryData<FollowState>(key, {
          ...previous,
          isFollowed: follow,
          followerCount: Math.max(0, previous.followerCount + (follow ? 1 : -1)),
        })
      }
      mutate({ follow, previous })
    },
    [queryClient, target.kind, target.id, mutate],
  )
  return {
    toggle,
    error: mutation.isError,
    expired: mutation.isError && errorKey(mutation.error) === 'unauthorized',
  }
}
