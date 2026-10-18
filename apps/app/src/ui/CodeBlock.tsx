// Un bloc de texte affiché tel quel, en police à chasse fixe : les prompts d'un projet.
// On peut le sélectionner pour le copier.
import { maxTextScale, radii, space, textStyles } from '@ruche/brand'
import { Text, View } from 'react-native'
import { monoFont } from './theme/fonts'
import { useTheme } from './theme/ThemeProvider'

export function CodeBlock({ children }: { children: string }) {
  const { colors } = useTheme()
  const { size, lineHeight } = textStyles.callout
  return (
    <View
      style={{
        backgroundColor: colors.surfaceGrouped,
        borderRadius: radii.code,
        padding: space.md,
      }}
    >
      <Text
        selectable
        maxFontSizeMultiplier={maxTextScale}
        style={{ fontFamily: monoFont, fontSize: size - 1, lineHeight, color: colors.text }}
      >
        {children}
      </Text>
    </View>
  )
}
