// Données d'exemple des e-mails de notification (tranche 6c, R8) : les réglages de Léa et des liens
// de désinscription, tels qu'ils arrivent dans un e-mail. Seuls des types viennent de
// @ruche/contracts : les captures (scripts/shots.mjs) peuvent lire ce fichier.
import type { EmailPreferences } from '@ruche/contracts'

/**
 * Les réglages de Léa : ceux par défaut (R8 : tout « Dans le récap », le récap activé). Écrits en
 * entier plutôt que repris de DEFAULT_EMAIL_PREFERENCES : ce fichier ne lit que des types.
 */
export const leaEmailPreferences: EmailPreferences = {
  weeklyRecap: true,
  reactions: 'digest',
  comments: 'digest',
  replies: 'digest',
  follows: 'digest',
  updates: 'digest',
  testers: 'digest',
}

/**
 * Les réglages de la planche R8-Activite-Desktop : les réponses et mentions « Tout de suite », le
 * reste dans le récap du dimanche.
 */
export const repliesNowPreferences: EmailPreferences = { ...leaEmailPreferences, replies: 'now' }

/**
 * Les réglages de la planche R8-Reglages, récap coupé : les types « Dans le récap » le disent
 * (« Le récap est coupé : rien ne part ») sans changer leur choix.
 */
export const recapOffPreferences: EmailPreferences = {
  ...leaEmailPreferences,
  weeklyRecap: false,
  comments: 'now',
  follows: 'never',
}

// Un jeton de désinscription a la forme `v1.<id du membre en base64url>.<sorte>.<signature>`
// (UnsubscribeToken, packages/contracts/src/email.ts). « dTE » est « u1 », l'identifiant de Léa,
// écrit en base64url. La signature fait 43 caractères ; celle-ci n'est pas une vraie : seule l'API
// la vérifie, l'appli ne regarde que la forme.
const signature = 'Zm9yLXRlc3RzLW9ubHktbm90LWEtcmVhbC1zaWduYXR'

/** Le lien « Ne plus recevoir le récap de la semaine », au bas d'un récap. */
export const recapToken = `v1.dTE.recap.${signature}`

/** Le lien « Ne plus recevoir les e-mails de mentions et de réponses » (6c, toujours valable). */
export const mentionsToken = `v1.dTE.mentions.${signature}`

/** R8 : le lien « Ne plus recevoir ces e-mails », au bas d'un e-mail « tout de suite ». */
export const instantToken = `v1.dTE.instant.${signature}`

/**
 * Un jeton de bonne forme que l'API refuse (signature fausse, compte supprimé) : elle répond 400
 * `unsubscribe_invalid`, et la page dit « Lien invalide » après « Confirmer ».
 */
export const refusedToken = `v1.dTE.recap.${'A'.repeat(43)}`

/** Un jeton abîmé (une sorte inconnue, une signature coupée) : « Lien invalide » dès l'ouverture. */
export const malformedToken = 'v1.dTE.weekly.Zm9yLXRlc3Rz' // gitleaks:allow
