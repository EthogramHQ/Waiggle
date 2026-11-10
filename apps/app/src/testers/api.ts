// Rejoindre les testeurs d'un projet, et les quitter (R7a). Comme « Suivre » (follows/api.ts), la page
// change tout de suite : `isTester` bascule dans le projet en cache au toucher, avant toute réponse,
// et revient en arrière si l'API refuse. Les écrans n'appellent que ces deux hooks ; les tests les
// remplacent.
import type { Project } from '@ruche/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { projectQueryKey } from '../projects/hooks'

/**
 * Pourquoi la dernière demande a échoué, quand réessayer ne servirait à rien :
 * - full : le projet compte déjà 200 testeurs (409 `testers_full`) ;
 * - notTestable : le projet ne cherche plus de testeurs (409 `not_testable`) ;
 * - expired : la session a expiré (401), il faut se reconnecter ;
 * - limited : trop de demandes (429).
 * Absent : une autre erreur (réseau, serveur), qu'un nouvel essai peut régler.
 */
export type TesterFailure = 'full' | 'notTestable' | 'expired' | 'limited'

const reasonOf = (error: unknown): TesterFailure | undefined => {
  if (!error) return undefined
  switch (errorKey(error)) {
    case 'testersFull':
      return 'full'
    case 'notTestable':
      return 'notTestable'
    case 'unauthorized':
      return 'expired'
    case 'rateLimited':
      return 'limited'
    default:
      return undefined
  }
}

// Ce qui part avec la demande : le sens (rejoindre ou quitter) et le projet d'avant, pour le remettre
// tel quel si l'API refuse.
type Change = { join: boolean; previous: Project | undefined }

const testersPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/testers`

/** POST pour rejoindre, DELETE pour quitter. L'API répond 204, sans contenu. */
export const setTester = async (projectId: string, join: boolean): Promise<void> => {
  const result = await requestWithoutBody(testersPath(projectId), {
    method: join ? 'POST' : 'DELETE',
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Le geste commun aux deux hooks : change `isTester` dans le projet en cache au toucher (pas dans un
 * `onMutate` asynchrone : un second toucher lirait l'ancien état), envoie la demande, puis relit le
 * projet une fois la dernière terminée. `scope` fait partir les demandes d'un même projet l'une
 * après l'autre.
 */
const useTesterChange = (projectId: string, join: boolean) => {
  const queryClient = useQueryClient()
  const mutationKey = ['tester', projectId]
  const mutation = useMutation({
    mutationKey,
    mutationFn: (change: Change) => setTester(projectId, change.join),
    scope: { id: mutationKey.join(':') },
    // Refusé : le projet revient à ce qu'il était avant ce toucher.
    onError: (_error, { previous }) => {
      if (previous) queryClient.setQueryData(projectQueryKey(projectId), previous)
    },
    // isMutating compte encore la demande qui se termine, d'où « 1 » : relire entre deux touchers
    // rapides ferait clignoter le bouton.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
    },
  })
  const { mutateAsync } = mutation
  const run = useCallback(async () => {
    const key = projectQueryKey(projectId)
    // Une lecture déjà en route ne doit pas écraser notre changement.
    void queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<Project>(key)
    if (previous) queryClient.setQueryData<Project>(key, { ...previous, isTester: join })
    try {
      await mutateAsync({ join, previous })
      return true
    } catch {
      return false
    }
  }, [queryClient, projectId, join, mutateAsync])
  return {
    run,
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

/** Hook : `join` inscrit le membre aux testeurs du projet ; vrai si l'API a accepté. */
export const useBecomeTester = (projectId: string) => {
  const { run, ...state } = useTesterChange(projectId, true)
  return { join: run, ...state }
}

/** Hook : `quit` retire le membre des testeurs du projet ; vrai si l'API a accepté. */
export const useQuitTester = (projectId: string) => {
  const { run, ...state } = useTesterChange(projectId, false)
  return { quit: run, ...state }
}
