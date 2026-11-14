// Le bandeau d'un contenu retiré par la modération (tranche 7a), tel que son auteur le lit : un
// titre (« Retiré par la modération »), puis une phrase par ligne (qu'il est seul à le voir, après
// un signalement ou non, le fondement, l'explication, comment contester). Les phrases viennent de
// l'écran (reports/removal.ts) : le composant ne fait que les poser.
//
// Il sert en tête d'un projet, au-dessus d'une note du journal et au-dessus d'un commentaire.
// Ce n'est pas une alerte : le bandeau est là dès l'ouverture de la page, il se lit à son tour,
// sans interrompre le lecteur d'écran.
//
// R9 (7d) : le bandeau est un groupe nommé par son titre (son texte se fondait avec celui qui le
// suit dans l'arbre lu), et, avec `contest`, il finit par « Pour contester : » suivi de notre
// adresse, écrite en entier et en lien qui ouvre la messagerie avec un objet tout prêt.
import { radii, space } from '@ruche/brand'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ContactLink } from './ContactLink'
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
  /**
   * « Pour contester », écrit par le bandeau lui-même, après toutes les phrases : l'adresse de
   * contact en entier (elle se lit et se recopie, même sans appli de messagerie), en lien
   * `mailto:` dont l'objet nomme la décision (J12). Absent : rien de plus ; `lines` ne doit alors
   * pas déjà contenir la phrase « Pour contester : … », qui serait dite deux fois.
   */
  contest?: { subject: string }
}

export function RemovalNotice({ title, lines, compact = false, contest }: Props) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  return (
    <View
      // Un groupe nommé par son titre, sans `accessible` : sur iOS, un conteneur `accessible`
      // devient un seul élément pour VoiceOver, qui n'atteindrait plus le lien qu'il contient.
      role="group"
      accessibilityLabel={title}
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
        {contest ? (
          // « Pour contester : » puis l'adresse, comme dans RemovedPart : une rangée qui passe à la
          // ligne (à 320 points ou à 200 %, l'adresse descend sous le début). Le lien garde sa zone
          // de 44 points, plus haute qu'une ligne : une marge négative la laisse déborder sur l'air
          // de la phrase voisine, pour que la ligne ne paraisse pas détachée des autres.
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: space.xs,
              marginVertical: -space.sm,
            }}
          >
            <Text variant="callout">{t(($) => $.removal.part.contestLead)}</Text>
            <View style={{ flexShrink: 1, maxWidth: '100%' }}>
              <ContactLink subject={contest.subject} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  )
}
