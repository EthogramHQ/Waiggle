// L'en-tête de la page d'un membre : son avatar, son nom, sa bio et ses outils favoris, chacun
// menant à la page de son étiquette.
import type { ReactNode } from 'react'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import { Stack } from './Stack'
import { Tag } from './Tag'
import { Text } from './Text'

type Props = {
  name: string
  avatar: ImageSource | null
  bio: string
  /** Le titre de la liste des outils (« Outils favoris »). */
  toolsTitle: string
  tools: { label: string; onPress: () => void }[]
  /** Un bouton sous l'en-tête (« Modifier mon profil », sur sa propre page). */
  action?: ReactNode
}

export function MemberHeader({ name, avatar, bio, toolsTitle, tools, action }: Props) {
  return (
    <Stack gap="lg" align="center">
      <Avatar name={name} source={avatar} label={name} size={96} />
      <Stack gap="sm" align="center">
        <Text variant="title1" align="center" accessibilityRole="header">
          {name}
        </Text>
        {bio ? (
          <Text tone="secondary" align="center">
            {bio}
          </Text>
        ) : null}
      </Stack>
      {tools.length > 0 ? (
        <Stack gap="sm" align="center">
          <Text variant="caption" weight={600} tone="muted">
            {toolsTitle}
          </Text>
          <Stack direction="row" gap="sm" wrap justify="center">
            {tools.map((tool) => (
              <Tag key={tool.label} label={tool.label} onPress={tool.onPress} />
            ))}
          </Stack>
        </Stack>
      ) : null}
      {action}
    </Stack>
  )
}
