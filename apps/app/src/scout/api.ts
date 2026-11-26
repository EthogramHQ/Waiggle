// Les requêtes des Éclaireuses vues par l'appli (tranche R20) : la feuille « Ton retour », les
// missions de la semaine, « Mes retours » et l'entrée par un code. Chaque hook branche un écran sur
// une route de l'API (contrat `@ruche/contracts`, scouts.ts) par React Query : les lectures sont
// gardées en cache sous une clé, les écritures (« mutations ») mettent ce cache à jour.
//
// Ce module n'est chargé qu'à la demande, avec les écrans des Éclaireuses : la Goutte (premier
// paquet de l'appli) lit le profil (`Me.scout`), pas ce fichier.
import {
  type JoinScouts,
  Me,
  MyScoutReports,
  ScoutMissions,
  ScoutReport,
  type ScoutReportInput,
  type ScoutSettings,
} from '@ruche/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request, requestWithoutBody } from '../api/client'
import { ApiError } from '../api/errors'
import { earnPollen } from '../gamification/earn'
import { appendImage, type PickedImage } from '../media/pick'
import { meQueryKey } from '../profile/hooks'

const SCOUT_PATH = '/v1/me/scout'

/** Les clés du cache, sous `['scout']` : un envoi relit tout ce qui en dépend d'un coup. */
export const scoutKeys = {
  all: ['scout'] as const,
  missions: ['scout', 'missions'] as const,
  reports: ['scout', 'reports'] as const,
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** Ce que reçoit `useSendScoutReport().mutate` : le retour, et la capture choisie (ou rien). */
export type ScoutReportSend = { report: ScoutReportInput; capture: PickedImage | null }

// --- Lectures ---

/**
 * Hook : les missions de la semaine (GET /v1/me/scout/missions), dans la langue du membre. Refus
 * `scout_only` pour qui n'est pas (ou plus) Éclaireuse active : une `ApiError`.
 */
export const useScoutMissions = () =>
  useQuery({
    queryKey: scoutKeys.missions,
    queryFn: async (): Promise<ScoutMissions> => {
      const result = await request(`${SCOUT_PATH}/missions`, {}, ScoutMissions)
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
  })

/**
 * Hook : mes retours (GET /v1/me/scout/reports), les plus récents d'abord. Lisible aussi après le
 * mois, et par une Éclaireuse retirée (ce sont ses données). La feuille y compte les envois des
 * dernières 24 heures (la limite de 20 par jour).
 */
export const useMyScoutReports = () =>
  useQuery({
    queryKey: scoutKeys.reports,
    queryFn: async (): Promise<MyScoutReports> => {
      const result = await request(`${SCOUT_PATH}/reports`, {}, MyScoutReports)
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
  })

// --- Écritures ---

/**
 * Hook : envoyer un retour (POST /v1/me/scout/reports), en formulaire « multipart » : la partie
 * `report` (le JSON du retour) et, si une capture est jointe, la partie `file`. Rend le retour créé ;
 * un refus est une `ApiError` (quota du jour, mois fini, mission d'une autre semaine…).
 * Réussi : le pollen gagné se montre (R19), les missions, mes retours et le profil (le nombre de
 * missions qui restent, sur la Goutte) sont relus.
 */
export const useSendScoutReport = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ report, capture }: ScoutReportSend): Promise<ScoutReport> => {
      // FormData : l'équivalent d'un formulaire HTML ; fetch calcule seul son en-tête (la
      // « frontière » entre les parties), d'où l'absence de Content-Type.
      const form = new FormData()
      form.append('report', JSON.stringify(report))
      if (capture) await appendImage(form, 'file', capture)
      const result = await request(
        `${SCOUT_PATH}/reports`,
        { method: 'POST', body: form },
        ScoutReport,
      )
      if (!result.ok) throw new ApiError(result.error)
      earnPollen(queryClient, result.pollen, 'global')
      return result.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scoutKeys.all })
      void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true })
    },
  })
}

/**
 * Hook : supprimer un de mes retours (DELETE /v1/me/scout/reports/:id), sa capture avec. `mutate(id)`.
 * Réussi : il quitte aussitôt la liste gardée en cache, puis la liste est relue.
 */
export const useDeleteScoutReport = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const result = await requestWithoutBody(`${SCOUT_PATH}/reports/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!result.ok) throw new ApiError(result.error)
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<MyScoutReports>(scoutKeys.reports, (old) =>
        old ? { ...old, reports: old.reports.filter((report) => report.id !== id) } : old,
      )
      void queryClient.invalidateQueries({ queryKey: scoutKeys.reports })
    },
  })
}

/**
 * Hook : devenir Éclaireuse avec un code (POST /v1/me/scout `{ code }`). Rend le nouveau profil,
 * gardé en cache : la Goutte paraît aussitôt. Refus : code faux, places prises, mois fini, déjà
 * Éclaireuse, retirée (`ApiError`).
 */
export const useJoinScouts = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: JoinScouts): Promise<Me> => {
      const result = await request(SCOUT_PATH, jsonInit('POST', input), Me)
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meQueryKey, me)
      void queryClient.invalidateQueries({ queryKey: scoutKeys.all })
    },
  })
}

/**
 * Hook : les réglages des Éclaireuses (PATCH /v1/me/scout `{ showDrop }`, « Afficher la Goutte »).
 * Rend le nouveau profil, gardé en cache : la Goutte suit aussitôt.
 */
export const useScoutSettings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ScoutSettings): Promise<Me> => {
      const result = await request(SCOUT_PATH, jsonInit('PATCH', input), Me)
      if (!result.ok) throw new ApiError(result.error)
      return result.data
    },
    // Deux bascules rapides partent l'une après l'autre, dans l'ordre (la dernière fait foi).
    scope: { id: 'scout-settings' },
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
  })
}
