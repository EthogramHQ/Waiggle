// La garde de session commune aux écrans réservés aux membres (R16, « La garde de session ») :
// l'attente, l'erreur, la page réservée aux membres et l'écran connecté, en un seul endroit.
import type { ReactNode } from 'react'
import type { SessionData } from './session'

// R16, socle : pièce vide, écrite par la tranche (plan R16).
export function SessionGate(_props: {
  /** Le squelette de la page, pendant la lecture de la session. */
  loading?: ReactNode
  /** Ce qu'un visiteur voit à la place de « Réservé aux membres » (feuilles, page introuvable). */
  signedOut?: ReactNode
  /** L'écran connecté. La fonction rend un composant, sans hook. */
  children: (session: SessionData) => ReactNode
}): ReactNode {
  return null
}
