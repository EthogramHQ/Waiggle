// Les e-mails de notification : les réglages d'un membre et la désinscription. Tranche 6c : le récap
// de la semaine, et l'e-mail de mentions et de réponses si le membre l'active. R8 : un choix par
// type (« Tout de suite », « Dans le récap », « Jamais »), « Dans le récap » par défaut pour tous
// (décision de Louis du 12/11/2026 : aucun e-mail immédiat sans l'avoir demandé), et un seul e-mail
// « tout de suite » qui regroupe les types réglés ainsi. Les e-mails de compte (vérification de
// l'adresse, mot de passe) ne dépendent pas de ces réglages.
import { z } from 'zod'

/** Le récap part le dimanche à 10 h (R8), s'il y a du nouveau ; au plus 5 lignes, puis « et N autres ». */
export const RECAP_MAX_LINES = 5
/** Après 3 récaps de suite sans visite, plus de récap jusqu'à la visite suivante. */
export const RECAP_UNVISITED_MAX = 3
/** R8 : au plus trois « Nouveaux projets de tes proches », un seul projet qui cherche des testeurs. */
export const RECAP_FRIEND_PROJECTS_MAX = 3
/** R8 : quatre vignettes jointes au récap, au plus (A5). */
export const RECAP_IMAGES_MAX = 4
/**
 * L'e-mail « tout de suite » part 15 minutes après la première nouveauté, et au plus une fois par
 * heure (repris de l'e-mail de mentions de 6c).
 */
export const INSTANT_EMAIL_DELAY_MINUTES = 15
export const INSTANT_EMAIL_MIN_INTERVAL_MINUTES = 60
/** Une inscription jamais vérifiée est effacée par la purge de nuit au bout de 30 jours. */
export const UNVERIFIED_ACCOUNT_DAYS = 30

/** Le choix d'un type : un e-mail tout de suite, une ligne dans le récap, ou rien par e-mail. */
export const EmailChoice = z.enum(['now', 'digest', 'never'])
export type EmailChoice = z.infer<typeof EmailChoice>

/** Les types qui ne partent jamais « tout de suite » : on y choisit le récap ou rien. */
export const DigestOnlyChoice = z.enum(['digest', 'never'])
export type DigestOnlyChoice = z.infer<typeof DigestOnlyChoice>

/**
 * Les six types d'e-mail, dans l'ordre de l'écran. `comments` : les commentaires sur ses projets ;
 * `replies` : les réponses et les mentions ; `testers` : le coin des testeurs (appels, retours,
 * réponses, « Réglé »).
 */
export const EmailType = z.enum([
  'reactions',
  'comments',
  'replies',
  'follows',
  'updates',
  'testers',
])
export type EmailType = z.infer<typeof EmailType>

/** Les types où « Tout de suite » est possible ; les autres refusent `now` (400). */
export const INSTANT_EMAIL_TYPES = [
  'comments',
  'replies',
  'testers',
] as const satisfies readonly EmailType[]
export type InstantEmailType = (typeof INSTANT_EMAIL_TYPES)[number]

/** Les réglages d'e-mail d'un membre, rendus par GET et PATCH /v1/me/email-preferences. */
export const EmailPreferences = z
  .object({
    /** Le récap de la semaine : activé par défaut. Coupé, les types « Dans le récap » ne partent plus. */
    weeklyRecap: z.boolean(),
    reactions: DigestOnlyChoice,
    comments: EmailChoice,
    replies: EmailChoice,
    follows: DigestOnlyChoice,
    updates: DigestOnlyChoice,
    testers: EmailChoice,
  })
  .meta({ id: 'EmailPreferences' })
export type EmailPreferences = z.infer<typeof EmailPreferences>

/** Les réglages par défaut, ceux d'un membre qui n'a jamais rien changé. */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  weeklyRecap: true,
  reactions: 'digest',
  comments: 'digest',
  replies: 'digest',
  follows: 'digest',
  updates: 'digest',
  testers: 'digest',
}

