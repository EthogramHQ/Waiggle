// La vignette d'un projet, avec un badge (tranche R6a, scénario « Supprimer », planche
// `R6-Supprimer`) : en tête de la fenêtre « Supprimer « Le ciel de ce soir » ? »
// (`Dialog.illustration`), la première photo du projet, petite et arrondie, et dans son coin bas droit
// un rond rouge avec une corbeille. Elle dit d'un coup d'œil « ce projet-ci va partir ».
//
// C'est un décor : le titre de la fenêtre nomme déjà le projet, et son message dit ce qui
// disparaît. Elle est donc cachée aux lecteurs d'écran (ni la photo ni la corbeille ne sont lues) et
// rien n'y est touchable. Sans photo, elle garde sa place et son badge, sur la lumière miel d'une
// couverture sans photo (`ProjectCover`).
import { borders, layout, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon } from './Icon'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La première photo du projet ; null : la lumière miel d'un projet sans photo. */
  image: CoverImage | null
  /** Le badge du coin : la corbeille de la fenêtre de suppression (le seul pour l'instant). */
  badge: 'trash'
}

const { size, badge: badgeSize } = layout.thumb

export function ProjectThumb({ image, badge }: Props) {
  const { colors } = useTheme()
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
      {/* La photo, ou la lumière miel sans elle : la couverture d'un projet, en petit. */}
      <ProjectCover height={size} radius="small" image={image} />
      {/* Le badge, à cheval sur le coin bas droit ; le liseré couleur du fond le détache de la photo
          (le même que la pastille des nouveautés sur une icône). */}
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
    </View>
  )
}
