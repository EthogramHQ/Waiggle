// Le mot de passe (tranche R2, docs/scenarios/refonte.md, « Le mot de passe ») : tout ce que l'API
// ajoute à Better Auth pour le mot de passe oublié et le changement depuis les réglages, rangé ici
// pour que auth.ts reste lisible (sur le modèle de auth/change-email.ts).
//
// Les trois routes sont celles de Better Auth (1.7.13) :
// 1. POST /api/auth/request-password-reset { email } : si un compte a cette adresse, Better Auth
//    range un jeton à usage unique dans la table `verification` et nous demande d'envoyer le lien
//    (`sendResetPassword`) ; la réponse est la même que l'adresse ait un compte ou non ;
// 2. POST /api/auth/reset-password { token, newPassword } : la page de l'appli envoie le jeton lu
//    dans le lien ; Better Auth change le mot de passe et coupe toutes les sessions ;
// 3. POST /api/auth/change-password { currentPassword, newPassword } : depuis les réglages, avec la
//    session et le mot de passe actuel.
// Ce fichier y ajoute les règles du plan (A1, A2) et de ses relectures : quotas par adresse et par
// membre, lien vers la page de l'appli seulement, envois en arrière-plan, adresse vérifiée par le
// lien seulement si c'est celle à qui il est parti, liens plus anciens effacés à chaque changement.
// Ne jamais journaliser une adresse ni un jeton.

