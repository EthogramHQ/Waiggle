// Une étiquette d'outil ou de modèle (« Claude », « Python »). Touchée, elle mène à la page de
// l'étiquette ; sans `onPress`, c'est une simple pastille.
import { borders, layout, radii, space } from '@ruche/brand'
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
    // Jamais plus large que la ligne : un nom d'outil très long passe à la ligne.
    maxWidth: '100%',
    minHeight: layout.chipHeight,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    backgroundColor: onGlass ? colors.glass : colors.surface,
    borderColor: onGlass ? colors.glassBorder : colors.outline,
  }
  const content = (
    // align="center" : un nom long qui passe sur deux lignes reste centré dans sa pastille.
    <Text variant="callout" weight={600} align="center" breakAnywhere>
      {label}
    </Text>
  )
  if (!onPress) return <View style={box}>{content}</View>
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      // La pastille dessinée fait 36 points de haut ; la zone à toucher autour d'elle, 44.
      style={{
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minHeight: layout.touchTarget,
        minWidth: layout.touchTarget,
        justifyContent: 'center',
      }}
    >
      {({ pressed }) => (
        <View style={[box, pressed && { backgroundColor: colors.honeySoft }]}>{content}</View>
      )}
    </Pressable>
  )
}
