// Un contrôle segmenté : deux à quatre choix côte à côte dans une capsule, le choix actif en blanc
// plein (la « goutte »). Sert pour l'apparence (Automatique / Jour / Nuit) ou la langue.
// Annoncé comme un groupe de boutons radio, comme Choices.
import { borders, layout, radii, space } from '@ruche/brand'
import { Pressable, View } from 'react-native'
import { Icon, type IconName } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Option<T extends string> = {
  value: T
  label: string
  icon?: IconName
  /** Le nom lu par les lecteurs d'écran, s'il diffère du texte affiché (« FR » → « Français »). */
  spokenLabel?: string
}

type Props<T extends string> = {
  /** Le nom du groupe, lu par les lecteurs d'écran (« Apparence »). */
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Prend toute la largeur (par défaut) ou seulement la place de ses choix. */
  fill?: boolean
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  fill = true,
}: Props<T>) {
  const { colors, shadows } = useTheme()
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        // Une capsule fine autour des choix : chaque choix garde ses 44 points à toucher.
        padding: space.xxs,
        gap: space.xxs,
        borderRadius: radii.pill,
        backgroundColor: colors.surfaceGrouped,
        borderWidth: borders.hairline,
        borderColor: colors.line,
        alignSelf: fill ? 'stretch' : 'flex-start',
      }}
    >
      {options.map((option) => {
        const checked = option.value === value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.spokenLabel ?? option.label}
            aria-checked={checked}
            onPress={() => onChange(option.value)}
            style={{
              ...(fill ? { flex: 1 } : null),
              flexDirection: 'row',
              gap: space.xs,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: layout.touchTarget,
              minWidth: layout.touchTarget,
              paddingHorizontal: space.md,
              borderRadius: radii.pill,
              ...(checked
                ? { backgroundColor: colors.surfaceRaised, boxShadow: shadows.soft }
                : null),
            }}
          >
            {option.icon ? (
              <Icon name={option.icon} size={18} tone={checked ? 'default' : 'muted'} />
            ) : null}
            <Text
              variant="callout"
              weight={checked ? 700 : 500}
              tone={checked ? 'default' : 'muted'}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
