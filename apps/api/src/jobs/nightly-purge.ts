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
//   (tranche 7a, reports/retention.ts) ;
// - les « Autre » (noms d'outils tapés par des membres) que plus rien ne cite, et les lignes du
//   journal du catalogue de plus d'un an (tranche R6b) ; les « Autre » laissés hors du catalogue
//   depuis plus d'un an, quand plus rien ne les cite (relecture juridique jur-J5) ;
// - les notifications du catalogue de plus de 90 jours (R8) ;
// - les invitations dans une ruche de plus de 30 jours, et les traces des ruches de plus de 90 jours
//   (R10) ;
// - les photos de mise à jour restées « en attente » plus de 24 heures (R7a), ligne et fichier ;
// - les images du coin des testeurs restées « en attente » plus de 24 heures (R7b), de même ;
// - R19 (relecture juridique du plan, J2 et J3) : les avis du jeu de plus de 90 jours, les défis
//   (perso et de ruche) d'une semaine passée une fois la semaine suivante finie, et l'autre membre
//   des gestes du grand livre au même moment (la ligne du geste reste, avec son pollen).
// - R20 (relecture juridique J4) : les retours des Éclaireuses et leurs captures, 6 mois après la fin
//   de leur mois, et les missions, 8 jours après leur semaine.
// Elle clôt aussi les suspensions restées ouvertes d'un compte parti (tranche 7c), avant de purger.
// Elle rend le nombre de lignes effacées de chaque sorte, et le note dans les journaux.
//
// L'heure vient du paramètre `now` et entre dans le SQL par utc() (un texte ISO lu comme un instant,
// puis ramené à l'heure UTC des colonnes), jamais par now() en SQL : la comparaison ne dépend ni de
// l'horloge ni du fuseau de la base (relecture de sécurité S-A5).
import { UNVERIFIED_ACCOUNT_DAYS, weekOf } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, lt, sql } from 'drizzle-orm'
import { AUTH_RATE_WINDOW_MAX_MS } from '../auth/auth'
import { clearCounterparts } from '../game/award'
import { weekShift } from '../game/weeks'
import { purgeExpiredHandles } from '../handles/claim'
import { invitationValidSince } from '../hives/load'
import type { FileStorage } from '../media/storage'
import { notificationCutoff, utc } from '../notifications/load'
import { RATE_WINDOW_MAX_MS } from '../rate-limit'
import { purgeModeration } from '../reports/retention'
import type { VisitorMail } from '../reports/visitor'
import { purgeScouts } from '../scouts/purge'
import { closeSuspensionsOfDeparted } from '../suspension/load'
import { DISMISSED_TOOL_KEEP_DAYS, dropDismissedOthers, dropOrphanOthers } from '../tools/write'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Les compteurs de Better Auth : gardés pendant sa plus longue fenêtre (aujourd'hui une heure,
// l'inscription), calculée dans auth.ts à partir de ses règles : une règle plus longue ajoutée là-bas
// la suit d'elle-même.
/** Nos compteurs : la plus longue fenêtre, plus une heure de marge. */
const API_RATE_KEEP_MS = RATE_WINDOW_MAX_MS + HOUR
/** Une photo téléversée pour une mise à jour jamais publiée : gardée 24 heures. */
const PENDING_PHOTO_KEEP_MS = DAY

/**
 * `visitorMail` (R12, relecture juridique point 2) : la messagerie, pour envoyer leur décision aux
 * visiteurs dont le signalement est classé « sans objet » cette nuit. L'ordonnanceur la donne,
 * sauf avec EMAIL_JOBS=off : la purge efface alors leurs adresses sans e-mail. Facultatif pour les
 * tests qui ne regardent pas les e-mails.
 */
export const nightlyPurge = async (
  db: Database,
  now: Date,
  storage: FileStorage,
  visitorMail: VisitorMail | null = null,
) => {
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
  const moderation = await purgeModeration(db, now, visitorMail)
  // R6b (sec-A5, jur-T6) : les « Autre » que plus aucun projet ni profil ne cite. L'API les efface
  // déjà dans la transaction qui retire leur dernière référence ; ceci est le filet (une panne entre
  // deux écritures, une suppression de compte, une ligne effacée à la main). Un outil du catalogue
  // ne s'efface jamais ici.
  const otherTools = await dropOrphanOthers(db)
  // jur-J5 : les « Autre » laissés hors du catalogue depuis plus d'un an, que plus rien ne cite
  // (tools/write.ts). Avant l'effacement du journal, qui porte la date de leur décision.
  const dismissedTools = await dropDismissedOthers(
    db,
    new Date(now.getTime() - DISMISSED_TOOL_KEEP_DAYS * DAY),
  )
  // Le journal « Changements récents » ne se garde pas plus d'un an. Lecture par l'index
  // `catalogue_change_created_idx` (date décroissante : la plage « avant telle date » en est la fin).
  const catalogueChanges = await db
    .delete(schema.catalogueChange)
    .where(sql`${schema.catalogueChange.createdAt} < ${utc(new Date(now.getTime() - 365 * DAY))}`)
    .returning({ id: schema.catalogueChange.id })
  // R8 : les notifications du catalogue (`catalogue_notice`), les seules qui s'écrivent, ne se
  // gardent pas plus longtemps qu'elles ne se montrent : 90 jours, la limite de l'écran
  // (notificationCutoff, « daté de cet instant ou d'avant : plus montré »). Une seule requête ; la
  // table est petite (une ligne par geste et par auteur) : une lecture complète par nuit suffit,
  // l'index `catalogue_notice_member_idx` commençant par le membre.
  const catalogueNotices = await db
    .delete(schema.catalogueNotice)
    .where(sql`${schema.catalogueNotice.createdAt} <= ${utc(notificationCutoff(now))}`)
    .returning({ id: schema.catalogueNotice.id })
  // R10 : les invitations dans une ruche ne valent que 30 jours (invitationValidSince, la limite
  // que lisent l'onglet Ruches et l'Activité) ; au-delà, refusées comprises, elles ne servent plus à
  // rien et s'effacent. Les traces gardées pour l'Activité (`hive_notice`, avec la copie du nom
  // d'une ruche) ne se gardent pas plus longtemps qu'elles ne se montrent : 90 jours. Deux tables
  // petites (20 invitations par jour et par membre au plus, une trace par geste) : une lecture
  // complète par nuit suffit, leurs index commençant par le membre.
  const hiveInvitations = await db
    .delete(schema.hiveInvitation)
    .where(sql`${schema.hiveInvitation.createdAt} <= ${utc(invitationValidSince(now))}`)
    .returning({ id: schema.hiveInvitation.id })
  const hiveNotices = await db
    .delete(schema.hiveNotice)
    .where(sql`${schema.hiveNotice.createdAt} <= ${utc(notificationCutoff(now))}`)
    .returning({ id: schema.hiveNotice.id })
  // R12 (relecture juridique du plan, décision 19) : les traces « ton projet est sur l'accueil »
  // (`showcase_notice`) ne se gardent pas plus longtemps qu'elles ne se montrent, 90 jours, comme
  // celles du catalogue. Lecture par l'index `showcase_notice_created_idx` (la date seule).
  // Relecture juridique R12, point 1 : sauf tant que le projet est encore dans la vitrine. La
  // mise en avant n'a pas de fin, et cette ligne de l'Activité est la voie de l'autrice vers
  // « Retirer de l'accueil » ; elle se montre donc aussi longtemps (notifications/load.ts). Sorti
  // de la vitrine (refus, retrait, plus « Public », suppression), les 90 jours comptés depuis la
  // notice reviennent. La vitrine se cherche par sa clé primaire (project_id), en
  // « (select 1 … limit 1) is null » plutôt qu'en « not exists » (charte de l'API, 7b) ; la
  // vitrine a quatre lignes au plus. `sql.raw` écrit la colonne avec sa table : Drizzle l'écrirait
  // sans, et dans la sous-requête « project_id » désignerait celle de showcase (charte de l'API).
  const showcaseNotices = await db
    .delete(schema.showcaseNotice)
    .where(
      and(
        sql`${schema.showcaseNotice.createdAt} <= ${utc(notificationCutoff(now))}`,
        sql`(select 1 from showcase s where s.project_id = ${sql.raw('showcase_notice.project_id')} limit 1) is null`,
      ),
    )
    .returning({ id: schema.showcaseNotice.id })

  // R19 (J2) : les avis du jeu (`game_notice` : introduction, niveau, sceau, défi de ruche, miel
  // reçu) ne se gardent pas plus longtemps qu'ils ne se montrent dans l'Activité, 90 jours, comme
  // ceux du catalogue. L'index `game_notice_member_idx` commence par le membre : une lecture
  // complète par nuit, sur une table bornée (quelques avis par membre et par semaine).
  const gameNotices = await db
    .delete(schema.gameNotice)
    .where(sql`${schema.gameNotice.createdAt} <= ${utc(notificationCutoff(now))}`)
    .returning({ id: schema.gameNotice.id })
  // R19 (J2) : un défi ne sert plus une fois la semaine suivante finie (« Ma récolte » montre la
  // semaine en cours, le récap du dimanche la semaine qui finit) : le lundi de W+2, les défis de W
  // partent. Le miel qu'ils ont rapporté reste (`honey_entry` ne pointe pas vers eux). Lecture par
  // les index `personal_challenge_week_idx` et `hive_challenge_week_idx` (la semaine seule) : la
  // plage « avant telle semaine » en est le début.
  const lastKeptWeek = weekShift(weekOf(now), -1)
  const personalChallenges = await db
    .delete(schema.personalChallenge)
    .where(lt(schema.personalChallenge.week, lastKeptWeek))
    .returning({ week: schema.personalChallenge.week })
  const hiveChallenges = await db
    .delete(schema.hiveChallenge)
    .where(lt(schema.hiveChallenge.week, lastKeptWeek))
    .returning({ week: schema.hiveChallenge.week })
  // R19 (J3) : au même moment, l'autre membre d'un geste s'efface du grand livre ; seul
  // game/award.ts écrit `pollen_entry`, d'où l'appel plutôt qu'une requête ici.
  const counterparts = await clearCounterparts(db, now)

  // R7a (sécurité A5) : les photos « en attente » (slot 'update', jamais rattachées à une mise à
  // jour) de plus de 24 heures : téléversées, mais la mise à jour n'a pas été publiée. La ligne
  // s'efface d'abord (`returning` rend la clé du fichier), puis le fichier : une panne entre les deux
  // laisse un fichier orphelin, jamais une ligne qui montre un fichier absent. Lecture par l'index
  // partiel project_media_pending_idx (seulement ces photos). Une erreur d'effacement d'un fichier
  // est notée avec sa clé, et la purge continue avec les suivants.
  const pendingPhotos = await db
    .delete(schema.projectMedia)
    .where(
      and(
        eq(schema.projectMedia.slot, 'update'),
        sql`${schema.projectMedia.updateId} is null`,
        sql`${schema.projectMedia.createdAt} < ${utc(new Date(now.getTime() - PENDING_PHOTO_KEEP_MS))}`,
      ),
    )
    .returning({ storageKey: schema.projectMedia.storageKey })
  for (const { storageKey } of pendingPhotos) {
    try {
      await storage.delete(storageKey)
    } catch (error) {
      console.error('Nightly purge: a pending photo file could not be erased', storageKey, error)
    }
  }

  // R7b : les images du coin des testeurs « en attente » (ni photo d'un appel, ni capture d'un
  // message) de plus de 24 heures. Même démarche que ci-dessus : la ligne d'abord, puis le fichier.
  // Lecture par l'index partiel tester_media_pending_idx (seulement ces images) ; la date se
  // compare ensuite sur ce petit lot.
  const pendingTesterImages = await db
    .delete(schema.testerMedia)
    .where(
      and(
        sql`${schema.testerMedia.callId} is null`,
        sql`${schema.testerMedia.messageId} is null`,
        sql`${schema.testerMedia.createdAt} < ${utc(new Date(now.getTime() - PENDING_PHOTO_KEEP_MS))}`,
      ),
    )
    .returning({ storageKey: schema.testerMedia.storageKey })
  for (const { storageKey } of pendingTesterImages) {
    try {
      await storage.delete(storageKey)
    } catch (error) {
      console.error('Nightly purge: a pending tester image could not be erased', storageKey, error)
    }
  }

  // R20 (relecture juridique J4) : les retours des Éclaireuses et leurs captures, 6 mois après la fin
  // de leur mois ; les missions, 8 jours après leur semaine (scouts/purge.ts).
  const scouts = await purgeScouts(db, now, storage)

  const purged = {
    pendingPhotos: pendingPhotos.length,
    pendingTesterImages: pendingTesterImages.length,
    sessions: sessions.length,
    verifications: verifications.length,
    rateLimits: rateLimits.length,
    apiRateLimits: apiRateLimits.length,
    handles,
    unverifiedAccounts: unverifiedAccounts.length,
    otherTools,
    dismissedTools,
    catalogueChanges: catalogueChanges.length,
    catalogueNotices: catalogueNotices.length,
    hiveInvitations: hiveInvitations.length,
    hiveNotices: hiveNotices.length,
    showcaseNotices: showcaseNotices.length,
    gameNotices: gameNotices.length,
    personalChallenges: personalChallenges.length,
    hiveChallenges: hiveChallenges.length,
    counterparts,
    ...scouts,
    ...moderation,
  }
  console.log('Nightly purge', purged)
  return purged
}
