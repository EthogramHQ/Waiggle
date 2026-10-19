// Les deux fils de l'accueil (tranche 4) : « Abonnements » (GET /v1/feed/following) et
// « Découvrir » (GET /v1/feed/discover). Ils se lisent par pages de 20, du plus récent au plus
// ancien, grâce à un curseur : un marque-page rendu avec chaque page, qu'on renvoie pour obtenir
// la suivante.
import { z } from 'zod'
import { ProjectSummary } from './projects'

/** Le nombre d'éléments par page de fil. */
export const FEED_PAGE_SIZE = 20

/**
 * Le marque-page d'un fil. Pour l'appli, c'est un texte opaque : elle le reçoit avec une page et le
 * renvoie tel quel pour avoir la suivante, sans jamais le lire. (Pour l'API, c'est la date et
 * l'identifiant du dernier élément de la page, encodés en base64url.) Seuls les caractères du
 * base64url sont admis, et 200 au plus : un curseur fabriqué à la main ne peut rien glisser d'autre.
 */
export const FeedCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/** Les paramètres d'adresse du fil « Abonnements » : sans curseur, la première page. */
export const FeedQuery = z.object({ cursor: FeedCursor.optional() })
export type FeedQuery = z.infer<typeof FeedQuery>

/**
 * Les paramètres d'adresse du fil « Découvrir ». `testers=true` ne garde que les projets qui
 * cherchent des testeurs : au statut « testable », avec un lien de démo.
 */
export const DiscoverQuery = FeedQuery.extend({ testers: z.enum(['true', 'false']).optional() })
export type DiscoverQuery = z.infer<typeof DiscoverQuery>

/**
 * Un nouveau projet dans le fil. `at` est le moment où il est devenu public pour la première fois :
 * un brouillon rendu public plus tard arrive en haut du fil.
 */
export const FeedProjectItem = z.object({
  kind: z.literal('project'),
  at: z.iso.datetime(),
  project: ProjectSummary,
})

/**
 * Un élément du fil. Une « union discriminée » : un objet de l'une des formes listées, que le champ
 * `kind` permet de distinguer. La tranche 4b y ajoutera les notes (`kind: 'update'`).
 */
export const FeedItem = z.discriminatedUnion('kind', [FeedProjectItem]).meta({ id: 'FeedItem' })
export type FeedItem = z.infer<typeof FeedItem>

/** Une page de fil. `nextCursor` vaut null quand il n'y a plus rien après : « Tu es à jour ». */
export const FeedPage = z
  .object({
    items: z.array(FeedItem).max(FEED_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'FeedPage' })
export type FeedPage = z.infer<typeof FeedPage>

/**
 * Une page du fil « Abonnements ». `followsAnyone` permet à l'appli de distinguer un membre qui ne
 * suit personne (« Tu ne suis personne pour l'instant ») d'un fil simplement vide.
 */
export const FollowingFeedPage = FeedPage.extend({ followsAnyone: z.boolean() }).meta({
  id: 'FollowingFeedPage',
})
export type FollowingFeedPage = z.infer<typeof FollowingFeedPage>
