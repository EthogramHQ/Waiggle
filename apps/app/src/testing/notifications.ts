// Notifications d'exemple pour les tests de l'appli (tranche 6b) : une de chaque sorte, telles que
// l'API les donne à Inès (GET /v1/notifications). Son projet public s'appelle « Météo ». Seuls des
// types viennent de @ruche/contracts : les captures (scripts/shots.mjs) peuvent lire ce fichier.
import type { Notification, NotificationPage, ReactionCounts } from '@ruche/contracts'

/** Une notification d'une sorte donnée (« reactions », « comment »…), avec ses champs à elle. */
export type Of<Kind extends Notification['kind']> = Extract<Notification, { kind: Kind }>

/** Le projet d'Inès dont parlent la plupart des notifications. */
export const meteoProject = { id: '6e7f8091-a2b3-4dc4-9ed5-e6f708192a3b', title: 'Météo' }

/** Malik, qui commente le projet d'Inès (son nom est déjà visible sous son commentaire). */
export const malikAuthor = { id: 'u4', name: 'Malik', avatarUrl: null, handle: 'malik' }

/** Aucune réaction : chaque test ajoute celles qui l'intéressent. */
export const noReactionCounts: ReactionCounts = {
  amazing: 0,
  inspiring: 0,
  useful: 0,
  funny: 0,
  bravo: 0,
}

/** Deux « Bravo » sur « Météo », aujourd'hui : nouveau. Aucun nom, seulement des nombres. */
export const reactionsNotification: Of<'reactions'> = {
  kind: 'reactions',
  id: `reactions:${meteoProject.id}:2026-10-20`,
  at: '2026-10-20T12:00:00.000Z',
  isNew: true,
  project: meteoProject,
  day: '2026-10-20',
  counts: { ...noReactionCounts, bravo: 2 },
  total: 2,
}

/** Malik a commenté « Météo » : nouveau. */
export const commentNotification: Of<'comment'> = {
  kind: 'comment',
  reason: 'comment',
  id: 'comment:7f8091a2-b3c4-4ed5-8fe6-f708192a3b4c',
  at: '2026-10-20T11:00:00.000Z',
  isNew: true,
  project: meteoProject,
  comment: { id: '7f8091a2-b3c4-4ed5-8fe6-f708192a3b4c', excerpt: 'Super idée…' },
  author: malikAuthor,
}

/** Malik parle d'Inès dans un commentaire sur « Météo » : déjà vu. */
export const mentionNotification: Of<'comment'> = {
  kind: 'comment',
  reason: 'mention',
  id: 'comment:8091a2b3-c4d5-4fe6-9f07-08192a3b4c5d',
  at: '2026-10-20T10:00:00.000Z',
  isNew: false,
  project: meteoProject,
  comment: { id: '8091a2b3-c4d5-4fe6-9f07-08192a3b4c5d', excerpt: 'Demande à @ines_morel' },
  author: malikAuthor,
}

/** Malik a répondu au commentaire d'Inès sur « Météo » : déjà vu. */
export const replyNotification: Of<'comment'> = {
  kind: 'comment',
  reason: 'reply',
  id: 'comment:91a2b3c4-d5e6-4f07-8018-192a3b4c5d6e',
  at: '2026-10-20T09:00:00.000Z',
  isNew: false,
  project: meteoProject,
  comment: { id: '91a2b3c4-d5e6-4f07-8018-192a3b4c5d6e', excerpt: 'Oui, en anglais aussi.' },
  author: malikAuthor,
}

/** Trois personnes de plus suivent Inès, hier : sans nom, et ne mène nulle part. */
export const memberFollowsNotification: Of<'member_follows'> = {
  kind: 'member_follows',
  id: 'member_follows:2026-10-19',
  at: '2026-10-19T18:00:00.000Z',
  isNew: false,
  day: '2026-10-19',
  count: 3,
}

/** Deux personnes de plus suivent « Météo », hier : sans nom. */
export const projectFollowsNotification: Of<'project_follows'> = {
  kind: 'project_follows',
  id: `project_follows:${meteoProject.id}:2026-10-19`,
  at: '2026-10-19T17:00:00.000Z',
  isNew: false,
  project: meteoProject,
  day: '2026-10-19',
  count: 2,
}

/** Le commentaire d'Inès sur « Météo » a été masqué par l'auteur du projet. */
export const hiddenNotification: Of<'hidden'> = {
  kind: 'hidden',
  id: 'hidden:a2b3c4d5-e6f7-4018-9129-2a3b4c5d6e7f',
  at: '2026-10-18T09:00:00.000Z',
  isNew: false,
  project: meteoProject,
  comment: { id: 'a2b3c4d5-e6f7-4018-9129-2a3b4c5d6e7f', excerpt: 'Une remarque' },
}

/** La toute première : le pseudo qu'Inès a reçu, tiré de son nom. */
export const handleNotification: Of<'handle'> = {
  kind: 'handle',
  id: 'handle',
  at: '2026-10-01T08:00:00.000Z',
  isNew: false,
  handle: 'ines_morel',
}

/** Toutes, dans l'ordre où l'API les range : de la plus récente à la plus ancienne. */
export const allNotifications: Notification[] = [
  reactionsNotification,
  commentNotification,
  mentionNotification,
  replyNotification,
  memberFollowsNotification,
  projectFollowsNotification,
  hiddenNotification,
  handleNotification,
]

// --- Tranche 7a : les deux sortes de la modération ---
// À part de `allNotifications` : les tests des tranches précédentes comptent ses éléments.

