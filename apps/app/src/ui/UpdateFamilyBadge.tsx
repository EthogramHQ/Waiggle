// La pastille d'une famille de mise à jour (R7a, scénario « Publier une mise à jour ») : un petit
// rond coloré, avec l'icône de sa famille, posé devant chaque ligne de « Ce qui a changé ».
// « Nouveau » : une étincelle sur l'ambre ; « Réparé » : une clé sur le vert ; « Plus joli » : une
// palette sur une encre discrète. On la retrouve dans la feuille « Nouvelle mise à jour », dans la
// frise des mises à jour et sur la carte du fil.
//
// Elle est décorative : cachée aux lecteurs d'écran, car lue seule elle ne dirait que sa couleur.
// Le nom de la famille (« Nouveau : … ») est un texte posé à côté par le composant qui la montre
// (relecture du plan, interface B4). Dans la feuille, c'est ce composant parent qui en fait un
// bouton nommé « Famille : Nouveau » (44 points) : la pastille, elle, ne se touche pas.
import type { UpdateFamily } from '@ruche/contracts'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { type IconName, iconPaths } from './icons.generated'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  family: UpdateFamily
  /**
   * regular (par défaut) : devant une ligne de la frise ou de la feuille ; small : sur la carte du
   * fil, à la hauteur d'une ligne de texte courant.
   */
  size?: 'small' | 'regular'
}

/**
 * Ce que chaque famille dessine : son icône et ses deux rôles de couleur (packages/brand,
 * `family<X>Surface` pour le rond, `family<X>Icon` pour l'icône, au moins 3:1 sur lui).
 * `as const` : TypeScript garde les noms exacts des rôles, que `colors[...]` vérifie.
 */
const looks = {
  new: { icon: 'sparkle', surface: 'familyNewSurface', fill: 'familyNewIcon' },
  fixed: { icon: 'wrench', surface: 'familyFixedSurface', fill: 'familyFixedIcon' },
  polish: { icon: 'palette', surface: 'familyPolishSurface', fill: 'familyPolishIcon' },
} as const satisfies Record<UpdateFamily, { icon: IconName; surface: string; fill: string }>

/** Le diamètre du rond et la taille de son icône, en points. */
const sizes = {
  regular: { disc: 28, icon: 16 },
  small: { disc: 22, icon: 13 },
} as const

export function UpdateFamilyBadge({ family, size = 'regular' }: Props) {
  const { colors } = useTheme()
  const look = looks[family]
  const { disc, icon } = sizes[size]
  return (
    <View
      // Cachée aux lecteurs d'écran, sur iOS (accessibilityElementsHidden), Android
      // (importantForAccessibility) et le web (aria-hidden) : le nom de la famille est à côté.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        width: disc,
        height: disc,
        // Un rond : un rayon de la moitié du diamètre.
        borderRadius: disc / 2,
        backgroundColor: colors[look.surface],
        alignItems: 'center',
        justifyContent: 'center',
        // Jamais écrasée par un texte long à côté d'elle, dans une rangée (piège de code-appli.md).
        flexShrink: 0,
      }}
    >
      {/* Le dessin de l'icône, comme dans Icon, mais d'une couleur propre à la famille : les tons
          d'Icon sont ceux du texte, et la famille a ses propres rôles. */}
      <Svg width={icon} height={icon} viewBox="0 0 256 256" fill={colors[look.fill]}>
        {iconPaths[look.icon].map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    </View>
  )
}
