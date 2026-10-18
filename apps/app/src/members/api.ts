// Lire la page d'un membre et celle d'une étiquette. Les écrans n'appellent que ces hooks ; les tests
// remplacent les fonctions get… par de faux appels.
import { Member, TagPage } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError } from '../api/errors'

// encodeURIComponent : l'identifiant vient de l'adresse de la page ; on l'insère sans qu'il puisse
// changer le chemin de la requête (un « ../ » glissé dedans resterait un simple texte).

/** La page d'un membre (GET /v1/members/:id). Lève une ApiError en cas d'échec (404 : introuvable). */
export const getMember = async (id: string): Promise<Member> => {
  const result = await request(`/v1/members/${encodeURIComponent(id)}`, {}, Member)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** La page d'une étiquette (GET /v1/tags/:slug) : toujours une réponse, éventuellement vide. */
export const getTag = async (slug: string): Promise<TagPage> => {
  const result = await request(`/v1/tags/${encodeURIComponent(slug)}`, {}, TagPage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Hook : la page d'un membre. `enabled: false` (personne de connecté) : aucune requête. */
export const useMember = (id: string, enabled = true) =>
  useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled })

/** Hook : la page d'une étiquette. */
export const useTag = (slug: string, enabled = true) =>
  useQuery({ queryKey: ['tag', slug], queryFn: () => getTag(slug), enabled })
