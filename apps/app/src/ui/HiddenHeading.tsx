// Un titre lu par les lecteurs d'écran mais caché à l'œil. Il sert quand une page dit déjà, par
// l'image, où l'on est : sur téléphone, le haut du Fil montre le logo, et l'onglet « Fil » de la
// barre du bas est allumé. Les yeux n'ont pas besoin d'un titre de plus ; un lecteur d'écran, si :
// il parcourt une page par ses titres, et une page sans titre de niveau 1 ne dit pas où il est
// (relecture R3, 31/10/2026 : le Fil de téléphone n'avait aucun h1).
import { Platform, View, type ViewStyle } from 'react-native'
import { type HeadingLevel, Text } from './Text'

/**
 * Le cadre qui cache : une case d'un point, hors du flux (position absolue, elle ne pousse rien),
 * qui rogne ce qui dépasse. Sur le web, `clipPath` efface aussi ce point : rien n'est peint, mais
 * la balise garde sa boîte, donc les lecteurs d'écran la lisent (`display: none` ou `opacity: 0`
 * la leur cacheraient, ou pas selon le lecteur). C'est la recette « sr-only » du web, en styles de
 * React Native. `clipPath` et `whiteSpace` manquent aux types de React Native, d'où la conversion.
 */
const hiddenFrame = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: 'hidden',
  ...(Platform.OS === 'web' ? { clipPath: 'inset(50%)', whiteSpace: 'nowrap' } : null),
} as unknown as ViewStyle

type Props = {
  /** Le texte du titre, celui qu'on lirait s'il était affiché (« Fil »). */
  text: string
  /** Son niveau : 1 quand il est le titre de la page (le cas du Fil). */
  level?: HeadingLevel
}

export function HiddenHeading({ text, level = 1 }: Props) {
  return (
    // pointerEvents : la case ne prend jamais une tape ni un clic destinés à ce qui est dessous.
    <View style={hiddenFrame} pointerEvents="none">
      <Text heading={level}>{text}</Text>
    </View>
  )
}
