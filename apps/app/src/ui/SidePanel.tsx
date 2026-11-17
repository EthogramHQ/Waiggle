// Le panneau d'à côté d'un écran large (R15, « L'ordinateur en grand ») : ce que la page offre en
// plus de son contenu principal (Explorer : « Ils cherchent des testeurs » et « Outils
// populaires »), ses sections l'une sous l'autre. Il se pose dans la colonne de côté de `Columns`
// (`sideWidth="panel"`), qui lui donne sa largeur.
//
// C'est une région « complémentaire » (`role="complementary"`) : sur le web, un `<aside>`, que les
// lecteurs d'écran listent parmi les repères de la page et permettent d'atteindre d'un geste. La
// vue n'est pas `accessible` : sur téléphone, une vue `accessible` devient un seul élément, et
// VoiceOver n'atteindrait plus les boutons et les liens qu'elle contient.
import { space } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'

type Props = {
  /** Les sections du panneau, dans l'ordre de lecture. */
  children: ReactNode
  /**
   * Le nom lu du repère, s'il en faut un (plusieurs panneaux sur une même page). Sans lui, le
   * lecteur d'écran dit « complémentaire » et lit les titres des sections.
   */
  label?: string
}

export function SidePanel({ children, label }: Props) {
  return (
    // L'écart entre deux sections : celui du panneau du Fil (`feed/FeedSide`).
    <View role="complementary" aria-label={label} style={{ gap: space.xxl }}>
      {children}
    </View>
  )
}
