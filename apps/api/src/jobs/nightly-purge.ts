// La purge de nuit (tranche 6c, conformité n°4 : ne rien garder plus longtemps qu'il ne sert),
// lancée chaque nuit à 3 h, heure de Paris. Elle efface :
// - les sessions expirées et les jetons de vérification expirés (Better Auth ne les efface que
//   lorsqu'on les présente : ceux qu'on ne présente plus restaient pour toujours) ;
// - les compteurs anti-abus périmés : ceux de Better Auth (rate_limit) après une heure, sa plus
//   longue fenêtre ; les nôtres (api_rate_limit) après 25 heures, la plus longue fenêtre (un jour,
//   RATE_WINDOW_MAX_MS) plus une marge ;
// - les pseudos dont la réservation est finie (handles/claim.ts, aussi appelé au démarrage) ;
// - les inscriptions jamais vérifiées au bout de 30 jours (décision de Louis du 20/10/2026).
// Elle rend le nombre de lignes effacées de chaque sorte, et le note dans les journaux.
//
// L'heure vient du paramètre `now` et entre dans le SQL par utc() (un texte ISO lu comme un instant,
// puis ramené à l'heure UTC des colonnes), jamais par now() en SQL : la comparaison ne dépend ni de
// l'horloge ni du fuseau de la base (relecture de sécurité S-A5).
import { UNVERIFIED_ACCOUNT_DAYS } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, lt, sql } from 'drizzle-orm'
import { purgeExpiredHandles } from '../handles/claim'
import { utc } from '../notifications/load'
import { RATE_WINDOW_MAX_MS } from '../rate-limit'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** La plus longue fenêtre des compteurs de Better Auth (l'inscription : une heure, auth.ts). */
const AUTH_RATE_WINDOW_MS = HOUR
/** Nos compteurs : la plus longue fenêtre, plus une heure de marge. */
const API_RATE_KEEP_MS = RATE_WINDOW_MAX_MS + HOUR

export const nightlyPurge = async (db: Database, now: Date) => {
  // Chaque « delete … returning » rend les lignes effacées : leur nombre est le résultat.
  // Les tables session et verification sont petites (une ligne par appareil connecté, par lien
  // envoyé) : une lecture complète, une fois par nuit, coûte peu. Un index sur expires_at le
  // jour où elles grandiront (à surveiller).
  const sessions = await db
    .delete(schema.session)
    .where(sql`${schema.session.expiresAt} < ${utc(now)}`)
    .returning({ id: schema.session.id })
  const verifications = await db
    .delete(schema.verification)
    .where(sql`${schema.verification.expiresAt} < ${utc(now)}`)
    .returning({ id: schema.verification.id })
  // Les compteurs datent leur dernière demande (Better Auth) ou le début de leur fenêtre (les
  // nôtres) en millisecondes depuis 1970 : un nombre, comparé à un nombre.
  const rateLimits = await db
    .delete(schema.rateLimit)
    .where(lt(schema.rateLimit.lastRequest, now.getTime() - AUTH_RATE_WINDOW_MS))
    .returning({ id: schema.rateLimit.id })
  const apiRateLimits = await db
    .delete(schema.apiRateLimit)
    .where(lt(schema.apiRateLimit.windowStart, now.getTime() - API_RATE_KEEP_MS))
    .returning({ key: schema.apiRateLimit.key })
  const handles = await purgeExpiredHandles(db, now)
  // Les inscriptions jamais vérifiées, créées il y a plus de 30 jours (la date de création ne
  // bouge pas si la personne réessaie de s'inscrire). Leurs sessions, façons de se connecter et
  // jetons partent avec elles (clés « cascade »). Un compte non vérifié ne peut ni se connecter ni
  // rien publier : il n'a ni fichier, ni projet, ni commentaire, ni compteur à effacer en plus du
  // chemin de la suppression d'un compte (auth.ts, deleteUser).
  const unverifiedAccounts = await db
    .delete(schema.user)
    .where(
      and(
        eq(schema.user.emailVerified, false),
        sql`${schema.user.createdAt} < ${utc(new Date(now.getTime() - UNVERIFIED_ACCOUNT_DAYS * DAY))}`,
      ),
    )
    .returning({ id: schema.user.id })

  const purged = {
    sessions: sessions.length,
    verifications: verifications.length,
    rateLimits: rateLimits.length,
    apiRateLimits: apiRateLimits.length,
    handles,
    unverifiedAccounts: unverifiedAccounts.length,
  }
  console.log('Nightly purge', purged)
  return purged
}
