// Une petite note discrète précédée d'une icône (« Les projets et les profils ne sont visibles que
// par les membres connectés. »). L'icône reste alignée sur la première ligne du texte, et le texte
// se replie à côté d'elle, aligné à gauche, au lieu de se centrer sous l'icône.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

type Props = { icon: IconName; text: string }

export function Hint({ icon, text }: Props) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
      {/* L'icône est décorative : le texte dit tout. paddingTop la cale sur la première ligne. */}
      <View style={{ paddingTop: space.xxs }} aria-hidden>
        <Icon name={icon} size={14} tone="muted" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption" tone="muted">
          {text}
        </Text>
      </View>
    </View>
  )
}
