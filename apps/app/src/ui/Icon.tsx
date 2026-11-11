// Une icône Phosphor, dessinée en SVG (dessin vectoriel : net à toutes les tailles).
// Les icônes disponibles sont dans icons.generated.ts ; pour en ajouter une, voir scripts/icons.mts.
// Une icône seule est décorative et cachée aux lecteurs d'écran : c'est le bouton qui la porte
// qui doit avoir un nom (voir IconButton).
import type { ColorName } from '@ruche/brand'
import Svg, { Path } from 'react-native-svg'
import { type IconName, iconPaths } from './icons.generated'
import type { Tone } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type { IconName }

// Les mêmes rôles que pour le texte, plus le miel et l'ambre (icônes d'accent).
export type IconTone = Tone | 'honey' | 'amber'

/**
 * La petite icône d'une ligne d'informations (R7b) : l'issue d'un retour (`OutcomePill`), l'appareil
 * d'un retour (`MessageBubble`), le mégaphone d'un appel (`CallCard`), à côté d'un texte de légende.
 * Une seule valeur : ces trois lignes se lisent ensemble dans le coin des testeurs.
 */
export const SMALL_ICON = 15

const toneColor = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  accent: 'amberText',
  danger: 'dangerText',
  success: 'success',
  onHoney: 'onHoney',
  onDanger: 'onDanger',
  disabled: 'onHoneyDisabled',
  status: 'statusText',
  onBadge: 'onBadge',
  honey: 'honey',
  amber: 'amber',
} as const

type Props = {
  name: IconName
  size?: number
  tone?: IconTone
  /**
   * R7b : un rôle de couleur de la marque, à la place du ton, pour une icône qui a sa couleur à
   * elle (la coche verte d'un retour réglé, `settledText` ; l'issue d'un retour, `outcomeYesIcon`).
   * Le rôle choisi a son couple dans `contrastPairs`, contre le fond où l'icône se pose.
   */
  color?: ColorName
}

export function Icon({ name, size = 22, tone = 'default', color }: Props) {
  const { colors } = useTheme()
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={colors[color ?? toneColor[tone]]}
      // Caché aux lecteurs d'écran (iOS, Android, web) : il n'apporte rien de plus que son bouton.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {iconPaths[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  )
}
