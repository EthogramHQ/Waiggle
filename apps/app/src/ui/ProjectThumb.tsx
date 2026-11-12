// La vignette d'un projet, avec un badge (tranche R6a, scénario « Supprimer », planche
// `R6-Supprimer`) : en tête de la fenêtre « Supprimer « Le ciel de ce soir » ? »
// (`Dialog.illustration`), la première photo du projet, petite et arrondie, et dans son coin bas droit
// un rond rouge avec une corbeille. Elle dit d'un coup d'œil « ce projet-ci va partir ».
//
// C'est un décor : le titre de la fenêtre nomme déjà le projet, et son message dit ce qui
// disparaît. Elle est donc cachée aux lecteurs d'écran (ni la photo ni la corbeille ne sont lues) et
// rien n'y est touchable. Sans photo, elle garde sa place et son badge, sur la lumière miel d'une
// couverture sans photo (`ProjectCover`).
import { borders, layout, radii, space } from '@ruche/brand'
import { Image, View } from 'react-native'
import { Icon } from './Icon'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La première photo du projet ; null : la lumière miel d'un projet sans photo. */
  image: CoverImage | null
  /**
   * Le badge du coin : la corbeille de la fenêtre de suppression. Sans badge (R8), la vignette
   * seule : celle d'une ligne d'Activité, qui montre de quel projet elle parle.
   */
  badge?: 'trash'
  /**
   * `row` (R8) : la petite vignette d'une ligne de liste (48 points, coins plus serrés) ; `dialog`
   * par défaut : celle d'une fenêtre (84 points).
   */
  size?: 'dialog' | 'row'
}

const { size: dialogSize, badge: badgeSize } = layout.thumb
/** La vignette d'une ligne : celle de la planche R8-Activite. */
const ROW_SIZE = 48

export function ProjectThumb({ image, badge, size: kind = 'dialog' }: Props) {
  const { colors } = useTheme()
  const size = kind === 'row' ? ROW_SIZE : dialogSize
  return (
    <View
      // Caché aux lecteurs d'écran, partout : `aria-hidden` (web et RNTL), et ses équivalents
      // d'iOS et d'Android. Rien n'y est touchable non plus : les touchers passent au travers.
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      // Rangée à gauche, comme l'image d'un état (charte : image, titre et boutons au même bord).
      style={{ width: size, height: size, alignSelf: 'flex-start' }}
    >
      {kind === 'row' && image?.source ? (
        // La vignette d'une ligne (48 points) : l'image de React Native, comme la photo d'un membre
        // (`Avatar`), qui reçoit la source telle quelle (adresse et en-tête de session). Pas de
        // résumé flou ici : à cette taille, le fond de miel qui attend suffit.
        <Image
          accessibilityLabel={image.label}
          source={image.source}
          resizeMode="cover"
          style={{
            width: size,
            height: size,
            borderRadius: radii.code,
            backgroundColor: colors.honeySoft,
          }}
        />
      ) : (
        // La photo, ou la lumière miel sans elle : la couverture d'un projet, en petit.
        <ProjectCover height={size} radius={kind === 'row' ? 'code' : 'small'} image={image} />
      )}
      {/* Le badge, à cheval sur le coin bas droit ; le liseré couleur du fond le détache de la photo
          (le même que la pastille des nouveautés sur une icône). */}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            right: -space.sm,
            bottom: -space.sm,
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            borderWidth: borders.badge,
            borderColor: colors.background,
            backgroundColor: colors.danger,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badge === 'trash' ? <Icon name="trash" size={16} tone="onDanger" /> : null}
        </View>
      ) : null}
    </View>
  )
}
