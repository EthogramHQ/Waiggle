// La place de la pastille de gain près d'un bouton (R19, relecture d'interface UI-1) : une boîte
// qui enveloppe le bouton du geste (« Le coin des testeurs », « Envoyer », « Envoyer un retour »)
// et y pose `PollenGain` quand ce geste vient de rapporter du pollen. La boîte prend la taille du
// bouton, rien de plus : la pastille, posée hors du flux, ne pousse rien et ne prend aucune tape
// (ui/PollenGain.tsx). Sans gain, la boîte ne montre que le bouton.
//
// Pourquoi une boîte à part plutôt que la pastille posée à côté du bouton par l'écran : la pastille
// se place contre le bord de la boîte qui la porte (`placement`). Dans une rangée pleine largeur,
// « à droite » serait au bord de la page, loin du bouton. Et un écran n'écrit aucune mise en page
// (les trois étages) : c'est ce composant qui la tient.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { PollenGain } from './PollenGain'

/** Un gain à montrer : le pollen et sa clé de rejeu (`usePollenGain` rend `{ amount, key }`). */
export type PlacedGain = { amount: number; trigger: number }

type Props = {
  /** Le gain du geste ; `null` ou absent : rien à montrer. */
  gain?: PlacedGain | null | undefined
  /** `above` : centrée au-dessus du bouton ; `end` : à sa droite, à mi-hauteur. */
  placement: 'above' | 'end'
  children: ReactNode
}

export function PollenGainSpot({ gain, placement, children }: Props) {
  return (
    // Une boîte sans style : dans une rangée, elle a la largeur du bouton ; dans une colonne, celle
    // de la colonne, comme le bouton qu'elle remplace. Sur le web, une vue est déjà « relative » :
    // la pastille s'y ancre.
    <View testID="pollen-gain-spot">
      {children}
      {gain ? (
        <PollenGain amount={gain.amount} trigger={gain.trigger} placement={placement} />
      ) : null}
    </View>
  )
}
