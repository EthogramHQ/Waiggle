// Les mises à jour d'un projet (R7a), qui remplacent les notes du Journal : la frise (lue 20 par 20),
// publier une mise à jour et en supprimer une. Les écrans n'appellent que les trois hooks
// ci-dessous ; les tests les remplacent.
//
// Deux caches bougent ensemble : le projet (`['project', id]` : sa dernière mise à jour, leur nombre,
// sa version) et la frise (`['project-updates', id]`, des pages à la suite). Supprimer change les
// deux au toucher et revient en arrière si l'API refuse ; publier attend la réponse (l'API peut
// refuser : photo perdue, 10 mises à jour par jour), puis range la nouvelle en tête. Dans les deux
// cas, on relit ensuite : seul le serveur connaît le vrai compte et la vraie « dernière version ».
import {
  type NewProjectUpdate,
  type Project,
  ProjectUpdate,
  ProjectUpdatePage,
} from '@ruche/contracts'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, errorKey } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { projectQueryKey } from '../projects/hooks'

/** La clé de cache de la frise d'un projet. */
export const projectUpdatesQueryKey = (projectId: string) => ['project-updates', projectId] as const

type UpdatesCache = InfiniteData<ProjectUpdatePage, string | undefined>

/**
 * Pourquoi la dernière demande a échoué, quand réessayer ne servirait à rien :
 * - limited : la limite du jour est atteinte (10 mises à jour par jour, 429) ;
 * - expired : la session a expiré (401) ;
 * - invalidPhotos : une photo n'est plus en attente (400 `invalid_photos`) ;
 * - invalidFeedback : un retour coché dans « Retours réglés » n'est plus à traiter (400
 *   `invalid_feedback`, R7b : un autre onglet l'a réglé, ou son testeur l'a supprimé).
 * Absent : une autre erreur (réseau, serveur), qu'un nouvel essai peut régler.
 */
export type UpdateFailure = 'limited' | 'expired' | 'invalidPhotos' | 'invalidFeedback'

const reasonOf = (error: unknown): UpdateFailure | undefined => {
  if (!error) return undefined
  switch (errorKey(error)) {
    case 'rateLimited':
      return 'limited'
    case 'unauthorized':
      return 'expired'
    case 'invalidPhotos':
      return 'invalidPhotos'
    case 'invalidFeedback':
      return 'invalidFeedback'
    default:
      return undefined
  }
}

