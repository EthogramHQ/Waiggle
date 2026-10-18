// L'en-tête d'un écran de saisie sur téléphone, comme celui d'une feuille : « Annuler » à gauche, le
// titre au centre, l'action principale à droite (« Publier », « Enregistrer »). Ainsi l'action reste
// à portée de pouce, même quand le formulaire est long.
import { space } from '@ruche/brand'
import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'
import { TextLink } from './TextLink'

type Props = {
  title: string
  cancel: { label: string; onPress: () => void }
  action: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }
}

export function SheetHeader({ title, cancel, action }: Props) {
  // Pour centrer le titre sur toute la barre, les deux côtés prennent la largeur du plus large
  // (« Annuler » est plus court que « Enregistrer »). onLayout donne la largeur réelle de chaque côté
  // une fois dessiné ; useState la garde, et l'écran se redessine avec la bonne valeur.
  const [sides, setSides] = useState({ left: 0, right: 0 })
  const side = Math.max(sides.left, sides.right)
  const measure = (key: 'left' | 'right') => (event: LayoutChangeEvent) => {
    const width = Math.ceil(event.nativeEvent.layout.width)
    setSides((current) => (current[key] === width ? current : { ...current, [key]: width }))
  }

  // Les côtés gardent la largeur de leur texte (« Annuler », « Enregistrer » ne sont jamais coupés) ;
  // le titre prend la place qui reste, sur deux lignes au plus. minWidth: 0 l'autorise à devenir
  // plus étroit que son texte.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flexShrink: 0, minWidth: side, alignItems: 'flex-start' }}>
        <View onLayout={measure('left')}>
          <TextLink label={cancel.label} onPress={cancel.onPress} role="button" />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="headline" align="center" accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      <View style={{ flexShrink: 0, minWidth: side, alignItems: 'flex-end' }}>
        <View onLayout={measure('right')}>
          <Button
            label={action.label}
            size="compact"
            onPress={action.onPress}
            loading={action.loading ?? false}
            disabled={action.disabled ?? false}
          />
        </View>
      </View>
    </View>
  )
}
