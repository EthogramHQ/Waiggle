// Une ligne de petits renseignements séparés par des points (R5a) : « Publié le 3 oct. · Mis à jour
// hier » sous le titre d'un projet. Chaque morceau est un élément à part (souvent une date relative,
// `RelativeTime`, qui est une vue sur le web et ne s'insère pas dans un texte) ; ce composant pose
// le point entre deux morceaux et laisse la ligne passer à la ligne quand elle ne tient pas
// (téléphone étroit, texte agrandi), sans jamais couper un morceau en deux.
// Le point est un décor pour l'œil : les lecteurs d'écran le sautent et lisent les morceaux l'un
// après l'autre.
import { space } from '@ruche/brand'
import { Children, isValidElement, type ReactNode } from 'react'
import { View } from 'react-native'
import { Text } from './Text'

type Props = {
  /** Les morceaux, dans l'ordre de lecture ; un enfant vide (`cond && …` faux) ne laisse rien. */
  children: ReactNode
}

export function MetaLine({ children }: Props) {
  // Children.toArray retire les enfants vides : pas de point en trop au bout de la ligne.
  const items = Children.toArray(children)
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space.xs,
        // maxWidth et flexShrink : sur le web, une rangée ne rétrécit pas d'elle-même dans sa
        // colonne (320 points, texte à 200 %).
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      {items.map((item, index) => (
        <View
          key={isValidElement(item) && item.key !== null ? item.key : index}
          // Un morceau plus large que la colonne rétrécit et passe à la ligne au lieu d'en sortir.
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            columnGap: space.xs,
            maxWidth: '100%',
            flexShrink: 1,
          }}
        >
          {index > 0 ? (
            // Le point, caché aux lecteurs d'écran (iOS, Android, web).
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text variant="caption" tone="muted">
                ·
              </Text>
            </View>
          ) : null}
          {item}
        </View>
      ))}
    </View>
  )
}
