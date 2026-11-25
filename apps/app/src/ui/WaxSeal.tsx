// Le sceau de cire (R19, planches R19-Sceaux et R19-Recolte, option a retenue par Louis) : un
// disque au bord de cire pressée, un anneau en creux, et une icône au centre. Deux matières : le
// miel pour une première fois (« Premier envol »), la crème pour un palier ou une catégorie
// (« 10 projets testés », « Cuisine explorée »). Deux tailles : 40 dans un avis de l'Activité, 60
// dans une tuile de « Mes sceaux » (ui/SealTile).
//
// Pour un lecteur d'écran : seul, c'est une image nommée (« Premier envol ») ; suivi d'une légende
// qui dit déjà son nom, il est décoratif (`label` vide) et rien n'est lu deux fois. L'icône, elle,
// n'est jamais lue : elle ne fait qu'illustrer le nom.
import { type ColorName, layout } from '@ruche/brand'
import type { SealMatter } from '@ruche/contracts'
import { View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { Icon, type IconName } from './Icon'
import { useTheme } from './theme/ThemeProvider'

/**
 * Le bord du disque, dans un carré de 64 × 64 : un cercle dont le rayon ondule, somme de trois
 * vagues de 7, 11 et 17 bosses (le dessin de la planche). Des vagues qui se mêlent, et pas des
 * dents : c'est ce qui donne l'air d'une cire pressée à la main plutôt que d'un engrenage. Calculé
 * une fois, au chargement du fichier : 128 points reliés par des segments.
 */
const DISC_PATH = (() => {
  const points: string[] = []
  const steps = 128
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const radius =
      28.6 +
      1.3 * Math.cos(7 * angle) +
      0.9 * Math.cos(11 * angle + 1.3) +
      0.5 * Math.cos(17 * angle + 0.4)
    const x = 32 + radius * Math.cos(angle)
    const y = 32 + radius * Math.sin(angle)
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `M${points.join(' L')}Z`
})()

/** Les couleurs d'une matière : le disque, son bord. L'icône et l'anneau sont bruns sur les deux. */
const matters: Record<SealMatter, { disc: ColorName; edge: ColorName }> = {
  // Le miel de la marque, bordé du miel appuyé ; l'icône brune y a son couple (onHoneyTile sur
  // honey, contrastPairs).
  honey: { disc: 'honey', edge: 'honeyPressed' },
  // La cire crème (`wax`, la même de jour et de nuit), bordée d'ambre pour se détacher du fond.
  cream: { disc: 'wax', edge: 'amber' },
}

export type WaxSealProps = {
  /** L'icône du sceau (Phosphor) : celle du contrat (`SEALS`), ou celle d'une catégorie. */
  icon: IconName
  /** Miel pour une première fois, crème pour un palier ou une catégorie (contrat, `SealMatter`). */
  matter: SealMatter
  /** 40 points dans un avis de l'Activité, 60 dans une tuile de « Mes sceaux » (`layout.seal`). */
  size: 'small' | 'regular'
  /**
   * Le nom lu du sceau (« Premier envol »). Vide quand une légende visible le dit déjà (une tuile
   * de « Mes sceaux ») : le sceau est alors décoratif, caché aux lecteurs d'écran.
   */
  label: string
}

export function WaxSeal({ icon, matter, size, label }: WaxSealProps) {
  const { colors } = useTheme()
  const side = layout.seal[size]
  const { disc, edge } = matters[matter]
  const named = label !== ''
  return (
    <View
      // Nommé : une seule image, qui porte le nom. Sans nom : caché, avec tout ce qu'il contient
      // (iOS : accessibilityElementsHidden ; Android : no-hide-descendants ; web : aria-hidden).
      accessible={named}
      accessibilityRole={named ? 'image' : undefined}
      accessibilityLabel={named ? label : undefined}
      accessibilityElementsHidden={!named}
      importantForAccessibility={named ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!named}
      style={{
        width: side,
        height: side,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <View style={{ position: 'absolute' }}>
        <Svg
          width={side}
          height={side}
          viewBox="0 0 64 64"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          <Path d={DISC_PATH} fill={colors[disc]} stroke={colors[edge]} strokeWidth={1} />
          {/* L'anneau en creux, que laisse le cachet : un trait brun à peine marqué. */}
          <Circle
            cx={32}
            cy={32}
            r={22}
            fill="none"
            stroke={colors.onHoneyTile}
            strokeOpacity={0.3}
            strokeWidth={1.4}
          />
        </Svg>
      </View>
      {/* L'icône dans sa propre vue : sur le web, une vue est « positionnée » (react-native-web)
          et se peint donc par-dessus le disque posé en absolu avant elle (comme ui/HiveBadge). */}
      <View>
        <Icon name={icon} size={Math.round(side * layout.seal.iconRatio)} color="onHoneyTile" />
      </View>
    </View>
  )
}
