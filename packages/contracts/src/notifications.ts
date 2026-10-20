// Les notifications dans l'appli (tranche 6b). Elles ne sont pas recopiées dans une table : l'API les
// calcule à la lecture à partir des réactions, abonnements, commentaires et mentions qui existent.
// Une réaction retirée, un commentaire supprimé ou masqué, un projet devenu privé font donc
// disparaître la notification d'eux-mêmes. Réactions et abonnés sont groupés et sans nom : une
// notification ne révèle jamais ce que l'écran cache (on ne voit nulle part qui a réagi ou suit).
import { z } from 'zod'
import { CommentId } from './comments'
import { FeedCursor } from './feed'
import { ProjectAuthor, ProjectId } from './projects'
import { ReactionCounts } from './reactions'

/** L'écran charge les notifications 20 par 20, de la plus récente à la plus ancienne. */
export const NOTIFICATION_PAGE_SIZE = 20
/** Une notification se montre 90 jours, puis plus du tout (décision du 20/10/2026). */
export const NOTIFICATION_DAYS = 90
/** L'extrait d'un commentaire dans une notification : 80 caractères au plus. */
export const EXCERPT_MAX = 80
/** Le nombre de la cloche s'arrête à 10 : l'appli affiche « 9+ » au-delà de 9. */
export const UNREAD_COUNT_MAX = 10

/** Le projet dont parle une notification : de quoi écrire son titre et y mener. */
const NotifiedProject = z.object({ id: ProjectId, title: z.string() })
/** Le commentaire dont parle une notification : son texte actuel, raccourci. */
const NotifiedComment = z.object({ id: CommentId, excerpt: z.string().max(EXCERPT_MAX + 1) })
/** Un jour, en heure de Paris (« 2026-10-20 ») : les groupes vont par jour. */
const Day = z.iso.date()

// Ce que toutes les notifications ont en commun.
const Common = {
  /** Une clé stable du groupe (« reactions:<projet>:<jour> ») : l'appli s'en sert comme clé de liste. */
  id: z.string().min(1).max(200),
  /** Le geste le plus récent du groupe : c'est lui qui range la notification dans la liste. */
  at: z.iso.datetime(),
  /** Vrai si ce geste est arrivé après la dernière ouverture de l'écran. */
  isNew: z.boolean(),
}

/**
 * Les réactions à un de ses projets, un jour donné : les nombres par type et le total, jamais les
 * noms. Une réaction retirée sort du nombre ; à zéro, la notification disparaît.
 */
export const ReactionsNotification = z.object({
  ...Common,
  kind: z.literal('reactions'),
  project: NotifiedProject,
  day: Day,
  counts: ReactionCounts,
  total: z.int().positive(),
})

/** De nouveaux abonnés à un de ses projets, un jour donné, sans noms. */
export const ProjectFollowsNotification = z.object({
  ...Common,
  kind: z.literal('project_follows'),
  project: NotifiedProject,
  day: Day,
  count: z.int().positive(),
})

/** De nouveaux abonnés à son compte, un jour donné, sans noms. */
export const MemberFollowsNotification = z.object({
  ...Common,
  kind: z.literal('member_follows'),
  day: Day,
  count: z.int().positive(),
})

/**
 * Pourquoi un commentaire lui est signalé, une seule fois par commentaire : il y est mentionné,
 * sinon c'est une réponse dans son fil, sinon un commentaire sur son projet.
 */
export const CommentReason = z.enum(['mention', 'reply', 'comment'])
export type CommentReason = z.infer<typeof CommentReason>

/**
 * Un commentaire d'un autre membre : sur son projet, en réponse dans son fil, ou qui le mentionne.
 * Le nom de l'auteur est donné : il est déjà affiché sous le commentaire.
 */
export const CommentNotification = z.object({
  ...Common,
  kind: z.literal('comment'),
  reason: CommentReason,
  project: NotifiedProject,
  comment: NotifiedComment,
  author: ProjectAuthor.extend({ handle: z.string() }),
})

/** Son commentaire a été masqué par l'auteur du projet ; démasqué, la notification disparaît. */
export const HiddenNotification = z.object({
  ...Common,
  kind: z.literal('hidden'),
  project: NotifiedProject,
  comment: NotifiedComment,
})

/** La première notification : le pseudo qu'il a reçu, tiré de son nom, qu'il peut changer. */
export const HandleNotification = z.object({
  ...Common,
  kind: z.literal('handle'),
  /** Son pseudo actuel, sans « @ ». */
  handle: z.string(),
})

/** Une notification : l'appli choisit son texte selon `kind`. */
export const Notification = z
  .discriminatedUnion('kind', [
    ReactionsNotification,
    ProjectFollowsNotification,
    MemberFollowsNotification,
    CommentNotification,
    HiddenNotification,
    HandleNotification,
  ])
  .meta({ id: 'Notification' })
export type Notification = z.infer<typeof Notification>
export type NotificationKind = Notification['kind']

/** Les paramètres d'adresse de la liste (GET /v1/notifications) : sans curseur, la première page. */
export const NotificationsQuery = z.object({ cursor: FeedCursor.optional() })
export type NotificationsQuery = z.infer<typeof NotificationsQuery>

/**
 * Une page de notifications, de la plus récente à la plus ancienne, avec le marque-page de la
 * suivante (null tout au bout). `asOf` est l'heure du serveur au moment de la lecture : l'appli la
 * renvoie à PUT /v1/notifications/seen, pour marquer vu ce qui existait à l'ouverture, et rien de
 * ce qui serait arrivé entre-temps.
 */
export const NotificationPage = z
  .object({
    items: z.array(Notification).max(NOTIFICATION_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
    asOf: z.iso.datetime(),
  })
  .meta({ id: 'NotificationPage' })
export type NotificationPage = z.infer<typeof NotificationPage>

/** Le nombre de la cloche (GET /v1/notifications/unread) : les groupes nouveaux, 10 au plus. */
export const UnreadCount = z
  .object({ count: z.int().min(0).max(UNREAD_COUNT_MAX) })
  .meta({ id: 'UnreadCount' })
export type UnreadCount = z.infer<typeof UnreadCount>

/**
 * Ce que l'appli envoie en ouvrant l'écran (PUT /v1/notifications/seen) : tout ce qui est arrivé
 * jusqu'à `upTo` est vu. L'API ne recule jamais (une date plus ancienne ne change rien) et ne va
 * jamais au-delà de son heure à elle.
 */
export const SeenUpTo = z.object({ upTo: z.iso.datetime() }).meta({ id: 'SeenUpTo' })
export type SeenUpTo = z.infer<typeof SeenUpTo>
