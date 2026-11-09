// La phrase d'erreur sous un groupe de choix (`Choices`, `IconGrid`) : une icône d'avertissement et
// le texte en rouge, comme sous un `TextField`. Elle est dans une région `aria-live="polite"` qui
// existe toujours, même vide : un lecteur d'écran ne suit que les régions déjà présentes, et le
// membre qui vient de toucher « Enregistrer » entend ainsi « Choisis une famille. » sans chercher.
// Son `id` (le `nativeID`) est celui que le groupe cite dans `aria-describedby`.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'

type Props = {
  /** L'identifiant que le groupe de choix cite dans `aria-describedby`. */
  id: string
  /** Le texte ; absent : la région reste là, vide, et ne prend aucune place. */
  message: string | undefined
}

export function FieldError({ id, message }: Props) {
  return (
    <View nativeID={id} aria-live="polite">
      {message ? (
        <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}>
          <Icon name="warning-circle" size={16} tone="danger" />
          <View style={{ flex: 1 }}>
            <Text variant="caption" tone="danger">
              {message}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}
