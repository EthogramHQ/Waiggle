// Une étiquette d'outil ou de modèle (« Claude », « Python »). Touchée, elle mène à la page de
// l'étiquette ; sans `onPress`, c'est une simple pastille.
import { borders, layout, radii, space } from '@ruche/brand'
import { Pressable, View, type ViewStyle } from 'react-native'
import { enterActivates } from './keyboard'
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
    // Un nom très long tient sur une ligne, abrégé par « … » : la pastille garde sa forme. Le nom
    // complet reste lu par les lecteurs d'écran (accessibilityLabel) et présent dans la page.
    <Text variant="callout" weight={600} numberOfLines={1}>
      {label}
    </Text>
  )
  // La pastille dessinée fait 36 points de haut ; autour d'elle, une zone de 44. Touchable, c'est
  // la zone à toucher ; simple pastille, elle garde la même hauteur, pour que les deux sortes
  // restent alignées sur une même ligne (sinon la simple pastille remontait de 4 points).
  const frame: ViewStyle = {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: layout.touchTarget,
    justifyContent: 'center',
  }
  if (!onPress) {
    return (
      <View style={frame}>
        <View style={box}>{content}</View>
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      // Entrée ouvre l'étiquette sur le web, comme un vrai lien (voir keyboard.ts).
      {...enterActivates(onPress)}
      onPress={onPress}
      style={{ ...frame, minWidth: layout.touchTarget }}
    >
      {({ pressed }) => (
        <View style={[box, pressed && { backgroundColor: colors.honeySoft }]}>{content}</View>
      )}
    </Pressable>
  )
}
