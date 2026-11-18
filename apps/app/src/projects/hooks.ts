// Les hooks des projets : brancher un écran sur un projet gardé en cache par React Query
// (même principe que profile/hooks.ts, un tiroir par projet : ['project', id]).
// R14 : `useProjectPreview`, ce qu'une liste déjà lue sait d'un projet, pour la page qui s'ouvre.
import type { Project, ProjectSummary } from '@ruche/contracts'
import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { getProject } from './api'

export const projectQueryKey = (id: string) => ['project', id] as const

/** Un projet. `enabled: false` (personne de connecté) : aucune requête. */
export const useProject = (id: string, enabled = true) =>
  useQuery({ queryKey: projectQueryKey(id), queryFn: () => getProject(id), enabled })

/**
 * Les listes en cache qui connaissent des projets en version courte (`ProjectSummary`), par le début
 * de leur clé : la page d'un membre (`['member', id]`, members/api.ts) et les fils (`['feed', …]` :
 * « Abonnements », « Découvrir », leurs têtes, le Fil d'une ruche ; feed/api.ts, hives/api.ts).
 * Écrites ici en toutes lettres plutôt qu'importées : les tests du Fil remplacent feed/api par un
 * faux module, et ce fichier ne doit pas en dépendre pour lire une page de projet.
 */
const LIST_KEYS = [['member'], ['feed']] as const

/** Vrai pour un objet (pas `null`, pas un tableau) : on peut y lire des champs. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Les éléments d'un tableau, ou rien si la valeur n'en est pas un. */
const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

/**
 * Les projets courts rangés dans une donnée du cache, quelle que soit sa forme :
 * - la page d'un membre (`Member`) : `projects` ;
 * - un fil lu page par page (`useInfiniteQuery`) : `pages`, chacune avec ses `items` ;
 * - une seule page de fil (la tête relue par `useFeedNews`) : `items`.
 * Chaque élément d'un fil porte son projet dans `project` (un nouveau projet ou une mise à jour).
 * Le cache ne garde que ce que l'API a répondu, déjà vérifié par son schéma : on ne fait que choisir
 * le bon chemin, sans rien recopier.
 */
const summariesIn = (data: unknown): readonly ProjectSummary[] => {
  if (!isRecord(data)) return []
  if (Array.isArray(data.projects)) return data.projects as ProjectSummary[]
  const pages = Array.isArray(data.pages) ? data.pages : [data]
  return pages.flatMap((page) =>
    isRecord(page)
      ? arrayOf(page.items).flatMap((item) =>
          isRecord(item) && isRecord(item.project) ? [item.project as ProjectSummary] : [],
        )
      : [],
  )
}

/**
 * Le projet `id` tel que la liste la plus fraîche le connaît, ou `null` si aucune ne le connaît.
 * La plus fraîche : celle dont la réponse est la plus récente (`dataUpdatedAt`), si deux listes le
 * connaissent (la page de Léa et le Fil, lus à des moments différents).
 */
export const findProjectInLists = (client: QueryClient, id: string): ProjectSummary | null => {
  let found: { summary: ProjectSummary; at: number } | null = null
  const queries: Query[] = LIST_KEYS.flatMap((queryKey) =>
    client.getQueryCache().findAll({ queryKey: [...queryKey] }),
  )
  for (const query of queries) {
    const summary = summariesIn(query.state.data).find((item) => item.id === id)
    if (summary && (!found || query.state.dataUpdatedAt > found.at)) {
      found = { summary, at: query.state.dataUpdatedAt }
    }
  }
  return found?.summary ?? null
}

/**
 * Hook (R14, plan, choix 4) : l'aperçu d'un projet, ce qu'une liste déjà lue en sait (titre,
 * accroche, statut, photo, auteur), pour que sa page le montre avant la réponse de l'API ; `null`
 * si aucune liste ne le connaît (un lien direct, une notification).
 *
 * C'est une vue partielle, rendue telle quelle, jamais rangée dans le cache sous `['project', id]`
 * (ni `initialData`, ni `placeholderData`) : un `ProjectSummary` n'a ni la galerie, ni la
 * description, ni les réactions, ni ce que le membre qui lit en a fait (`isMine`, `isFollowed`) ;
 * déguisé en `Project`, il ferait dire à la page des choses fausses.
 *
 * Lu une fois par projet (`useMemo`) : l'aperçu ne change pas sous les yeux si un fil se relit
 * pendant que la page attend ; le projet complet le remplace de toute façon dès qu'il arrive.
 */
export const useProjectPreview = (id: string): ProjectSummary | null => {
  const client = useQueryClient()
  return useMemo(() => findProjectInLists(client, id), [client, id])
}

/**
 * Les auteurs que connaît une donnée du cache : celui de chaque projet court d'une liste (voir
 * `summariesIn`), et celui d'une page de projet complète (`['project', id]`, un `Project` porte son
 * `author`) : on ouvre souvent la page d'un membre depuis celle d'un de ses projets.
 */
const authorsIn = (data: unknown): readonly ProjectSummary['author'][] => [
  ...summariesIn(data).map((summary) => summary.author),
  ...(isRecord(data) && isRecord(data.author) ? [data.author as ProjectSummary['author']] : []),
]

/** Les listes où chercher un auteur : celles des projets, plus les pages de projet lues. */
const AUTHOR_KEYS = [...LIST_KEYS, ['project']] as const

/**
 * Le membre `id` tel que la donnée la plus fraîche le connaît (son nom, sa photo), ou `null` si
 * aucune ne le connaît. Même règle que `findProjectInLists` : la réponse la plus récente gagne.
 */
export const findAuthorInLists = (
  client: QueryClient,
  id: string,
): ProjectSummary['author'] | null => {
  let found: { author: ProjectSummary['author']; at: number } | null = null
  const queries: Query[] = AUTHOR_KEYS.flatMap((queryKey) =>
    client.getQueryCache().findAll({ queryKey: [...queryKey] }),
  )
  for (const query of queries) {
    const author = authorsIn(query.state.data).find((item) => item.id === id)
    if (author && (!found || query.state.dataUpdatedAt > found.at)) {
      found = { author, at: query.state.dataUpdatedAt }
    }
  }
  return found?.author ?? null
}

/**
 * Hook (R16, plan, choix 10) : l'aperçu d'un membre, ce qu'une liste déjà lue sait de lui (son nom
 * et sa photo, l'auteur d'une carte), pour que sa page les montre avant la réponse de l'API ; `null`
 * si aucune ne le connaît (un lien direct, une notification). Aucune requête : on ne lit que le
 * cache, vidé à la connexion et à la déconnexion (rien d'un autre compte n'y reste).
 *
 * Comme l'aperçu d'un projet : rendu tel quel, jamais rangé sous `['member', id]` (un auteur n'a ni
 * pseudo, ni bio, ni projets, ni ce que le membre qui lit en a fait), et lu une fois par membre
 * (`useMemo`) : il ne change pas sous les yeux si un fil se relit pendant que la page attend.
 *
 * Il vit ici, à côté de `useProjectPreview` dont il partage la lecture des listes ; members/api.ts
 * le réexporte (la page d'un membre l'y trouve aussi).
 */
export const useMemberPreview = (id: string): ProjectSummary['author'] | null => {
  const client = useQueryClient()
  return useMemo(() => findAuthorInLists(client, id), [client, id])
}

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