import { createHmac, randomUUID } from 'node:crypto'
import { ForgotPasswordRequest } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { APIError, getSessionFromCtx, isAPIError } from 'better-auth/api'
import type { expireCookie } from 'better-auth/cookies'
import { and, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
import { type Email, passwordChangedEmail, resetPasswordEmail } from '../email/templates'
import { ensureHandle } from '../handles/claim'
import { describeError } from '../log'
import {
  addressDigest,
  memberCounterKeys,
  normalizeAddress,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'

/**
 * Le contexte d'une requête de Better Auth, tel que ses hooks le reçoivent (corps, session, outils
 * comme `internalAdapter`). Même astuce que auth/change-email.ts : on reprend le type qu'attend
 * l'une de ses fonctions, faute d'un nom exporté.
 */
type AuthContext = Parameters<typeof expireCookie>[0]

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * La durée de vie d'un lien de mot de passe oublié, en secondes : une heure. Better Auth la lit
 * (`resetPasswordTokenExpiresIn`, auth.ts), et l'e-mail l'écrit (`{{hours}}`, jur-4) : une seule
 * valeur pour les deux.
 */
export const RESET_LINK_LIFETIME_SECONDS = 60 * 60

// Les quotas de la tranche. Ils s'ajoutent à ceux de Better Auth, comptés par adresse IP
// (AUTH_RATE_RULES, dans auth.ts) : ceux-ci suivent l'adresse e-mail ou le membre partout.
// - Mot de passe oublié : 3 liens par heure et 10 par jour vers une même adresse (A1, S1). Une
//   boîte qui n'a rien demandé ne reçoit pas un e-mail par minute.
// - Changer son mot de passe : 5 essais par quart d'heure et 10 par jour par membre (A2, S10).
const RESET_REQUEST_RULE: RateRule = { windowMs: HOUR, max: 3 }
const RESET_REQUEST_DAY_RULE: RateRule = { windowMs: DAY, max: 10 }
const CHANGE_RULE: RateRule = { windowMs: 15 * MINUTE, max: 5 }
const CHANGE_DAY_RULE: RateRule = { windowMs: DAY, max: 10 }

/**
 * La réponse de Better Auth 1.7.13 à toute demande de lien, que l'adresse ait un compte ou non.
 * Quand le quota d'une adresse est atteint, notre hook répond à sa place, avec les mêmes mots :
 * rien ne doit dire qu'un quota est atteint, ni pour quelle adresse. Un test compare les deux
 * réponses (auth/password.test.ts) : il rougira si une mise à jour de Better Auth change ce texte.
 */
const RESET_REQUEST_ANSWER = {
  status: true,
  message: 'If this email exists in our system, check your email for the reset link',
}

// Où dire qu'un envoi ou une écriture a échoué, dans les journaux.
const REQUEST = { method: 'POST', path: '/api/auth/request-password-reset' }
const RESET = { method: 'POST', path: '/api/auth/reset-password' }
const CHANGE = { method: 'POST', path: '/api/auth/change-password' }

/** Les clés des compteurs d'une adresse pour le mot de passe oublié (empreinte HMAC, sec-S2). */
export const resetAddressCounterKeys = (secret: string, email: string) => {
  const digest = addressDigest(secret, email)
  return { hour: `password-reset:${digest}`, day: `password-reset-day:${digest}` }
}

/**
 * Dans un hook `after` : la route a-t-elle échoué ? Better Auth range sa réponse dans
 * `ctx.context.returned` (une APIError quand il refuse), que son type ne déclare pas : on la lit
 * sans supposer sa forme, comme `responseHeaders` dans auth/change-email.ts.
 */
const failed = (ctx: AuthContext) => {
  const returned: unknown = Reflect.get(ctx.context, 'returned')
  return returned === undefined || isAPIError(returned)
}

/** Le corps d'une requête, s'il est un objet ; sinon un objet vide (Better Auth refusera). */
const objectBody = (ctx: AuthContext): Record<string, unknown> =>
  typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}

/**
 * Efface tous les liens de mot de passe oublié d'un membre (relecture de sécurité B2) : après un
 * mot de passe changé (par un lien ou depuis les réglages), une adresse corrigée avant sa
 * vérification (A4, routes/unverified-email.ts), un changement d'adresse abouti, et la suppression
 * du compte (jur-6). Un lien envoyé avant ne doit plus rien pouvoir.
 * Deux sortes de lignes dans la table `verification` :
 * - celles de Better Auth, dont la valeur (`value`) est l'identifiant du membre : seul le mot de
 *   passe oublié y met un identifiant (relecture S12, testé) ;
 * - les nôtres (`sentTo`, plus bas), dont la valeur commence par « identifiant: ».
 * `starts_with` compare le début d'un texte sans motif : contrairement à `like`, un « _ » ou un
 * « % » n'y sont pas des jokers. La table n'a pas d'index sur `value` : PostgreSQL la lit en
 * entier, ce qui reste court, puisque chaque ligne y vit une heure et que la purge de nuit efface
 * les lignes périmées (jobs/nightly-purge.ts).
 */
export const forgetResetLinks = (db: Database, userId: string) =>
  db
    .delete(schema.verification)
    .where(
      or(
        eq(schema.verification.value, userId),
        sql`starts_with(${schema.verification.value}, ${`${userId}:`})`,
      ),
    )

export type PasswordFlowsOptions = {
  db: Database
  mailer: Mailer
  rateLimiter: RateLimiter
  /** Adresse de l'appli web : la page où mène le lien, et les réglages. */
  appUrl: string
  /** BETTER_AUTH_SECRET : les clés des empreintes (adresses, jetons) en sont dérivées. */
  secret: string
}

export const createPasswordFlows = ({
  db,
  mailer,
  rateLimiter,
  appUrl,
  secret,
}: PasswordFlowsOptions) => {
  // L'empreinte d'un jeton de lien : la ligne `sentTo` le retrouve sans le garder lui-même (S12).
  // Une clé à part, dérivée du secret par sa propre étiquette.
  const tokenKey = createHmac('sha256', secret).update('waiggle:reset-link:v1').digest()
  const sentToIdentifier = (token: string) =>
    `reset-sent-to:${createHmac('sha256', tokenKey).update(token).digest('hex')}`

  /**
   * Envoie un e-mail sans attendre qu'il parte (relecture de sécurité S5) : sinon la durée de la
   * réponse dirait si l'adresse a un compte (rien ne part pour une adresse inconnue). Un échec est
   * noté dans les journaux sans l'adresse, ni le jeton, ni le message de l'erreur (describeError,
   * log.ts ; jur-8).
   */
  const sendInBackground = (email: Email, where: { method: string; path: string }) => {
    void mailer.send(email).catch((error: unknown) => {
      console.error('Password e-mail not sent', describeError(error, where))
    })
  }

  /** « Ton mot de passe a changé », vers l'adresse du compte, dans sa langue. */
  const sendPasswordChanged = (
    user: { name: string; email: string },
    where: { method: string; path: string },
  ) => {
    sendInBackground(
      {
        to: user.email,
        ...passwordChangedEmail(languageOfMember(user), {
          name: user.name,
          settingsUrl: `${appUrl}/settings/security`,
        }),
      },
      where,
    )
  }

  return {
    /**
     * Hook `before` de POST /api/auth/request-password-reset, avant le code de Better Auth, donc
     * avant qu'il cherche le compte (relecture de sécurité S1) :
     * 1. une adresse qui n'est pas un texte : Better Auth refusera la demande (400) ;
     * 2. le quota de l'adresse, compté pour toute adresse, inscrite ou non : 3 par heure, 10 par
     *    jour. Atteint, on répond comme Better Auth, sans rien envoyer ;
     * 3. l'adresse passe à Better Auth sans blancs et en minuscules, la forme sous laquelle il la
     *    range : « Lea@Example.com » trouve le compte de « lea@example.com ».
     */
    beforeResetRequest: async (ctx: AuthContext) => {
      const body = objectBody(ctx)
      const email = body.email
      if (typeof email !== 'string') return
      const keys = resetAddressCounterKeys(secret, email)
      // Les deux compteurs comptent chaque demande, même quand l'un refuse déjà.
      const decisions = [
        await rateLimiter.hit(keys.hour, RESET_REQUEST_RULE),
        await rateLimiter.hit(keys.day, RESET_REQUEST_DAY_RULE),
      ]
      const normalized = { ...body, email: normalizeAddress(email) }
      // Quota atteint : la réponse de Better Auth, sans rien envoyer. Seulement pour une adresse
      // bien formée (le contrat de l'appli, ForgotPasswordRequest) : une adresse mal formée reçoit
      // le refus de Better Auth (400), quota atteint ou non, sinon la réponse trahirait le quota.
      const blocked = decisions.some((decision) => !decision.allowed)
      if (blocked && ForgotPasswordRequest.safeParse(normalized).success) {
        return ctx.json(RESET_REQUEST_ANSWER)
      }
      // Ce qu'un hook `before` retourne dans `context` remplace ces valeurs de la requête.
      return { context: { body: normalized } }
    },

    /**
     * Réglage `emailAndPassword.sendResetPassword` de Better Auth : il l'appelle seulement si un
     * compte a l'adresse, avec le jeton qu'il vient de ranger. On n'utilise jamais son `url`, qui
     * mène à sa route GET /reset-password/:token et à la page de retour choisie par le visiteur
     * (`redirectTo`, sec-S6) : le lien mène à la page de l'appli et ne porte que le jeton.
     *
     * Avant l'envoi, une ligne `sentTo` note à quelle adresse le lien part (relecture de sécurité
     * B1) : l'empreinte du jeton → l'identifiant du membre et l'empreinte de son adresse. Au reset,
     * le lien ne vérifie l'adresse que si c'est toujours celle-là. Si cette écriture échoue, rien
     * ne part : un lien sans sa ligne ne saurait pas à qui il a été envoyé.
     */
    sendResetPassword: async ({
      user,
      token,
    }: {
      user: { id: string; name: string; email: string }
      token: string
    }) => {
      const now = Date.now()
      try {
        await db.insert(schema.verification).values({
          id: randomUUID(),
          identifier: sentToIdentifier(token),
          value: `${user.id}:${addressDigest(secret, user.email)}`,
          expiresAt: new Date(now + RESET_LINK_LIFETIME_SECONDS * 1000),
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
      } catch (error) {
        console.error('Reset link not recorded', describeError(error, REQUEST))
        return
      }
      const link = new URL(`${appUrl}/reset-password`)
      link.searchParams.set('token', token)
      sendInBackground(
        {
          to: user.email,
          ...resetPasswordEmail(languageOfMember(user), {
            url: link.toString(),
            hours: RESET_LINK_LIFETIME_SECONDS / 3600,
          }),
        },
        REQUEST,
      )
    },

    /**
     * Hook `after` de POST /api/auth/reset-password, une fois le mot de passe changé (Better Auth a
     * déjà coupé toutes les sessions et consommé le jeton) :
     * 1. si l'adresse du compte n'était pas vérifiée et que le lien lui a bien été envoyé (sa
     *    ligne `sentTo`, B1), le lien la vérifie : il prouve qu'on lit cette boîte (décision de
     *    Louis du 29/10/2026). Le membre reçoit alors son pseudo, comme après le lien
     *    d'inscription (auth.ts, afterEmailVerification) ;
     * 2. tous ses autres liens de mot de passe oublié tombent (B2) ;
     * 3. « Ton mot de passe a changé » part à son adresse.
     * Un membre suspendu le reste : rien ici ne touche à sa suspension (S14).
     */
    afterReset: async (ctx: AuthContext) => {
      if (failed(ctx)) return
      const body = objectBody(ctx)
      const token = typeof body.token === 'string' ? body.token : ctx.query?.token
      if (typeof token !== 'string') return
      const [sentTo] = await db
        .select({ value: schema.verification.value })
        .from(schema.verification)
        .where(eq(schema.verification.identifier, sentToIdentifier(token)))
      // « identifiant:empreinte », écrit par sendResetPassword ; relu par Zod comme tout ce qui entre.
      const parsed = z
        .string()
        .regex(/^[^:]+:[0-9a-f]{64}$/)
        .safeParse(sentTo?.value)
      if (!parsed.success) return
      const [userId = '', sentToDigest] = parsed.data.split(':')
      const user = await ctx.context.internalAdapter.findUserById(userId)
      if (!user) return

      if (!user.emailVerified && addressDigest(secret, user.email) === sentToDigest) {
        await ctx.context.internalAdapter.updateUser(userId, { emailVerified: true })
        // Une panne ici ne doit pas faire échouer le changement, déjà fait : le pseudo sera donné
        // en filet à la première lecture de « Mon profil », comme après l'inscription.
        try {
          await ensureHandle(db, userId)
        } catch (error) {
          console.error('Handle not given after password reset', describeError(error, RESET))
        }
      }
      await forgetResetLinks(db, userId)
      sendPasswordChanged(user, RESET)
    },

    /**
     * Hook `before` de POST /api/auth/change-password, avant le code de Better Auth. Dans l'ordre :
     * 1. sans session, on laisse Better Auth répondre 401 ;
     * 2. les quotas du membre (A2, S10), comptés avant tout contrôle, donc avant la vérification
     *    du mot de passe actuel : chaque essai compte, même mal formé, d'où qu'il vienne ;
     * 3. `revokeOtherSessions` est imposé à `false` : Better Auth couperait alors toutes les
     *    sessions, celle-ci comprise, et en ouvrirait une nouvelle. C'est notre hook `after` qui
     *    coupe les autres et garde celle-ci (afterChange) : l'appli n'a rien à décider (S10).
     */
    beforeChange: async (ctx: AuthContext) => {
      const session = await getSessionFromCtx(ctx)
      if (!session) return
      const keys = memberCounterKeys(session.user.id)
      const decisions = [
        await rateLimiter.hit(keys.passwordChange, CHANGE_RULE),
        await rateLimiter.hit(keys.passwordChangeDay, CHANGE_DAY_RULE),
      ]
      const wait = Math.max(
        0,
        ...decisions.map((decision) => (decision.allowed ? 0 : decision.retryAfterSeconds)),
      )
      if (wait > 0) {
        throw new APIError(
          'TOO_MANY_REQUESTS',
          { message: 'Too many password changes' },
          { 'Retry-After': String(wait) },
        )
      }
      if (typeof ctx.body !== 'object' || ctx.body === null) return
      return { context: { body: { ...ctx.body, revokeOtherSessions: false } } }
    },

    /**
     * Hook `after` de POST /api/auth/change-password, quand le mot de passe a changé :
     * 1. les autres sessions du membre sont effacées, celle de cet appareil gardée (sec-S10) ;
     * 2. ses liens de mot de passe oublié tombent (B2) ;
     * 3. « Ton mot de passe a changé » part à son adresse.
     * Une panne à l'étape 1 n'est pas cachée : l'erreur remonte (500, notée dans les journaux), et
     * le membre voit que quelque chose n'a pas marché, plutôt que de croire ses autres appareils
     * déconnectés.
     */
    afterChange: async (ctx: AuthContext) => {
      if (failed(ctx)) return
      const current = ctx.context.session
      if (!current) return
      const { user } = current
      // « Toutes ses sessions sauf celle-ci », lues par l'index session_userId_idx.
      await db
        .delete(schema.session)
        .where(
          and(eq(schema.session.userId, user.id), ne(schema.session.token, current.session.token)),
        )
      await forgetResetLinks(db, user.id)
      sendPasswordChanged(user, CHANGE)
    },
  }
}
