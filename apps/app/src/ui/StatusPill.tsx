// La pastille qui donne le statut d'un projet (Idée, En construction, Testable…).
// En miel plein (`strong`) quand on veut appeler au test : « Testable ».
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = { label: string; strong?: boolean }

export function StatusPill({ label, strong = false }: Props) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        minHeight: 26,
        justifyContent: 'center',
        paddingHorizontal: space.md,
        borderRadius: radii.pill,
        backgroundColor: strong ? colors.honey : colors.honeySoft,
      }}
    >
      <Text variant="caption" weight={700} tone={strong ? 'onHoney' : 'status'}>
        {label}
      </Text>
    </View>
  )
}
