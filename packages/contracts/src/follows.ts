// Suivre une personne ou un projet (tranche 4). Ce qui se suit s'affiche avec son nombre
// d'abonnés, jamais avec leurs noms : la liste des abonnés n'est visible par personne.
import { z } from 'zod'

/**
 * L'état d'abonnement d'une page (un membre ou un projet), vu par le membre qui la regarde.
 * Ses champs sont ajoutés tels quels à Member et à Project (`...FollowState.shape`).
 */
export const FollowState = z.object({
  /** Vrai si le membre qui regarde suit cette personne ou ce projet. Toujours faux sur sa propre page. */
  isFollowed: z.boolean(),
  /** Combien de membres suivent cette personne ou ce projet. */
  followerCount: z.number().int().min(0),
})
export type FollowState = z.infer<typeof FollowState>
