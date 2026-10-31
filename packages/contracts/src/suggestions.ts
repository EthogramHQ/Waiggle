// « Proches à suivre » (R4) : au premier lancement et dans la colonne de droite du Fil, des
// membres qui ont publié récemment, chacun avec son dernier projet public. Un membre peut en
// écarter un (« × », « Ne plus suggérer Léa ») : ce choix est gardé par le serveur, sur tous ses
// appareils, et le membre écarté n'en sait jamais rien.
//
// Les routes :
// - GET /v1/suggestions/members : la liste (200 ; 401, 429) ;
// - PUT /v1/suggestions/members/{id}/dismissed : écarter (204, idempotent ; 401, 404, 429). Un
//   membre inconnu, non vérifié ou bloqué dans un sens ou l'autre reçoit le même 404 que
//   « Suivre » : la réponse ne dit jamais qu'un blocage existe (relecture de sécurité sec-B1).
import { z } from 'zod'
import { ProjectSummary } from './projects'

/** Au plus cinq membres suggérés à la fois (trois s'affichent dans la colonne de droite). */
export const SUGGESTION_MAX = 5

/**
 * Un membre suggéré : sa photo, son nom et son dernier projet public (résumé complet, total des
 * réactions compris). `z.strictObject` : aucun autre champ ne peut s'y glisser, ni adresse, ni
 * pseudo, ni date, ni nombre d'abonnés (relecture de sécurité sec-A5 ; aucune preuve sociale sur
 * la ligne, relecture juridique jur-J5).
 */
export const SuggestedMember = z
  .strictObject({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.url().nullable(),
    latestProject: ProjectSummary,
  })
  .meta({ id: 'SuggestedMember' })
export type SuggestedMember = z.infer<typeof SuggestedMember>

/**
 * La réponse de GET /v1/suggestions/members : les auteurs triés par la date de leur dernier projet
 * public, du plus récent au plus ancien. Jamais le membre lui-même, ni quelqu'un qu'il suit, qu'il
 * a écarté, qu'il a bloqué ou qui l'a bloqué. Un membre suspendu reste suggéré, comme ses projets
 * restent dans Explorer (décision de Louis du 31/10/2026, sec-B2).
 */
export const MemberSuggestions = z
  .object({ members: z.array(SuggestedMember).max(SUGGESTION_MAX) })
  .meta({ id: 'MemberSuggestions' })
export type MemberSuggestions = z.infer<typeof MemberSuggestions>

/**
 * Une suggestion écartée dans l'export des données : celles que le membre a écartées, jamais
 * celles qui le visent. Même forme qu'un blocage (`BlockExport`) : le pseudo est celui du moment
 * de l'export (null si le membre écarté n'en a pas), jamais le nom affiché (jur-J4).
 */
export const DismissedSuggestionExport = z.object({
  memberId: z.string(),
  handle: z.string().nullable(),
  at: z.iso.datetime(),
})
export type DismissedSuggestionExport = z.infer<typeof DismissedSuggestionExport>
