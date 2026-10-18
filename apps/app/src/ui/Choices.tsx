// Une question à choix unique (statut, visibilité…) : une rangée de pastilles dont une seule est
// cochée, en miel. Les lecteurs d'écran l'annoncent comme un groupe de boutons radio, ce qui permet
// aussi aux tests de retrouver chaque choix par son nom : getByRole('radio', { name: 'Testable' }).
import { borders, radii, space } from '@ruche/brand'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Option<T extends string> = { value: T; label: string; icon?: IconName }

// <T extends string> : un composant « générique ». T est le type des valeurs possibles
// ('idea' | 'building' | …) : TypeScript vérifie que les options et la valeur choisie concordent.
type Props<T extends string> = {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

export function Choices<T extends string>({ label, options, value, onChange }: Props<T>) {
  const { colors } = useTheme()
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" weight={600} tone="muted">
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                minHeight: 40,
                paddingHorizontal: space.lg,
                borderRadius: radii.pill,
                borderWidth: borders.strong,
                borderColor: checked ? colors.honey : colors.outline,
                backgroundColor: checked
                  ? colors.honey
                  : pressed
                    ? colors.honeySoft
                    : colors.surface,
              })}
            >
              {option.icon ? (
                <Icon name={option.icon} size={18} tone={checked ? 'onHoney' : 'muted'} />
              ) : null}
              <Text
                variant="callout"
                weight={checked ? 700 : 500}
                tone={checked ? 'onHoney' : 'default'}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
