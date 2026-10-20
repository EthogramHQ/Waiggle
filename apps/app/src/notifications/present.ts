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
 * personne ; un commentaire nomme son auteur, déjà visible sous le commentaire.
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
  }
}
