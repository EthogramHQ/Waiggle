// La carte immersive d'un projet, celle du fil : la couverture en plein cadre et, en bas, un panneau
// de verre avec l'auteur, le titre, le pitch, le bouton « Tester » et le statut.
// Elle ne connaît pas l'API : on lui donne des textes déjà prêts, ce qui permet de l'utiliser aussi
// comme aperçu pendant qu'on écrit un projet. Dans une liste, toute la carte est un lien (`onPress`).
import { space } from '@ruche/brand'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import { Button } from './Button'
import type { ImageSource } from './image'
import { Pressed } from './Pressed'
import { type CoverImage, ProjectCover } from './ProjectCover'
import { StatusPill } from './StatusPill'
import { Surface } from './Surface'
import { Text } from './Text'

type Props = {
  title: string
  pitch: string
  author: { name: string; avatar: ImageSource | null }
  /** La photo de couverture ; sans elle, la lumière miel. */
  image?: CoverImage | null
  /** Quand (« à l'instant », « il y a 3 jours »). */
  when: string
  status: { label: string; strong: boolean }
  /** Le bouton « Tester », s'il y a une démo. Pas dans une carte-lien : un bouton dans un lien
   *  serait ambigu pour les lecteurs d'écran. */
  tryIt?: { label: string; onPress: () => void }
  /** Une pastille de plus, à côté du statut (« Privé »). */
  badge?: string
  /** Toute la carte devient un lien vers le projet ; son nom est le titre du projet. */
  onPress?: () => void
  height?: number
}

export function ProjectCard({
  title,
  pitch,
  author,
  image,
  when,
  status,
  tryIt,
  badge,
  onPress,
  height = 476,
}: Props) {
  const card = (
    <ProjectCover height={height} image={image ?? null}>
      <View style={{ position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm }}>
        <Surface variant="panel" padding="lg" gap="sm">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Avatar name={author.name} source={author.avatar} label={author.name} size={28} />
            <View style={{ flex: 1 }}>
              <Text variant="callout" weight={700} numberOfLines={1}>
                {author.name}
              </Text>
            </View>
            <Text variant="caption" tone="muted">
              {when}
            </Text>
          </View>
          <Text variant="title3" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="callout" tone="secondary" numberOfLines={2}>
            {pitch}
          </Text>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}
          >
            {tryIt && !onPress ? (
              <Button
                label={tryIt.label}
                icon="arrow-up-right"
                size="compact"
                onPress={tryIt.onPress}
              />
            ) : null}
            <StatusPill label={status.label} strong={status.strong} />
            {badge ? <StatusPill label={badge} /> : null}
          </View>
        </Surface>
      </View>
    </ProjectCover>
  )
  if (!onPress) return card
  return (
    <Pressed label={title} onPress={onPress} role="link">
      {card}
    </Pressed>
  )
}