// encodeURIComponent : les identifiants restent de simples morceaux de l'adresse (voir projects/api).
const updatesPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/updates`

// L'adresse d'une page ; le curseur reste un paramètre (URLSearchParams l'encode).
const withCursor = (path: string, cursor?: string) =>
  cursor ? `${path}?${new URLSearchParams({ cursor }).toString()}` : path

/** Une page de la frise (GET /v1/projects/{id}/updates). Lève une ApiError en cas d'échec. */
export const getUpdatesPage = async (
  projectId: string,
  cursor?: string,
): Promise<ProjectUpdatePage> => {
  const result = await request(withCursor(updatesPath(projectId), cursor), {}, ProjectUpdatePage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Publie une mise à jour (POST, 201) ; l'API répond par la mise à jour publiée. */
export const postUpdate = async (
  projectId: string,
  payload: NewProjectUpdate,
): Promise<ProjectUpdate> => {
  const result = await request(
    updatesPath(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    ProjectUpdate,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Supprime une mise à jour (DELETE …/updates/{updateId}) ; l'API répond 204, sans contenu. */
export const deleteUpdate = async (projectId: string, updateId: string): Promise<void> => {
  const result = await requestWithoutBody(
    `${updatesPath(projectId)}/${encodeURIComponent(updateId)}`,
    { method: 'DELETE' },
  )
  if (!result.ok) throw new ApiError(result.error)
}

/** Hook : la frise du projet, 20 mises à jour par page, de la plus récente à la plus ancienne. */
export const useProjectUpdates = (projectId: string) =>
  useInfiniteQuery({
    queryKey: projectUpdatesQueryKey(projectId),
    queryFn: ({ pageParam }) => getUpdatesPage(projectId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

// La version affichée sous le titre : celle de la plus récente mise à jour qui en a une (les
// retirées ne comptent pas : l'API les ignore aussi).
const versionOf = (updates: ProjectUpdate[], fallback: string | null) =>
  updates.find((update) => update.removal === null && update.version !== null)?.version ?? fallback

// Ce que les deux caches deviennent quand une mise à jour est ajoutée ou retirée.
const withPublished = (project: Project, update: ProjectUpdate): Project => ({
  ...project,
  latestUpdate: update,
  updateCount: project.updateCount + 1,
  version: update.version ?? project.version,
})

const withoutUpdate = (project: Project, cache: UpdatesCache | undefined, id: string): Project => {
  const wasShown = project.latestUpdate?.id === id
  // La nouvelle « dernière » vient de la frise déjà lue, si elle y est ; sinon on la relira.
  const first = cache?.pages[0]?.items.filter((update) => update.id !== id)
  return {
    ...project,
    updateCount: Math.max(0, project.updateCount - 1),
    latestUpdate: wasShown ? (first?.[0] ?? null) : project.latestUpdate,
    version: wasShown && first ? versionOf(first, null) : project.version,
  }
}

// Après un geste, on relit le projet, la frise et les fils (la carte du projet y remonte ou non).
const refresh = (queryClient: ReturnType<typeof useQueryClient>, projectId: string) => {
  void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
  void queryClient.invalidateQueries({ queryKey: projectUpdatesQueryKey(projectId) })
  void queryClient.invalidateQueries({ queryKey: feedQueryKey })
}

/**
 * Hook : publier une mise à jour. `publish` renvoie vrai si elle est publiée (la feuille se ferme),
 * faux sinon (la feuille reste ouverte, `error` devient vrai). La nouvelle se range en tête de
 * la frise et dans le projet en cache, sans attendre la relecture.
 */
export const usePublishUpdate = (projectId: string) => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (payload: NewProjectUpdate) => postUpdate(projectId, payload),
    onSuccess: (update) => {
      queryClient.setQueryData<Project>(projectQueryKey(projectId), (project) =>
        project ? withPublished(project, update) : project,
      )
      queryClient.setQueryData<UpdatesCache>(projectUpdatesQueryKey(projectId), (cache) => {
        const [first, ...others] = cache?.pages ?? []
        return cache && first
          ? { ...cache, pages: [{ ...first, items: [update, ...first.items] }, ...others] }
          : cache
      })
    },
    onSettled: () => refresh(queryClient, projectId),
  })
  const { mutateAsync } = mutation
  const publish = useCallback(
    async (payload: NewProjectUpdate) => {
      try {
        await mutateAsync(payload)
        return true
      } catch {
        return false
      }
    },
    [mutateAsync],
  )
  return {
    publish,
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}

// Ce que garde une suppression pour revenir en arrière : les deux caches d'avant le toucher.
type Snapshot = { project: Project | undefined; updates: UpdatesCache | undefined }

/**
 * Hook : supprimer une mise à jour (après confirmation, demandée par l'écran). `remove` renvoie vrai
 * une fois l'API d'accord. La mise à jour quitte la frise et le projet au toucher ; refusée, elle
 * revient.
 */
export const useDeleteUpdate = (projectId: string) => {
  const queryClient = useQueryClient()
  const mutationKey = ['delete-update', projectId]
  const mutation = useMutation({
    mutationKey,
    mutationFn: ({ updateId }: { updateId: string; snapshot: Snapshot }) =>
      deleteUpdate(projectId, updateId),
    scope: { id: mutationKey.join(':') },
    onError: (_error, { snapshot }) => {
      if (snapshot.project) queryClient.setQueryData(projectQueryKey(projectId), snapshot.project)
      if (snapshot.updates)
        queryClient.setQueryData(projectUpdatesQueryKey(projectId), snapshot.updates)
    },
    // Relire après la dernière suppression seulement (isMutating compte encore celle qui finit).
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      refresh(queryClient, projectId)
    },
  })
  const { mutateAsync } = mutation
  const remove = useCallback(
    async (updateId: string) => {
      const projectKey = projectQueryKey(projectId)
      const updatesKey = projectUpdatesQueryKey(projectId)
      void queryClient.cancelQueries({ queryKey: projectKey })
      void queryClient.cancelQueries({ queryKey: updatesKey })
      const snapshot: Snapshot = {
        project: queryClient.getQueryData<Project>(projectKey),
        updates: queryClient.getQueryData<UpdatesCache>(updatesKey),
      }
      // Au toucher, avant tout envoi : un second toucher lit déjà la frise sans cette mise à jour.
      if (snapshot.project)
        queryClient.setQueryData<Project>(
          projectKey,
          withoutUpdate(snapshot.project, snapshot.updates, updateId),
        )
      if (snapshot.updates)
        queryClient.setQueryData<UpdatesCache>(updatesKey, {
          ...snapshot.updates,
          pages: snapshot.updates.pages.map((page) => ({
            ...page,
            items: page.items.filter((update) => update.id !== updateId),
          })),
        })
      try {
        await mutateAsync({ updateId, snapshot })
        return true
      } catch {
        return false
      }
    },
    [queryClient, projectId, mutateAsync],
  )
  return {
    remove,
    pending: mutation.isPending,
    error: mutation.isError,
    reason: reasonOf(mutation.error),
  }
}
