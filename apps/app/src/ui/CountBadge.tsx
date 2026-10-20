// La pastille rouge d'un nombre de nouveautés, posée sur une icône (la cloche des notifications).
// Au-delà de `max`, elle écrit « 9+ » : un grand nombre n'apprend rien de plus, et la pastille
// garde sa petite taille. À zéro, rien du tout.
// Elle est cachée aux lecteurs d'écran : c'est le bouton qui la porte qui dit le nombre dans son
// nom (« Notifications, 3 nouvelles »), sinon il serait lu deux fois.
import { borders, radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  count: number
  /** Le plus grand nombre écrit tel quel ; au-delà, « max+ ». */
  max?: number
}

/** Ce que la pastille écrit : « 3 », ou « 9+ » au-delà de `max`. */
export const badgeText = (count: number, max = 9): string =>
  count > max ? `${max}+` : String(count)

// La taille d'une pastille d'un chiffre : un rond. Plus de chiffres l'allongent en gélule.
const SIZE = 20

export function CountBadge({ count, max = 9 }: Props) {
  const { colors } = useTheme()
  if (count <= 0) return null
  return (
    <View
      // aria-hidden : caché sur le web ; importantForAccessibility : caché sur Android ;
      // accessibilityElementsHidden : caché sur iOS.
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        minWidth: SIZE,
        minHeight: SIZE,
        paddingHorizontal: space.xs,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.badge,
        // Un liseré de la couleur du fond détache la pastille de l'icône qu'elle chevauche.
        borderWidth: borders.badge,
        borderColor: colors.background,
      }}
    >
      {/* Le chiffre grandit avec le réglage de taille, mais moins qu'un texte courant : la
          pastille reste une pastille. */}
      <Text variant="micro" weight={700} tone="onBadge" tabular maxScale={1.4}>
        {badgeText(count, max)}
      </Text>
    </View>
  )
}
