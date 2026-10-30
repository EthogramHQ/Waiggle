// Renvoyer le lien de vérification d'une inscription (tranche R2, A3) : ce que l'API ajoute à
// Better Auth pour le bouton « Renvoyer l'e-mail » de la page « Vérifie ta boîte mail », et pour le
// renvoi automatique quand un compte pas encore vérifié essaie de se connecter.
//
// Better Auth envoie ce lien par trois chemins, qui finissent tous dans le même réglage
// (`emailVerification.sendVerificationEmail`, auth.ts) :
// 1. l'inscription (POST /api/auth/sign-up/email), sous le quota par adresse IP de l'inscription ;
// 2. « Renvoyer l'e-mail » (POST /api/auth/send-verification-email), sans session : n'importe qui
//    peut le demander pour n'importe quelle adresse. D'où un quota par adresse, compté dans le hook
//    `before` (beforeResend), avant que Better Auth cherche le compte (relecture de sécurité S1) ;
// 3. une connexion avant la vérification (POST /api/auth/sign-in/email, réglage `sendOnSignIn`) :
//    un quota par membre, à part (S3), pour qu'un tiers qui épuise celui de l'adresse n'empêche pas
//    le membre de recevoir son lien.
// Dans tous les cas, l'e-mail part en arrière-plan (S5) et le lien mène à la page /verified de
// l'appli, quoi qu'en dise la demande (S6).

