// Le numéro d'une étape, dans une pastille de miel : pour une suite d'actions à faire dans l'ordre.
import { radii } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

const SIZE = 32

// La pastille ne se décale pas elle-même : c'est la rangée de l'étape qui la centre sur le bouton
// ou le champ voisin (align="center").
export function StepNumber({ value }: { value: number }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honeySoft,
      }}
    >
      <Text variant="callout" weight={700} tone="status">
        {String(value)}
      </Text>
    </View>
  )
}
