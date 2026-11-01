// La date de la dernière lecture du fil « Abonnements » (tranche R4), dans la table feed_state :
// une ligne par membre, qui dit jusqu'où il a lu son fil. C'est une trace d'activité (relecture
// juridique jur-J3) : ce fichier est le seul à lire ou écrire cette table, et seules la route du
// fil (routes/feed.ts) et l'export (routes/me.ts) l'appellent. Un test le vérifie
// (feed-read.test.ts, « is read only by feed/state.ts, the feed route and the export ») : un nouvel
// appelant demande d'abord une relecture juridique.
import { type Database, schema } from '@ruche/db'
import { eq, sql } from 'drizzle-orm'

const t = schema.feedState

/**
 * Les bornes d'une date de lecture (relecture de sécurité sec-A2) : jamais avant l'ouverture du
 * site, le 1/1/2026 à minuit UTC. La borne haute est l'heure du serveur, passée à chaque appel.
 */
export const FEED_READ_FLOOR = new Date('2026-01-01T00:00:00.000Z')

/**
 * Jusqu'où ce membre a lu son fil (null : jamais), lu par la clé primaire de feed_state (une seule
 * ligne au plus). Rendu tel quel sur chaque page du fil ; lire n'écrit jamais rien.
 */
export const readFeedReadAt = async (
  db: Pick<Database, 'select'>,
  memberId: string,
): Promise<Date | null> => {
  const [row] = await db.select({ readAt: t.readAt }).from(t).where(eq(t.memberId, memberId))
  return row?.readAt ?? null
}

/**
 * Note que ce membre a lu son fil jusqu'à `upTo` (la date `at` d'un élément affiché par l'appli).
 *
 * Une date hors des bornes (avant le 1/1/2026, ou après `now`, l'heure du serveur) n'est pas gardée
 * du tout : rien n'est écrit, et la route répond quand même 204 (contrat `FeedReadBody`). La
 * vérification se fait ici, en JavaScript, avant toute requête : PostgreSQL refuserait l'an 0000
 * (une erreur 500), et « greatest » avec l'an 9999 pousserait la date vers l'avenir pour toujours.
 * Contrairement à « vu » des notifications, une date future n'est pas ramenée à `now` : elle ne
 * correspond à aucun élément du fil, donc à rien de lu.
 *
 * Sinon, un « upsert » (« insert … on conflict do update ») : la ligne naît à la première lecture,
 * puis se met à jour en place, trouvée par sa clé primaire. La date ne recule jamais :
 * « greatest(ancienne, nouvelle) » garde la plus récente (un autre appareil resté sur une page plus
 * ancienne envoie une date plus ancienne, qui ne change rien). « excluded » désigne la ligne qu'on
 * voulait insérer : la date arrive par la colonne, en paramètre lié, jamais écrite dans le SQL.
 * Une seule instruction : deux demandes en même temps ne peuvent pas faire reculer la date.
 *
 * Rend true si la date était dans les bornes (et a donc été proposée à la base).
 */
export const markFeedRead = async (
  db: Database,
  memberId: string,
  upTo: Date,
  now: Date,
): Promise<boolean> => {
  if (Number.isNaN(upTo.getTime()) || upTo < FEED_READ_FLOOR || upTo > now) return false
  await db
    .insert(t)
    .values({ memberId, readAt: upTo })
    .onConflictDoUpdate({
      target: t.memberId,
      set: { readAt: sql`greatest(${t.readAt}, excluded.read_at)` },
    })
  return true
}
