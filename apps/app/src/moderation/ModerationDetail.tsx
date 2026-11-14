// Le détail d'un élément de la file de modération (R9, planches `R9-Moderation-Desktop` et
// `R9-Moderation-Detail-Telephone`) : la colonne du milieu sur ordinateur, une page à lui sur
// téléphone. Il dit ce qui est signalé et où (« Un commentaire sur Décollage ! », « La photo 2 de
// Météo »), montre la copie gardée au moment du signalement, les motifs, les précisions laissées par
// les membres (sans jamais leur nom : la file n'en porte aucun), puis les décisions possibles et la
// fiche de l'auteur (`AuthorRecord`), pour décider en sachant ce qui a déjà été décidé pour lui.
//
// Il ne décide de rien lui-même : l'écran lui passe les actions déjà gardées (double tape, envoi en
// cours) et le résultat d'une décision, qui prend la place des boutons. Ici, seulement l'assemblage
// des composants de `src/ui` et les textes, comme un écran : aucune couleur, taille ni marge.
//
// Les fonctions pures du haut (la copie, les images) servent aussi à la file : l'écran les importe.
import {
  IMAGE_INPUT_FIELDS,
  type ModerationQueueItem,
  type RemovedItem,
  type ReportSnapshotEntry,
  type SnapshotImage,
} from '@ruche/contracts'
import type { ComponentProps, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaSources } from '../api/media'
import { shortDate } from '../projects/format'
import { AuthorRecord } from '../ui/AuthorRecord'
import { excerpt } from '../ui/CommentAction'
import type { Focusable } from '../ui/focus'
import type { ImageSource } from '../ui/image'
import { ReportCard, type ReportCardAction } from '../ui/ReportCard'
import { Stack } from '../ui/Stack'
import { Text } from '../ui/Text'
import { TextLink } from '../ui/TextLink'
import { partText, reasonTextKey } from './present'

/**
 * Les champs d'une copie qui sont des images : la copie n'en garde que la clé, jamais le texte. Le
 * détail les dit à part (`images`), seulement par leur état ; ils n'ont pas de libellé de champ.
 */
type ImageField = (typeof IMAGE_INPUT_FIELDS)[number]
const imageFields: ReadonlySet<string> = new Set(IMAGE_INPUT_FIELDS)
export const isTextEntry = (
  entry: ReportSnapshotEntry,
): entry is ReportSnapshotEntry & { field: Exclude<ReportSnapshotEntry['field'], ImageField> } =>
  !imageFields.has(entry.field)

/** Le premier texte d'une copie (le titre d'un projet, le nom d'un profil) : de quoi la reconnaître. */
export const firstText = (snapshot: readonly ReportSnapshotEntry[]): string =>
  snapshot.find(isTextEntry)?.value ?? ''

type T = ReturnType<typeof useTranslation>['t']

/**
 * L'état de chaque image d'une copie, en une phrase (« Couverture : toujours affichée »). Dès qu'un
 * projet a deux photos, chacune porte son rang (« Photo 2 : supprimée ou remplacée depuis »), sinon
 * deux lignes identiques ne diraient pas laquelle est partie (relecture 7b).
 */
const imageLines = (images: readonly SnapshotImage[], t: T): string[] => {
  const photos = images.filter(({ field }) => field === 'photo').length
  let rank = 0
  return images.map(({ field, state }) => {
    const image =
      field === 'photo' && photos > 1
        ? t(($) => $.moderation.images.photoNumbered, { n: ++rank })
        : t(($) => $.moderation.images[field])
    return t(($) => $.moderation.images[state], { image })
  })
}

/**
 * R7b : l'image d'une capture ou d'une photo d'appel, quand l'API en donne l'adresse. Son nom lu est
 * le libellé du champ (« Photo »). Une image sans adresse, ou déjà partie, reste dite par son état.
 */
