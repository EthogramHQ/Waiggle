// Les hooks des projets : brancher un écran sur un projet gardé en cache par React Query
// (même principe que profile/hooks.ts, un tiroir par projet : ['project', id]).
import type { Project } from '@ruche/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { getProject } from './api'

export const projectQueryKey = (id: string) => ['project', id] as const

/** Un projet. `enabled: false` (personne de connecté) : aucune requête. */
export const useProject = (id: string, enabled = true) =>
  useQuery({ queryKey: projectQueryKey(id), queryFn: () => getProject(id), enabled })

/** Range dans le cache le projet renvoyé par l'API après une modification. */
export const useSetProject = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (project: Project) => queryClient.setQueryData(projectQueryKey(project.id), project),
    [queryClient],
  )
}

/** Oublie un projet (après sa suppression). */
export const useForgetProject = () => {
  const queryClient = useQueryClient()
  return useCallback(
    (id: string) => queryClient.removeQueries({ queryKey: projectQueryKey(id) }),
    [queryClient],
  )
}
