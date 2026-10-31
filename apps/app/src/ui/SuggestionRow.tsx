// Une ligne de « Proches à suivre » (R4, planche R4-Fil-Premier) : la photo et le nom d'un membre
// qui a publié récemment, la vignette et le titre de son dernier projet, « Suivre » et « × ».
// Quatre gestes séparés, jamais l'un dans l'autre (décision de Louis du 31/10/2026) :
// - le nom ouvre la page du membre (un lien) ; la photo aussi, mais elle double le nom : elle est
//   cachée aux lecteurs d'écran et hors du parcours de Tab, pour qu'on n'entende pas deux fois le
//   même lien ;
// - la vignette et le titre ouvrent le projet (un lien nommé par le titre) ;
// - « Suivre » est l'interrupteur de FollowButton (« Suivre Léa », puis « Tu suis Léa ») ;
// - « × » ne suggère plus ce membre (le nom lu le dit : « Ne plus suggérer Léa »).
// Aucune preuve sociale (ni « suivi par », ni nombre d'abonnés : relecture juridique jur-J5).
//
// Pourquoi pas `ListRow` (relecture du plan, ui) : une ligne de `ListRow` est un seul geste (tout
// est dans son bouton) ou aucun ; ici, il en faut quatre, côte à côte. Et sa rangée ne passe pas à
// la ligne : à 200 % de texte sur 320 points, « Suivre » et « × » ne laisseraient plus de place au
// nom. La ligne reprend donc le dessin de `ListRow` (mêmes marges, même hauteur minimale) et se
// pose dans un `ListGroup` (voir SuggestionList), mais dessine sa propre rangée, qui se replie.
//
// La ligne ne garde pas l'état « suivi » : l'écran le donne (`followed`) et le change dans
// `onFollow`, comme pour FollowButton.
import { layout, radii, space } from '@ruche/brand'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { Avatar } from './Avatar'
import { FollowButton } from './FollowButton'
import { IconButton } from './IconButton'
import type { ImageSource } from './image'
import { enterActivates } from './keyboard'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { useTapGuard } from './tapGuard'
import { useTheme } from './theme/ThemeProvider'

/** La taille de la photo du membre, celle des pastilles de `ListRow`. */
const AVATAR_SIZE = 40
/** La vignette du projet, devant son titre : à la hauteur d'une ligne de texte. */
const THUMBNAIL_SIZE = 20
/**
 * La place gardée au nom et au titre avant que « Suivre » passe dessous : un nom de deux mots y
 * tient sur un téléphone de 390 points, et à texte agrandi, « Suivre » descend plutôt que de
 * réduire le nom à une lettre par ligne.
 */
const NAME_BASIS = 88

type Props = {
  /** Le nom affiché du membre (« Léa Martin »). */
  name: string
  /** Sa photo ; sans photo, ses initiales. */
  avatar: ImageSource | null
  /** Son dernier projet publié : son titre, et sa photo (sans photo, la lumière miel). */
  project: { title: string; image: CoverImage | null }
  /** Vrai quand le membre connecté le suit déjà (l'écran le sait, la ligne le montre). */
  followed: boolean
  /**
   * « Suivre » à sa place mais inactif : un compte suspendu ne suit plus personne de nouveau
   * (comme la pastille d'Explorer, R3). Le bouton ne disparaît pas sous le doigt.
   */
  followDisabled?: boolean
  onFollow: () => void
  onOpenMember: () => void
  onOpenProject: () => void
  onDismiss: () => void
  /**
   * Pour que la liste pose le focus du clavier sur le « × » de cette ligne quand celui de la ligne
   * d'au-dessus disparaît avec elle (SuggestionList).
   */
  dismissRef?: Ref<View>
}

