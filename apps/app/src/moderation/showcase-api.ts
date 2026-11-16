// Lire et ranger la vitrine de l'accueil depuis la Modération (tranche R12, plan, choix 10) : l'onglet
// « Vitrine de l'accueil » (`moderation/ShowcaseTab`).
// - la lecture : GET /v1/moderation/showcase, la vitrine dans l'ordre (au plus quatre projets), puis
//   les projets publics qui n'y sont pas (les 20 plus récents) ;
// - l'écriture : PUT /v1/moderation/showcase avec la vitrine **entière**, dans l'ordre
//   (`{ projectIds }`). Ajouter, c'est renvoyer la liste avec un projet de plus à la fin ; retirer,
//   la renvoyer sans lui. L'API répond 204, sans corps : l'onglet relit ensuite la vitrine.
//
// Ces hooks vivent ici, avec ceux de la Modération, plutôt que dans `showcase/api.ts` : ils ne
// servent qu'aux administrateurs, et leur clé de cache commence par « moderation » (une session qui
// se ferme les efface avec le reste de la Modération). Comme toute la Modération, l'API refait la
// vérification « administrateur » à chaque demande : pour un autre membre, ces routes répondent 404.
import { ModerationShowcase } from '@ruche/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { request, requestWithoutBody } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/**
 * La clé de cache de l'onglet, sous « moderation » (`moderationQueryKey` de `./api`), écrite en
 * toutes lettres : les tests de la page Modération remplacent `./api` par un module simulé, sans
 * cette clé, et ce module se charge avec la page.
 */
export const moderationShowcaseKey = ['moderation', 'showcase'] as const

/** La vitrine et ses candidats, telles que la modération les voit. */
export const getModerationShowcase = async (): Promise<ModerationShowcase> => {
  const result = await request('/v1/moderation/showcase', {}, ModerationShowcase)
  // Une erreur levée : React Query la range dans `error`, et l'onglet dit que la vitrine n'a pas pu
  // se charger.
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la vitrine de la modération. Jamais relue d'elle-même (retour sur l'onglet du navigateur,
 * retour du réseau) : une ligne ne vient pas remplacer, sous le doigt, celle qu'on allait toucher.
 * L'onglet la relit après ses propres changements.
 */
export const useModerationShowcase = () =>
  useQuery({
    queryKey: moderationShowcaseKey,
    queryFn: getModerationShowcase,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** Ce qu'il faut à une écriture : la vitrine voulue, et celle d'avant (pour revenir en arrière). */
type Change = { projectIds: string[]; previous: ModerationShowcase | undefined }

/**
 * La vitrine telle qu'elle sera après le changement, posée dans le cache au toucher : les projets
 * gardés à leur place, renumérotés ; un projet ajouté pris parmi les candidats, à la dernière place.
 * Il quitte les candidats ; un projet retiré n'y revient qu'à la relecture (l'API seule connaît sa
 * date de publication et le refus de son auteur).
 */
const nextShowcase = (
  current: ModerationShowcase,
  projectIds: readonly string[],
): ModerationShowcase => {
  const items = projectIds.flatMap((id, index) => {
    const kept = current.items.find((item) => item.project.id === id)
    if (kept) return [{ ...kept, position: index + 1 }]
    const added = current.candidates.find((candidate) => candidate.project.id === id)
    return added
      ? [
          {
            project: added.project,
            position: index + 1,
            addedAt: new Date().toISOString(),
            editedSinceAdded: false,
          },
        ]
      : []
  })
  return {
    items,
    candidates: current.candidates.filter(
      (candidate) => !projectIds.includes(candidate.project.id),
    ),
  }
}

/**
 * Hook : `save(projectIds)` remplace la vitrine entière par cette liste, dans cet ordre. L'écran
 * change au toucher, avant tout envoi : un second toucher, même très rapide, part de la vitrine
 * déjà changée (un projet ajouté puis un autre : les deux, dans cet ordre). Les écritures partent
 * l'une après l'autre (`scope`) ; refusée, la vitrine revient à ce qu'elle était avant ce toucher.
 * Une fois la dernière écriture faite, la vitrine est relue (pas avant : elle clignoterait).
 * `save` rend toujours un résultat (`{ ok }` ou `{ ok: false, error }`), sans lever.
 */
export const useSetShowcase = () => {
  const queryClient = useQueryClient()
  const mutationKey = [...moderationShowcaseKey, 'save']
  const { mutateAsync, isPending } = useMutation({
    mutationKey,
    mutationFn: ({ projectIds }: Change): Promise<ApiResult<null>> =>
      requestWithoutBody('/v1/moderation/showcase', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectIds }),
      }),
    scope: { id: mutationKey.join(':') },
    onSettled: (result, _error, { previous }) => {
      // Refusée (409 du refus de l'auteur, panne) : on remet la vitrine d'avant ce toucher, tout de
      // suite, sans attendre la relecture.
      if (!result?.ok && previous) queryClient.setQueryData(moderationShowcaseKey, previous)
      // isMutating compte encore l'écriture qui se termine, d'où « 1 ».
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: moderationShowcaseKey })
    },
  })
  const save = useCallback(
    async (projectIds: string[]): Promise<ApiResult<null>> => {
      const previous = queryClient.getQueryData<ModerationShowcase>(moderationShowcaseKey)
      if (previous) {
        queryClient.setQueryData(moderationShowcaseKey, nextShowcase(previous, projectIds))
      }
      try {
        return await mutateAsync({ projectIds, previous })
      } catch {
        // Le réseau a lâché avant toute réponse : comme une panne du serveur.
        return { ok: false, error: 'unavailable' }
      }
    },
    [queryClient, mutateAsync],
  )
  return { save, pending: isPending }
}
