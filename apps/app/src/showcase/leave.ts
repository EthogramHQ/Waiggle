// « Retirer de l'accueil » (tranche R12, plan, décision 18 ; scénario « La vitrine ») : l'auteur d'un
// projet mis en avant le fait quitter la vitrine depuis sa ligne d'Activité. L'API retire le projet
// de la vitrine et garde son refus (`showcase_declined_at`) : la modération ne peut plus l'y remettre.
// Le projet reste public ; il quitte seulement l'accueil.
//
// Un fichier à part de showcase/api.ts : les écritures de la modération (ranger la vitrine) vivent
// là-bas, celle de l'auteur ici, chacune avec ses propres lecteurs.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'
import { notificationsQueryKey } from '../notifications/api'
import { showcaseKeys } from './api'

/** DELETE /v1/projects/<id>/showcase : réponse 204, sans corps. Un refus lève une `ApiError`. */
export const leaveShowcase = async (projectId: string): Promise<void> => {
  // L'identifiant est encodé : il reste un seul morceau du chemin, quoi qu'il contienne.
  const result = await requestWithoutBody(
    `/v1/projects/${encodeURIComponent(projectId)}/showcase`,
    { method: 'DELETE' },
  )
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook : « Retirer de l'accueil » pour un projet. `useMutation` (React Query) garde l'état de
 * l'écriture : en cours (`isPending`), échouée (`isError`), réussie (`isSuccess`).
 *
 * Après la réussite :
 * - la vitrine d'un membre (« À la une », l'accueil) est relue si elle se voit, sinon marquée
 *   périmée : le projet n'y est plus ;
 * - la liste d'Activité est seulement marquée périmée (`refetchType: 'none'`) : elle ne bouge
 *   jamais seule sous les yeux ; c'est l'écran qui montre le résultat à la place du bouton, et la
 *   prochaine ouverture relira `onShowcase` à faux.
 */
export const useLeaveShowcase = (projectId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['showcase', 'leave', projectId],
    mutationFn: () => leaveShowcase(projectId),
    // Une « portée » : deux demandes pour le même projet partent l'une après l'autre, jamais
    // ensemble (une double tape que l'écran n'aurait pas arrêtée).
    scope: { id: `showcase:leave:${projectId}` },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: showcaseKeys.member, refetchType: 'active' })
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey, refetchType: 'none' })
    },
  })
}
