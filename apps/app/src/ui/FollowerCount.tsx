// Le nombre d'abonnés d'un membre ou d'un projet (« 12 abonnés »), toujours avec la même allure :
// à côté du bouton « Suivre », ou seul sur sa propre page. Jamais les noms des abonnés.
//
// R21 (« Le temps réel ») : le nombre peut changer sous les yeux, quand un autre membre suit ou ne
// suit plus. Le nouveau texte arrive alors en fondu, à la même place, sans saut ; rien du tout avec
// « Réduire les animations ». Aucune annonce au lecteur d'écran : un abonné de plus n'interrompt
// personne (plan R21, choix 11), le nombre se lit en passant dessus.
import { durations, layout } from '@ruche/brand'
import { useRef } from 'react'
import { View } from 'react-native'
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated'
import { Text } from './Text'
import { useCalmMotion } from './theme/motion'

type Props = {
  text: string
  /**
   * R6b : le nombre tient la place d'un bouton, dans une rangée où l'autre bouton est à côté (la
   * page d'un projet retiré ou d'un compte suspendu : plus de « Suivre » ni de « Modifier »). Il
   * prend la hauteur d'un bouton et se centre dessus, au lieu de se coller en haut de la rangée,
   * au-dessus de la ligne de « Tester la démo ».
   */
  inButtonRow?: boolean
}

// Le fondu d'un nombre qui change : court, sans déplacement. `ReduceMotion.Never` : c'est
// `useCalmMotion` qui décide (il suit le réglage de l'appareil et celui de l'appli), pas Reanimated.
const change = FadeIn.duration(durations.base).reduceMotion(ReduceMotion.Never)

export function FollowerCount({ text, inButtonRow = false }: Props) {
  const calm = useCalmMotion()
  // Le texte du premier affichage : lui est simplement là. Seul un texte différent, arrivé ensuite
  // (un signal du temps réel, ou son propre « Suivre »), entre en fondu.
  const first = useRef(text)
  const changed = text !== first.current
  const count = (
    // `key` : un nouveau texte est une nouvelle vue, et Reanimated joue son entrée (`entering`),
    // seulement à ce moment-là.
    <Animated.View key={text} entering={changed && !calm ? change : undefined}>
      <Text variant="callout" tone="secondary">
        {text}
      </Text>
    </Animated.View>
  )
  if (!inButtonRow) return count
  // `minHeight` et non `height` : texte agrandi, le nombre peut dépasser sans être rogné.
  return (
    <View style={{ minHeight: layout.controlHeight.regular, justifyContent: 'center' }}>
      {count}
    </View>
  )
}
