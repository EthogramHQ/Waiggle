// L'en-tête d'un écran de saisie sur téléphone, comme celui d'une feuille : « Annuler » à gauche, le
// titre au centre, l'action principale à droite (« Publier », « Enregistrer »). Ainsi l'action reste
// à portée de pouce, même quand le formulaire est long.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Button } from './Button'
import { Text } from './Text'
import { TextLink } from './TextLink'

type Props = {
  title: string
  cancel: { label: string; onPress: () => void }
  action: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }
}

export function SheetHeader({ title, cancel, action }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <TextLink label={cancel.label} onPress={cancel.onPress} role="button" />
      </View>
      <View style={{ flex: 2 }}>
        <Text variant="headline" align="center" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Button
          label={action.label}
          size="compact"
          onPress={action.onPress}
          loading={action.loading ?? false}
          disabled={action.disabled ?? false}
        />
      </View>
    </View>
  )
}
