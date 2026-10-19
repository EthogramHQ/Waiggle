// Les notes d'un projet (tranche 4b) : l'auteur en publie une (« v2 : mode hors ligne ») ou en
// supprime une. Les écrans n'appellent que les deux hooks ci-dessous ; les tests les remplacent.
// Ici, pas de mise à jour optimiste comme pour « Suivre » : une note publiée doit vraiment exister
// avant d'apparaître dans le journal (l'API peut la refuser : texte invalide, 30 notes par jour).
import { PROJECT_NOTES_SHOWN, type Project, ProjectNote } from '@ruche/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'
import { feedQueryKey } from '../feed/api'
import { projectQueryKey } from '../projects/hooks'

// encodeURIComponent : les identifiants restent de simples morceaux de l'adresse (voir projects/api).
const notesPath = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/notes`

/** Publie une note (POST /v1/projects/{id}/notes) ; l'API répond par la note publiée. */
export const postNote = async (projectId: string, body: string): Promise<ProjectNote> => {
  const result = await request(
    notesPath(projectId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
    ProjectNote,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Supprime une note (DELETE /v1/projects/{id}/notes/{noteId}) ; l'API répond 204, sans contenu. */
export const deleteNote = async (projectId: string, noteId: string): Promise<void> => {
  const result = await requestWithoutBody(`${notesPath(projectId)}/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
  })
  if (!result.ok) throw new ApiError(result.error)
}

/**
 * Hook : publier une note sur ce projet. `publish` renvoie vrai si la note est publiée (l'écran
 * vide alors le champ), faux sinon (le texte reste dans le champ, et `error` devient vrai).
 * La note se range en tête du journal du projet en cache, sans relire la page ; les fils, eux, sont
 * marqués « à relire » : les abonnés (et le membre lui-même, ailleurs) la verront à leur prochain
 * passage.
 */
export const usePublishNote = (projectId: string) => {
  const queryClient = useQueryClient()
  // useMutation : une écriture vers l'API, dont React Query suit l'état (en cours, échouée).
  const mutation = useMutation({
    mutationFn: (body: string) => postNote(projectId, body),
    onSuccess: (note) => {
      // setQueryData avec une fonction : on part du projet en cache, sans rien perdre d'autre.
      // slice : le journal montre les 20 plus récentes, comme l'API.
      queryClient.setQueryData<Project>(projectQueryKey(projectId), (project) =>
        project
          ? { ...project, notes: [note, ...project.notes].slice(0, PROJECT_NOTES_SHOWN) }
          : project,
      )
      void queryClient.invalidateQueries({ queryKey: feedQueryKey })
    },
  })
  const { mutateAsync } = mutation
  // mutateAsync lève une erreur si l'API refuse : on la traduit en vrai / faux pour l'écran.
  const publish = useCallback(
    async (body: string) => {
      try {
        await mutateAsync(body)
        return true
      } catch {
        return false
      }
    },
    [mutateAsync],
  )
  return { publish, pending: mutation.isPending, error: mutation.isError }
}

/**
 * Hook : supprimer une note de ce projet (après confirmation, demandée par l'écran). `remove`
 * renvoie vrai une fois la note supprimée : elle disparaît alors du journal en cache.
 */
export const useDeleteNote = (projectId: string) => {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (noteId: string) => deleteNote(projectId, noteId),
    onSuccess: (_nothing, noteId) => {
      queryClient.setQueryData<Project>(projectQueryKey(projectId), (project) =>
        project ? { ...project, notes: project.notes.filter((n) => n.id !== noteId) } : project,
      )
      // La note disparaît aussi des fils de ses abonnés : on relira les nôtres.
      void queryClient.invalidateQueries({ queryKey: feedQueryKey })
    },
  })
  const { mutateAsync } = mutation
  const remove = useCallback(
    async (noteId: string) => {
      try {
        await mutateAsync(noteId)
        return true
      } catch {
        return false
      }
    },
    [mutateAsync],
  )
  return { remove, error: mutation.isError }
}
