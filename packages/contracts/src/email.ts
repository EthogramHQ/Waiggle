// Les e-mails de notification (tranche 6c) : les deux réglages d'un membre et la désinscription.
// Version sobre, décidée le 20/10/2026 : une seule sorte d'e-mail par défaut (le récap de la
// semaine), l'e-mail de mentions et de réponses seulement si le membre l'active. Les e-mails de
// compte (vérification de l'adresse) ne dépendent pas de ces réglages.
import { z } from 'zod'

/** Le récap part le lundi, s'il y a du nouveau ; au plus 5 lignes, puis « et N autres ». */
export const RECAP_MAX_LINES = 5
/** Après 3 récaps de suite sans visite, plus de récap jusqu'à la visite suivante. */
export const RECAP_UNVISITED_MAX = 3
/** L'e-mail de mentions part 15 minutes après la première, et au plus une fois par heure. */
export const MENTION_EMAIL_DELAY_MINUTES = 15
export const MENTION_EMAIL_MIN_INTERVAL_MINUTES = 60
/** Une inscription jamais vérifiée est effacée par la purge de nuit au bout de 30 jours. */
export const UNVERIFIED_ACCOUNT_DAYS = 30

/** Les réglages d'e-mail d'un membre, rendus par GET et PATCH /v1/me/email-preferences. */
export const EmailPreferences = z
  .object({
    /** Le récap de la semaine : activé par défaut. */
    weeklyRecap: z.boolean(),
    /** Un e-mail quand on le mentionne ou lui répond : désactivé par défaut. */
    mentionEmails: z.boolean(),
  })
  .meta({ id: 'EmailPreferences' })
export type EmailPreferences = z.infer<typeof EmailPreferences>

/** Les réglages par défaut, ceux d'un membre qui n'a jamais rien changé. */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  weeklyRecap: true,
  mentionEmails: false,
}

/**
 * Le corps de PATCH /v1/me/email-preferences : un réglage ou les deux, rien d'autre (objet
 * « strict » : un champ inconnu est refusé, pour qu'une faute de frappe ne passe pas en silence).
 */
export const EmailPreferencesUpdate = z
  .strictObject({
    weeklyRecap: z.boolean().optional(),
    mentionEmails: z.boolean().optional(),
  })
  .refine((value) => value.weeklyRecap !== undefined || value.mentionEmails !== undefined, {
    message: 'At least one preference',
  })
  .meta({ id: 'EmailPreferencesUpdate' })
export type EmailPreferencesUpdate = z.infer<typeof EmailPreferencesUpdate>

/** La sorte d'e-mail qu'un lien de désinscription coupe. */
export const UnsubscribeKind = z.enum(['recap', 'mentions'])
export type UnsubscribeKind = z.infer<typeof UnsubscribeKind>

/**
 * Le jeton d'un lien de désinscription : `v1.<id du membre en base64url>.<sorte>.<signature>`.
 * La signature (HMAC-SHA256, 32 octets) s'écrit en 43 caractères base64url. L'appli ne vérifie que
 * la forme, pour dire tout de suite « lien invalide » ; seule l'API vérifie la signature.
 */
export const UnsubscribeToken = z
  .string()
  .max(300)
  .regex(/^v1\.[A-Za-z0-9_-]{1,200}\.(recap|mentions)\.[A-Za-z0-9_-]{43}$/)

/**
 * Les paramètres de POST /v1/email/unsubscribe : le jeton, et `scope=all` pour tout couper (les deux
 * sortes) au lieu de la seule sorte du jeton. La route ne lit jamais le corps : une messagerie y
 * envoie « List-Unsubscribe=One-Click » (RFC 8058), en formulaire ou en multipart.
 */
export const UnsubscribeQuery = z.object({
  token: UnsubscribeToken,
  scope: z.enum(['all']).optional(),
})
export type UnsubscribeQuery = z.infer<typeof UnsubscribeQuery>

/**
 * Ce que l'export des données (RGPD) donne des e-mails : les deux réglages (valeurs par défaut
 * comprises) et les dates gardées. Chaque date est remplacée au prochain envoi : il n'y a pas
 * d'historique. Jamais de jeton.
 */
export const EmailPreferencesExport = EmailPreferences.extend({
  recapSentAt: z.iso.datetime().nullable(),
  /** Le nombre de récaps envoyés de suite sans visite (0 à 3). */
  recapUnvisited: z.number().int().min(0).max(RECAP_UNVISITED_MAX),
  mentionSentAt: z.iso.datetime().nullable(),
  /** La dernière modification des réglages ; null s'il n'y a jamais touché. */
  updatedAt: z.iso.datetime().nullable(),
})
export type EmailPreferencesExport = z.infer<typeof EmailPreferencesExport>
