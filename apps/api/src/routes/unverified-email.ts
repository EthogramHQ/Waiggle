// Corriger son adresse avant de l'avoir vérifiée (tranche R2, A4 ; docs/scenarios/refonte.md) :
// POST /v1/account/unverified-email. Un nouveau membre s'est trompé d'une lettre en s'inscrivant ;
// il n'a pas de session (on ne se connecte qu'après la vérification). L'adresse saisie et le mot
// de passe prouvent que c'est bien lui ; l'adresse change, l'ancien lien cesse de marcher, et un
// nouveau lien part à la bonne adresse.
//
// La route n'utilise jamais la session (app.ts ne la lui lit pas, relecture de sécurité S9) : la
// session d'un autre membre sur le même appareil ne change rien. Le contrôle d'origine des routes
// /v1, lui, s'applique (une page d'un autre site ne peut pas l'appeler).
//
// Ce qu'elle ne dit jamais : si une adresse a un compte. Adresse inconnue ou mot de passe faux, la
// même réponse 401 et la même durée ; nouvelle adresse déjà prise, la même réponse qu'une adresse
// libre (décision D4), et c'est son propriétaire qui est prévenu, comme à l'inscription.
import { createRoute } from '@hono/zod-openapi'
import { ChangeUnverifiedEmailRequest, ChangeUnverifiedEmailResponse } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { createEmailVerificationToken } from 'better-auth/api'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import type { Auth } from '../auth/auth'
import { forgetResetLinks } from '../auth/password'
import { hitInOrder } from '../auth/verification-resend'
import { languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
import { type Email, existingAccountEmail, verificationEmail } from '../email/templates'
import { errorBody, languageOf } from '../errors'
import { describeError } from '../log'
import {
  ADDRESS_COUNTER_PURPOSES,
  addressCounterKey,
  memberCounterKeys,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

/** Le chemin de la route : app.ts l'exempte de la lecture de la session (pas du contrôle d'origine). */
export const UNVERIFIED_EMAIL_PATH = '/v1/account/unverified-email'

const route = createRoute({
  method: 'post',
  path: UNVERIFIED_EMAIL_PATH,
  summary: 'Correct my address before verifying it (no session)',
  description:
    'The current address and the password prove the account. A new verification link leaves ' +
    'for the new address; the old link stops working. A new address that already has an account ' +
    'gets the same answer, and its owner is warned.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ChangeUnverifiedEmailRequest } },
    },
  },
  responses: {
    200: {
      description: 'The new address, where the link left if it was free.',
      content: { 'application/json': { schema: ChangeUnverifiedEmailResponse } },
    },
    400: errorResponse('Malformed request.'),
    401: errorResponse('Wrong address or password (the same answer for both).'),
    403: errorResponse('Sent from another website.'),
    409: errorResponse('The account is already verified: sign in instead.'),
    429: errorResponse('Too many corrections.'),
  },
})

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Les quotas (plan A4, relectures de sécurité S7, S9 et juridique jur-7) :
// - par adresse IP, 5 par quart d'heure, comptés avant même la lecture du corps (les demandes mal
//   formées comptent) ;
// - par adresse de départ, 3 par heure, avant la recherche du compte : on ne peut pas essayer plus
//   de 3 mots de passe par heure sur une adresse, d'où qu'on vienne ;
// - après un mot de passe juste, par compte : 3 par heure, 5 par jour ;
// - par adresse d'arrivée, 3 par jour, qui que soit le demandeur : une boîte ne reçoit pas plus de
//   3 e-mails par jour de cette route (ce plafond contient celui de 3 par heure de S7).
const IP_RULE: RateRule = { windowMs: 15 * MINUTE, max: 5 }
const ADDRESS_RULE: RateRule = { windowMs: HOUR, max: 3 }
const ACCOUNT_RULE: RateRule = { windowMs: HOUR, max: 3 }
const ACCOUNT_DAY_RULE: RateRule = { windowMs: DAY, max: 5 }
const DESTINATION_RULE: RateRule = { windowMs: DAY, max: 3 }

/** Une durée de vie de lien d'une heure, comme `emailVerification.expiresIn` (auth.ts). */
const LINK_LIFETIME_SECONDS = 60 * 60

