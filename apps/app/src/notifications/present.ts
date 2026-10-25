// Ce qu'une notification écrit à l'écran, et où elle mène, selon sa sorte (`kind`). Des fonctions
// pures, à part des hooks de api.ts : les tests de l'écran remplacent api.ts sans perdre celles-ci.
import { type Notification, REACTION_KINDS } from '@ruche/contracts'
import type { Href } from 'expo-router'
import type { useTranslation } from 'react-i18next'
import type { IconName } from '../ui/Icon'

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

/**
 * Les textes et la destination d'une notification. Les réactions et les abonnés ne nomment
 * personne ; un commentaire nomme son auteur, déjà visible sous le commentaire. Celles de la
 * modération (tranche 7a) ne nomment jamais qui a signalé, ni qui a décidé.
 */
export const presentNotification = (notification: Notification, t: T): Presented => {
  switch (notification.kind) {
    case 'reactions': {
      const { counts, total, project } = notification
      // Seulement les réactions reçues, dans l'ordre de la barre des réactions : « Bravo ×2 ».
      const detail = REACTION_KINDS.filter((kind) => counts[kind] > 0)
        .map((kind) =>
          t('notifications.reactionCount', {
            reaction: t(`project.reactions.${kind}`),
            count: counts[kind],
          }),
        )
        .join(', ')
      return {
        icon: 'heart',
        text: t('notifications.reactions', { count: total, title: project.title }),
        detail: detail || null,
        quote: null,
        target: projectRoute(project.id),
      }
    }
    case 'project_follows':
      return {
        icon: 'bookmark-simple',
        text: t('notifications.projectFollows', {
          count: notification.count,
          title: notification.project.title,
        }),
        detail: null,
        quote: null,
        target: projectRoute(notification.project.id),
      }
    case 'member_follows':
      // Sans nom, elle n'a rien à montrer de plus : elle ne mène nulle part.
      return {
        icon: 'user-plus',
        text: t('notifications.memberFollows', { count: notification.count }),
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
        comment: { icon: 'chat-circle', text: t('notifications.comment', { name, title }) },
        mention: { icon: 'at', text: t('notifications.mention', { name, title }) },
        reply: { icon: 'arrow-bend-up-left', text: t('notifications.reply', { name, title }) },
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
        text: t('notifications.hidden', { title: notification.project.title }),
        detail: null,
        quote: notification.comment.excerpt,
        target: projectRoute(notification.project.id),
      }
    case 'handle':
      return {
        icon: 'sparkle',
        text: t('notifications.handle', { handle: notification.handle }),
        detail: null,
        quote: null,
        target: '/profile',
      }
    case 'removed': {
      // Tranche 7a, règle 13 de la relecture du plan (article 17 du DSA) : ce qui est retiré (la
      // phrase), puis, une phrase par ligne, que lui seul le voit encore, après un signalement ou
      // non (jamais de qui), qu'une personne a décidé, le fondement, l'explication, et comment
      // contester. L'extrait d'une note ou d'un commentaire suit en citation. Elle mène au projet,
      // que son auteur voit toujours (un commentaire retiré s'y lit pour lui seul).
      // Tranche 7b (règle 9) : un commentaire écrit sur le projet d'un membre qui m'a bloqué. L'API
      // vide le titre de ce projet, que je ne vois plus ; la notification garde la motivation, sans
      // titre ni lien.
      const { targetKind, project, excerpt, ground, explanation, afterReport } = notification
      const elsewhere = targetKind === 'comment' && project.title === ''
      return {
        icon: 'prohibit',
        text: elsewhere
          ? t('notifications.removed.commentElsewhere')
          : t(`notifications.removed.${targetKind}`, { title: project.title }),
        detail: [
          t('removal.onlyYou'),
          afterReport ? t('removal.afterReport') : t('removal.direct'),
          t(`removal.grounds.${ground}`),
          t('removal.explanation', { explanation }),
          t('removal.contest'),
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
        text: t(`notifications.reportHandled.${targetKind}.${outcome}`),
        detail: t('notifications.reportHandled.contest'),
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
