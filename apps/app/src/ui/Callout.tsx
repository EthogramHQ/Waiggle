// Un encadré qui met en avant ce qu'il faut savoir avant un geste (tranche R2, relecture de
// l'interface C6) : une icône, un titre court en gras, puis une phrase d'explication. Par exemple,
// sur « Changer ton mot de passe » : « Tes autres appareils seront déconnectés », puis ce qui reste
// connecté (relecture juridique, jur-3). Ce n'est pas un message (Notice) : rien ne vient de se
// passer, il n'est donc pas annoncé quand la page paraît ; il se lit dans l'ordre de la page.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  /** L'icône, décorative (le titre dit tout) : l'appareil, un cadenas… */
  icon: IconName
  /** Ce qu'il faut retenir, en une ligne. */
  title: string
  /** L'explication, sous le titre. */
  body: string
}

export function Callout({ icon, title, body }: Props) {
  return (
    <Surface padding="lg">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <Icon name={icon} size={24} tone="secondary" />
        {/* flexShrink et minWidth 0 : à 200 % de texte, les lignes passent à la ligne au lieu de
            sortir du cadre (sur le web, une vue ne rétrécit pas d'elle-même). */}
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0, gap: space.xs }}>
          <Text weight={600}>{title}</Text>
          <Text variant="callout" tone="secondary">
            {body}
          </Text>
        </View>
      </View>
    </Surface>
  )
}
