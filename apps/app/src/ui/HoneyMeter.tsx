// Une jauge en alvéoles de miel : une alvéole par unité, remplie au fur et à mesure.
// Elle montre par exemple combien de caractères manquent au mot de passe. Les lecteurs d'écran
// lisent la phrase (`label`), pas les alvéoles.
import { space } from '@ruche/brand'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  value: number
  max: number
  /** La phrase qui résume la jauge (« Encore 3 caractères »). */
  label: string
}

// Un hexagone pointe en haut, dessiné dans un carré de 24 × 24.
const HEXAGON = 'M12 1.5 21.1 6.75V17.25L12 22.5 2.9 17.25V6.75Z'

export function HoneyMeter({ value, max, label }: Props) {
  const { colors } = useTheme()
  const filled = Math.min(value, max)
  const done = value >= max
  return (
    <View accessible accessibilityLabel={label} style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs }}>
        {Array.from({ length: max }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: les alvéoles n'ont pas d'autre identité que leur rang
          <Svg key={i} width={22} height={22} viewBox="0 0 24 24">
            <Path
              d={HEXAGON}
              fill={i < filled ? colors.honey : colors.surfaceGrouped}
              stroke={i < filled ? colors.honeyPressed : colors.line}
              strokeWidth={1}
            />
          </Svg>
        ))}
      </View>
      <Text variant="caption" weight={700} tone={done ? 'success' : 'accent'}>
        {label}
      </Text>
    </View>
  )
}
