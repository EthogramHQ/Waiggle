// La pastille rouge d'un nombre de nouveautés, posée sur une icône (la cloche des notifications).
// Au-delà de `max`, elle écrit « 9+ » : un grand nombre n'apprend rien de plus, et la pastille
// garde sa petite taille. À zéro, rien du tout.
// Elle est cachée aux lecteurs d'écran : c'est le bouton qui la porte qui dit le nombre dans son
// nom (« Notifications, 3 nouvelles »), sinon il serait lu deux fois.
import { borders, radii, space, textStyles } from '@ruche/brand'
import { useState } from 'react'
import { type LayoutChangeEvent, Platform, View } from 'react-native'
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

/** La taille d'une pastille d'un chiffre : un rond. Plus de chiffres l'allongent en gélule. */
export const BADGE_SIZE = 20
const SIZE = BADGE_SIZE

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
        // Sa propre hauteur, même dans une rangée qui étire ses enfants.
        alignSelf: 'flex-start',
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
      <BadgeText>{badgeText(count, max)}</BadgeText>
    </View>
  )
}

/** L'agrandissement le plus fort du chiffre avec le réglage de taille de l'appareil. */
const BADGE_MAX_SCALE = 1.2
/** La plus grande hauteur du chiffre : sa hauteur de ligne, agrandie au plus de BADGE_MAX_SCALE. */
const BADGE_TEXT_CAP = textStyles.micro.lineHeight * BADGE_MAX_SCALE

type Size = { width: number; height: number }

/**
 * Le facteur qui ramène un chiffre de cette taille naturelle sous le plafond : 1 en dessous.
 */
export const badgeTextScale = (natural: Size | null): number =>
  natural && natural.height > BADGE_TEXT_CAP ? BADGE_TEXT_CAP / natural.height : 1

/**
 * Le chiffre grandit avec le réglage de taille, mais peu (×1,2 au plus) : la pastille reste une
 * pastille, de la même taille partout, et ne cache ni l'icône qu'elle accompagne ni ne sort de la
 * barre qui la porte.
 * - Sur téléphone, `maxScale` suffit.
 * - Sur le web, il n'existe pas (relecture de design de R3, 12 : à 200 %, la pastille de la
 *   cloche grandissait vers le haut jusqu'à 2 px du bord de l'écran). On mesure donc le chiffre à
 *   sa taille naturelle (`onLayout`, qui ignore la réduction : pas de boucle), puis on le réduit à
 *   l'œil (`transform: scale`) jusqu'au plafond ; la boîte qui l'entoure prend la taille réduite,
 *   si bien que la pastille garde ses proportions. Même façon que les initiales d'Avatar.
 */
function BadgeText({ children }: { children: string }) {
  const [natural, setNatural] = useState<Size | null>(null)
  const text = (
    <Text variant="micro" weight={700} tone="onBadge" tabular maxScale={BADGE_MAX_SCALE}>
      {children}
    </Text>
  )
  if (Platform.OS !== 'web') return text
  const scale = badgeTextScale(natural)
  const measure = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    // Le même objet quand rien ne change : pas de rendu de plus.
    setNatural((old) =>
      old && old.width === width && old.height === height ? old : { width, height },
    )
  }
  return (
    <View
      style={{
        // La place du chiffre réduit ; avant la première mesure, celle du chiffre tel quel.
        ...(natural ? { width: natural.width * scale, height: natural.height * scale } : null),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Plus large que sa boîte quand il est réduit : il en déborde également des deux côtés,
          puis la réduction (autour de son centre) le ramène dedans. */}
      <View onLayout={measure} style={{ transform: [{ scale }] }}>
        {text}
      </View>
    </View>
  )
}
