// Les réactions à son propre projet (R5a, planche `R5a-Auteur`) : l'auteur ne réagit pas à son
// projet. À la place de la capsule, il lit chaque réaction (icône, nom, nombre, « 0 » compris) sous
// le titre « Les réactions à ton projet », puis la légende « Des nombres seulement : l'appli ne
// montre à personne qui a réagi. » (relecture juridique jur-2). Jamais qui a réagi : seulement
// combien. Tant que tout est à zéro, une seule phrase calme, « Pas encore de réaction », au lieu de
// cinq zéros (jur-14, décision de Louis du 1/11/2026) ; les cinq pastilles reviennent dès la
// première réaction.
//
// Il remplace aussi la `ReactionBar` en lecture seule d'un compte suspendu qui n'a aucune réaction
// à retirer (`viewer="suspended"`, relecture ui-3) : les nombres seuls, sous la légende « Les
// réactions à ce projet », comme avant R5a. (Avec une réaction posée, le suspendu garde la capsule,
// pour pouvoir la retirer.)
//
// Aucun bouton : rien n'invite à toucher. Pour les lecteurs d'écran, une liste nommée par son titre,
// dont chaque pastille est lue d'un seul tenant (« Waggle !, 21 »). Les pastilles passent à la ligne
// quand la place manque (téléphone étroit, texte agrandi).
import { radii, space } from '@ruche/brand'
import type { ReactionKind } from '@ruche/contracts'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { ReactionIcon } from './ReactionCapsule'
import { Text } from './Text'
import { useTheme } from './theme/ThemeProvider'

/** Une réaction telle que la page la donne : son type et combien de membres l'ont posée. */
export type OwnReaction = { kind: ReactionKind; count: number }

type Props = {
  reactions: OwnReaction[]
  /**
   * Qui regarde : l'auteur (par défaut), ou un compte suspendu sans réaction à retirer, qui lit les
   * nombres sans le titre de l'auteur ni sa légende.
   */
  viewer?: 'author' | 'suspended'
}

/** La taille des icônes des pastilles, en points. */
const ICON_SIZE = 18

export function OwnReactions({ reactions, viewer = 'author' }: Props) {
  const { t } = useTranslation()
  const author = viewer === 'author'
  const title = author ? t(($) => $.project.reactions.own) : t(($) => $.project.reactions.readOnly)
  // Tout à zéro, pour l'auteur : la phrase à la place des cinq zéros. Le compte suspendu voit les
  // nombres tels quels, comme avant.
  const none = author && reactions.every((reaction) => reaction.count === 0)

  return (
    <View style={styles.block}>
      {/* L'auteur : un titre de section (niveau 2, comme « La recette » ou « Le prompt de départ »).
          Le compte suspendu : la légende d'avant, en petit. */}
      {author ? (
        <Text variant="headline" heading={2}>
          {title}
        </Text>
      ) : (
        <Text variant="caption" weight={600} tone="muted">
          {title}
        </Text>
      )}
      {none ? (
        <Text tone="secondary">{t(($) => $.project.reactions.ownNone)}</Text>
      ) : (
        // role « list » : une liste de nombres, annoncée comme telle, nommée par le titre. Pas
        // d'`accessible` sur la liste : sur iOS, il regrouperait les pastilles en un seul élément.
        <View role="list" accessibilityLabel={title} style={styles.list}>
          {reactions.map((reaction) => (
            <Pill key={reaction.kind} reaction={reaction} />
          ))}
        </View>
      )}
      {author ? (
        <Text variant="caption" tone="muted">
          {t(($) => $.project.reactions.ownCaption)}
        </Text>
      ) : null}
    </View>
  )
}

/** Une réaction : l'icône, le nom et le nombre sur une pastille grise, lus d'un seul tenant. */
function Pill({ reaction }: { reaction: OwnReaction }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const name = t(($) => $.project.reactions[reaction.kind])
  const { count } = reaction
  return (
    <View
      // accessible : sur téléphone, la pastille est lue d'un seul tenant ; sur le web, le rôle et le
      // nom suffisent. Le nom reprend ce qu'on voit (« Inspirant, 0 »).
      accessible
      role="listitem"
      accessibilityLabel={t(($) => $.project.reactions.label, { name, count })}
      style={[styles.pill, { backgroundColor: colors.surfaceGrouped }]}
    >
      <ReactionIcon kind={reaction.kind} size={ICON_SIZE} />
      <Text variant="callout" weight={600} selectable={false}>
        {name}
      </Text>
      {/* tabular : des chiffres de même largeur, comme dans la capsule. */}
      <Text variant="callout" weight={700} tabular selectable={false}>
        {count}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: space.sm, alignSelf: 'stretch' },
  // Les pastilles passent à la ligne quand la place manque.
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Une pastille : jamais plus large que la ligne (sur le web, une vue ne rétrécit pas sans
  // flexShrink), le nom se replie dedans quand le texte est agrandi.
  pill: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    // Pas un rayon de pilule : sur deux lignes (texte agrandi), il rognerait les lettres des coins.
    borderRadius: radii.small,
    maxWidth: '100%',
    flexShrink: 1,
  },
})
