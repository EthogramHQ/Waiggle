// La catégorie d'un projet, écrite à côté de son statut en haut de sa page (R6a, scénario « La
// catégorie sur les cartes et la page ») : l'icône de la catégorie principale, puis un seul texte,
// « Sciences et espace · Apprendre », ou la principale seule. Sur la carte du fil, la catégorie est
// une étiquette de verre posée sur la photo (`Tag onGlass icon`) ; sur la page, elle n'a pas à se
// détacher d'une image : un petit texte discret suffit, à la hauteur de la pastille du statut.
//
// L'icône est un décor (Icon la cache aux lecteurs d'écran) : le texte dit tout, lu tel quel. Le
// texte passe à la ligne au lieu de sortir de la colonne (320 points, texte à 200 %).
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'

type Props = {
  /** Le texte déjà traduit : « Sciences et espace · Apprendre », ou la principale seule. */
  label: string
  /** L'icône de la catégorie principale (`categoryOption`, projects/categories.ts). */
  icon: IconName
}

/** La hauteur de la pastille du statut (`StatusPill`) : le texte se centre sur elle. */
const PILL_HEIGHT = 26

export function CategoryLine({ label, icon }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: PILL_HEIGHT,
        // Sur le web, une rangée ne rétrécit pas d'elle-même dans sa colonne : sans ces deux
        // lignes, un long nom de catégorie sortirait de l'écran à 320 points.
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      <Icon name={icon} size={18} tone="secondary" />
      {/* flexShrink : le texte rétrécit et passe à la ligne ; l'icône garde sa taille. */}
      <View style={{ flexShrink: 1 }}>
        <Text variant="caption" weight={600} tone="secondary">
          {label}
        </Text>
      </View>
    </View>
  )
}
