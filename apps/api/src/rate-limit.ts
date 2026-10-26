// Limitation de débit pour nos propres routes : « au plus N requêtes par fenêtre de temps ».
// Les compteurs sont dans la base (table api_rate_limit) : ils survivent à un redémarrage et
// seraient partagés si l'API tournait un jour sur plusieurs serveurs.
import { type Database, schema } from '@ruche/db'
import { inArray, sql } from 'drizzle-orm'

export type RateRule = { windowMs: number; max: number }

/**
 * La plus longue fenêtre permise : un jour. La purge de nuit (jobs/nightly-purge.ts) efface les
 * compteurs dont la fenêtre a commencé il y a plus de 25 heures (ce jour, plus une marge) : une
 * règle plus longue verrait son compteur effacé en cours de route, et le quota ne tiendrait plus.
 * hit() refuse donc toute règle plus longue (relecture de sécurité S-A5 de la tranche 6c).
 */
export const RATE_WINDOW_MAX_MS = 24 * 60 * 60 * 1000
export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export type RateLimiter = {
  /** Compte une requête pour cette clé et dit si elle est autorisée. */
  hit(key: string, rule: RateRule): Promise<RateDecision>
}

/**
 * `clock` donne l'heure actuelle en millisecondes. Par défaut l'horloge réelle (Date.now) ;
 * les tests en passent une qu'ils font avancer eux-mêmes.
 */
export const createRateLimiter = (db: Database, clock: () => number = Date.now): RateLimiter => ({
  async hit(key, { windowMs, max }) {
    // Une erreur de programmation, pas une demande d'un membre : on le dit fort.
    if (windowMs > RATE_WINDOW_MAX_MS) throw new Error('Rate window longer than one day')
    const now = clock()
    const t = schema.apiRateLimit
    // Une seule requête SQL, « atomique » : même si deux requêtes arrivent en même temps,
    // le compteur ne peut pas sauter une valeur.
    // - Première fois pour cette clé : on crée la ligne avec count = 1.
    // - Sinon (« on conflict ») : si la fenêtre est terminée, on repart à 1 ; sinon on ajoute 1.
    const [row] = await db
      .insert(t)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: t.key,
        set: {
          count: sql`case when ${t.windowStart} <= ${now - windowMs} then 1 else ${t.count} + 1 end`,
          windowStart: sql`case when ${t.windowStart} <= ${now - windowMs} then ${now} else ${t.windowStart} end`,
        },
      })
      .returning({ count: t.count, windowStart: t.windowStart })

    if (!row || row.count <= max) return { allowed: true }
    // Temps restant avant la fin de la fenêtre, arrondi à la seconde supérieure.
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((row.windowStart + windowMs - now) / 1000),
    }
  },
})

/** Les clés des compteurs propres à un membre : une par action limitée. */
export const memberCounterKeys = (userId: string) => ({
  profile: `profile:${userId}`,
  avatar: `avatar:${userId}`,
  projectCreate: `project-create:${userId}`,
  projectChange: `project-change:${userId}`,
  visualUpload: `visual-upload:${userId}`,
  // Suivre et ne plus suivre, membres et projets ensemble (tranche 4).
  follow: `follow:${userId}`,
  // Publier une note, tous ses projets ensemble (tranche 4b).
  note: `note:${userId}`,
  // Poser et retirer une réaction, tous les projets ensemble (tranche 5).
  reaction: `reaction:${userId}`,
  // Publier et modifier un commentaire, tous les projets ensemble (tranche 5).
  comment: `comment:${userId}`,
  // Changer de pseudo, essais sur un pseudo pris compris (tranche 6a).
  handle: `handle:${userId}`,
  // Chercher un membre à mentionner après « @ » (tranche 6b).
  mentionSearch: `mention-search:${userId}`,
  // Le même, sur une journée : un second plafond, pour qu'on ne puisse pas relever tous les pseudos
  // du réseau en cherchant 600 fois par heure, jour et nuit.
  mentionSearchDay: `mention-search-day:${userId}`,
  // Lire ses notifications : la liste et le nombre de la cloche ensemble (tranche 6b).
  notificationsRead: `notifications-read:${userId}`,
  // Marquer ses notifications comme vues (tranche 6b).
  notificationsSeen: `notifications-seen:${userId}`,
  // Changer ses réglages d'e-mail (tranche 6c).
  emailPreferences: `email-preferences:${userId}`,
  // Les liens de désinscription valides de ce membre, toutes adresses IP confondues (tranche 6c).
  unsubscribe: `unsubscribe:${userId}`,
  // Télécharger toutes ses données (audit de sécurité d'octobre 2026) : une lecture lourde.
  export: `export:${userId}`,
  // Signaler un contenu (tranche 7a) : 20 par jour, contre les signalements en rafale.
  report: `report:${userId}`,
  // Bloquer et débloquer (tranche 7b) : deux compteurs, 100 par jour chacun. Séparés, pour qu'une
  // rafale de déblocages et de reblocages (débloquer, lire, rebloquer) bute sur les deux plafonds.
  block: `block:${userId}`,
  unblock: `unblock:${userId}`,
  // Demander à changer d'adresse (tranche « adresse ») : 5 par quart d'heure et 10 par jour,
  // toutes connexions confondues (relecture de sécurité S4). Sans eux, en changeant d'adresse IP,
  // on pourrait tester sans fin le mot de passe d'une session volée, ou quelles adresses ont un
  // compte (le premier lien d'une adresse prise n'envoie rien).
  emailChange: `email-change:${userId}`,
  emailChangeDay: `email-change-day:${userId}`,
  // Les e-mails envoyés à une nouvelle adresse (le second lien) : 3 par heure (S1).
  emailChangeLink: `email-change-link:${userId}`,
})

/**
 * Efface les compteurs d'un membre, à la suppression de son compte (leurs clés contiennent son
 * identifiant). inArray : « la clé est l'une de celles de cette liste ».
 */
export const deleteMemberCounters = (db: Database, userId: string) =>
  db
    .delete(schema.apiRateLimit)
    .where(inArray(schema.apiRateLimit.key, Object.values(memberCounterKeys(userId))))
