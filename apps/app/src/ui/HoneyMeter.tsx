// Une jauge en alvéoles de miel : une alvéole par unité, remplie au fur et à mesure.
// Elle montre par exemple combien de caractères manquent au mot de passe. Les lecteurs d'écran
// lisent la phrase (`label`), pas les alvéoles : c'est le nom de la barre de progression, et sa
// valeur lue. Une fois la jauge pleine, la phrase ne s'affiche plus mais le nom reste.
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
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={filled}
      aria-valuetext={label}
      style={{ gap: space.sm }}
    >
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
      {/* Discrète tant que la jauge est vide, ambre pendant la saisie. Une fois remplie, les
          alvéoles pleines suffisent : la phrase quitte l'écran (« moins de mots ») mais garde sa
          place, transparente et cachée des lecteurs d'écran (elle est déjà le nom de la barre),
          pour que ce qui suit la jauge ne remonte pas sous le doigt au dernier caractère. */}
      <View
        aria-hidden={done}
        importantForAccessibility={done ? 'no-hide-descendants' : 'auto'}
        style={{ opacity: done ? 0 : 1 }}
      >
        <Text
          variant="caption"
          weight={value === 0 ? 400 : 700}
          tone={value === 0 ? 'muted' : 'accent'}
        >
          {label}
        </Text>
      </View>
    </View>
  )
}
