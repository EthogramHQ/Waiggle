// « Proches à suivre » (R4, F-Fil10) : la liste des membres suggérés, et le geste qui en écarte un.
// Les écrans n'appellent que ces hooks ; leurs tests les remplacent par de faux résultats.
//
// Suivre un membre de la liste passe par useFollow (follows/api.ts), qui relit le fil et la page du
// membre, mais pas cette liste : sa clé ne commence ni par « feed » ni par « member ». La ligne reste
// donc à sa place, avec « Tu suis », au lieu de disparaître sous le doigt.
import { MemberSuggestions } from '@ruche/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/** La clé de cache de la liste. */
export const suggestionsQueryKey = ['suggestions', 'members'] as const

const listPath = '/v1/suggestions/members'
const dismissPath = (memberId: string) =>
  `/v1/suggestions/members/${encodeURIComponent(memberId)}/dismissed`

/** GET /v1/suggestions/members. Lève une ApiError en cas d'échec, comme les autres lectures. */
export const getSuggestions = async (): Promise<MemberSuggestions> => {
  const result = await request(listPath, {}, MemberSuggestions)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : les membres à suivre (cinq au plus), du plus récemment publié au plus ancien. */
export const useSuggestions = () =>
  useQuery({ queryKey: suggestionsQueryKey, queryFn: getSuggestions })

/**
 * Hook : `dismiss(memberId)` écarte un membre de la liste (PUT …/{id}/dismissed, 204).
 *
 * Le membre quitte la liste en cache tout de suite, avant même l'envoi : un second geste, même
 * rapide, voit déjà la liste sans lui. Puis, si l'API accepte, la liste est relue (un autre membre
 * peut prendre la place) ; si elle refuse, le membre revient à sa place. Le résultat est rendu tel
 * quel : l'écran dit l'échec (SuggestionList remet la ligne et affiche un message).
 */
export const useDismissSuggestion = () => {
  const queryClient = useQueryClient()
  const dismiss = useCallback(
    async (memberId: string): Promise<ApiResult<null>> => {
      // Une lecture déjà en route ne doit pas remettre le membre écarté.
      void queryClient.cancelQueries({ queryKey: suggestionsQueryKey })
      const before = queryClient.getQueryData<MemberSuggestions>(suggestionsQueryKey)
      const index = before?.members.findIndex((member) => member.id === memberId) ?? -1
      const removed = index >= 0 ? before?.members[index] : undefined
      if (removed) {
        queryClient.setQueryData<MemberSuggestions>(suggestionsQueryKey, (current) =>
          current
            ? { members: current.members.filter((member) => member.id !== memberId) }
            : current,
        )
      }

      const result = await requestWithoutBody(dismissPath(memberId), { method: 'PUT' })

      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: suggestionsQueryKey })
      } else if (removed) {
        // Refusé : le membre revient, à son ancien rang. On repart de la liste du moment (et non
        // de celle d'avant le geste) : un autre écart fait entre-temps reste fait.
        queryClient.setQueryData<MemberSuggestions>(suggestionsQueryKey, (current) => {
          if (!current || current.members.some((member) => member.id === memberId)) return current
          const members = [...current.members]
          members.splice(Math.min(index, members.length), 0, removed)
          return { members }
        })
      }
      return result
    },
    [queryClient],
  )
  return { dismiss }
}
