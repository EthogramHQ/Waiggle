// Le numéro d'une étape, dans une pastille de miel : pour une suite d'actions à faire dans l'ordre.
import { layout, radii } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

const SIZE = 32
// La hauteur de ce qui suit le numéro : un bouton (52 points), ou un champ avec son libellé
// (TextField, environ 85 points). Le numéro se centre sur cette hauteur.
const heights = { button: layout.controlHeight.regular, field: 85 }

type Props = {
  value: number
  /** Ce qui suit le numéro dans l'étape : un bouton (par défaut) ou un champ de saisie. */
  beside?: 'button' | 'field'
}

export function StepNumber({ value, beside = 'button' }: Props) {
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
        // Aligné sur le milieu du bouton ou du champ de l'étape.
        marginTop: (heights[beside] - SIZE) / 2,
      }}
    >
      <Text variant="callout" weight={700} tone="status">
        {String(value)}
      </Text>
    </View>
  )
}
