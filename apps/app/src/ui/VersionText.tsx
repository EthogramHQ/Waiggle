// La version d'une mise à jour (« v1.2 »), en Geist Mono, lue « version 1.2 » (R7a, relecture ui-S1) :
// le « v » collé au nombre se lirait « vé un point deux ». Le texte vu reste « v1.2 » ; seul le nom lu
// change. Les deux endroits qui l'affichent (l'en-tête d'une mise à jour, la ligne de dates du
// projet) passent par ici.
//
// Téléphone : le lecteur d'écran lit le nom donné au texte. Web : le navigateur ignore le nom d'une
// balise sans rôle ; le texte vu est donc caché au lecteur, et la phrase entière est écrite à côté,
// cachée à l'œil seulement (comme les lignes d'une mise à jour et la date de `RelativeTime`).
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'
import { hiddenFrame } from './HiddenHeading'
import { Text } from './Text'

type Props = {
  /** La version telle que l'auteur l'a écrite (« v1.2 »). */
  version: string
  /** La couleur : discrète (`muted`) dans la ligne de dates, `secondary` près d'un titre. */
  tone?: 'secondary' | 'muted'
}

export function VersionText({ version, tone = 'secondary' }: Props) {
  const { t } = useTranslation()
  // « v1.2 » → « version 1.2 » : sans le « v » de tête (écrit ou non par l'auteur).
  const read = t(($) => $.project.updates.versionRead, {
    version: version.replace(/^v(?=\d)/i, ''),
  })
  if (Platform.OS !== 'web') {
    return (
      <Text variant="mono" tone={tone} breakAnywhere accessibilityLabel={read}>
        {version}
      </Text>
    )
  }
  return (
    <View style={{ flexShrink: 1, maxWidth: '100%' }}>
      <View aria-hidden>
        <Text variant="mono" tone={tone} breakAnywhere>
          {version}
        </Text>
      </View>
      <View style={hiddenFrame} pointerEvents="none">
        <Text>{read}</Text>
      </View>
    </View>
  )
}
