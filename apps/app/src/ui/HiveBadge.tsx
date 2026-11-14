// L'alvéole d'une ruche (R10, planches R10-Ruches, R10-Ruche, R10-Creer) : un hexagone de miel,
// pointe en haut, et au milieu l'icône que ses membres ont choisie (une maison, un café…). Elle se
// pose devant le nom d'une ruche, à trois tailles : 28 (la ligne compacte de « Tes ruches »), 44 (la
// ligne de l'onglet Ruches, l'invitation), 64 (l'en-tête de la page d'une ruche, l'aperçu).
//
// Pour un lecteur d'écran, c'est une image qui dit la ruche (« Ruche Famille ») : l'icône, elle,
// est décorative (on ne lit pas « Maison »), son sens ne sert qu'à qui choisit l'icône
// (HiveIconPicker). Une ruche dont la modération a retiré le nom se lit « Ruche sans nom ».
import { layout } from '@ruche/brand'
import type { HiveIcon } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Icon } from './Icon'
import { useTheme } from './theme/ThemeProvider'

/**
 * L'hexagone, pointe en haut, dans un carré de 24 × 24 : centré, de rayon 11 (du centre à un
 * sommet). Son trait, de la couleur du fond et aux angles arrondis (`strokeLinejoin`), adoucit les
 * coins comme sur les planches et l'amène juste au bord du carré.
 */
export const HEXAGON_PATH = 'M12 1 21.53 6.5V17.5L12 23 2.47 17.5V6.5Z'
/** L'épaisseur du trait qui arrondit les coins, dans le même repère de 24. */
export const HEXAGON_ROUNDING = 2

type HexagonProps = {
  /**
   * La hauteur de l'hexagone, en points ; sa largeur en découle (√3 / 2 de la hauteur). Sans
   * taille, il remplit sa boîte en gardant ses proportions : le plus grand hexagone qui y tient
   * (une alvéole de HiveIconPicker, dont la largeur se resserre sur un écran étroit).
   */
  size?: number
  /** Sa couleur de fond. */
  fill: string
}

/**
 * L'hexagone seul, sans nom ni icône, posé en fond de sa boîte : l'alvéole, et chaque choix de
 * HiveIconPicker. Caché aux lecteurs d'écran, comme une icône.
 */
export function Hexagon({ size, fill }: HexagonProps) {
  return (
    <Svg
      width={size ?? '100%'}
      height={size ?? '100%'}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <Path
        d={HEXAGON_PATH}
        fill={fill}
        stroke={fill}
        strokeWidth={HEXAGON_ROUNDING}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

type Props = {
  /** L'icône de la ruche, une des douze du contrat (`HIVE_ICONS`). */
  icon: HiveIcon
  /** Le nom de la ruche, ou null quand la modération l'a retiré (« Ruche sans nom »). */
  name: string | null
  /** La hauteur de l'alvéole, en points : 28, 44 ou 64 (`layout.hive`). */
  size: 28 | 44 | 64
}

export function HiveBadge({ icon, name, size }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Le nom lu : « Ruche Famille », ou « Ruche sans nom » (le texte entier, pas « Ruche » suivi
  // d'un nom vide).
  const label = name === null ? t(($) => $.hives.unnamed) : t(($) => $.hives.badge, { hive: name })
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      // Une boîte carrée, à la taille demandée : l'hexagone y tient en hauteur, centré, et les
      // lignes qui le posent devant un nom l'alignent comme une photo de la même taille.
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <View style={{ position: 'absolute' }}>
        {/* Le miel de la marque ; l'icône, brune, a son couple dans contrastPairs (onHoneyTile sur
            honey), de jour comme de nuit. */}
        <Hexagon size={size} fill={colors.honey} />
      </View>
      <Icon name={icon} size={Math.round(size * layout.hive.iconRatio)} color="onHoneyTile" />
    </View>
  )
}
