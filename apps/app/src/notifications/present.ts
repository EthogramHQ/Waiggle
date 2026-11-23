// Ce qu'une notification écrit à l'écran, et où elle mène, selon sa sorte (`kind`). Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
//
// R8 : la ligne d'Activité se dessine par `NotificationCard`. Ce fichier prépare ce qu'elle reçoit,
// sans rien savoir de son dessin :
// - `leading` : à gauche, la photo d'un membre (le nom lui donne ses initiales) ou une icône teintée ;
// - `parts` : la phrase en morceaux (gras pour les noms et titres, une version à part) ;
// - `thumb` : à droite, la vignette du projet ou la tuile d'un outil ;
// - `reactions`, `version`, `detail`, `quote` : ce qui s'écrit dessous.
// Les images sortent comme des adresses (`image: string`, `{ url, thumbhash }`) : seul l'écran sait
// les transformer en sources d'image (`useMediaSources`, la session voyage avec la demande).
import {
  type Category,
  type MILESTONE_SEALS,
  type Notification,
  type NotifiedCover,
  REACTION_KINDS,
  type ReactionKind,
  type ReportPartField,
  SEALS,
  type SealCode,
  type SealMatter,
  sealCategory,
} from '@ruche/contracts'
import type { Translation } from '@ruche/i18n'
import type { Href } from 'expo-router'
import type { useTranslation } from 'react-i18next'
import { contestSubjectOf, partContestSubject } from '../ui/contestSubject'
import type { IconName } from '../ui/Icon'
import { type Part, splitMarks } from '../ui/marks'
import { parisDateTime } from '../ui/parisTime'
import { partText } from '../ui/partText'

type T = ReturnType<typeof useTranslation>['t']

/** À gauche de la ligne : un membre (son nom, sa photo si on l'a) ou l'icône de la sorte. */
export type PresentedLeading =
  | { kind: 'avatar'; name: string; image: string | null }
  | { kind: 'icon'; icon: IconName; tone: 'neutral' | 'honey' | 'danger' }
  // R19 : l'alvéole numérotée d'un niveau passé, le petit sceau d'un sceau gagné.
  | { kind: 'level'; level: number }
  | { kind: 'seal'; icon: IconName; matter: SealMatter }

/** À droite de la ligne : la couverture d'un projet (ou sa lumière sans photo), ou un outil. */
export type PresentedThumb =
  | { kind: 'project'; image: NotifiedCover | null; title: string }
  | { kind: 'tool'; name: string }

/** Les textes d'une carte de notification, et sa destination (null : elle ne mène nulle part). */
export type Presented = {
  /** L'icône de la sorte (aussi `leading` quand la ligne n'a pas de membre à montrer). */
  icon: IconName
  leading: PresentedLeading
  /** La phrase, en morceaux ; `text` en est la version sans mise en forme. */
  parts: Part[]
  text: string
  thumb: PresentedThumb | null
  /** Les réactions reçues, dans l'ordre de la barre des réactions (le nombre est dans la phrase). */
  reactions?: ReactionKind[]
  /** La version d'une mise à jour (« v1.2 »), pour qui voudrait l'écrire à part. */
  version?: string | null
  detail: string | null
  quote: string | null
  /**
   * R9 : un geste sous la ligne, qui n'est pas son toucher. `target` : un lien dans l'appli
   * (« Choisir un pseudo ») ; `contact` : l'adresse de contact, avec un objet qui nomme la
   * décision et sa date (« Contester »). Absent ou null : aucun.
   */
  action?: { label: string; target: Href } | { label: string; contact: { subject: string } } | null
  target: Href | null
}

/** Le code d'un sceau de palier (« first_feedback »), la clé de son nom. */
type MilestoneSeal = (typeof MILESTONE_SEALS)[number]['code']

/** R19 : « Ma récolte », où mènent un niveau, un sceau et l'avis d'arrivée de la récolte. */
const HARVEST: Href = '/harvest'

/**
 * R19 : le nom, l'icône et la matière d'un sceau. Un sceau connu d'avance (`SEALS` du contrat) a
 * les siens ; le sceau d'une catégorie créée ensuite prend l'icône de la catégorie (si la liste est
 * lue) et le texte `categoryOther`, en cire crème comme les autres catégories.
 */
const sealOf = (
  code: SealCode,
  t: T,
  categories: readonly Category[] | undefined,
): { name: string; icon: IconName; matter: SealMatter } => {
  const known = SEALS.find((seal) => seal.code === code)
  const category = sealCategory(code)
  const name =
    category === null
      ? t(($) => $.game.seals[code as MilestoneSeal])
      : known
        ? t(($) => $.game.seals.category[code as keyof Translation['game']['seals']['category']])
        : t(($) => $.game.seals.categoryOther, {
            category: categories?.find((one) => one.code === category)?.name ?? category,
          })
  // L'icône vient du contrat (une chaîne : un test vérifie que chacune existe dans Icon).
  const icon = (known?.icon ??
    categories?.find((one) => one.code === category)?.icon ??
    'shapes') as IconName
  return { name, icon, matter: known?.matter ?? 'cream' }
}