const pictures = (
  images: readonly SnapshotImage[],
  t: T,
  mediaSource: (url: string) => ImageSource | null,
): { name: string; source: ImageSource }[] =>
  images.flatMap(({ field, state, url }) => {
    const source = state === 'present' && url ? mediaSource(url) : null
    return source ? [{ name: t(($) => $.moderation.images[field]), source }] : []
  })

/** Une majuscule au début d'un titre fait d'une partie en minuscules (« la photo 2 de Météo »). */
const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

/**
 * Le titre du détail : ce qui est signalé, et où. Une partie : « La photo 2 de Météo » ; un
 * commentaire : « Un commentaire sur Décollage ! » ; un contenu entier : son titre (le projet), ou
 * le nom de son auteur (un profil) ; à défaut, la sorte seule.
 */
export const detailTitle = (
  item: Pick<ModerationQueueItem, 'target' | 'part'> & {
    context?: ModerationQueueItem['context']
    authorRecord?: ModerationQueueItem['authorRecord']
  },
  t: T,
): string => {
  const kind = t(($) => $.moderation.kinds[item.target.kind])
  const where = item.context?.title ?? item.authorRecord?.name ?? null
  if (item.part) {
    const part = partText(item.part, t, item.target.kind)
    return upperFirst(where ? t(($) => $.moderation.detail.partOf, { part, title: where }) : part)
  }
  if (item.target.kind === 'comment' && item.context) {
    return t(($) => $.moderation.detail.commentOn, { title: item.context.title })
  }
  return where ?? kind
}

/** Le résultat d'une décision, à la place des boutons : une confirmation, ou « déjà décidé ». */
export type Outcome = { message: string; ok: boolean }

/** Ce qui est commun aux deux sortes de détail : les actions et ce qu'elles ont donné. */
type Common = {
  /** Les décisions possibles, déjà gardées par l'écran ; aucune : le détail dit pourquoi (`status`). */
  actions: readonly ReportCardAction[]
  /** Le résultat d'une décision prise ici : il remplace les boutons. */
  outcome?: Outcome | undefined
  /** Pour y poser le focus du clavier (le bouton touché a disparu). */
  outcomeRef?: ComponentProps<typeof ReportCard>['decidedRef']
  /** Le refus d'une décision (une panne) : au-dessus des boutons, qui restent pour réessayer. */
  error?: string | undefined
  /** « Voir en contexte » ; `null` : pas de lien (un projet retiré n'a plus de page). */
  onView: (() => void) | null
  /** Le titre du détail, pour y poser le focus à l'arrivée sur téléphone. */
  titleRef?: Ref<Focusable> | undefined
}

type Props = Common &
  (
    | {
        /** Un élément de la file (« À traiter »). */
        tab: 'pending'
        item: ModerationQueueItem
        /** « Suspendre » sur la fiche de l'auteur ; `null` : pas de bouton (l'écran en décide). */
        onSuspend: (() => void) | null
        /** « Voir ses décisions » : l'historique filtré sur l'auteur ; `null` : pas de lien. */
        onSeeDecisions: (() => void) | null
      }
    | {
        /** Un contenu retiré (« Retirés »). */
        tab: 'removed'
        item: RemovedItem
        onSuspend?: never
        onSeeDecisions?: never
      }
  )

