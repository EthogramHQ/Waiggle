// Le numéro d'une étape, dans une pastille de miel : pour une suite d'actions à faire dans l'ordre.
import { radii } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

export function StepNumber({ value }: { value: number }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.honeySoft,
        // Aligné sur le milieu du bouton ou du champ de l'étape (52 points de haut).
        marginTop: 10,
      }}
    >
      <Text variant="callout" weight={700} tone="status">
        {String(value)}
      </Text>
    </View>
  )
}
