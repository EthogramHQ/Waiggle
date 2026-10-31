// La tuile à l'initiale d'un outil (refonte, tranche R3 : les lignes de « Tous les outils », planche
// R3-Outils). Un carré aux coins arrondis, en miel ou en crème, avec la première lettre du nom.
// Elle décore : le nom de l'outil est écrit à côté, et lu par la ligne. Elle est donc cachée aux
// lecteurs d'écran.
import { radii } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** La taille de la tuile, en points : celle de la pastille d'icône d'une ligne (ListRow). */
const SIZE = 40

type Props = {
  /** Le nom de l'outil (« Claude ») : la tuile en montre la première lettre. */
  name: string
  /** honey : le miel vif, initiale brune ; cream : le miel doux, initiale encre. */
  variant?: 'honey' | 'cream'
}

/**
 * La première lettre d'un nom, en capitale (« cursor » → « C », « Écrivain » → « É »). Un nom qui
 * commence par un emoji ou un chiffre garde ce caractère entier : `Array.from` découpe par points
 * de code, et non par unités UTF-16 (un emoji en compte deux).
 */
export const initialOf = (name: string): string =>
  (Array.from(name.trim())[0] ?? '').toLocaleUpperCase()

/**
 * La teinte d'un outil, toujours la même pour un même outil (d'une visite à l'autre, d'une page à
 * l'autre) : elle se tire de son identifiant. Une liste alternée sans ordre apparent, comme la
 * planche.
 */
export const tileVariantOf = (slug: string): 'honey' | 'cream' => {
  let sum = 0
  for (const char of slug) sum += char.codePointAt(0) ?? 0
  return sum % 2 === 0 ? 'honey' : 'cream'
}

export function InitialTile({ name, variant = 'cream' }: Props) {
  const { colors } = useTheme()
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: radii.code,
        alignItems: 'center',
        justifyContent: 'center',
        // Les couples de contraste : onHoneyTile sur honey, text sur honeySoft (contrastPairs).
        backgroundColor: variant === 'honey' ? colors.honey : colors.honeySoft,
      }}
    >
      {/* maxScale 1 : l'initiale reste dans sa tuile quand le texte de l'appareil grandit. */}
      <Text
        variant="mono"
        weight={700}
        tone={variant === 'honey' ? 'onHoneyTile' : 'default'}
        maxScale={1}
        selectable={false}
      >
        {initialOf(name)}
      </Text>
    </View>
  )
}
