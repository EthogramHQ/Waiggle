// La carte d'une note dans le fil (tranche 4b) : un projet suivi annonce du nouveau (« v2 : mode
// hors ligne »). Elle doit se reconnaître d'un coup d'œil sans voler la vedette aux projets : là où
// la carte d'un projet est une grande photo couverte d'un panneau de verre, celle d'une note est une
// carte blanche, avec la couverture du projet en petit, et le texte de la note au premier plan.
// Toute la carte est un lien vers le projet ; les lecteurs d'écran entendent son nom (« Note de Léa
// sur Mon agent de recettes »), puis, sur le web, le texte de la note (aria-describedby).
//
// Une note est du texte brut : il s'affiche tel quel, sans Markdown, et se coupe après quelques
// lignes (la page du projet la montre en entier).
import { borders, radii, space } from '@ruche/brand'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** Le nom du lien (« Note de Léa sur Mon agent de recettes »). */
  label: string
  /** Le titre du projet. */
  project: string
  author: { name: string; avatar: ImageSource | null }
  /** Le texte de la note, tel qu'écrit. */
  body: string
  /** Quand (« 14 oct. »). */
  when: string
  /** La couverture du projet ; sans elle, la lumière miel. */
  image?: CoverImage | null
  onPress: () => void
}

// La couverture, en bande basse : assez pour reconnaître le projet, pas assez pour se confondre
// avec une carte de projet. Sa hauteur ne change jamais, même à côté de cartes plus hautes.
const COVER_HEIGHT = 120
// Au-delà, le texte se coupe (avec « … ») : la carte garde une taille raisonnable dans le fil.
const BODY_LINES = 6

export function NoteCard({ label, project, author, body, when, image, onPress }: Props) {
  const { t } = useTranslation()
  const { colors, shadows } = useTheme()
  // useId : un identifiant unique et stable (le même au pré-rendu web et dans le navigateur), qui
  // relie le lien au texte qui le décrit.
  const bodyId = useId()
  return (
    <Pressed label={label} onPress={onPress} role="link" fill describedBy={bodyId}>
      <View
        style={{
          flexGrow: 1,
          padding: space.sm,
          gap: space.sm,
          backgroundColor: colors.surface,
          borderRadius: radii.tile,
          borderWidth: borders.hairline,
          borderColor: colors.groupBorder,
          boxShadow: shadows.soft,
        }}
      >
        {/* Rayon intérieur plus petit que celui de la carte, de l'épaisseur du bord blanc. */}
        <ProjectCover height={COVER_HEIGHT} radius="group" image={image ?? null} />
        {/* Dans une grille, la place gagnée va au texte (flexGrow) ; l'auteur reste en bas. */}
        <View
          style={{
            flexGrow: 1,
            justifyContent: 'space-between',
            paddingHorizontal: space.md,
            paddingBottom: space.md,
            gap: space.md,
          }}
        >
          <View style={{ gap: space.md }}>
            <View style={{ gap: space.xxs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                <Icon name="megaphone-simple" size={16} tone="amber" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="caption" weight={700} tone="accent">
                    {t('feed.noteKicker')}
                  </Text>
                </View>
              </View>
              <Text variant="headline" numberOfLines={2} breakAnywhere>
                {project}
              </Text>
            </View>
            {/* Le texte de la note, souligné d'un trait de miel à gauche, comme une citation. */}
            <View
              style={{
                borderLeftWidth: borders.quote,
                borderLeftColor: colors.honey,
                paddingLeft: space.md,
              }}
            >
              <Text nativeID={bodyId} numberOfLines={BODY_LINES} breakAnywhere>
                {body}
              </Text>
            </View>
          </View>
          {/* L'auteur, puis la date. Quand la place manque (texte agrandi, nom long), la date passe
              à la ligne et le nom se replie, au lieu d'être coupé. */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              columnGap: space.sm,
              rowGap: space.xxs,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                flexShrink: 1,
                flexBasis: 'auto',
                minWidth: 0,
              }}
            >
              <Avatar name={author.name} source={author.avatar} label={author.name} size={28} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text variant="callout" weight={700} breakAnywhere>
                  {author.name}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="muted">
              {when}
            </Text>
          </View>
        </View>
      </View>
    </Pressed>
  )
}
