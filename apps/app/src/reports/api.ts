// Signaler un contenu (tranche 6d) : lire ce qu'on signale, puis envoyer le signalement. La page
// « Signaler » n'appelle que ces fonctions ; les tests les remplacent.
//
// La cible vient de l'adresse de la page (`?kind=comment&id=…`), mais son texte vient de l'API
// (GET /v1/reports/target), lu avec la même règle de visibilité que l'envoi : un lien fabriqué ne
// fait jamais signaler autre chose que ce que le membre voit, et un contenu invisible répond 404.
import {
  CreatedReport,
  type CreateReport,
  type ReportTarget,
  ReportTargetPreview,
} from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { request } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/**
 * Ce que montre la page de la cible (GET /v1/reports/target?kind=…&id=…). Lève une ApiError en cas
 * d'échec (404 : introuvable ou invisible ; 422 : son propre contenu).
 */
export const getReportTarget = async (target: ReportTarget): Promise<ReportTargetPreview> => {
  // URLSearchParams encode la sorte et l'identifiant : ils restent de simples paramètres, sans
  // pouvoir changer le chemin de la requête.
  const query = new URLSearchParams({ kind: target.kind, id: target.id }).toString()
  const result = await request(`/v1/reports/target?${query}`, {}, ReportTargetPreview)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la cible lue par l'API. `null` (une adresse qui ne décrit aucune cible valable) : aucune
 * requête, la page dit « introuvable » d'elle-même.
 */
export const useReportTarget = (target: ReportTarget | null) =>
  useQuery({
    queryKey: ['report-target', target?.kind, target?.id],
    // enabled garantit que target n'est pas null quand la lecture part ; le test le redit pour
    // TypeScript.
    queryFn: () => {
      if (!target) throw new ApiError('notFound')
      return getReportTarget(target)
    },
    enabled: target !== null,
  })

/**
 * Envoie un signalement (POST /v1/reports). Rend la réponse ou la clé du message d'erreur :
 * déjà signalé (409), quota du jour (429), contenu disparu (404), son propre contenu (422)…
 * Pas de React Query ici : la page garde elle-même l'état de l'envoi (un seul à la fois).
 */
export const sendReport = (report: CreateReport): Promise<ApiResult<CreatedReport>> =>
  request(
    '/v1/reports',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    },
    CreatedReport,
  )
