// Signaler sans compte (tranche R12, scénario « Le signalement par un visiteur » ; plan R12,
// décisions 10 et 12) : lire ce qu'on signale, puis envoyer le signalement, aux routes d'un
// visiteur (/v1/public/reports…), jamais à celles des membres (/v1/reports…).
//
// Comme les autres lectures d'un visiteur (public/api.ts), tout part **sans session**
// (`requestWithoutSession`) : sur le web, le navigateur ne joint aucun cookie ; la route publique ne
// lit pas la session, et sa réponse ne dépend jamais de qui regarde. La cible ne dit jamais le
// pseudo de l'auteur (Q8), ni « déjà signalé » (un visiteur n'a pas de compte).
//
// Un fichier à part de `reports/api.ts` : les tests de la feuille d'un membre remplacent ce
// module-là (`jest.mock('../reports/api')`) ; ceux d'un visiteur parlent à un faux serveur.
import { PublicReportTarget, type VisitorReport, type VisitorReportTarget } from '@ruche/contracts'
import { useQuery } from '@tanstack/react-query'
import { requestWithoutSession } from '../api/client'
import { ApiError, type ApiResult } from '../api/errors'

/**
 * Ce que montre la feuille d'un visiteur (GET /v1/public/reports/target?kind=…&id=…). Lève une
 * ApiError en cas d'échec (404 : une cible qui n'est pas visible d'un visiteur, ou inconnue).
 */
export const getPublicReportTarget = async (
  target: VisitorReportTarget,
): Promise<PublicReportTarget> => {
  // URLSearchParams encode la sorte et l'identifiant : ils restent de simples paramètres, sans
  // pouvoir changer le chemin de la requête.
  const query = new URLSearchParams({ kind: target.kind, id: target.id }).toString()
  const result = await requestWithoutSession(
    `/v1/public/reports/target?${query}`,
    {},
    PublicReportTarget,
  )
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

/**
 * Hook : la cible lue par la route d'un visiteur. `null` (un membre connecté, une sorte qu'un
 * visiteur ne peut pas signaler, la page pas encore hydratée) : aucune requête. Sa clé de cache
 * commence par « public » : elle ne se mêle jamais à la cible lue par un membre.
 */
export const usePublicReportTarget = (target: VisitorReportTarget | null) =>
  useQuery({
    queryKey: ['public', 'report-target', target?.kind, target?.id],
    // enabled garantit que target n'est pas null quand la lecture part ; le test le redit pour
    // TypeScript.
    queryFn: () => {
      if (!target) throw new ApiError('notFound')
      return getPublicReportTarget(target)
    },
    enabled: target !== null,
  })

/**
 * La route d'envoi répond 204, sans corps (rien ne distingue un premier signalement d'un doublon,
 * plan R12, décision 2). Ce « schéma » accepte donc toute réponse réussie, sans rien en lire : la
 * forme que `requestWithoutSession` attend (une fonction `safeParse`), sans Zod dans l'appli.
 */
const noBody = { safeParse: () => ({ success: true as const, data: null }) }

/**
 * Envoie le signalement d'un visiteur (POST /v1/public/reports). Rend `{ ok: true }`, ou la clé du
 * message d'erreur : la limite du jour depuis cette connexion (429 `visitor_report_quota`), un
 * contenu qui n'est plus public (404)… Pas de React Query : la feuille garde elle-même l'état de
 * l'envoi (un seul à la fois), comme pour un membre.
 */
export const sendVisitorReport = (report: VisitorReport): Promise<ApiResult<null>> =>
  requestWithoutSession(
    '/v1/public/reports',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    },
    noBody,
  )
