// La tuile à l'initiale d'un outil (refonte, tranche R3 : les lignes de « Tous les outils », planche
// R3-Outils). Un carré aux coins arrondis, en miel pâle, avec la première lettre du nom à l'encre.
// Elle décore : le nom de l'outil est écrit à côté, et lu par la ligne. Elle est donc cachée aux
// lecteurs d'écran.
// Depuis R4 (reporté de la relecture de design de R3), une seule teinte pour tous les outils : la
// liste alternée miel vif et crème, sans ordre apparent, faisait croire à un sens (une catégorie,
// un outil mis en avant) qu'elle n'avait pas.
import { radii } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** La taille de la tuile, en points : celle de la pastille d'icône d'une ligne (ListRow). */
const SIZE = 40

/** La seule teinte d'une tuile : le miel pâle, initiale à l'encre. */
export type TileVariant = 'cream'

type Props = {
  /** Le nom de l'outil (« Claude ») : la tuile en montre la première lettre. */
  name: string
  /**
   * Ancien choix de teinte (R3 : miel vif ou crème). Ignoré depuis R4 : toutes les tuiles sont en
   * miel pâle. Gardé le temps que ses appelants (le catalogue) le retirent.
   * @deprecated une seule teinte depuis R4 ; ne plus le passer.
   */
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
 * La teinte de la tuile d'un outil. En R3, elle se tirait de son identifiant (miel ou crème) ;
 * depuis R4, c'est la même pour tous. La fonction reste pour ses appelants (« Tous les outils », la
 * recherche), qui la passent à la tuile sans avoir à changer.
 */
export const tileVariantOf = (_slug: string): TileVariant => 'cream'

export function InitialTile({ name }: Props) {
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
        // Le couple de contraste : text sur honeySoft, de jour et de nuit (contrastPairs).
        backgroundColor: colors.honeySoft,
      }}
    >
      {/* maxScale 1 : l'initiale reste dans sa tuile quand le texte de l'appareil grandit. */}
      <Text variant="mono" weight={700} maxScale={1} selectable={false}>
        {initialOf(name)}
      </Text>
    </View>
  )
}
