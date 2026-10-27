// L'en-tête de la page d'un membre : son avatar, son nom et son pseudo, sa bio et ses outils
// favoris, chacun menant à la page de son étiquette.
import { readableWidth } from '@ruche/brand'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Avatar } from './Avatar'
import type { ImageSource } from './image'
import { Stack } from './Stack'
import { Tag } from './Tag'
import { Text } from './Text'

type Props = {
  name: string
  /** Son pseudo, déjà mis en forme par l'écran (« @lea »), affiché sous le nom. */
  handle?: string
  avatar: ImageSource | null
  bio: string
  /** Le titre de la liste des outils (« Outils favoris »). */
  toolsTitle: string
  /**
   * Les outils ; sans `onPress`, une simple pastille (le profil d'un compte suspendu, tranche 7c,
   * où seuls les noms des outils sont connus, pas leur étiquette).
   */
  tools: { label: string; onPress?: (() => void) | undefined }[]
  /** Un bouton sous l'en-tête (« Modifier mon profil », sur sa propre page). */
  action?: ReactNode
}

export function MemberHeader({ name, handle, avatar, bio, toolsTitle, tools, action }: Props) {
  return (
    <Stack gap="lg" align="center">
      <Avatar name={name} source={avatar} label={name} size={96} />
      {/* align="stretch" : le nom et la bio prennent toute la largeur et se replient, même un nom
          très long sans espace. */}
      <Stack gap="sm" align="stretch">
        {/* Le pseudo colle au nom (écart minimal) : il le précise, comme un second nom. */}
        <Stack gap="xxs" align="stretch">
          {/* Le nom du membre est le titre de sa page (niveau 1). */}
          <Text variant="title1" align="center" heading={1} breakAnywhere>
            {name}
          </Text>
          {/* En discret (gris, plus petit) : le nom reste ce qu'on lit d'abord. Un pseudo n'a
              pas d'espace : breakAnywhere le coupe s'il dépasse, à texte agrandi. */}
          {handle ? (
            <Text variant="callout" tone="muted" align="center" breakAnywhere selectable>
              {handle}
            </Text>
          ) : null}
        </Stack>
        {/* La bio garde une longueur de ligne confortable (readableWidth), centrée sous le nom. */}
        {bio ? (
          <View style={{ maxWidth: readableWidth, alignSelf: 'center' }}>
            <Text tone="secondary" align="center">
              {bio}
            </Text>
          </View>
        ) : null}
      </Stack>
      {tools.length > 0 ? (
        <Stack gap="sm" align="center">
          <Text variant="caption" weight={600} tone="muted">
            {toolsTitle}
          </Text>
          <Stack direction="row" gap="sm" wrap justify="center">
            {tools.map((tool) => (
              <Tag
                key={tool.label}
                label={tool.label}
                {...(tool.onPress ? { onPress: tool.onPress } : null)}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}
      {action}
    </Stack>
  )
}
