// Le bouton qui ouvre la feuille des catégories (R6b : page d'un outil sur téléphone, recherche).
// Il montre son état : « Toutes les catégories », ou le nom de la catégorie choisie (« Cuisine »).
// Un lecteur d'écran lit `spokenLabel` (« Catégorie : Cuisine ») : le nom seul ne dirait pas ce que
// le bouton filtre. Une pastille de 44 points de haut, avec son icône et un chevron qui dit qu'une
// liste s'ouvre.
import { borders, layout, radii, space } from '@ruche/brand'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Ce qu'on voit : « Toutes les catégories » ou « Cuisine ». */
  label: string
  /** Ce qu'on entend : « Catégorie : Cuisine » (identique à `label` tant que rien n'est choisi). */
  spokenLabel: string
  /** L'icône de la catégorie choisie, ou celle de « Toutes » (les formes). */
  icon: IconName
  onPress: () => void
}

export function FilterButton({ label, spokenLabel, icon, onPress }: Props) {
  const { colors } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        // Jamais plus large que la ligne : un nom long se coupe dans la pastille.
        maxWidth: '100%',
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        minHeight: layout.touchTarget,
        paddingHorizontal: space.lg,
        borderRadius: radii.pill,
        borderWidth: borders.strong,
        borderColor: colors.outline,
        backgroundColor: pressed ? colors.honeySoft : colors.surface,
      })}
    >
      <Icon name={icon} size={18} tone="muted" />
      <View style={{ flexShrink: 1 }}>
        <Text variant="callout" weight={600} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Icon name="caret-down" size={14} tone="muted" />
    </Pressable>
  )
}