/** L'onglet des ruches : où l'on rejoint une ruche ou refuse une invitation. */
const HIVES_TAB: Href = '/hives'

/**
 * Le nom d'une ruche dans une phrase. Retiré par la modération (`null`), il devient « sans nom »
 * là où la phrase dit déjà « la ruche » (`inline`), « Ruche sans nom » ailleurs (`plain`).
 */
const hiveName = (name: string | null, place: 'inline' | 'plain', t: T): string =>
  name ?? (place === 'inline' ? t(($) => $.hives.unnamedInline) : t(($) => $.hives.unnamed))

/** Les réglages du profil, où l'on choisit un nouveau nom ou pseudo. */
const PROFILE_SETTINGS: Href = '/settings/profile'

/** La clé de la phrase d'une partie retirée (`notifications.removedPart`), ou null si elle n'en a pas. */
const removedPartKey = (
  targetKind: 'project' | 'update' | 'comment' | 'call' | 'message',
  field: ReportPartField,
): keyof Translation['notifications']['removedPart'] | null => {
  if (field === 'photo') {
    return targetKind === 'update'
      ? 'updatePhoto'
      : targetKind === 'call'
        ? 'callPhoto'
        : targetKind === 'message'
          ? 'capture'
          : targetKind === 'project'
            ? 'photo'
            : null
  }
  if (targetKind !== 'project') return null
  return field === 'description' ||
    field === 'tools' ||
    field === 'demoUrl' ||
    field === 'cover' ||
    field === 'photoDescription' ||
    field === 'prompt'
    ? field
    : null
}

/** Le rang d'une photo (« 1re », « 2e »), ou rien si on ne sait plus où elle était. */
const rankOf = (position: number | null, t: T): string =>
  position === null
    ? ''
    : position === 1
      ? t(($) => $.report.rank.first)
      : t(($) => $.report.rank.other, { n: position })

const projectRoute = (id: string): Href => ({ pathname: '/projects/[id]', params: { id } })

/** Un commentaire : la page du projet, qui ouvre le fil en contexte (`?comment=<id>`, R8). */
const commentRoute = (projectId: string, commentId: string): Href => ({
  pathname: '/projects/[id]',
  params: { id: projectId, comment: commentId },
})

/** Un onglet du coin des testeurs d'un projet (R7b). */
const cornerRoute = (id: string, tab: 'calls' | 'feedback'): Href => ({
  pathname: '/projects/[id]/testers',
  params: { id, tab },
})

/**
 * La phrase en morceaux. `render` écrit la traduction avec les valeurs qu'on lui donne ; on lui
 * passe d'abord les NOMS des trous (« {{title}} » pour `title`), pour que les marques <b> et <v>
 * se découpent sur le modèle, puis les vraies valeurs remplissent chaque morceau. Un titre ou un
 * nom de membre qui contient « <b> » reste donc du texte (voir `marks.ts`). Un nombre (`count`,
 * qui choisit le singulier ou le pluriel) se donne à `render` par sa fermeture, pas par `values`.
 */
const say = (
  values: Record<string, string>,
  render: (params: Record<string, string>) => string,
): { parts: Part[]; text: string } => {
  const holes = Object.fromEntries(Object.keys(values).map((name) => [name, `{{${name}}}`]))
  const parts = splitMarks(render(holes), values)
  return { parts, text: parts.map((part) => part.text).join('') }
}

/** Une icône ronde, sans membre à montrer. */
const iconLeading = (
  icon: IconName,
  tone: 'neutral' | 'honey' | 'danger' = 'neutral',
): PresentedLeading => ({ kind: 'icon', icon, tone })

/** La photo d'un membre : son nom (les initiales sans photo) et l'adresse de sa photo. */
const memberLeading = (member: { name: string; avatarUrl: string | null }): PresentedLeading => ({
  kind: 'avatar',
  name: member.name,
  image: member.avatarUrl,
})

/** La vignette d'un projet nommé par la notification. */
const projectThumb = (project: { title: string; cover: NotifiedCover | null }): PresentedThumb => ({
  kind: 'project',
  image: project.cover,
  title: project.title,
})

/**
 * Les textes et la destination d'une notification. Les réactions et les abonnés ne nomment
 * personne ; un commentaire nomme son auteur, déjà visible sous le commentaire. Celles de la
 * modération (tranche 7a) ne nomment jamais qui a signalé, ni qui a décidé.
 */