import { ResendVerificationRequest } from '@ruche/contracts'
import { APIError } from 'better-auth/api'
import type { expireCookie } from 'better-auth/cookies'
import { languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
import { type Email, verificationEmail } from '../email/templates'
import { describeError } from '../log'
import {
  addressCounterKey,
  memberCounterKeys,
  type RateDecision,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'

/**
 * Le contexte d'une requête de Better Auth, tel que ses hooks le reçoivent (le même type que dans
 * change-email.ts : celui qu'attend l'une de ses fonctions, faute d'un nom exporté).
 */
type AuthContext = Parameters<typeof expireCookie>[0]

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Les quotas du renvoi, par adresse (plan A3, relecture de sécurité S4) : un renvoi par minute
// (le temps de regarder sa boîte), 5 par heure, 10 par jour. Celui par adresse IP (5 par quart
// d'heure) est compté par Better Auth lui-même (AUTH_RATE_RULES, auth.ts).
const RESEND_RULES: ReadonlyArray<{ name: string; rule: RateRule }> = [
  { name: 'minute', rule: { windowMs: MINUTE, max: 1 } },
  { name: 'hour', rule: { windowMs: HOUR, max: 5 } },
  { name: 'day', rule: { windowMs: DAY, max: 10 } },
]
// Le renvoi par la connexion (S3) : 3 par heure et par membre. Au-delà, rien ne part, sans le dire :
// la connexion répond toujours « adresse pas encore vérifiée ».
const SIGN_IN_RULE: RateRule = { windowMs: HOUR, max: 3 }

/**
 * Compte une demande sous plusieurs règles, de la plus courte à la plus longue, et s'arrête à la
 * première qui refuse : une demande refusée par la minute n'use pas le quota de l'heure ni du jour.
 * Rend la décision de la règle qui refuse (son Retry-After), ou « permis ».
 */
export const hitInOrder = async (
  rateLimiter: RateLimiter,
  rules: ReadonlyArray<{ key: string; rule: RateRule }>,
): Promise<RateDecision> => {
  for (const { key, rule } of rules) {
    const decision = await rateLimiter.hit(key, rule)
    if (!decision.allowed) return decision
  }
  return { allowed: true }
}

/**
 * Remplace la page de retour (callbackURL) d'un lien fabriqué par Better Auth : il y écrit celle de
 * la demande, ou « / ». Nos liens de vérification mènent toujours à /verified (S6).
 */
const withPage = (url: string, page: string) => {
  const link = new URL(url)
  link.searchParams.set('callbackURL', page)
  return link.toString()
}

/** Le chemin d'une requête (« /api/auth/sign-in/email »), ou '' si Better Auth n'en passe pas. */
const pathOf = (request: Request | undefined) => (request ? new URL(request.url).pathname : '')

export type VerificationResendOptions = {
  mailer: Mailer
  rateLimiter: RateLimiter
  /** Adresse de l'appli web : la page /verified, où mène tout lien de vérification. */
  appUrl: string
  /** BETTER_AUTH_SECRET : la clé des compteurs par adresse en est dérivée. */
  secret: string
}

export const createVerificationResend = ({
  mailer,
  rateLimiter,
  appUrl,
  secret,
}: VerificationResendOptions) => {
  const verifiedPage = `${appUrl}/verified`

  /**
   * Envoie un e-mail sans attendre qu'il parte (S5) : la durée de la réponse ne dit pas si
   * l'adresse a un compte non vérifié (le seul cas où un e-mail part). Un échec d'envoi est noté
   * dans les journaux, sans l'adresse ni le lien (describeError ne garde ni le message ni les
   * valeurs : jur-8). `Promise.resolve().then` attrape aussi une erreur levée avant la promesse.
   */
  const sendInBackground = (email: Email, path: string) => {
    void Promise.resolve()
      .then(() => mailer.send(email))
      .catch((error: unknown) => {
        console.error(
          'Verification e-mail not sent',
          describeError(error, { method: 'POST', path }),
        )
      })
  }

  return {
    /**
     * Hook `before` de POST /api/auth/send-verification-email, avant le code de Better Auth : les
     * trois quotas de l'adresse demandée, comptés pour toute adresse (inconnue, déjà vérifiée), et
     * une seule fois par demande (S3 : l'envoi qui suit ne recompte pas). Au-delà : 429 avec
     * Retry-After, la même réponse que l'adresse ait un compte ou non. Un corps sans adresse valide
     * est laissé à Better Auth, qui répond 400 (il a déjà compté la demande dans le quota de
     * l'adresse IP).
     */
    beforeResend: async (ctx: AuthContext) => {
      const body: object = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}
      const sent = 'email' in body ? body.email : undefined
      // Le contrat (ResendVerificationRequest) sur l'adresse ramenée à une seule écriture : une
      // adresse mal formée n'use aucun quota d'adresse, Better Auth lui répond 400.
      const parsed = ResendVerificationRequest.safeParse({
        email: typeof sent === 'string' ? sent.trim().toLowerCase() : sent,
      })
      if (!parsed.success) return
      const { email } = parsed.data
      const decision = await hitInOrder(
        rateLimiter,
        RESEND_RULES.map(({ name, rule }) => ({
          key: addressCounterKey(secret, `verify-${name}`, email),
          rule,
        })),
      )
      if (!decision.allowed) {
        throw new APIError(
          'TOO_MANY_REQUESTS',
          { message: 'Too many verification e-mails' },
          { 'Retry-After': String(decision.retryAfterSeconds) },
        )
      }
      // Ce qu'un hook `before` retourne dans `context` remplace la requête : Better Auth cherche
      // le compte de l'adresse telle qu'on l'a comptée, et le lien mène à notre page (S6).
      return { context: { body: { ...body, email, callbackURL: verifiedPage } } }
    },

    /**
     * Le corps du réglage `emailVerification.sendVerificationEmail` (auth.ts), pour un lien
     * d'inscription (le second lien d'un changement d'adresse est pris avant, par
     * change-email.ts). La page de retour est imposée ; la connexion avant vérification (et tout
     * chemin inattendu, par prudence) passe par le compteur du membre, sans 429 : au-delà, rien ne
     * part. L'inscription et le renvoi ont déjà leur quota.
     */
    sendSignUpLink: async (
      { user, url }: { user: { id: string; name: string; email: string }; url: string },
      request: Request | undefined,
    ) => {
      const path = pathOf(request)
      const counted = !path.endsWith('/sign-up/email') && !path.endsWith('/send-verification-email')
      if (counted) {
        const decision = await rateLimiter.hit(
          memberCounterKeys(user.id).verificationOnSignIn,
          SIGN_IN_RULE,
        )
        if (!decision.allowed) return
      }
      sendInBackground(
        {
          to: user.email,
          ...verificationEmail(languageOfMember(user), {
            name: user.name,
            url: withPage(url, verifiedPage),
          }),
        },
        path || '/api/auth',
      )
    },
  }
}
