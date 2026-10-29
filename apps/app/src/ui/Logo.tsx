// Le logo de l'appli : l'abeille dont le vol écrit le « w ». Dessin vectoriel (SVG), net à toutes
// les tailles, tiré de logo.generated.ts (fabriqué par scripts/logo.mts). Ce fichier ne garde que
// les couleurs, par rôle : de jour, une encre sur la Cire ; de nuit, une crème sur la Nuit.
// - `full` : le « w » et l'abeille (l'accueil, la barre, les écrans de marque) ;
// - `bee` : l'abeille seule, pour les petites tailles (une icône, le favicon) ;
// - `tinted` : le logo entier d'une seule couleur (le miel en transparence, les ailes ajourées),
//   pour un fond qui n'est ni la Cire ni la Nuit.
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import { bee, beeViewBox, trail, trailWidth, viewBox } from './logo.generated'
import { useTheme } from './theme/ThemeProvider'

export type LogoVariant = 'full' | 'bee' | 'tinted'

type Props = {
  variant?: LogoVariant
  /** La hauteur du logo, en points ; la largeur suit ses proportions. */
  size?: number
  /**
   * Caché aux lecteurs d'écran, quand le nom de l'appli est déjà écrit à côté (le logo devant le
   * mot, dans Wordmark) : sinon il serait lu deux fois.
   */
  decorative?: boolean
}

// L'opacité du miel dans la version d'une seule couleur : assez pour que le ventre se distingue du
// contour, assez peu pour que les anneaux restent lisibles.
const tintedHoneyOpacity = 0.45

/** Les proportions d'un cadre SVG « x y largeur hauteur ». */
const aspect = (box: string) => {
  const [, , width, height] = box.split(' ').map(Number)
  return (width ?? 1) / (height ?? 1)
}

export function Logo({ variant = 'full', size = 48, decorative = false }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const box = variant === 'bee' ? beeViewBox : viewBox
  const tinted = variant === 'tinted'
  const ink = colors.text
  return (
    <View
      // Le dessin est une image pour les lecteurs d'écran : un seul élément, avec un nom. Décoratif,
      // il garde son rôle et son nom (un test le retrouve), mais il est caché aux lecteurs d'écran.
      accessible
      role="img"
      accessibilityLabel={t(($) => $.brand.logoAlt)}
      {...(decorative
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
            'aria-hidden': true,
          }
        : null)}
    >
      <Svg
        width={size * aspect(box)}
        height={size}
        viewBox={box}
        // Le dessin lui-même est muet : c'est la vue qui l'entoure qui porte le nom.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {variant === 'bee' ? null : (
          // Le « w » passe sous l'abeille : son bout arrondi rentre sous le contour du ventre.
          <Path
            d={trail}
            fill="none"
            stroke={ink}
            strokeWidth={trailWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <G>
          {/* Le miel et les ailes d'abord : ils débordent un peu sous l'encre, sans jour entre les
              couches. Dans la version teintée, les ailes ne sont pas peintes (on voit le fond). */}
          <Path
            d={bee.honey}
            fill={tinted ? ink : colors.honey}
            opacity={tinted ? tintedHoneyOpacity : 1}
          />
          {tinted ? null : <Path d={bee.wing} fill={colors.surface} />}
          <Path d={bee.ink} fill={ink} />
        </G>
      </Svg>
    </View>
  )
}
