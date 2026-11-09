// Lire la page d'un membre. Les écrans n'appellent que ce hook ; les tests remplacent la fonction
// get… par de faux appels. (La page d'un outil, l'ancienne « étiquette », se lit depuis R6b dans
// tools/api.ts.)
import { Member } from '@ruche/contracts'
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

/** Hook : la page d'un membre. `enabled: false` (personne de connecté) : aucune requête. */
export const useMember = (id: string, enabled = true) =>
  useQuery({ queryKey: ['member', id], queryFn: () => getMember(id), enabled })
