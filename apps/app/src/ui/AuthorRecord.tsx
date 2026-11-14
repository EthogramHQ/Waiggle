// La fiche de l'auteur d'un contenu signalé (R9, planches `R9-Moderation-Desktop` et
// `R9-Moderation-Detail-Telephone`) : dans le détail d'un signalement, ce que la modération sait du
// membre visé, pour décider en le sachant. Son nom et son pseudo, « Compte récent » s'il a moins de
// 14 jours (un compte ouvert pour nuire est souvent neuf), sa date d'inscription, ses nombres de
// projets et de commentaires, ce qui a déjà été décidé pour lui (« Déjà décidé : 2 retraits,
// 1 suspension »), et « Suspendre » quand l'écran le permet.
//
// Seuls les administrateurs la voient : c'est l'écran de la modération qui la monte. Elle ne dit
// jamais qui a signalé : elle n'a aucune place pour un autre nom que celui de l'auteur.
import { radii, space } from '@ruche/brand'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Button } from './Button'
import { ActionDescription } from './CommentAction'
import { shortDate } from './relativeDate'
import { StatusPill } from './StatusPill'
import { Text } from './Text'
import { useHydrated } from './theme/hydration'
import { useTheme } from './theme/ThemeProvider'

/** Un compte plus jeune que ce nombre de jours est dit « Compte récent ». */
export const RECENT_ACCOUNT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Vrai si le compte a moins de 14 jours : jusqu'à la dernière milliseconde du 14e jour, plus dès
 * qu'il a 14 jours pile. On compte en durée (14 × 24 h), pas en jours du calendrier : la règle est
 * la même à toute heure, sans dépendre du fuseau de l'appareil.
 */
export const isRecentAccount = (joinedAt: string, now: Date): boolean =>
  now.getTime() - new Date(joinedAt).getTime() < RECENT_ACCOUNT_DAYS * DAY_MS

/**
 * Un marqueur pour couper une phrase traduite autour d'une valeur (« Déjà décidé : {{record}} ») et
 * mettre la valeur seule en gras, sans écrire l'ordre des mots ici : chaque langue garde le sien.
 * Un caractère de contrôle, qu'aucun texte traduit ne contient (écrit par son code : invisible).
 */
const SLOT = String.fromCodePoint(0x1)

type Props = {
  /** Le nom affiché de l'auteur. */
  name: string
  /** Son pseudo, sans « @ » (la fiche l'ajoute). */
  handle: string
  /** Sa date d'inscription (ISO). */
  joinedAt: string
  projectCount: number
  commentCount: number
  /** Le nombre de ses contenus retirés par la modération. */
  removals: number
  /** Le nombre de ses suspensions passées. */
  suspensions: number
  /** Vrai s'il est suspendu en ce moment. */
  suspendedNow: boolean
  /** L'heure qu'il est, figée (tests, catalogue) ; sinon l'heure de l'appareil. */
  now?: Date
  /**
   * Ouvre la fenêtre de suspension. `null` : pas de bouton (l'administrateur lui-même, un autre
   * administrateur, ou un membre déjà suspendu ; l'écran en décide).
   */
  onSuspend: (() => void) | null
}

export function AuthorRecord({
  name,
  handle,
  joinedAt,
  projectCount,
  commentCount,
  removals,
  suspensions,
  suspendedNow,
  now,
  onSuspend,
}: Props) {
  const { colors } = useTheme()
  const { t, i18n } = useTranslation()
  // Sur le web, la page est pré-rendue sans connaître l'heure du visiteur : avant l'hydratation, on
  // ne juge pas « Compte récent », et la date s'écrit sans l'année (la date elle-même tient lieu de
  // « maintenant »), pour que le pré-rendu et le premier affichage écrivent le même texte.
  const hydrated = useHydrated()
  const clock = now ?? (hydrated ? new Date() : null)
  const recent = clock !== null && isRecentAccount(joinedAt, clock)
  const joined = t(($) => $.moderation.authorCard.joined, {
    date: shortDate(joinedAt, i18n.language, clock ?? new Date(joinedAt)),
  })
  // Les nombres : « aucun projet » plutôt que « 0 projet », qui se lit mal.
  const projects =
    projectCount === 0
      ? t(($) => $.moderation.authorCard.noProject)
      : t(($) => $.moderation.authorCard.projects, { count: projectCount })
  const comments =
    commentCount === 0
      ? t(($) => $.moderation.authorCard.noComment)
      : t(($) => $.moderation.authorCard.comments, { count: commentCount })
  // Ce qui a déjà été décidé, sans zéro : seules les décisions qui existent ont leur mot.
  const decisions = [
    ...(removals > 0 ? [t(($) => $.moderation.record.removals, { count: removals })] : []),
    ...(suspensions > 0 ? [t(($) => $.moderation.record.suspensions, { count: suspensions })] : []),
    ...(suspendedNow ? [t(($) => $.moderation.record.suspendedNow)] : []),
  ]
  const [decidedBefore = '', decidedAfter = ''] = t(($) => $.moderation.authorCard.decided, {
    record: SLOT,
  }).split(SLOT)
  // « Suspendre » est lu avec le nom du membre (« Inès Haddad, @ines_haddad ») : on sait quel
  // compte on suspend, même en arrivant sur le bouton par Tab.
  const descriptionId = useId()
  const who = `${name}, @${handle}`
  return (
    <View
      style={{
        gap: space.xs,
        padding: space.md,
        borderRadius: radii.group,
        backgroundColor: colors.surfaceGrouped,
      }}
    >
      {/* Le nom, le pseudo et « Compte récent » sur une ligne, « Suspendre » au bout ; à texte
          agrandi ou en colonne étroite, chacun passe à la ligne plutôt que de se couper. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: space.sm,
          rowGap: space.xs,
        }}
      >
        <View style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Text variant="headline">{name}</Text>
        </View>
        <View style={{ flexShrink: 1, maxWidth: '100%' }}>
          <Text variant="callout" tone="muted" breakAnywhere>
            {`@${handle}`}
          </Text>
        </View>
        {recent ? <StatusPill label={t(($) => $.moderation.authorCard.recent)} /> : null}
        {onSuspend ? (
          // marginLeft auto : le bouton va au bout de la ligne, ou au début de la suivante.
          <View style={{ marginLeft: 'auto' }}>
            <Button
              label={t(($) => $.moderation.detail.suspend)}
              icon="prohibit"
              variant="danger"
              size="compact"
              onPress={onSuspend}
              describedById={descriptionId}
              hint={who}
            />
          </View>
        ) : null}
      </View>
      {/* L'inscription et les nombres, en une ligne qui se lit comme une phrase. */}
      <Text variant="callout" tone="secondary">
        {[joined, projects, comments].join(' · ')}
      </Text>
      {/* Ce que la modération a déjà décidé : la liste en gras, après « Déjà décidé : ». */}
      <Text variant="callout" tone="secondary">
        {decisions.length > 0 ? (
          <>
            {decidedBefore}
            <Text variant="callout" weight={700}>
              {decisions.join(', ')}
            </Text>
            {decidedAfter}
          </>
        ) : (
          t(($) => $.moderation.record.none)
        )}
      </Text>
      {onSuspend ? <ActionDescription id={descriptionId} text={who} /> : null}
    </View>
  )
}
