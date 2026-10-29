// Un bloc de texte affiché tel quel, en police à chasse fixe : les prompts d'un projet.
// On peut le sélectionner pour le copier.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export function CodeBlock({ children }: { children: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        backgroundColor: colors.surfaceGrouped,
        borderRadius: radii.code,
        padding: space.md,
      }}
    >
      {/* Le rôle `code` (Miel 2) porte la police, la taille et l'interligne ; Text suit la taille
          de texte de l'appareil, dans la limite commune. */}
      <Text variant="code" selectable>
        {children}
      </Text>
    </View>
  )
}
