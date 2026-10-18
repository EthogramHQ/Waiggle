// Le numéro d'une étape, dans une pastille de miel : pour une suite d'actions à faire dans l'ordre.
// Step range une étape entière : le numéro centré sur le bouton ou le champ de l'étape, et les
// précisions dessous, alignées sur ce bouton (en retrait de la largeur du numéro).
import { radii, space } from '@ruche/brand'
import type { ReactNode } from 'react'
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

type StepProps = {
  value: number
  /** Le bouton ou le champ de l'étape, sur lequel le numéro se centre. */
  control: ReactNode
  /** Ce qui vient dessous (une précision, un message), aligné sur le bouton ou le champ. */
  children?: ReactNode
}

export function Step({ value, control, children }: StepProps) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <StepNumber value={value} />
        <View style={{ flex: 1, minWidth: 0 }}>{control}</View>
      </View>
      {children ? (
        <View style={{ paddingLeft: SIZE + space.md, gap: space.sm }}>{children}</View>
      ) : null}
    </View>
  )
}
