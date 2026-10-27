// La purge de nuit (tranche 6c, conformité n°4 : ne rien garder plus longtemps qu'il ne sert),
// lancée chaque nuit à 3 h, heure de Paris. Elle efface :
// - les sessions expirées et les jetons de vérification expirés (Better Auth ne les efface que
//   lorsqu'on les présente : ceux qu'on ne présente plus restaient pour toujours) ;
// - les compteurs anti-abus périmés : ceux de Better Auth (rate_limit) après sa plus longue
//   fenêtre (une heure aujourd'hui, AUTH_RATE_WINDOW_MAX_MS) ; les nôtres (api_rate_limit) après 25 heures, la plus longue fenêtre (un jour,
//   RATE_WINDOW_MAX_MS) plus une marge ;
// - les pseudos dont la réservation est finie (handles/claim.ts, aussi appelé au démarrage) ;
// - les inscriptions jamais vérifiées au bout de 30 jours (décision de Louis du 20/10/2026), sauf
//   un compte qui a déjà reçu un pseudo (un ancien membre : voir plus bas) ;
// - les signalements et les décisions de modération arrivés au terme de leur durée de garde
//   (tranche 7a, reports/retention.ts).
// Elle clôt aussi les suspensions restées ouvertes d'un compte parti (tranche 7c), avant de purger.
// Elle rend le nombre de lignes effacées de chaque sorte, et le note dans les journaux.
//
// L'heure vient du paramètre `now` et entre dans le SQL par utc() (un texte ISO lu comme un instant,
// puis ramené à l'heure UTC des colonnes), jamais par now() en SQL : la comparaison ne dépend ni de
// l'horloge ni du fuseau de la base (relecture de sécurité S-A5).
import { UNVERIFIED_ACCOUNT_DAYS } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, lt, sql } from 'drizzle-orm'
import { AUTH_RATE_WINDOW_MAX_MS } from '../auth/auth'
import { purgeExpiredHandles } from '../handles/claim'
import { utc } from '../notifications/load'
import { RATE_WINDOW_MAX_MS } from '../rate-limit'
import { purgeModeration } from '../reports/retention'
import { closeSuspensionsOfDeparted } from '../suspension/load'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Les compteurs de Better Auth : gardés pendant sa plus longue fenêtre (aujourd'hui une heure,
// l'inscription), calculée dans auth.ts à partir de ses règles : une règle plus longue ajoutée là-bas
// la suit d'elle-même.
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
    .where(lt(schema.rateLimit.lastRequest, now.getTime() - AUTH_RATE_WINDOW_MAX_MS))
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
  //
  // Ce raisonnement suppose qu'une adresse vérifiée ne redevient jamais « non vérifiée ». C'est
  // vrai aujourd'hui (on ne peut pas changer d'adresse), mais rien ne l'écrit ailleurs. D'où une
  // garde (relecture de sécurité A3) : un compte qui a reçu un pseudo, donné à la vérification
  // de l'adresse (auth.ts, afterEmailVerification), a été un vrai membre ; on ne l'efface jamais
  // ici, en SQL, sans le ménage de la suppression d'un compte (fichiers, commentaires, compteurs).
  // « not exists (select 1 …) » est vrai quand la sous-requête ne trouve aucune ligne ; elle est
  // « corrélée » : elle lit, pour chaque compte, son identifiant, et l'index member_handle_user_idx
  // (sur user_id) la sert. On écrit "user".id en toutes lettres : la colonne visée est bien celle
  // du compte, pas une colonne homonyme de la sous-requête.
  const unverifiedAccounts = await db
    .delete(schema.user)
    .where(
      and(
        eq(schema.user.emailVerified, false),
        sql`${schema.user.createdAt} < ${utc(new Date(now.getTime() - UNVERIFIED_ACCOUNT_DAYS * DAY))}`,
        sql`not exists (select 1 from member_handle h where h.user_id = "user".id)`,
      ),
    )
    .returning({ id: schema.user.id })
  // Tranche 7c : les suspensions encore ouvertes d'un compte parti, closes à l'heure de la purge.
  // La suppression du compte les clôt d'ordinaire elle-même (auth/auth.ts, afterDelete), mais
  // cette clôture, faite après la suppression, peut échouer ; sans ce rattrapage, une suspension
  // sans fin resterait ouverte, donc gardée pour toujours. Avant la purge de la modération : la
  // date de fin ainsi notée compte déjà pour la durée de garde (365 jours après la fin).
  await closeSuspensionsOfDeparted(db, now)
  // Les signalements et les décisions de modération (tranche 7a) : reports/retention.ts.
  const moderation = await purgeModeration(db, now)

  const purged = {
    sessions: sessions.length,
    verifications: verifications.length,
    rateLimits: rateLimits.length,
    apiRateLimits: apiRateLimits.length,
    handles,
    unverifiedAccounts: unverifiedAccounts.length,
    ...moderation,
  }
  console.log('Nightly purge', purged)
  return purged
}
