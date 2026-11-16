// La vitrine de l'accueil (tranche R12, plan, choix 10) : au plus quatre projets publics choisis par
// la modération, dans son ordre. Deux lectures, une par public :
// - un visiteur sans compte la lit à GET /v1/public/showcase, **sans session** (comme les autres
//   lectures d'un visiteur, public/api.ts) : le navigateur n'y joint aucun cookie ;
// - un membre connecté la lit à GET /v1/showcase, avec sa session : l'API y applique les mêmes
//   règles de blocage qu'Explorer (un projet d'un auteur qu'il a bloqué, ou qui l'a bloqué, n'y est
//   pas). C'est la lecture de l'accueil d'un membre et de « À la une », en tête d'Explorer.
//
// Les deux réponses ont la même forme (`ShowcasePage`, packages/contracts) ; leurs clés de cache
// restent séparées : celle du visiteur commence par « public », comme toutes les lectures d'un
// visiteur, pour ne jamais se mêler à ce qu'un membre a lu.
import { ShowcasePage } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { request, requestWithoutSession } from '../api/client'
import { ApiError } from '../api/errors'

/** Les clés du cache de la vitrine : celle d'un visiteur sous « public » (voir l'en-tête). */
export const showcaseKeys = {
  visitor: ['public', 'showcase'] as const,
  member: ['showcase'] as const,
}

/** La vitrine lue par un visiteur (GET /v1/public/showcase), sans session. */
export const getPublicShowcase = async (): Promise<ShowcasePage> => {
  const result = await requestWithoutSession('/v1/public/showcase', {}, ShowcasePage)
  // Une erreur levée : React Query la range dans `error` (l'écran garde alors l'accueil sans vitrine).
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** La vitrine lue par un membre connecté (GET /v1/showcase), avec les règles de blocage. */
export const getMemberShowcase = async (): Promise<ShowcasePage> => {
  const result = await request('/v1/showcase', {}, ShowcasePage)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la vitrine d'un visiteur. `enabled: false` : aucune requête (l'écran d'un membre, qui lit
 * la sienne). `data.items` : de zéro à quatre `ShowcaseItem`, dans l'ordre de la modération.
 */
export const usePublicShowcase = (enabled = true) =>
  useQuery({ queryKey: showcaseKeys.visitor, queryFn: getPublicShowcase, enabled })

/**
 * Hook : la vitrine d'un membre connecté, pour l'accueil et « À la une ». `enabled: false` : aucune
 * requête (un visiteur, qui lit la route publique). Même forme que celle d'un visiteur.
 */
export const useMemberShowcase = (enabled = true) =>
  useQuery({ queryKey: showcaseKeys.member, queryFn: getMemberShowcase, enabled })
