// La carte d'une décision dans l'historique de la modération (tranche 7c, onglet « Historique ») :
// l'action en toutes lettres (« Retrait », « Suspension »…), la date, l'administrateur qui a décidé,
// le membre visé, la sorte de contenu, le fondement, la durée d'une suspension ou la raison d'une
// levée, l'explication, et un lien « Voir » vers la cible.
//
// La carte écrit elle-même ses textes à partir de la décision telle que l'API la donne
// (`DecisionHistoryItem`) : l'écran n'a qu'à la poser et à dire où mène « Voir ». Jamais qui a
// signalé : le contrat n'a aucun champ pour cela, et la carte aucune place.
//
// Une trace ne s'efface pas : un administrateur parti, un membre parti, un contenu supprimé depuis
// gardent leur ligne, dite en mots (« compte supprimé »), sans lien vers ce qui n'existe plus.
// L'explication s'affiche en texte brut : ni Markdown, ni lien qu'on toucherait par mégarde (règle 22
// de la relecture du plan 7a).
import { borders, radii, space } from '@ruche/brand'
import type { DecisionHistoryItem } from '@ruche/contracts'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ActionDescription, excerpt } from './CommentAction'
import { Icon } from './Icon'
import { parisDateTime } from './parisTime'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { TextLink } from './TextLink'
import { useTheme } from './theme/ThemeProvider'

type Props = {
  /** La décision, telle que l'API la donne. */
  decision: DecisionHistoryItem
  /**
   * Où mène « Voir » (la page du contenu, ou celle du membre), choisi par l'écran qui connaît les
   * routes. Sans lui, pas de lien ; une cible supprimée depuis n'en a jamais.
   */
  onView?: (() => void) | undefined
}

/** Vrai si la cible n'existe plus : un contenu sans projet, ou un membre dont le compte est parti. */
export const targetIsGone = (decision: DecisionHistoryItem): boolean =>
  decision.target.kind === 'member' ? decision.member === null : decision.projectId === null

export function DecisionCard({ decision, onView }: Props) {
  const { colors, shadows } = useTheme()
  const { t, i18n } = useTranslation()
  // Le texte caché qui dit de quelle carte il s'agit, lu après « Voir » (toutes les cartes ont le
  // même lien) : l'action et le début de l'explication, ou le membre visé.
  const descriptionId = useId()
  const { action, admin, member, ground, explanation, duration, liftCause, afterReport, target } =
    decision
  const actionLabel = t(($) => $.moderation.actions[action])
  const description = t(($) => $.moderation.describe, {
    kind: actionLabel,
    excerpt: explanation ? excerpt(explanation) : (member?.name ?? ''),
  })
  const gone = targetIsGone(decision)
  // Une décision sur un contenu dit lequel (« Commentaire ») ; une suspension, une levée, visent
  // le membre lui-même, déjà dit par « Membre visé ».
  const onContent = action !== 'suspend' && action !== 'lift'
  return (
    <View
      style={{
        gap: space.md,
        padding: space.lg,
        backgroundColor: colors.surface,
        borderRadius: radii.group,
        borderWidth: borders.hairline,
        borderColor: colors.groupBorder,
        boxShadow: shadows.soft,
      }}
    >
      {/* L'action, et la sorte de contenu visé : de quoi parcourir la liste d'un coup d'œil. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
          rowGap: space.xs,
        }}
      >
        <Text variant="headline">{actionLabel}</Text>
        {onContent ? <StatusPill label={t(($) => $.moderation.kinds[target.kind])} /> : null}
      </View>

      {/* Quand, et qui : la date à l'heure de Paris (comme toutes les dates de la modération),
          l'administrateur, le membre visé. */}
      <View style={{ gap: space.xxs }}>
        <Text variant="caption" tone="muted">
          {t(($) => $.moderation.decidedOn, {
            date: parisDateTime(decision.at, i18n.language).date,
          })}
        </Text>
        <Text variant="callout" tone="secondary">
          {admin
            ? t(($) => $.moderation.decidedBy, { name: admin.name })
            : t(($) => $.moderation.decidedByGone)}
        </Text>
        <Text variant="callout" tone="secondary">
          {member
            ? t(($) => $.moderation.memberLine, { name: member.name })
            : t(($) => $.moderation.memberGone)}
        </Text>
      </View>

      {onContent && gone ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
          <Icon name="info" size={18} tone="amber" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="callout" weight={600}>
              {t(($) => $.moderation.targetGone)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Le fondement, la durée d'une suspension, son origine (un signalement), la raison d'une
          levée : en pastilles, comme les motifs d'un signalement. À texte agrandi, elles passent
          à la ligne. */}
      {ground || duration || afterReport || liftCause ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {[
            ground ? t(($) => $.moderation.grounds[ground]) : null,
            duration
              ? t(($) => $.moderation.durationLine, {
                  duration: t(($) => $.moderation.durations[duration]),
                })
              : null,
            afterReport ? t(($) => $.moderation.afterReportLine) : null,
            liftCause ? t(($) => $.moderation.lift.causes[liftCause]) : null,
          ]
            .filter((line): line is string => line !== null)
            .map((line, index) => (
              <View
                // Deux pastilles peuvent avoir le même texte dans une langue (des phrases traduites) :
                // leur rang les distingue, et la liste ne change pas d'ordre.
                // biome-ignore lint/suspicious/noArrayIndexKey: une pastille n'a pas d'autre identité que sa place
                key={index}
                style={{
                  maxWidth: '100%',
                  paddingHorizontal: space.sm,
                  paddingVertical: space.xxs,
                  borderRadius: radii.pill,
                  backgroundColor: colors.surfaceGrouped,
                }}
              >
                <Text variant="caption" weight={600} tone="secondary">
                  {line}
                </Text>
              </View>
            ))}
        </View>
      ) : null}

      {/* L'explication, en citation et en texte brut, sélectionnable. */}
      {explanation ? (
        <View
          style={{
            borderLeftWidth: borders.quote,
            borderLeftColor: colors.line,
            paddingLeft: space.md,
          }}
        >
          <Text variant="callout" selectable breakAnywhere>
            {explanation}
          </Text>
        </View>
      ) : null}

      {onView && !gone ? (
        <View style={{ alignSelf: 'flex-start' }}>
          <TextLink
            label={t(($) => $.moderation.view)}
            onPress={onView}
            describedById={descriptionId}
            hint={description}
          />
        </View>
      ) : null}
      <ActionDescription id={descriptionId} text={description} />
    </View>
  )
}
