// Réagir à un projet (tranche 5) : poser ou retirer « Bravo », « Utile »… L'écran change tout de
// suite (« mise à jour optimiste »), comme pour « Suivre » (follows/api.ts) : un geste aussi simple
// n'attend pas le serveur, et la page revient en arrière si l'API refuse. Les écrans n'appellent
// que useReaction ; les tests le remplacent.
import type { Project, ReactionKind, ReactionState } from '@ruche/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { projectQueryKey } from '../projects/hooks'

// Un changement : ce type de réaction, posé (true) ou retiré (false).
type Change = { kind: ReactionKind; react: boolean }

const pathOf = (projectId: string, kind: ReactionKind) =>
  `/v1/projects/${encodeURIComponent(projectId)}/reactions/${kind}`

/** PUT pour réagir, DELETE pour retirer sa réaction. L'API répond 204, sans contenu. */
export const setReaction = async (projectId: string, { kind, react }: Change): Promise<void> => {
  const result = await requestWithoutBody(pathOf(projectId, kind), {
    method: react ? 'PUT' : 'DELETE',
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Les réactions après ce changement : le nombre du type monte ou baisse de un, et le type entre
 * dans « les miennes » ou en sort. Sans effet si c'est déjà fait : appliquer deux fois le même
 * changement ne compte pas deux fois.
 */
const applied = (state: ReactionState, { kind, react }: Change): ReactionState => {
  const mine = state.mine.includes(kind)
  if (mine === react) return state
  return {
    counts: { ...state.counts, [kind]: Math.max(0, state.counts[kind] + (react ? 1 : -1)) },
    mine: react ? [...state.mine, kind] : state.mine.filter((k) => k !== kind),
  }
}

/**
 * Hook : `toggle(kind)` pose ou retire cette réaction, selon l'état affiché à l'instant du toucher ;
 * `error` dit si le dernier changement a échoué, et `expired` si c'est parce que la session a
 * expiré (réessayer ne servirait à rien : il faut se reconnecter).
 */
export const useReaction = (projectId: string) => {
  const queryClient = useQueryClient()
  const key = projectQueryKey(projectId)
  const mutationKey = ['reaction', projectId]
  const mutation = useMutation({
    mutationKey,
    mutationFn: (change: Change) => setReaction(projectId, change),
    // Une « portée » par projet : ses réactions partent l'une après l'autre, jamais en même temps.
    // Deux touchers rapides sur « Bravo » font donc bien « réagir » puis « retirer », dans cet
    // ordre, côté serveur aussi. (Une portée par type suffirait pour l'ordre, mais React Query fixe
    // la portée une fois pour toutes par hook : une seule file par projet, c'est plus simple et
    // aussi juste.)
    scope: { id: `reaction:${projectId}` },
    // cancelQueries : une lecture de la page déjà en route ne doit pas écraser notre changement.
    onMutate: () => queryClient.cancelQueries({ queryKey: key }),
    // Refusé : on défait ce changement-là seulement (pas une photo de la page d'avant, qui
    // effacerait aussi un autre type de réaction touché entre-temps).
    onError: (_error, change) => {
      queryClient.setQueryData<Project>(key, (project) =>
        project
          ? {
              ...project,
              reactions: applied(project.reactions, { ...change, react: !change.react }),
            }
          : project,
      )
    },
    // Une fois le dernier changement fait, on relit la page (les vrais nombres). Pas avant :
    // relire entre deux touchers rapides ferait clignoter les compteurs. isMutating compte encore
    // le changement qui se termine, d'où « 1 ».
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const { mutate } = mutation
  // biome-ignore lint/correctness/useExhaustiveDependencies: la clé ne change qu'avec projectId.
  const toggle = useCallback(
    (kind: ReactionKind) => {
      // La page change ici même, au toucher, avant tout envoi : un second toucher, même très
      // rapide, lit déjà le nouvel état (« réagi ») et demande donc l'inverse.
      const project = queryClient.getQueryData<Project>(key)
      if (!project) return
      const change: Change = { kind, react: !project.reactions.mine.includes(kind) }
      queryClient.setQueryData<Project>(key, {
        ...project,
        reactions: applied(project.reactions, change),
      })
      mutate(change)
    },
    [queryClient, projectId, mutate],
  )
  return {
    toggle,
    error: mutation.isError,
    expired: mutation.isError && errorKey(mutation.error) === 'unauthorized',
  }
}