/**
 * Le corps de PATCH /v1/me/email-preferences : **un seul** réglage à la fois, celui que le membre
 * vient de toucher (chaque choix s'enregistre aussitôt). Objet « strict » : un champ inconnu est
 * refusé, pour qu'une faute de frappe ne passe pas en silence ; `now` sur un type qui ne le permet
 * pas aussi.
 */
export const EmailPreferencesPatch = z
  .union([
    z.strictObject({ weeklyRecap: z.boolean() }),
    z.strictObject({ reactions: DigestOnlyChoice }),
    z.strictObject({ comments: EmailChoice }),
    z.strictObject({ replies: EmailChoice }),
    z.strictObject({ follows: DigestOnlyChoice }),
    z.strictObject({ updates: DigestOnlyChoice }),
    z.strictObject({ testers: EmailChoice }),
  ])
  .meta({ id: 'EmailPreferencesPatch' })
export type EmailPreferencesPatch = z.infer<typeof EmailPreferencesPatch>

/**
 * La sorte d'e-mail qu'un lien de désinscription vise. `mentions` : l'ancien e-mail de 6c, dont les
 * liens restent valables (ils visent « Réponses et mentions ») ; `instant` : l'e-mail « tout de
 * suite » de R8, qui vise tous les types réglés sur « Tout de suite ».
 */
export const UnsubscribeKind = z.enum(['recap', 'mentions', 'instant'])
export type UnsubscribeKind = z.infer<typeof UnsubscribeKind>

/**
 * Le jeton d'un lien de désinscription : `v1.<id du membre en base64url>.<sorte>.<signature>`.
 * La signature (HMAC-SHA256, 32 octets) s'écrit en 43 caractères base64url. L'appli ne vérifie que
 * la forme, pour dire tout de suite « lien invalide » ; seule l'API vérifie la signature.
 */
export const UnsubscribeToken = z
  .string()
  .max(300)
  .regex(/^v1\.[A-Za-z0-9_-]{1,200}\.(recap|mentions|instant)\.[A-Za-z0-9_-]{43}$/)

/**
 * Les paramètres de POST /v1/email/unsubscribe : le jeton, `scope=all` pour couper aussi le récap,
 * et pour un jeton `instant`, ce que deviennent les types « Tout de suite » : `digest` (« Dans le
 * récap ») ou `never`. Absent, c'est `digest` : le « Se désabonner » en un clic d'une messagerie
 * (List-Unsubscribe, RFC 8058) ne lit pas de page (décision de Louis du 12/11/2026). Jamais `now` :
 * un lien ne rallume rien. La route ne lit jamais le corps : une messagerie y envoie
 * « List-Unsubscribe=One-Click », en formulaire ou en multipart.
 */
export const UnsubscribeQuery = z.object({
  token: UnsubscribeToken,
  scope: z.enum(['all']).optional(),
  choice: DigestOnlyChoice.optional(),
})
export type UnsubscribeQuery = z.infer<typeof UnsubscribeQuery>

/**
 * Ce que l'export des données (RGPD) donne des e-mails : les réglages (valeurs par défaut
 * comprises) et les dates gardées. Chaque date est remplacée au prochain envoi : il n'y a pas
 * d'historique. Jamais de jeton.
 */
export const EmailPreferencesExport = EmailPreferences.extend({
  recapSentAt: z.iso.datetime().nullable(),
  /** Le nombre de récaps envoyés de suite sans visite (0 à 3). */
  recapUnvisited: z.number().int().min(0).max(RECAP_UNVISITED_MAX),
  /** R8 : le dernier e-mail « tout de suite » (avant R8, le dernier e-mail de mentions). */
  instantSentAt: z.iso.datetime().nullable(),
  /** La dernière modification des réglages ; null s'il n'y a jamais touché. */
  updatedAt: z.iso.datetime().nullable(),
})
export type EmailPreferencesExport = z.infer<typeof EmailPreferencesExport>
