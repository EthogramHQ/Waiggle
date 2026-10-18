// Les hooks du profil : brancher un écran sur le profil du membre connecté, gardé en cache par
// React Query (voir api/query-client.ts). Tous les écrans qui lisent le profil partagent la même
// copie : quand l'un la met à jour, les autres se redessinent.
import type { Me } from '@ruche/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getMe } from './api'

// La « clé » du profil dans le cache, comme l'étiquette d'un tiroir.
export const meQueryKey = ['me'] as const

/**
 * Le profil du membre connecté. `enabled: false` (personne de connecté) : aucune requête.
 * Renvoie { data, isPending, isError… } : les écrans affichent un état selon le cas.
 */
export const useMe = (enabled = true) => useQuery({ queryKey: meQueryKey, queryFn: getMe, enabled })

/** Remplace le profil gardé en cache par celui renvoyé par l'API après une modification. */
export const useSetMe = () => {
  const queryClient = useQueryClient()
  // useCallback garde la même fonction d'un affichage à l'autre (utile si un useEffect en dépend).
  return useCallback((me: Me) => queryClient.setQueryData(meQueryKey, me), [queryClient])
}
