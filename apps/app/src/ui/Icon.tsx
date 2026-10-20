// Une icône Phosphor, dessinée en SVG (dessin vectoriel : net à toutes les tailles).
// Les icônes disponibles sont dans icons.generated.ts ; pour en ajouter une, voir scripts/icons.mts.
// Une icône seule est décorative et cachée aux lecteurs d'écran : c'est le bouton qui la porte
// qui doit avoir un nom (voir IconButton).
import Svg, { Path } from 'react-native-svg'
import { type IconName, iconPaths } from './icons.generated'
import type { Tone } from './Text'
import { useTheme } from './theme/ThemeProvider'

export type { IconName }

// Les mêmes rôles que pour le texte, plus le miel et l'ambre (icônes d'accent).
export type IconTone = Tone | 'honey' | 'amber'

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

type Props = { name: IconName; size?: number; tone?: IconTone }

export function Icon({ name, size = 22, tone = 'default' }: Props) {
  const { colors } = useTheme()
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill={colors[toneColor[tone]]}
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
