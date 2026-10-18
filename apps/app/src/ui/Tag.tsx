// Une étiquette d'outil ou de modèle (« Claude », « Python »). Touchée, elle mène à la page de
// l'étiquette ; sans `onPress`, c'est une simple pastille.
import { borders, radii, space } from '@ruche/brand'
import { Pressable, View, type ViewStyle } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  label: string
  onPress?: () => void
  /** Sur une image ou une lumière d'ambiance : en verre. */
  onGlass?: boolean
}

export function Tag({ label, onPress, onGlass = false }: Props) {
  const { colors } = useTheme()
  const box: ViewStyle = {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    backgroundColor: onGlass ? colors.glass : colors.surface,
    borderColor: onGlass ? colors.glassBorder : colors.outline,
  }
  const content = (
    <Text variant="callout" weight={600}>
      {label}
    </Text>
  )
  if (!onPress) return <View style={box}>{content}</View>
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      // La pastille fait 36 points de haut : hitSlop agrandit la zone à toucher à 44 points,
      // sans changer son dessin.
      hitSlop={4}
      style={({ pressed }) => [box, pressed && { backgroundColor: colors.honeySoft }]}
    >
      {content}
    </Pressable>
  )
}
