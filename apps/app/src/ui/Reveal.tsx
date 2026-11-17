// Le fondu d'un squelette vers son contenu, dans une page (R16, « Quand on le voit »).
import type { ReactNode } from 'react'

// R16, socle : pièce vide, écrite par la tranche (plan R16).
export function Reveal(_props: {
  /** Vrai tant que le contenu n'est pas arrivé. */
  loading: boolean
  /** Le squelette de la zone. */
  skeleton: ReactNode
  children?: ReactNode
}): ReactNode {
  return null
}