/**
 * Une écriture refusée par l'index unique de la base (code 23505) : ici, la nouvelle adresse est
 * déjà celle d'un autre compte. Drizzle range l'erreur de la base dans `cause`.
 */
const isUniqueViolation = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  return codeOf(error) === '23505' || (error instanceof Error && codeOf(error.cause) === '23505')
}

type Deps = {
  db: Database
  limiter: RateLimiter
  /** Better Auth : sa façon de hacher les mots de passe, son secret et l'adresse de ses liens. */
  auth: Pick<Auth, '$context'>
  mailer: Mailer
  /** Adresse de l'appli web : la page /verified des liens, et celle de la connexion. */
  appUrl: string
  /** BETTER_AUTH_SECRET : la clé des compteurs par adresse en est dérivée. */
  secret: string
}

export const unverifiedEmailRoutes = ({ db, limiter, auth, mailer, appUrl, secret }: Deps) => {
  const app = createRouter()

  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  /**
   * Envoie un e-mail sans attendre qu'il parte (S5) : la durée de la réponse ne dit rien. Un échec
   * d'envoi est noté dans les journaux sans l'adresse ni le lien (describeError, jur-8).
   */
  const sendInBackground = (email: Email) => {
    void Promise.resolve()
      .then(() => mailer.send(email))
      .catch((error: unknown) => {
        console.error(
          'Unverified address e-mail not sent',
          describeError(error, { method: 'POST', path: UNVERIFIED_EMAIL_PATH }),
        )
      })
  }

  // L'empreinte d'un mot de passe inventé, calculée une fois, au premier besoin : une adresse
  // inconnue fait vérifier le mot de passe contre elle, pour que la réponse prenne le même temps
  // qu'avec un vrai compte (sinon, chronométrer la réponse dirait qui a un compte).
  let dummyHash: Promise<string> | undefined
  const dummy = async () => {
    dummyHash ??= auth.$context.then((context) => context.password.hash('waiggle-no-account-here'))
    return dummyHash
  }

  /** Le propriétaire d'une adresse déjà prise est prévenu, comme à l'inscription (jur-B2). */
  const warnOwner = async (address: string) => {
    const [owner] = await db
      .select({ name: schema.user.name, email: schema.user.email, language: schema.user.language })
      .from(schema.user)
      .where(eq(schema.user.email, address))
    if (!owner) return
    sendInBackground({
      to: owner.email,
      ...existingAccountEmail(languageOfMember(owner), {
        name: owner.name,
        signInUrl: `${appUrl}/sign-in`,
      }),
    })
  }

  // Le quota par adresse IP, avant le validateur du corps (que Hono place juste avant la route) :
  // une demande mal formée compte aussi. X-Real-IP est posé par Caddy, qui remplace toute valeur
  // envoyée par le visiteur.
  app.on('POST', UNVERIFIED_EMAIL_PATH, async (c, next) => {
    const ip = c.req.header('x-real-ip') ?? 'unknown'
    const decision = await limiter.hit(`unverified-email-ip:${ip}`, IP_RULE)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  app.openapi(route, async (c) => {
    const input = c.req.valid('json')
    // Better Auth range les adresses en minuscules, sans blancs : les nôtres aussi (S9).
    const email = input.email.trim().toLowerCase()
    const newEmail = input.newEmail.trim().toLowerCase()

    const byAddress = await limiter.hit(
      addressCounterKey(secret, ADDRESS_COUNTER_PURPOSES.unverified, email),
      ADDRESS_RULE,
    )
    if (!byAddress.allowed) return tooMany(c, byAddress.retryAfterSeconds)

    // Le compte et l'empreinte de son mot de passe, en une requête : la ligne `user` par l'index
    // unique de son adresse, puis sa connexion « credential » (adresse et mot de passe) par l'index
    // account_userId_idx. « left join » garde le compte même sans mot de passe (hash vaut null).
    const [account] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        emailVerified: schema.user.emailVerified,
        language: schema.user.language,
        hash: schema.account.password,
      })
      .from(schema.user)
      .leftJoin(
        schema.account,
        and(eq(schema.account.userId, schema.user.id), eq(schema.account.providerId, 'credential')),
      )
      .where(eq(schema.user.email, email))
      .limit(1)

    const context = await auth.$context
    const hash = account?.hash ?? (await dummy())
    const rightPassword = await context.password.verify({ hash, password: input.password })
    if (!account?.hash || !rightPassword) {
      return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    }
    if (account.emailVerified) return c.json(errorBody(languageOf(c), 'already_verified'), 409)

    // Après un mot de passe juste : le compte (S7), puis l'adresse d'arrivée (S7, jur-7). Compté
    // avant de savoir si cette adresse est prise : sinon la différence de quota le dirait.
    const quota = await hitInOrder(limiter, [
      { key: memberCounterKeys(account.id).unverifiedEmail, rule: ACCOUNT_RULE },
      { key: memberCounterKeys(account.id).unverifiedEmailDay, rule: ACCOUNT_DAY_RULE },
      {
        key: addressCounterKey(secret, ADDRESS_COUNTER_PURPOSES.unverifiedTo, newEmail),
        rule: DESTINATION_RULE,
      },
    ])
    if (!quota.allowed) return tooMany(c, quota.retryAfterSeconds)

    const answer = () => c.json(ChangeUnverifiedEmailResponse.parse({ sentTo: newEmail }), 200)

    if (newEmail !== email) {
      // L'heure de JavaScript (pôle code, « Dates ») : updated_at sert de borne aux liens (S13).
      const now = new Date()
      let changed: boolean
      try {
        // Une « transaction » : les deux écritures réussissent ensemble ou pas du tout.
        // 1. La nouvelle adresse, et updated_at à maintenant : beforeLink (change-email.ts)
        //    refusera tout lien d'inscription émis avant (S13), même si le compte revient un jour
        //    à l'adresse de ce lien. Seulement si le compte n'est toujours pas vérifié (un lien
        //    ouvert entre-temps). Lue par la clé primaire. created_at ne bouge pas : la purge des
        //    comptes jamais vérifiés (30 jours) reste comptée depuis l'inscription.
        // 2. Les jetons du mot de passe oublié de ce membre (relecture de sécurité B2) : un lien
        //    parti à l'ancienne adresse ne doit plus rien pouvoir. Better Auth y range l'identifiant
        //    du membre dans `value` (S12) ; la table est petite (des jetons d'une heure), sans index
        //    sur cette colonne.
        changed = await db.transaction(async (tx) => {
          const updated = await tx
            .update(schema.user)
            .set({ email: newEmail, updatedAt: now })
            .where(and(eq(schema.user.id, account.id), eq(schema.user.emailVerified, false)))
            .returning({ id: schema.user.id })
          if (updated.length === 0) return false
          // Les lignes de Better Auth et les nôtres (auth/password.ts, sec-B1) : une seule fonction.
          await forgetResetLinks(tx, account.id)
          return true
        })
      } catch (error) {
        // La nouvelle adresse a déjà un compte : l'index unique de user.email refuse l'écriture
        // (23505). On ne cherche pas l'adresse avant d'écrire : c'est la base qui tranche, même
        // pour une inscription arrivée une milliseconde plus tôt (S9, aucune course possible).
        if (!isUniqueViolation(error)) throw error
        await warnOwner(newEmail)
        return answer()
      }
      if (!changed) return c.json(errorBody(languageOf(c), 'already_verified'), 409)
    }

    // Le nouveau lien, fabriqué comme Better Auth le fait (sendVerificationEmailFn), vers la page
    // /verified imposée (S6). Si l'adresse demandée est l'adresse actuelle, rien ne change en base
    // et un nouveau lien part : c'est un renvoi.
    const token = await createEmailVerificationToken(
      context.secret,
      newEmail,
      undefined,
      context.options.emailVerification?.expiresIn ?? LINK_LIFETIME_SECONDS,
    )
    const url = new URL(`${context.baseURL}/verify-email`)
    url.searchParams.set('token', token)
    url.searchParams.set('callbackURL', `${appUrl}/verified`)
    sendInBackground({
      to: newEmail,
      ...verificationEmail(languageOfMember(account), { name: account.name, url: url.toString() }),
    })
    return answer()
  })

  return app
}
