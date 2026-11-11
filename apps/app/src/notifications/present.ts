// Ce qu'une notification écrit à l'écran, et où elle mène, selon sa sorte (`kind`). Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
import { type Notification, REACTION_KINDS } from '@ruche/contracts'
import type { Href } from 'expo-router'
import type { useTranslation } from 'react-i18next'
import type { IconName } from '../ui/Icon'
import { parisDateTime } from '../ui/parisTime'

type T = ReturnType<typeof useTranslation>['t']

/** Les textes d'une carte de notification, et sa destination (null : elle ne mène nulle part). */
export type Presented = {
  icon: IconName
  text: string
  detail: string | null
  quote: string | null
  target: Href | null
}

const projectRoute = (id: string): Href => ({ pathname: '/projects/[id]', params: { id } })

/** Un onglet du coin des testeurs d'un projet (R7b). */
const cornerRoute = (id: string, tab: 'calls' | 'feedback'): Href => ({
  pathname: '/projects/[id]/testers',
  params: { id, tab },
})

/**
 * Les textes et la destination d'une notification. Les réactions et les abonnés ne nomment
 * personne ; un commentaire nomme son auteur, déjà visible sous le commentaire. Celles de la
 * modération (tranche 7a) ne nomment jamais qui a signalé, ni qui a décidé.
 */