export const presentNotification = (
  notification: Notification,
  t: T,
  /** L'heure de la lecture (les tests la fixent) ; l'API du plan la demande. */
  _now: Date = new Date(),
  {
    language = 'fr',
    categories,
  }: {
    /** La langue de l'écran (« fr », « en ») : elle écrit les dates (fin d'une suspension, mise à jour). */
    language?: string
    /**
     * Les catégories lues par `useCategories` : le nom d'une catégorie vient de l'API, dans la
     * langue du membre. Sans la liste (pas encore lue), la phrase garde le code de la catégorie.
     */
    categories?: readonly Category[]
  } = {},
): Presented => {
  /** Une ligne sans membre : icône ronde, phrase, vignette du projet (si on la donne). */
  const plain = {
    reactions: undefined,
    version: undefined,
    detail: null,
    quote: null,
    thumb: null,
  } as const
  switch (notification.kind) {
    case 'hive_invited': {
      // R10 : une invitation dans une ruche. La phrase nomme qui invite (ou, si son compte est
      // supprimé, seulement la ruche) ; au toucher, l'onglet Ruches, où l'on rejoint ou refuse.
      const { inviter, hive } = notification
      const name = hiveName(hive.name, 'inline', t)
      const said = inviter
        ? say({ name: inviter.name, hive: name }, (params) =>
            t(($) => $.notifications.hiveInvited, params as { name: string; hive: string }),
          )
        : say({ hive: name }, (params) =>
            t(($) => $.notifications.hiveInvitedNoInviter, params as { hive: string }),
          )
      return {
        ...plain,
        ...said,
        icon: 'hexagon',
        // L'icône de la ruche, dans le miel ; une ruche sans icône garde l'hexagone.
        leading: iconLeading(hive.icon ?? 'hexagon', 'honey'),
        target: HIVES_TAB,
      }
    }
    case 'hive_joined': {
      // R10 : quelqu'un que j'ai invité a rejoint. Sans nom de ruche (retiré par la modération), la
      // phrase ne dit pas « la ruche » : « Ruche sans nom ». Au toucher, les membres de la ruche.
      const { member, hive } = notification
      const said = say({ name: member.name, hive: hiveName(hive.name, 'plain', t) }, (params) =>
        t(($) => $.notifications.hiveJoined, params as { name: string; hive: string }),
      )
      return {
        ...plain,
        ...said,
        icon: 'user-plus',
        leading: memberLeading(member),
        target: hive.id
          ? { pathname: '/hives/[id]', params: { id: hive.id, tab: 'members' } }
          : null,
      }
    }
    case 'hive_animator': {
      // R10 : l'animation m'est confiée ; au toucher, la ruche.
      const { hive } = notification
      const said = say({ hive: hiveName(hive.name, 'inline', t) }, (params) =>
        t(($) => $.notifications.hiveAnimator, params as { hive: string }),
      )
      return {
        ...plain,
        ...said,
        icon: 'crown',
        leading: iconLeading('crown', 'honey'),
        target: hive.id ? { pathname: '/hives/[id]', params: { id: hive.id } } : null,
      }
    }
    case 'hive_removed':
    case 'hive_deleted': {
      // R10 : je ne suis plus dans la ruche (sans dire qui m'a retiré), ou elle est supprimée. Rien
      // à ouvrir (je n'y ai plus accès) ; dessous, ce que devient mon travail (option 7).
      const removed = notification.kind === 'hive_removed'
      const hive = hiveName(notification.hive.name, 'inline', t)
      const said = say({ hive }, (params) =>
        removed
          ? t(($) => $.notifications.hiveRemoved, params as { hive: string })
          : t(($) => $.notifications.hiveDeleted, params as { hive: string }),
      )
      return {
        ...plain,
        ...said,
        icon: removed ? 'sign-out' : 'hexagon',
        leading: iconLeading(removed ? 'sign-out' : 'hexagon'),
        detail: t(($) => $.notifications.hivePrivateAgain),
        target: null,
      }
    }
    case 'reactions': {
      const { counts, total, project } = notification
      const said = say({ title: project.title }, (params) =>
        t(($) => $.notifications.reactions, { ...params, count: total }),
      )
      return {
        ...plain,
        ...said,
        icon: 'heart',
        leading: iconLeading('heart', 'honey'),
        thumb: projectThumb(project),
        // Seulement les réactions reçues, dans l'ordre de la barre des réactions.
        reactions: REACTION_KINDS.filter((kind) => counts[kind] > 0),
        target: projectRoute(project.id),
      }
    }
    case 'project_follows': {
      const { project, count } = notification
      const said = say({ title: project.title }, (params) =>
        t(($) => $.notifications.projectFollows, { ...params, count }),
      )
      return {
        ...plain,
        ...said,
        icon: 'bookmark-simple',
        leading: iconLeading('bookmark-simple'),
        thumb: projectThumb(project),
        target: projectRoute(project.id),
      }
    }
    case 'project_update': {
      // R7a, R8 : une mise à jour d'un projet qu'on suit ou qu'on teste. La phrase nomme le projet
      // (pas l'auteur) et sa version s'il y en a une ; dessous, la première ligne de « Ce qui a
      // changé », et « et 2 autres changements » s'il y en a d'autres ; au toucher, la frise des
      // mises à jour du projet.
      const { project, update } = notification
      const version = update.version
      const said = version
        ? say({ title: project.title, version }, (params) =>
            t(
              ($) => $.notifications.projectUpdateVersion,
              params as { title: string; version: string },
            ),
          )
        : say({ title: project.title }, (params) =>
            t(($) => $.notifications.projectUpdate, params as { title: string }),
          )
      const line = update.firstLine.text
      return {
        ...plain,
        ...said,
        icon: 'arrows-clockwise',
        leading: iconLeading('arrows-clockwise'),
        thumb: projectThumb(project),
        version,
        detail:
          update.moreLines > 0
            ? t(($) => $.notifications.updateMore, { line, count: update.moreLines })
            : line,
        target: { pathname: '/projects/[id]/updates', params: { id: project.id } },
      }
    }
    case 'member_follows': {
      const said = say({}, () =>
        t(($) => $.notifications.memberFollows, { count: notification.count }),
      )
      // Sans nom, elle n'a rien à montrer de plus : elle ne mène nulle part.
      return {
        ...plain,
        ...said,
        icon: 'user-plus',
        leading: iconLeading('user-plus'),
        target: null,
      }
    }
    case 'comment': {
      const { reason, author, project, comment } = notification
      const values = { name: author.name, title: project.title }
      // Les trois sortes (sur son projet, une mention, une réponse) écrivent la phrase, puis
      // l'extrait dessous, en citation : la même forme partout, et l'extrait se lit à part.
      const said = say(values, (params) =>
        reason === 'mention'
          ? t(($) => $.notifications.mention, params as typeof values)
          : reason === 'reply'
            ? t(($) => $.notifications.reply, params as typeof values)
            : t(($) => $.notifications.comment, params as typeof values),
      )
      return {
        ...plain,
        ...said,
        icon:
          reason === 'mention' ? 'at' : reason === 'reply' ? 'arrow-bend-up-left' : 'chat-circle',
        leading: memberLeading(author),
        thumb: projectThumb(project),
        quote: comment.excerpt,
        target: commentRoute(project.id, comment.id),
      }
    }
    case 'hidden': {
      const { project, comment } = notification
      const said = say({ title: project.title }, (params) =>
        t(($) => $.notifications.hidden, params as { title: string }),
      )
      return {
        ...plain,
        ...said,
        icon: 'eye-slash',
        leading: iconLeading('eye-slash'),
        thumb: projectThumb(project),
        quote: comment.excerpt,
        // La page du projet, sans viser le commentaire : masqué, il n'est plus dans le fil que
        // lisent les autres, et « Voir en contexte » ne vaut que pour un commentaire, une réponse
        // ou une mention (scénario R8, « Où mène chaque ligne » ; test d'écran de 6b).
        target: projectRoute(project.id),
      }
    }
    case 'tester_call': {
      // R7b : un appel à tester ; le début de l'appel dessous, en citation ; au toucher, l'onglet
      // « Appels » du coin des testeurs.
      const { author, project, call } = notification
      const values = { name: author.name, title: project.title }
      const said = say(values, (params) =>
        t(($) => $.notifications.testerCall, params as typeof values),
      )
      return {
        ...plain,
        ...said,
        icon: 'megaphone-simple',
        leading: memberLeading(author),
        thumb: projectThumb(project),
        quote: call.excerpt,
        target: cornerRoute(project.id, 'calls'),
      }
    }
    case 'tester_message': {
      // R7b : un message d'un fil de testeur. Le fil est privé : jamais d'extrait, seulement qui a
      // écrit. L'auteur ouvre le fil de ce testeur ; le testeur, l'onglet « Retours » où il lit la
      // réponse sous son retour.
      const { from, project, role, message } = notification
      const values = { name: from.name, title: project.title }
      const said = say(values, (params) =>
        role === 'author'
          ? t(($) => $.notifications.testerReplyToTester, params as typeof values)
          : message.kind === 'feedback'
            ? t(($) => $.notifications.testerFeedback, params as typeof values)
            : t(($) => $.notifications.testerReplyToAuthor, params as typeof values),
      )
      return {
        ...plain,
        ...said,
        icon: 'chat-circle-dots',
        leading: memberLeading(from),
        thumb: projectThumb(project),
        target:
          role === 'author'
            ? cornerRoute(project.id, 'feedback')
            : {
                pathname: '/projects/[id]/testers/threads/[testerId]',
                params: { id: project.id, testerId: message.testerId },
              },
      }
    }
    case 'feedback_settled': {
      // R7b : un de ses retours est réglé, à la main, ou par une mise à jour (sa version, sinon sa
      // date, écrite à l'heure de Paris comme les autres dates de l'Activité).
      const { author, project, update } = notification
      const values = { name: author.name, title: project.title }
      const version = update?.version ?? null
      const said = !update
        ? say(values, (params) =>
            t(($) => $.notifications.feedbackSettled, params as typeof values),
          )
        : version
          ? say({ ...values, version }, (params) =>
              t(
                ($) => $.notifications.feedbackSettledVersion,
                params as typeof values & { version: string },
              ),
            )
          : say({ ...values, date: parisDateTime(update.createdAt, language).date }, (params) =>
              t(
                ($) => $.notifications.feedbackSettledUpdate,
                params as typeof values & { date: string },
              ),
            )
      return {
        ...plain,
        ...said,
        icon: 'check-circle',
        leading: memberLeading(author),
        thumb: projectThumb(project),
        version,
        target: cornerRoute(project.id, 'feedback'),
      }
    }
    case 'project_category': {
      // R8 : un administrateur a rangé le projet ; la phrase est signée par l'équipe, jamais par
      // lui. Le nom de la catégorie est celui de l'API, dans la langue du membre.
      const { project, category } = notification
      const values = {
        title: project.title,
        category: categories?.find((one) => one.code === category)?.name ?? category,
      }
      const said = say(values, (params) =>
        t(($) => $.notifications.projectCategory, params as typeof values),
      )
      return {
        ...plain,
        ...said,
        icon: 'shapes',
        leading: iconLeading('shapes'),
        thumb: projectThumb(project),
        target: projectRoute(project.id),
      }
    }
    case 'showcase_added': {
      // R12 : la modération a mis un de ses projets publics sur l'accueil (la vitrine). La phrase
      // est signée par l'équipe, jamais par l'administrateur ; au toucher, la page du projet.
      // « Retirer de l'accueil » n'est pas un lien vers une page mais une écriture (plan R12,
      // décision 18) : l'écran la pose lui-même sous la ligne, tant que `onShowcase` est vrai, car
      // elle demande un hook et un état que ce fichier de fonctions pures ne peut pas porter.
      // Le temps suit l'état (relecture juridique R12, point 1) : « est sur l'accueil » tant que le
      // projet y est, « a été sur l'accueil » dès qu'il n'y est plus (refus de l'auteur, retrait par
      // la modération, sortie de « Public »). Sinon l'auteur qui a refusé croirait son refus perdu.
      const { project, onShowcase } = notification
      const said = say({ title: project.title }, (params) =>
        t(
          ($) => (onShowcase ? $.notifications.showcaseAdded : $.notifications.showcaseWas),
          params as { title: string },
        ),
      )
      return {
        ...plain,
        ...said,
        // L'étoile dans le miel, comme sur la planche R12-Vitrine (« Chez l'auteur, dans Activité »).
        icon: 'star',
        leading: iconLeading('star', 'honey'),
        thumb: projectThumb(project),
        target: projectRoute(project.id),
      }
    }
    case 'tool_added': {
      // R8 : l'outil qu'il avait écrit en « Autre » est au catalogue (`merged` faux), ou s'affiche
      // maintenant sous le nom d'un outil existant (`merged` vrai). Au toucher, la page de l'outil.
      const { merged, typedName, toolName, toolSlug } = notification
      const said = merged
        ? say({ name: typedName, tool: toolName }, (params) =>
            t(($) => $.notifications.toolMerged, params as { name: string; tool: string }),
          )
        : say({ name: typedName }, (params) =>
            t(($) => $.notifications.toolAdded, params as { name: string }),
          )
      return {
        ...plain,
        ...said,
        icon: 'wrench',
        leading: iconLeading('wrench'),
        thumb: { kind: 'tool', name: toolName },
        target: { pathname: '/tags/[slug]', params: { slug: toolSlug } },
      }
    }
    // R19 (planche R19-Activite, option b14) : les avis de la récolte. Aucune félicitation : la
    // phrase dit ce qui est arrivé, l'alvéole numérotée ou le petit sceau le montrent à gauche.
    case 'game_level': {
      const said = say({}, () => t(($) => $.notifications.gameLevel, { level: notification.level }))
      return {
        ...plain,
        ...said,
        icon: 'hexagon',
        leading: { kind: 'level', level: notification.level },
        target: HARVEST,
      }
    }
    case 'game_seal': {
      const { code } = notification
      const seal = sealOf(code, t, categories)
      const said = say({ seal: seal.name }, (params) =>
        t(($) => $.notifications.gameSeal, params as { seal: string }),
      )
      return {
        ...plain,
        ...said,
        icon: seal.icon,
        leading: { kind: 'seal', icon: seal.icon, matter: seal.matter },
        target: HARVEST,
      }
    }
    case 'game_hive_challenge': {
      // Annoncé à tous les membres de la ruche ; le miel, seulement à qui y a participé (la ligne
      // ne dit jamais qui n'a rien fait). Sans nom (retiré par la modération), la ligne ne nomme
      // aucune ruche, et ne mène nulle part sans identifiant.
      const { hive, code, honey } = notification
      const said =
        hive.name === null
          ? say({}, () => t(($) => $.notifications.gameHiveChallengeUnnamed))
          : say({ hive: hive.name }, (params) =>
              t(($) => $.notifications.gameHiveChallenge, params as { hive: string }),
            )
      const challenge = t(($) => $.game.challenges.hive[code])
      return {
        ...plain,
        ...said,
        icon: 'hexagon',
        leading: iconLeading(hive.icon ?? 'hexagon', 'honey'),
        detail:
          honey > 0
            ? t(($) => $.notifications.gameHiveChallengeHoney, { challenge, honey })
            : challenge,
        target: hive.id ? { pathname: '/hives/[id]', params: { id: hive.id } } : null,
      }
    }
    case 'game_honey_gift': {
      // Qui a offert, avec sa photo ; au toucher, le projet qui a reçu le miel.
      const { actor, project } = notification
      const said = say({ name: actor.name, title: project.title }, (params) =>
        t(($) => $.notifications.gameHoneyGift, params as { name: string; title: string }),
      )
      return {
        ...plain,
        ...said,
        icon: 'hexagon',
        leading: memberLeading(actor),
        thumb: projectThumb(project),
        target: projectRoute(project.id),
      }
    }
    case 'game_intro': {
      // Une fois par compte (relecture juridique du plan, J1) : au toucher, « Ma récolte ».
      const said = say({}, () => t(($) => $.notifications.gameIntro))
      return {
        ...plain,
        ...said,
        icon: 'sparkle',
        leading: iconLeading('sparkle', 'honey'),
        target: HARVEST,
      }
    }
    case 'handle': {
      const said = say({ handle: notification.handle }, (params) =>
        t(($) => $.notifications.handle, params as { handle: string }),
      )
      return {
        ...plain,
        ...said,
        icon: 'sparkle',
        leading: iconLeading('sparkle'),
        target: '/profile',
      }
    }
    case 'suspended': {
      // Tranche 7c (article 17 du DSA ; relecture juridique J2, J3, J4) : la mesure et sa fin, à
      // l'heure de Paris (la même valeur que l'e-mail), puis, une phrase par ligne, si elle suit un
      // signalement (jamais de qui), qu'une personne a décidé, le fondement, l'explication, et
      // comment contester. Jamais l'administrateur. Elle ne mène nulle part : le bandeau, en haut de
      // chaque page, en dit autant tant que la suspension dure.
      // « Ce qui reste possible » n'y est pas : la notification reste après la fin de la mesure.
      const { endsAt, ground, explanation, afterReport } = notification
      const end = endsAt ? parisDateTime(endsAt, language) : null
      const said = end
        ? say({ date: end.date, time: end.time }, (params) =>
            t(($) => $.notifications.suspended, params as { date: string; time: string }),
          )
        : say({}, () => t(($) => $.notifications.suspendedIndefinite))
      return {
        ...plain,
        ...said,
        icon: 'lock-simple',
        leading: iconLeading('lock-simple', 'danger'),
        detail: [
          afterReport ? t(($) => $.suspension.afterReport) : t(($) => $.suspension.direct),
          t(($) => $.removal.grounds[ground]),
          t(($) => $.suspension.explanation, { explanation }),
          t(($) => $.suspension.contest),
        ].join('\n'),
        target: null,
      }
    }
    case 'suspension_ended': {
      // À la date prévue, ou levée plus tôt (J6) ; une levée dit pourquoi.
      // R9 (jur-R6) : levée parce que c'était une erreur de la modération, elle le dit.
      const { lifted, cause, explanation } = notification
      const said = say({}, () =>
        cause === 'error'
          ? t(($) => $.notifications.suspensionEnded.liftedError)
          : lifted
            ? t(($) => $.notifications.suspensionEnded.lifted)
            : t(($) => $.notifications.suspensionEnded.ended),
      )
      return {
        ...plain,
        ...said,
        icon: 'lock-simple-open',
        leading: iconLeading('lock-simple-open', 'danger'),
        detail: explanation ? t(($) => $.suspension.explanation, { explanation }) : null,
        target: null,
      }
    }
    case 'removed': {
      // Tranche 7a, règle 13 de la relecture du plan (article 17 du DSA) : ce qui est retiré (la
      // phrase). La ligne garde toute la motivation, une phrase par ligne (que lui seul le voit,
      // après un signalement ou non, le fondement, l'explication, comment contester ; jamais de
      // qui, ni l'administrateur), qu'elle mène quelque part ou non : elle mène au projet, que son
      // auteur voit toujours, sauf pour un commentaire sur le projet d'un membre qui l'a bloqué
      // (tranche 7b règle 9).
      const {
        targetKind,
        project,
        excerpt,
        part,
        ground,
        explanation,
        afterReport,
        projectHidden,
      } = notification
      // R10 : le nom d'une ruche retiré (seul cas sans projet) : la phrase, puis toute la
      // motivation, comme pour un contenu (article 17 du DSA). Relecture juridique (C2) : la ligne
      // va à l'animateur actuel et à qui avait écrit le nom. L'API ne donne l'identifiant de la
      // ruche qu'à l'animateur, tant que le retrait dure : lui seul est invité à la renommer, et
      // la ligne mène à ses réglages. La ruche se reconnaît à son icône ; renommée depuis, à son
      // nom actuel (jamais celui qui a été retiré).
      if (targetKind === 'hive' || project === null) {
        const hive = notification.hive
        const renamable = hive?.id ? hive.id : null
        const currentName = hive?.name ?? null
        const said =
          currentName === null
            ? say({}, () => t(($) => $.notifications.removed.hive))
            : say({ hive: currentName }, (params) =>
                t(($) => $.notifications.removed.hiveRenamed, params as { hive: string }),
              )
        const rest =
          renamable !== null
            ? t(($) => $.removal.part.rest.hive)
            : currentName === null
              ? t(($) => $.removal.part.restHiveWriter)
              : null
        return {
          ...plain,
          ...said,
          icon: 'prohibit',
          leading: iconLeading(hive?.icon ?? 'prohibit', 'danger'),
          detail: [
            t(($) => $.removal.part.onlyYou),
            ...(rest ? [rest] : []),
            afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct),
            t(($) => $.removal.grounds[ground]),
            t(($) => $.removal.explanation, { explanation }),
            t(($) => $.removal.contest),
          ].join('\n'),
          target:
            renamable !== null
              ? { pathname: '/hives/[id]/settings', params: { id: renamable } }
              : null,
        }
      }
      const elsewhere = targetKind === 'comment' && projectHidden
      // R9 : une partie retirée seule se nomme (« La 2e photo de Météo… ») ; une partie que
      // l'auteur ne voit pas comme telle retombe sur la phrase du contenu entier.
      const partKey = part ? removedPartKey(targetKind, part.field) : null
      const said = elsewhere
        ? say({}, () => t(($) => $.notifications.removed.commentElsewhere))
        : part && partKey
          ? say({ title: project.title }, (params) =>
              t(($) => $.notifications.removedPart[partKey], {
                ...params,
                rank: rankOf(part.position, t),
              } as { title: string; rank: string }),
            )
          : say({ title: project.title }, (params) =>
              t(($) => $.notifications.removed[targetKind], params as { title: string }),
            )
      // « Contester » : l'adresse de contact, avec un objet qui nomme la partie, le contenu et la
      // date (J12). Seulement pour une partie : un contenu entier garde « Voir la raison ».
      const action: Presented['action'] =
        part && partKey && !elsewhere
          ? {
              label: t(($) => $.notifications.contest),
              contact: {
                subject: partContestSubject(t, language, {
                  part: partText({ ...part, mediaId: null }, t, targetKind),
                  title: project.title,
                  at: notification.at,
                }),
              },
            }
          : null
      const target: Href | null = elsewhere
        ? null
        : // R7b : un appel ou un message retiré mène au coin des testeurs, à son onglet (Appels,
          // ou Retours) ; le reste, à la page du projet.
          targetKind === 'call'
          ? cornerRoute(project.id, 'calls')
          : targetKind === 'message'
            ? cornerRoute(project.id, 'feedback')
            : projectRoute(project.id)
      return {
        ...plain,
        ...said,
        icon: 'prohibit',
        leading: iconLeading('prohibit', 'danger'),
        thumb: elsewhere ? null : projectThumb(project),
        // Toute la motivation, qu'il y ait un lien ou non (article 17 du DSA) : « Voir la raison et
        // comment contester » ne la remplace jamais.
        detail: [
          part && partKey ? t(($) => $.removal.part.onlyYou) : t(($) => $.removal.onlyYou),
          afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct),
          t(($) => $.removal.grounds[ground]),
          t(($) => $.removal.explanation, { explanation }),
          t(($) => $.removal.contest),
        ].join('\n'),
        quote: excerpt,
        action,
        target,
      }
    }
    case 'profile_removed': {
      // R9 (L2) : une partie du profil retirée. Le nom et le pseudo sont remplacés d'office : la
      // phrase dit par quoi, et « Choisir un pseudo » (ou un nom) mène aux réglages du profil, où le
      // membre en choisit un autre ; comme l'action ne mène pas à « Contester », l'adresse reste
      // écrite dans la motivation (article 17 du DSA). Une bio, des outils ou une photo n'ont rien
      // à choisir : l'action est « Contester », avec un objet qui nomme la décision et sa date.
      const { part, replacedBy, ground, explanation, afterReport } = notification
      const field = part.field
      const said =
        field === 'name' || field === 'handle'
          ? say({ replacedBy: replacedBy ?? '' }, (params) =>
              t(($) => $.notifications.profileRemoved[field], params as { replacedBy: string }),
            )
          : say({}, () => t(($) => $.notifications.profileRemoved[field]))
      const action: Presented['action'] =
        field === 'handle'
          ? { label: t(($) => $.notifications.chooseHandle), target: PROFILE_SETTINGS }
          : field === 'name'
            ? { label: t(($) => $.notifications.chooseName), target: PROFILE_SETTINGS }
            : {
                label: t(($) => $.notifications.contest),
                contact: {
                  subject: contestSubjectOf(
                    t,
                    language,
                    t(($) => $.removal.contestDecision.profilePart, {
                      part: partText({ field, mediaId: null, position: null }, t),
                    }),
                    notification.at,
                  ),
                },
              }
      return {
        ...plain,
        ...said,
        icon: 'prohibit',
        leading: iconLeading('prohibit', 'danger'),
        detail: [
          t(($) => $.removal.part.onlyYou),
          afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct),
          t(($) => $.removal.grounds[ground]),
          t(($) => $.removal.explanation, { explanation }),
          t(($) => $.removal.contest),
        ].join('\n'),
        action,
        target: null,
      }
    }
    case 'restored': {
      // R9 (L3) : un contenu ou une partie rétablis, signés par l'équipe (jamais par qui a décidé).
      // Une partie nommée par son rang (« La 2e photo de Météo ») ; le pseudo ou le nom revient ou
      // non : le membre a pu en choisir un autre entre-temps (`valueBack`).
      const { targetKind, project, part, handle, valueBack } = notification
      // R10 : le nom d'une ruche est de nouveau visible (sans projet, sans lien).
      if (targetKind === 'hive') {
        const hiveLine = say(
          { hive: hiveName(notification.hive?.name ?? null, 'plain', t) },
          (params) => t(($) => $.notifications.restored.hive, params as { hive: string }),
        )
        return {
          ...plain,
          ...hiveLine,
          icon: 'check-circle',
          leading: iconLeading('check-circle', 'honey'),
          detail: t(($) => $.notifications.team),
          target: null,
        }
      }
      const field = part?.field
      const rank = rankOf(part?.position ?? null, t)
      const said =
        targetKind === 'member'
          ? field === 'name'
            ? say({}, () =>
                valueBack
                  ? t(($) => $.notifications.restored.nameBack)
                  : t(($) => $.notifications.restored.nameNotBack),
              )
            : field === 'bio' || field === 'favoriteTools' || field === 'avatar'
              ? say({}, () => t(($) => $.notifications.restored[field]))
              : say({ handle: handle ?? '' }, (params) =>
                  valueBack
                    ? t(($) => $.notifications.restored.handleBack, params as { handle: string })
                    : t(
                        ($) => $.notifications.restored.handleNotBack,
                        params as { handle: string },
                      ),
                )
          : project && field
            ? say({ title: project.title }, (params) =>
                t(($) => $.notifications.restored.part, {
                  ...params,
                  part: t(($) => $.report.parts[field], { rank }),
                }),
              )
            : project
              ? say({ title: project.title }, (params) =>
                  t(($) => $.notifications.restored[targetKind], params as { title: string }),
                )
              : say({}, () => t(($) => $.notifications.restored.commentElsewhere))
      return {
        ...plain,
        ...said,
        icon: 'check-circle',
        leading: iconLeading('check-circle', 'honey'),
        thumb: project ? projectThumb(project) : null,
        detail: t(($) => $.notifications.team),
        target: project ? projectRoute(project.id) : null,
      }
    }
    case 'report_handled': {
      // Tranche 7a, règle 2 : la sorte de contenu et l'issue, et comment contester ; ni titre, ni
      // extrait, ni auteur. Un lien seulement si la cible est encore visible (l'API le décide).
      const { targetKind, outcome, link } = notification
      // R9 (relectures) : un signalement qui ne visait qu'une partie le dit (`part`), sans nommer
      // laquelle ; les autres gardent le texte de leur sorte de contenu.
      const said = say({}, () =>
        notification.part
          ? t(($) => $.notifications.reportHandled.part[outcome])
          : t(($) => $.notifications.reportHandled[targetKind][outcome]),
      )
      return {
        ...plain,
        ...said,
        icon: 'flag',
        leading: iconLeading('flag', 'danger'),
        detail: t(($) => $.notifications.reportHandled.contest),
        target: link?.memberId
          ? { pathname: '/members/[id]', params: { id: link.memberId } }
          : link?.projectId
            ? projectRoute(link.projectId)
            : null,
      }
    }
  }
}
