// Le bas d'un fil : « Afficher la suite » tant qu'il en reste, puis « Tu es à jour ». Pas de
// défilement sans fin : on sait où le fil s'arrête, et un bouton se prend aussi au clavier.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Button } from './Button'
import { Icon } from './Icon'
import { Text } from './Text'

type Props = {
  /** more : il reste des pages ; loading : la suivante arrive ; end : tout est lu. */
  state: 'more' | 'loading' | 'end'
  moreLabel: string
  endLabel: string
  onMore: () => void
}

export function FeedEnd({ state, moreLabel, endLabel, onMore }: Props) {
  if (state === 'end') {
    return (
      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: space.lg,
        }}
      >
        <Icon name="check-circle" size={20} tone="muted" />
        <Text tone="muted">{endLabel}</Text>
      </View>
    )
  }
  return (
    // Le même bouton pendant le chargement, occupé : il garde sa place, et un second appui ne
    // redemande pas la page (Button est désactivé tant que loading est vrai).
    <View style={{ alignSelf: 'center', paddingVertical: space.md }}>
      <Button
        label={moreLabel}
        onPress={onMore}
        variant="secondary"
        loading={state === 'loading'}
      />
    </View>
  )
}
