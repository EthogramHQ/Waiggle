// La catégorie d'un projet, écrite à côté de son statut en haut de sa page (R6a, scénario « La
// catégorie sur les cartes et la page ») : l'icône de la catégorie principale, puis un seul texte,
// « Sciences et espace · Apprendre », ou la principale seule. Sur la carte du fil, la catégorie est
// une étiquette de verre posée sur la photo (`Tag onGlass icon`) ; sur la page, elle n'a pas à se
// détacher d'une image : un petit texte discret suffit, à la hauteur de la pastille du statut.
//
// L'icône est un décor (Icon la cache aux lecteurs d'écran) : le texte dit tout, lu tel quel. Le
// texte passe à la ligne au lieu de sortir de la colonne (320 points, texte à 200 %).
import { layout, space } from '@ruche/brand'
import { Platform, Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { enterActivates } from './keyboard'
import { linkProps } from './SettingsNav'
import { STATUS_PILL_HEIGHT } from './StatusPill'
import { Text } from './Text'

type Props = {
  /** Le texte déjà traduit : « Sciences et espace · Apprendre », ou la principale seule. */
  label: string
  /** L'icône de la catégorie principale (`optionOf`, projects/categories.ts). */
  icon: IconName
  /** R6b : donné, la ligne devient un lien (vers Explorer filtré sur la catégorie). */
  onPress?: (() => void) | undefined
  /**
   * L'adresse du lien (`/explore?category=science`), relecture de l'interface de R6b (S4) : sur le
   * web, la ligne est un vrai `<a href>`, comme les autres liens de l'appli (ouvrir dans un nouvel
   * onglet, l'adresse au survol). Ignorée sans `onPress`, et sur téléphone.
   */
  href?: string | undefined
}

export function CategoryLine({ label, icon, onPress, href }: Props) {
  const line = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        // La hauteur de la pastille du statut, lue chez elle : le texte se centre sur elle.
        minHeight: STATUS_PILL_HEIGHT,
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
  if (!onPress) return line
  // R6b : touchée, la catégorie mène à Explorer filtré. Un lien nommé par le texte de la ligne, dans
  // une zone de 44 points (la ligne, elle, n'en fait que 36) ; Entrée l'ouvre sur le web.
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      {...(href === undefined ? null : linkProps(href, false))}
      {...enterActivates(onPress)}
      onPress={(event) => {
        // Le routeur change de page ; sur le web, le navigateur ne recharge pas celle du `<a>`.
        if (Platform.OS === 'web' && href !== undefined) event?.preventDefault?.()
        onPress()
      }}
      style={{
        minHeight: layout.touchTarget,
        justifyContent: 'center',
        maxWidth: '100%',
        flexShrink: 1,
      }}
    >
      {line}
    </Pressable>
  )
}