export const presentNotification = (
  notification: Notification,
  t: T,
  /** La langue de l'écran (« fr », « en ») : elle écrit la date de fin d'une suspension. */
  language: string,
): Presented => {
  switch (notification.kind) {
    case 'reactions': {
      const { counts, total, project } = notification
      // Seulement les réactions reçues, dans l'ordre de la barre des réactions : « Bravo ×2 ».
      const detail = REACTION_KINDS.filter((kind) => counts[kind] > 0)
        .map((kind) =>
          t(($) => $.notifications.reactionCount, {
            reaction: t(($) => $.project.reactions[kind]),
            count: counts[kind],
          }),
        )
        .join(', ')
      return {
        icon: 'heart',
        text: t(($) => $.notifications.reactions, { count: total, title: project.title }),
        detail: detail || null,
        quote: null,
        target: projectRoute(project.id),
      }
    }
    case 'project_follows':
      return {
        icon: 'bookmark-simple',
        text: t(($) => $.notifications.projectFollows, {
          count: notification.count,
          title: notification.project.title,
        }),
        detail: null,
        quote: null,
        target: projectRoute(notification.project.id),
      }
    case 'project_update': {
      // R7a : une mise à jour d'un projet qu'on suit ou qu'on teste. Le nom de l'auteur (déjà affiché
      // sur la page du projet), le projet et la version s'il y en a une ; la première ligne de « Ce
      // qui a changé » dessous ; au toucher, la frise des mises à jour du projet.
      const { author, project, update } = notification
      const name = author.name
      const title = project.title
      return {
        icon: 'arrows-clockwise',
        text: update.version
          ? t(($) => $.notifications.projectUpdateVersion, { name, title, version: update.version })
          : t(($) => $.notifications.projectUpdate, { name, title }),
        detail: update.firstLine.text,
        quote: null,
        target: { pathname: '/projects/[id]/updates', params: { id: project.id } },
      }
    }
    case 'member_follows':
      // Sans nom, elle n'a rien à montrer de plus : elle ne mène nulle part.
      return {
        icon: 'user-plus',
        text: t(($) => $.notifications.memberFollows, { count: notification.count }),
        detail: null,
        quote: null,
        target: null,
      }
    case 'comment': {
      const { reason, author, project, comment } = notification
      const name = author.name
      const title = project.title
      // Les trois sortes (sur son projet, une mention, une réponse) écrivent la phrase, puis
      // l'extrait dessous, en citation : la même forme partout, et l'extrait se lit à part.
      const sorts = {
        comment: { icon: 'chat-circle', text: t(($) => $.notifications.comment, { name, title }) },
        mention: { icon: 'at', text: t(($) => $.notifications.mention, { name, title }) },
        reply: {
          icon: 'arrow-bend-up-left',
          text: t(($) => $.notifications.reply, { name, title }),
        },
      } as const
      return {
        ...sorts[reason],
        detail: null,
        quote: comment.excerpt,
        target: projectRoute(project.id),
      }
    }
    case 'hidden':
      return {
        icon: 'eye-slash',
        text: t(($) => $.notifications.hidden, { title: notification.project.title }),
        detail: null,
        quote: notification.comment.excerpt,
        target: projectRoute(notification.project.id),
      }
    case 'tester_call': {
      // R7b : un appel à tester ; le début de l'appel dessous, en citation ; au toucher, l'onglet
      // « Appels » du coin des testeurs.
      const { author, project, call } = notification
      return {
        icon: 'megaphone-simple',
        text: t(($) => $.notifications.testerCall, { name: author.name, title: project.title }),
        detail: null,
        quote: call.excerpt,
        target: cornerRoute(project.id, 'calls'),
      }
    }
    case 'tester_message': {
      // R7b : un message d'un fil de testeur. Le fil est privé : jamais d'extrait, seulement qui a
      // écrit. L'auteur ouvre le fil de ce testeur ; le testeur, l'onglet « Retours » où il lit la
      // réponse sous son retour.
      const { from, project, role, message } = notification
      const params = { name: from.name, title: project.title }
      if (role === 'author') {
        return {
          icon: 'chat-circle-dots',
          text: t(($) => $.notifications.testerReplyToTester, params),
          detail: null,
          quote: null,
          target: cornerRoute(project.id, 'feedback'),
        }
      }
      return {
        icon: 'chat-circle-dots',
        text:
          message.kind === 'feedback'
            ? t(($) => $.notifications.testerFeedback, params)
            : t(($) => $.notifications.testerReplyToAuthor, params),
        detail: null,
        quote: null,
        target: {
          pathname: '/projects/[id]/testers/threads/[testerId]',
          params: { id: project.id, testerId: message.testerId },
        },
      }
    }
    case 'feedback_settled': {
      // R7b : un de ses retours est réglé, à la main, ou par une mise à jour (sa version, sinon sa
      // date, écrite à l'heure de Paris comme les autres dates de l'Activité).
      const { author, project, update } = notification
      const params = { name: author.name, title: project.title }
      return {
        icon: 'check-circle',
        text: !update
          ? t(($) => $.notifications.feedbackSettled, params)
          : update.version
            ? t(($) => $.notifications.feedbackSettledVersion, {
                ...params,
                version: update.version,
              })
            : t(($) => $.notifications.feedbackSettledUpdate, {
                ...params,
                date: parisDateTime(update.createdAt, language).date,
              }),
        detail: null,
        quote: null,
        target: cornerRoute(project.id, 'feedback'),
      }
    }
    case 'handle':
      return {
        icon: 'sparkle',
        text: t(($) => $.notifications.handle, { handle: notification.handle }),
        detail: null,
        quote: null,
        target: '/profile',
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
      return {
        icon: 'lock-simple',
        text: end
          ? t(($) => $.notifications.suspended, { date: end.date, time: end.time })
          : t(($) => $.notifications.suspendedIndefinite),
        detail: [
          afterReport ? t(($) => $.suspension.afterReport) : t(($) => $.suspension.direct),
          t(($) => $.removal.grounds[ground]),
          t(($) => $.suspension.explanation, { explanation }),
          t(($) => $.suspension.contest),
        ].join('\n'),
        quote: null,
        target: null,
      }
    }
    case 'suspension_ended': {
      // À la date prévue, ou levée plus tôt (J6) ; une levée dit pourquoi.
      const { lifted, explanation } = notification
      return {
        icon: 'lock-simple-open',
        text: lifted
          ? t(($) => $.notifications.suspensionEnded.lifted)
          : t(($) => $.notifications.suspensionEnded.ended),
        detail: explanation ? t(($) => $.suspension.explanation, { explanation }) : null,
        quote: null,
        target: null,
      }
    }
    case 'removed': {
      // Tranche 7a, règle 13 de la relecture du plan (article 17 du DSA) : ce qui est retiré (la
      // phrase), puis, une phrase par ligne, que lui seul le voit encore, après un signalement ou
      // non (jamais de qui), qu'une personne a décidé, le fondement, l'explication, et comment
      // contester. L'extrait d'une note ou d'un commentaire suit en citation. Elle mène au projet,
      // que son auteur voit toujours (un commentaire retiré s'y lit pour lui seul).
      // Tranche 7b (règle 9) : un commentaire écrit sur le projet d'un membre qui m'a bloqué, que je
      // ne vois plus. L'API le dit par `projectHidden` (tranche 7c ; avant, l'appli le devinait à
      // un titre vide) : la notification garde la motivation, sans titre ni lien.
      const { targetKind, project, excerpt, ground, explanation, afterReport, projectHidden } =
        notification
      const elsewhere = targetKind === 'comment' && projectHidden
      return {
        icon: 'prohibit',
        text: elsewhere
          ? t(($) => $.notifications.removed.commentElsewhere)
          : t(($) => $.notifications.removed[targetKind], { title: project.title }),
        detail: [
          t(($) => $.removal.onlyYou),
          afterReport ? t(($) => $.removal.afterReport) : t(($) => $.removal.direct),
          t(($) => $.removal.grounds[ground]),
          t(($) => $.removal.explanation, { explanation }),
          t(($) => $.removal.contest),
        ].join('\n'),
        quote: excerpt,
        target: elsewhere ? null : projectRoute(project.id),
      }
    }
    case 'report_handled': {
      // Tranche 7a, règle 2 : la sorte de contenu et l'issue, et comment contester ; ni titre, ni
      // extrait, ni auteur. Un lien seulement si la cible est encore visible (l'API le décide).
      const { targetKind, outcome, link } = notification
      return {
        icon: 'flag',
        text: t(($) => $.notifications.reportHandled[targetKind][outcome]),
        detail: t(($) => $.notifications.reportHandled.contest),
        quote: null,
        target: link?.memberId
          ? { pathname: '/members/[id]', params: { id: link.memberId } }
          : link?.projectId
            ? projectRoute(link.projectId)
            : null,
      }
    }
  }
}
