// Le nombre d'abonnés d'un membre ou d'un projet (« 12 abonnés »), toujours avec la même allure :
// à côté du bouton « Suivre », ou seul sur sa propre page. Jamais les noms des abonnés.
import { layout } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'

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

export function FollowerCount({ text, inButtonRow = false }: Props) {
  const count = (
    <Text variant="callout" tone="secondary">
      {text}
    </Text>
  )
  if (!inButtonRow) return count
  // `minHeight` et non `height` : texte agrandi, le nombre peut dépasser sans être rogné.
  return (
    <View style={{ minHeight: layout.controlHeight.regular, justifyContent: 'center' }}>
      {count}
    </View>
  )
}
