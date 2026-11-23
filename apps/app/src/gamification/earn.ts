// Ce que fait un geste qui vient de réussir quand l'API a rapporté du pollen (R19) : montrer la
// pastille « +N pollen » (`reportPollen`) et relire « Ma récolte » (la semaine et le rayon ont
// bougé). Un seul endroit pour tous les hooks de geste (réactions, commentaires, testeurs, suivis,
// ruches, projets, profil) : ils n'ont qu'une ligne à écrire, et ne dépendent que de ce fichier, qui
// n'importe ni `gamification/api` ni un domaine (sinon une boucle d'imports : `gamification/api`
// lit `projects/hooks`, qui est lui-même un domaine de geste).
import type { QueryClient } from '@tanstack/react-query'
import { harvestQueryKey } from './keys'
import { type PollenAnchor, reportPollen } from './pollen'

/**
 * `pollen` est celui du résultat du client (`result.pollen`, en-tête `Waiggle-Pollen`) : absent, le
 * geste n'a rien rapporté (déjà fait, plafond de la semaine atteint, retrait d'une réaction) et rien
 * ne se montre ni ne se relit. `target` désigne le porteur visé quand une page en a plusieurs du
 * même ancrage (la capsule « Utile » parmi les quatre réactions).
 */
export const earnPollen = (
  queryClient: QueryClient,
  pollen: number | undefined,
  anchor: PollenAnchor,
  target?: string,
): void => {
  if (pollen === undefined) return
  reportPollen(pollen, anchor, target)
  void queryClient.invalidateQueries({ queryKey: harvestQueryKey })
}
