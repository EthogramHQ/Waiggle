// Lire et écrire la page de tri des Éclaireuses (tranche R20, « /moderation/scouts »), réservée à
// l'administrateur : le haut de la page (le mois, les places, les missions de la semaine, les
// Éclaireuses), la liste des retours filtrée, et les gestes (lancer le mois, publier les missions,
// changer le statut d'un retour ou sa note, retirer une Éclaireuse).
//
// Comme le reste de la Modération, l'API refait la vérification « administrateur actif » à chaque
// demande : pour tout autre membre, ces routes répondent 404, comme une adresse qui n'existe pas.
// Les réponses des écritures ne sont pas lues (le contrat les laisse libres) : après chacune, la
// page relit ce qui a changé (`invalidateQueries`).
import {
  type ScoutMissionsInput,
  ScoutReportPage,
  type ScoutReportPatch,
  type ScoutReportsQuery,
  ScoutTriage,
} from '@ruche/contracts'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, requestWithoutBody } from '../../api/client'
import { ApiError, type ApiResult } from '../../api/errors'
import { moderationQueryKey } from '../api'

/**
 * Les clés de cache de la page de tri, sous « moderation » : une session qui se ferme les efface
 * avec le reste de la Modération.
 */
export const scoutTriageKey = [...moderationQueryKey, 'scouts'] as const
const topKey = [...scoutTriageKey, 'top'] as const
const reportsKey = [...scoutTriageKey, 'reports'] as const

/** Les filtres de la liste : statut, sorte, gravité ; absents, tous les retours. */
export type ScoutReportFilters = Omit<ScoutReportsQuery, 'cursor'>

/** Une lecture : la donnée si tout va bien, sinon une ApiError (que React Query garde dans `error`). */
const read = async <T>(path: string, schema: Parameters<typeof request<T>>[2]): Promise<T> => {
  const result = await request(path, {}, schema)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/** Une écriture sans réponse lue : rien si tout va bien, sinon une ApiError (`mutation.error`). */
const write = async (sent: Promise<ApiResult<null>>): Promise<void> => {
  const result = await sent
  if (!result.ok) throw new ApiError(result.error)
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// Une erreur qui ne s'arrangera pas en réessayant (page inconnue, session expirée) : React Query
// ne relance pas la lecture. Les autres (réseau, serveur) ont droit à deux essais de plus.
const retry = (failures: number, error: unknown) =>
  !(error instanceof ApiError && (error.key === 'notFound' || error.key === 'unauthorized')) &&
  failures < 2

/** L'adresse de la liste : les filtres et le curseur passent par URLSearchParams, qui les encode. */
const reportsPath = (filters: ScoutReportFilters, cursor: string | undefined) => {
  const query = new URLSearchParams(
    Object.entries({ ...filters, cursor }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  ).toString()
  return query ? `/v1/moderation/scouts/reports?${query}` : '/v1/moderation/scouts/reports'
}

/** Hook : le haut de la page de tri (GET /v1/moderation/scouts). */
export const useScoutTriage = () =>
  useQuery({
    queryKey: topKey,
    queryFn: () => read('/v1/moderation/scouts', ScoutTriage),
    retry,
    refetchOnWindowFocus: false,
  })

/**
 * Hook : les retours, les plus récents d'abord, 30 par page, filtrés (GET
 * /v1/moderation/scouts/reports). `useInfiniteQuery` garde les pages lues, dans l'ordre ; chaque
 * jeu de filtres a son cache. Jamais relue d'elle-même (ni au retour sur l'onglet, ni au retour du
 * réseau) : un retour ne vient pas remplacer, sous le doigt, celui qu'on allait toucher.
 */
export const useScoutReports = (filters: ScoutReportFilters = {}) =>
  useInfiniteQuery({
    queryKey: [...reportsKey, filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => read(reportsPath(filters, pageParam), ScoutReportPage),
    getNextPageParam: (last: ScoutReportPage) => last.nextCursor ?? undefined,
    retry,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

/** Après une écriture : la page relit son haut et la liste (statuts, nombres de retours). */
const useRefresh = () => {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: scoutTriageKey })
}

/**
 * Hook : « Lancer le mois » (POST /v1/moderation/scouts/program). Une seule fois : un second
 * lancement répond 409 `scout_program_started`.
 */
export const useLaunchScoutProgram = () => {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: () =>
      write(requestWithoutBody('/v1/moderation/scouts/program', { method: 'POST' })),
    onSuccess: refresh,
  })
}

/**
 * Hook : « Publier les missions » (PUT /v1/moderation/scouts/missions) : les missions de la semaine,
 * dans l'ordre ; une mission absente est effacée, une mission sans `id` est neuve.
 */
export const useSaveScoutMissions = () => {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (input: ScoutMissionsInput) =>
      write(requestWithoutBody('/v1/moderation/scouts/missions', json('PUT', input))),
    onSuccess: refresh,
  })
}

/**
 * Hook : le statut d'un retour, sa note privée ou sa note pour l'Éclaireuse (PATCH
 * /v1/moderation/scouts/reports/{id}). Un retour corrigé ne change plus de statut (409
 * `scout_report_fixed`).
 */
export const usePatchScoutReport = () => {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ScoutReportPatch }) =>
      write(
        requestWithoutBody(
          `/v1/moderation/scouts/reports/${encodeURIComponent(id)}`,
          json('PATCH', patch),
        ),
      ),
    onSuccess: refresh,
  })
}

/**
 * Hook : « Retirer » une Éclaireuse (DELETE /v1/moderation/scouts/{memberId}), avec son motif,
 * obligatoire (relecture juridique du plan, J1) : il part dans son Activité et son export.
 */
export const useRemoveScout = () => {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      write(
        requestWithoutBody(
          `/v1/moderation/scouts/${encodeURIComponent(memberId)}`,
          json('DELETE', { reason }),
        ),
      ),
    onSuccess: refresh,
  })
}
