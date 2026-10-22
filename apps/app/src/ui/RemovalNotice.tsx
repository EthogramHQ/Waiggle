// Le bandeau d'un contenu retiré par la modération (tranche 6d), tel que son auteur le lit : un
// titre (« Retiré par la modération »), puis une phrase par ligne (qu'il est seul à le voir, après
// un signalement ou non, le fondement, l'explication, comment contester). Les phrases viennent de
// l'écran (reports/removal.ts) : le composant ne fait que les poser.
//
// Il sert en tête d'un projet, au-dessus d'une note du journal et au-dessus d'un commentaire.
// Ce n'est pas une alerte : le bandeau est là dès l'ouverture de la page, il se lit à son tour,
// sans interrompre le lecteur d'écran.
import { radii, space } from '@ruche/brand'
import { View } from 'react-native'
import { Icon } from './Icon'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** La taille de l'icône : les lignes s'alignent sur le titre, juste après elle. */
const ICON_SIZE = 20

/** Un bandeau de retrait : son titre, puis une phrase par ligne (CommentCard, NoteList le reçoivent). */
export type RemovedBanner = { title: string; lines: readonly string[] }

type Props = RemovedBanner & {
  /** compact : au-dessus d'un commentaire ou d'une note, un cadre plus serré. */
  compact?: boolean
}

export function RemovalNotice({ title, lines, compact = false }: Props) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.sm,
        padding: compact ? space.sm : space.md,
        borderRadius: radii.small,
        // Le fond miel pâle des informations (Notice « info ») : le texte normal s'y lit
        // (contrastPairs : text sur honeySoft).
        backgroundColor: colors.honeySoft,
      }}
    >
      {/* Le drapeau est décoratif : le titre dit tout. */}
      <View aria-hidden>
        <Icon name="flag" size={ICON_SIZE} tone="amber" />
      </View>
      {/* flex 1 et minWidth 0 : les lignes passent à la ligne au lieu de sortir du cadre, même à
          200 % de texte et sur un petit téléphone. */}
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Text variant="callout" weight={700}>
          {title}
        </Text>
        {lines.map((line, index) => (
          // Deux phrases ne sont jamais identiques, mais rien ne le garantit : leur rang les
          // distingue, et la liste ne change pas d'ordre.
          // biome-ignore lint/suspicious/noArrayIndexKey: une phrase n'a pas d'autre identité que sa place
          <Text key={index} variant="callout" breakAnywhere>
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}
