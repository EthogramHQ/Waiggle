// La carte d'une note dans le fil (tranche 4b, verre de R4) : un projet suivi annonce du nouveau
// (« v2 : mode hors ligne »). Elle doit se reconnaître d'un coup d'œil sans voler la vedette aux
// projets : là où la carte d'un projet est une grande photo couverte d'un panneau de verre, celle
// d'une note est tout entière ce même verre (le panneau `panel` de `Surface`), posé sur la lumière
// du fil, avec la couverture du projet en petit, et le texte de la note au premier plan.
// Toute la carte est un lien vers le projet ; les lecteurs d'écran entendent son nom (« Note de Léa
// sur Mon agent de recettes »), puis, sur le web, sa description (aria-describedby) : le texte de
// la note, puis sa date complète (« 20 octobre à 12:00 »).
//
// Une note est du texte brut : il s'affiche tel quel, sans Markdown, et se coupe après quelques
// lignes (la page du projet la montre en entier).
import { borders, space } from '@ruche/brand'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { Surface } from './Surface'
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
  /**
   * Quand : une date relative (`<RelativeTime date={…} tone="secondary" />`, « il y a 2 h », lue en
   * entier), ou un texte déjà écrit (« 14 oct. »). Sur le web, `RelativeTime` est une vue : elle se
   * pose ici, à côté de l'auteur, jamais dans un texte.
   */
  when: ReactNode
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
  const { colors } = useTheme()
  // useId : un identifiant unique et stable (le même au pré-rendu web et dans le navigateur), qui
  // relie le lien aux textes qui le décrivent : la note, puis sa date.
  const bodyId = useId()
  const dateId = useId()
  return (
    // Pas de `fill` : dans une rangée de la grille, la carte garde sa propre hauteur, en haut de sa
    // case, au lieu de s'étirer à celle des cartes de projet voisines (à côté d'une grande photo,
    // ~200 points de vide s'ouvraient entre le texte et l'auteur, relecture du 22/10/2026).
    // radius : l'anneau de focus suit le rayon du verre, celui des cartes du fil.
    <Pressed
      label={label}
      onPress={onPress}
      role="link"
      radius="sheet"
      describedBy={`${bodyId} ${dateId}`}
    >
      {/* Le verre des cartes de projet, au rayon des cartes du fil, avec l'ombre d'une carte. */}
      <Surface variant="panel" radius="sheet" padding="sm" gap="sm" shadow="card">
        {/* Rayon intérieur plus petit que celui du verre, de l'épaisseur de son bord (8 points) :
            34 − 8 = 26, le rayon « panel ». */}
        <ProjectCover height={COVER_HEIGHT} radius="panel" image={image ?? null} />
        {/* Le texte, puis l'auteur juste dessous. */}
        <View
          style={{
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
                    {t(($) => $.feed.noteKicker)}
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
            {/* La vue qui porte l'identifiant de la date : sur le web, le lien la lit comme sa
                description, après la note. Sur le verre posé sur la lumière, une légende passe en
                textSecondary (`textMuted` n'est mesuré que sur la page, voir Surface). */}
            <View nativeID={dateId}>
              {typeof when === 'string' ? (
                <Text variant="caption" tone="secondary">
                  {when}
                </Text>
              ) : (
                when
              )}
            </View>
          </View>
        </View>
      </Surface>
    </Pressed>
  )
}