export function ModerationDetail(props: Props) {
  const { t, i18n } = useTranslation()
  // Les images privées du coin des testeurs voyagent avec la session (cookie sur téléphone).
  const mediaSource = useMediaSources()
  const { item, actions, outcome, outcomeRef, error, onView, titleRef } = props
  const kind = t(($) => $.moderation.kinds[item.target.kind])
  const part = item.part ? partText(item.part, t, item.target.kind) : null
  const viewLink = onView ? { viewLabel: t(($) => $.moderation.detail.seeInContext), onView } : null
  // Ce que le lecteur d'écran lit après chaque bouton : de quel contenu il s'agit.
  const common = {
    kind,
    part,
    actions,
    decided: outcome,
    decidedRef: outcomeRef,
    error,
    ...viewLink,
  }

  if (props.tab === 'removed') {
    const removed = props.item
    return (
      <Stack gap="lg">
        <Text variant="title2" heading={2} focusRef={titleRef}>
          {detailTitle(removed, t)}
        </Text>
        <ReportCard
          {...common}
          description={t(($) => $.moderation.describe, { kind, excerpt: excerpt(removed.text) })}
          snapshot={removed.text}
          reasons={[t(($) => $.moderation.grounds[removed.ground])]}
          details={[removed.explanation]}
          when={t(($) => $.moderation.removedOn, {
            date: shortDate(removed.removedAt, i18n.language),
          })}
          {...(removed.concernsMe ? { status: t(($) => $.moderation.concernsMe) } : null)}
        />
      </Stack>
    )
  }

  const queued = props.item
  const record = queued.concernsMe ? null : queued.authorRecord
  // Ce qui explique les boutons absents : un contenu qui concerne l'administrateur, déjà retiré ou
  // disparu ; un profil entier, qui ne se retire pas (relecture de design 7a).
  const { state } = queued
  const status = queued.concernsMe
    ? t(($) => $.moderation.concernsMe)
    : state !== 'present'
      ? t(($) => $.moderation.state[state])
      : queued.target.kind === 'member' && !queued.part
        ? t(($) => $.moderation.profileNoRemove)
        : undefined
  return (
    <Stack gap="lg">
      <Text variant="title2" heading={2} focusRef={titleRef}>
        {detailTitle(queued, t)}
      </Text>
      <ReportCard
        {...common}
        description={t(($) => $.moderation.describe, {
          kind,
          excerpt: excerpt(firstText(queued.snapshot)),
        })}
        count={queued.count}
        detailsLabel={t(($) => $.moderation.detailsLabel)}
        // La copie champ par champ, chacun sous son libellé ; les images ne sont dites que par leur
        // état (jamais montrées, sauf les captures du coin des testeurs que l'API donne).
        snapshot={queued.snapshot.filter(isTextEntry).map(({ field, value }) => ({
          label: t(($) => $.moderation.fields[field]),
          value,
        }))}
        snapshotLabel={t(($) => $.moderation.snapshot)}
        snapshotNote={queued.snapshotsDiffer ? t(($) => $.moderation.snapshotsDiffer) : undefined}
        images={imageLines(queued.images, t)}
        pictures={pictures(queued.images, t, mediaSource)}
        reasons={queued.reasons.map(({ reason, count }) =>
          t(($) => $.moderation.reasonCount, {
            reason: t(($) => $.report.reasons[reasonTextKey[reason]]),
            count,
          }),
        )}
        // Les précisions des membres, en texte brut, sans leur nom (la file n'en a aucun).
        details={queued.details}
        when={t(($) => $.moderation.since, {
          date: shortDate(queued.firstReportedAt, i18n.language),
        })}
        {...(status ? { status } : null)}
      />
      {/* La fiche de l'auteur : rien pour un compte parti, ni pour ce qui concerne
          l'administrateur lui-même (il n'en décide pas). */}
      {record ? (
        <Stack gap="sm">
          <AuthorRecord
            name={record.name}
            handle={record.handle}
            joinedAt={record.joinedAt}
            projectCount={record.projectCount}
            commentCount={record.commentCount}
            removals={record.removals}
            suspensions={record.suspensions}
            suspendedNow={record.suspendedNow}
            onSuspend={props.onSuspend}
          />
          {props.onSeeDecisions ? (
            // Un bouton qui agit sur place (la vue de l'historique et son filtre) : le seul lien
            // du détail reste « Voir en contexte » (règle 22 de 7a).
            <TextLink
              role="button"
              label={t(($) => $.moderation.authorCard.seeDecisions)}
              onPress={props.onSeeDecisions}
            />
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  )
}
