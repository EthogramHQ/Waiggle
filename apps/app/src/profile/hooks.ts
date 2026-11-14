// Les hooks du profil : brancher un écran sur le profil du membre connecté, gardé en cache par
// React Query (voir api/query-client.ts). Tous les écrans qui lisent le profil partagent la même
// copie : quand l'un la met à jour, les autres se redessinent.
import type { Me } from '@ruche/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { ApiResult } from '../api/errors'
import { deleteAvatar, getMe, updateProfile } from './api'

// La « clé » du profil dans le cache, comme l'étiquette d'un tiroir.
export const meQueryKey = ['me'] as const

/**
 * Le profil du membre connecté. `enabled: false` (personne de connecté) : aucune requête.
 * `retryOnMount: false` : ce lecteur, en apparaissant, ne relance pas une lecture qui a échoué
 * (voir TopNav). Renvoie { data, isPending, isError… } : les écrans affichent un état selon le cas.
 */
export const useMe = (enabled = true, { retryOnMount = true } = {}) =>
  useQuery({ queryKey: meQueryKey, queryFn: getMe, enabled, retryOnMount })

/** Remplace le profil gardé en cache par celui renvoyé par l'API après une modification. */
export const useSetMe = () => {
  const queryClient = useQueryClient()
  // useCallback garde la même fonction d'un affichage à l'autre (utile si un useEffect en dépend).
  return useCallback((me: Me) => queryClient.setQueryData(meQueryKey, me), [queryClient])
}

/** Ce qu'un compte suspendu peut retirer de son profil (R9, jur-R5) : sa bio, ses outils, sa photo. */
export type RemovablePart = 'bio' | 'tools' | 'avatar'

/**
 * Hook : retirer une partie de son profil, sans rien mettre à la place. L'API n'accepte d'un compte
 * suspendu que ces trois écritures, et telles quelles (sec-P7) : `{ bio: '' }` seul,
 * `{ favoriteTools: [] }` seul, ou l'effacement de la photo. Une fois la réponse arrivée, le profil
 * gardé en cache perd la partie (les autres écrans le lisent aussi), et sa page (« Moi ») est
 * relue : elle montre la bio et les outils de la même façon.
 */
export const useRemoveProfilePart = () => {
  const queryClient = useQueryClient()
  return useCallback(
    async (part: RemovablePart, memberId: string): Promise<ApiResult<null>> => {
      const result =
        part === 'avatar'
          ? await deleteAvatar()
          : await updateProfile(part === 'bio' ? { bio: '' } : { favoriteTools: [] })
      if (!result.ok) return result
      // La réponse de l'effacement n'a pas de profil : on retire la photo du profil gardé, sans
      // toucher au reste (lu au moment de la réponse, pas au moment du geste).
      queryClient.setQueryData<Me>(meQueryKey, (previous) => {
        if (!previous) return previous
        if (part === 'avatar') return { ...previous, avatarUrl: null }
        return part === 'bio' ? { ...previous, bio: '' } : { ...previous, favoriteTools: [] }
      })
      void queryClient.invalidateQueries({ queryKey: ['member', memberId] })
      return { ok: true, data: null }
    },
    [queryClient],
  )
}
