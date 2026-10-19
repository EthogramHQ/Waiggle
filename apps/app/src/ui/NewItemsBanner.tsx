// Le bandeau « 3 nouveautés » en haut du fil. Le fil ne bouge jamais tout seul sous le doigt :
// quand il y a du nouveau, ce bouton apparaît, et c'est la personne qui choisit de l'afficher.
import { View } from 'react-native'
import { Button } from './Button'

type Props = {
  /** Le texte, déjà écrit avec son nombre (« 3 nouveautés »). */
  label: string
  onPress: () => void
}

export function NewItemsBanner({ label, onPress }: Props) {
  return (
    // alignSelf: 'center' : une pilule au milieu, de la largeur de son texte, pas une barre entière.
    <View style={{ alignSelf: 'center' }}>
      <Button label={label} onPress={onPress} icon="sparkle" size="compact" />
    </View>
  )
}
