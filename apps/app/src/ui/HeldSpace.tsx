// Une place gardée (tranche R2, relecture de design C6) : ce qu'on y met s'affiche normalement, puis,
// quand `vacated` passe à vrai, s'efface en laissant un vide de la même hauteur. Pour un message qui
// n'a plus lieu d'être sans que le membre ait rien fait (la fin d'une attente « trop d'essais ») :
// le retirer tout à fait ferait remonter ce qui est dessous, sous le doigt (règle de la charte :
// rien ne bouge sans geste du membre). Le vide dure jusqu'au prochain geste, quand l'écran retire
// la place elle-même (il ne dessine plus le composant).
//
// Le vide ne contient rien : aucun texte qu'un lecteur d'écran lirait encore, ni lien qu'on
// atteindrait à la touche Tab. C'est pourquoi on mesure la hauteur (onLayout) plutôt que de cacher
// le contenu par transparence, qui le laisserait dans la page.
import { type ReactNode, useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'

type Props = {
  /** Vrai : le contenu s'efface et sa place reste vide, à la hauteur qu'il avait. */
  vacated: boolean
  children?: ReactNode
}

export function HeldSpace({ vacated, children }: Props) {
  // La dernière hauteur dessinée du contenu, mesurée à chaque changement de taille.
  const [height, setHeight] = useState(0)
  const onLayout = (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height)
  if (vacated) {
    // Un vide décoratif : caché aux lecteurs d'écran, sur chaque plateforme.
    return (
      <View
        testID="held-space"
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ height }}
      />
    )
  }
  return <View onLayout={onLayout}>{children}</View>
}