export function SuggestionRow({
  name,
  avatar,
  project,
  followed,
  followDisabled = false,
  onFollow,
  onOpenMember,
  onOpenProject,
  onDismiss,
  dismissRef,
}: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  // Une seule garde pour les gestes de la ligne (TAP_GUARD_MS, celle des cartes) : la seconde tape
  // d'une double tape n'ouvre pas deux pages, et ne défait pas l'abonnement qu'on vient de prendre.
  const guard = useTapGuard()
  const openMember = guard(onOpenMember)
  const openProject = guard(onOpenProject)
  const { title } = project

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        // Un écart serré : sur un téléphone de 390 points, le nom, « Suivre » et « × » tiennent
        // encore sur une rangée.
        gap: space.sm,
        // La marge de `ListRow` à gauche ; à droite, le rond du « × » porte déjà de l'air.
        paddingLeft: space.lg,
        paddingRight: space.sm,
        paddingVertical: space.xs,
      }}
    >
      {/* La photo : un raccourci vers la page du membre, au doigt et à la souris. Elle double le
          lien du nom : cachée aux lecteurs d'écran (iOS, Android, web) et sortie du parcours de
          Tab (tabIndex -1 ; sur le web, `focusable` seul ne suffit pas). */}
      <Pressable
        onPress={openMember}
        focusable={false}
        {...{ tabIndex: -1 }}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: layout.touchTarget,
          height: layout.touchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Avatar name={name} source={avatar} label="" size={AVATAR_SIZE} />
      </Pressable>

      {/* Le milieu se replie : à texte agrandi ou sur un écran étroit, « Suivre » passe sous le nom
          au lieu de l'écraser. flexBasis réelle et flexGrow (pas flex: 1, dont la base nulle
          empêcherait le repli) ; minWidth: 0 laisse la rangée descendre sous la largeur du texte. */}
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.md,
        }}
      >
        {/* NAME_BASIS : sous cette largeur pour le nom, « Suivre » passe à la ligne. */}
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: NAME_BASIS, minWidth: 0 }}>
          {/* Deux liens l'un sur l'autre, de toute la largeur : 36 points de haut chacun (la
              hauteur d'un petit bouton), pour que la ligne garde la hauteur de la planche. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={name}
            {...enterActivates(openMember)}
            onPress={openMember}
            style={({ pressed }) => ({
              minHeight: layout.controlHeight.small,
              justifyContent: 'flex-end',
              borderRadius: radii.code,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text weight={600}>{name}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={title}
            {...enterActivates(openProject)}
            onPress={openProject}
            style={({ pressed }) => ({
              minHeight: layout.controlHeight.small,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space.sm,
              paddingTop: space.xxs,
              borderRadius: radii.code,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            {/* La vignette : décorative (le nom du lien est le titre), cachée aux lecteurs d'écran.
                Elle reste à la taille d'une ligne de texte, même quand le titre en prend deux. */}
            <View
              aria-hidden
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: THUMBNAIL_SIZE,
                marginTop: space.xxs,
                flexShrink: 0,
                borderRadius: radii.mark,
                backgroundColor: colors.honeySoft,
              }}
            >
              <ProjectCover height={THUMBNAIL_SIZE} radius="mark" image={project.image} />
            </View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text variant="callout" tone="muted" numberOfLines={2}>
                {title}
              </Text>
            </View>
          </Pressable>
        </View>
        <FollowButton
          followed={followed}
          onPress={guard(onFollow)}
          label={t(($) => (followed ? $.follow.memberFollowing : $.follow.member), { name })}
          text={t(($) => (followed ? $.suggestions.following : $.follow.follow))}
          // En blanc : sur le premier lancement, l'action miel de l'écran est « Publier ».
          prominent={false}
          disabled={followDisabled}
        />
      </View>

      <View style={{ flexShrink: 0 }}>
        <IconButton
          icon="x"
          variant="plain"
          label={t(($) => $.suggestions.dismiss, { name })}
          onPress={guard(onDismiss)}
          ref={dismissRef}
        />
      </View>
    </View>
  )
}