/** Le commentaire d'Inès sur « Météo » a été retiré, après un signalement, au nom des règles. */
export const removedCommentNotification: Of<'removed'> = {
  kind: 'removed',
  id: 'removed:comment:b3c4d5e6-f708-4129-8a3b-4c5d6e7f8091',
  at: '2026-10-21T09:00:00.000Z',
  isNew: true,
  targetKind: 'comment',
  project: meteoProject,
  excerpt: 'Écris-moi en privé pour le code',
  ground: 'rules',
  explanation: 'Demander un code de carte bancaire n’est pas permis ici.',
  afterReport: true,
  projectHidden: false,
}

/** Le projet « Météo » lui-même a été retiré, sans signalement, au nom de la loi. */
export const removedProjectNotification: Of<'removed'> = {
  kind: 'removed',
  id: `removed:project:${meteoProject.id}`,
  at: '2026-10-21T08:00:00.000Z',
  isNew: false,
  targetKind: 'project',
  project: meteoProject,
  excerpt: null,
  ground: 'illegal',
  explanation: 'Ces photos montrent des personnes sans leur accord.',
  afterReport: false,
  projectHidden: false,
}

/**
 * Le signalement d'un commentaire, fait par Inès, a été traité : retiré. Ni titre, ni extrait, ni
 * auteur ; le commentaire n'est plus visible, donc aucun lien.
 */
export const reportHandledNotification: Of<'report_handled'> = {
  kind: 'report_handled',
  id: 'report_handled:c4d5e6f7-0819-4a3b-9c4d-5e6f708192a3',
  at: '2026-10-21T10:00:00.000Z',
  isNew: true,
  targetKind: 'comment',
  outcome: 'removed',
  link: null,
}

/** Le signalement d'un projet, classé sans suite : le projet est toujours visible, d'où le lien. */
export const reportDismissedNotification: Of<'report_handled'> = {
  kind: 'report_handled',
  id: 'report_handled:d5e6f708-192a-4b4c-8d5e-6f708192a3b4',
  at: '2026-10-21T07:00:00.000Z',
  isNew: false,
  targetKind: 'project',
  outcome: 'dismissed',
  link: { projectId: 'e6f70819-2a3b-4c5d-9e6f-708192a3b4c5', memberId: null },
}

/** Le signalement d'un profil, classé sans suite : le lien mène à la page du membre. */
export const memberReportDismissedNotification: Of<'report_handled'> = {
  kind: 'report_handled',
  id: 'report_handled:e6f70819-2a3b-4c5d-8e6f-708192a3b4c5',
  at: '2026-10-21T06:00:00.000Z',
  isNew: false,
  targetKind: 'member',
  outcome: 'dismissed',
  link: { projectId: null, memberId: 'u7' },
}

export const moderationNotifications: Notification[] = [
  reportHandledNotification,
  removedCommentNotification,
  removedProjectNotification,
  reportDismissedNotification,
  memberReportDismissedNotification,
]

// --- Tranche 7c : la suspension de son compte, et sa fin ---
// Jamais l'administrateur qui a décidé, jamais qui a signalé (le contrat n'a pas ces champs).

/**
 * Le compte d'Inès suspendu 7 jours après un signalement, au nom des règles. La fin, 23 h 30 UTC
 * le 2 novembre, s'écrit « 3 novembre à 0 h 30 (heure de Paris) » (relecture juridique, J4).
 */
export const suspendedNotification: Of<'suspended'> = {
  kind: 'suspended',
  id: 'suspended:5f607182-93a4-4fb0-9bc2-4d5e6f708192',
  at: '2026-10-26T23:30:00.000Z',
  isNew: true,
  endsAt: '2026-11-02T23:30:00.000Z',
  ground: 'rules',
  explanation: 'Trois messages d’arnaque en deux jours, après deux retraits.',
  afterReport: true,
}

/** Le compte d'Inès suspendu sans fin, sans signalement, au nom de la loi. */
export const suspendedIndefinitelyNotification: Of<'suspended'> = {
  kind: 'suspended',
  id: 'suspended:60718293-a4b5-4c01-8cd3-5e6f708192a3',
  at: '2026-10-25T08:00:00.000Z',
  isNew: false,
  endsAt: null,
  ground: 'illegal',
  explanation: 'Publication répétée de photos de personnes sans leur accord.',
  afterReport: false,
}

/** La suspension d'Inès a pris fin à la date prévue : rien à expliquer. */
export const suspensionEndedNotification: Of<'suspension_ended'> = {
  kind: 'suspension_ended',
  id: 'suspension_ended:718293a4-b5c6-4d12-9de4-6f708192a3b4',
  at: '2026-11-02T23:30:00.000Z',
  isNew: true,
  lifted: false,
  explanation: null,
}

/** La suspension d'Inès a été levée plus tôt par un administrateur, avec son explication. */
export const suspensionLiftedNotification: Of<'suspension_ended'> = {
  kind: 'suspension_ended',
  id: 'suspension_ended:8293a4b5-c6d7-4e23-8ef5-708192a3b4c5',
  at: '2026-10-28T10:00:00.000Z',
  isNew: true,
  lifted: true,
  explanation: 'Les messages en cause ont été supprimés ; la suspension n’a plus lieu d’être.',
}

/** L'heure du serveur au moment de la lecture : l'appli la renvoie pour marquer vu. */
export const notificationsAsOf = '2026-10-20T12:30:00.000Z'

/** Une page de notifications (toutes, sans suite par défaut). */
export const notificationPageOf = (
  items: Notification[] = allNotifications,
  nextCursor: string | null = null,
  asOf = notificationsAsOf,
): NotificationPage => ({ items, nextCursor, asOf })
