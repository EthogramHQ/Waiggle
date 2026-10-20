// Configuration de Better Auth, la bibliothèque qui gère les comptes : inscription, connexion,
// sessions, vérification de l'adresse e-mail, suppression du compte.
// Écrire soi-même ces mécanismes est risqué (stockage des mots de passe, jetons, attaques) :
// on s'appuie sur une bibliothèque éprouvée, et on règle ici son comportement pour Ruche.

import { createHash, timingSafeEqual } from 'node:crypto'
import { expo } from '@better-auth/expo'
import { appName } from '@ruche/brand'
import {
  DisplayName,
  normalizeInviteCode,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import {
  defaultLanguage,
  type Language,
  parseAcceptLanguage,
  resolveLanguage,
  resources,
  supportedLanguages,
} from '@ruche/i18n'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { eraseCommentsOf, sweepOrphanComments } from '../comments/erase'
import type { Mailer } from '../email/mailer'
import { existingAccountEmail, verificationEmail } from '../email/templates'
import { ensureHandle } from '../handles/claim'
import { describeError } from '../log'
import type { FileStorage } from '../media/storage'
import { mediaKeysOf } from '../projects/load'
import { deleteMemberCounters } from '../rate-limit'
import { authSchemaOptions } from './schema-options'

/**
 * Une façon de hacher et de vérifier les mots de passe. Hacher, c'est transformer le mot de passe
 * en une empreinte dont on ne peut pas le retrouver : la base ne garde que l'empreinte.
 */
export type PasswordHashing = {
  hash: (password: string) => Promise<string>
  verify: (data: { hash: string; password: string }) => Promise<boolean>
}

export type AuthOptions = {
  db: Database
  mailer: Mailer
  /** Stockage des fichiers : l'avatar d'un compte supprimé y est effacé. */
  storage: FileStorage
  /** Clé secrète qui signe les sessions (BETTER_AUTH_SECRET). */
  secret: string
  /** Adresse publique de l'API, utilisée pour construire les liens des e-mails. */
  publicApiUrl: string
  /** Adresse de l'appli web : seule origine autorisée à appeler l'API avec des cookies. */
  appUrl: string
  /** Limitation de débit (anti-force brute). Désactivable pour certains tests. */
  rateLimit: boolean
  /** Le code d'invitation exigé à l'inscription ; null : inscription libre (développement). */
  inviteCode: string | null
  /**
   * Réservé aux tests (testing/context.ts) : un hachage rapide à la place de scrypt. La production
   * (index.ts) ne passe rien, et Better Auth garde scrypt, volontairement lent (~120 ms) pour
   * qu'un voleur de la base ne puisse pas essayer des milliards de mots de passe.
   */
  password?: PasswordHashing
}

// L'empreinte (SHA-256) d'un code d'invitation, sous sa forme comparable (voir
// normalizeInviteCode). Deux empreintes ont toujours la même longueur : c'est ce que demande
// timingSafeEqual, ci-dessous.
const inviteDigest = (code: string) =>
  createHash('sha256').update(normalizeInviteCode(code)).digest()

/**
 * Le code envoyé est-il le bon ? timingSafeEqual compare les deux empreintes en un temps qui ne
 * dépend pas de leur contenu. Une comparaison ordinaire s'arrête au premier caractère différent :
 * en chronométrant les réponses, un attaquant pourrait deviner le code caractère par caractère.
 */
const isRightInviteCode = (sent: unknown, expected: string) =>
  typeof sent === 'string' && timingSafeEqual(inviteDigest(sent), inviteDigest(expected))

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

// Langue d'un membre déjà inscrit : celle de son profil, le français si elle est absente ou invalide.
const languageOf = (user: object): Language => {
  const language = 'language' in user ? user.language : undefined
  return isLanguage(language) ? language : defaultLanguage
}

export const createAuth = ({
  db,
  mailer,
  storage,
  secret,
  publicApiUrl,
  appUrl,
  rateLimit,
  inviteCode,
  password,
}: AuthOptions) => {
  // Fichiers à effacer après la suppression d'un compte (identifiant du membre → ses fichiers :
  // son avatar et les photos de tous ses projets).
  const filesToDelete = new Map<string, string[]>()

  return betterAuth({
    ...authSchemaOptions,
    appName,
    baseURL: publicApiUrl,
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema }),

    // Origines autorisées : l'appli web, et l'appli mobile (adresses qui commencent par ruche://).
    // Une requête venant d'un autre site est refusée : protection contre les attaques « CSRF ».
    trustedOrigins: [appUrl, 'ruche://'],

    // Le plugin Expo permet à l'appli iOS / Android de garder sa session (elle n'a pas de cookies
    // comme un navigateur ; le jeton est rangé dans le coffre-fort du téléphone).
    plugins: [expo()],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      // Sans option, Better Auth hache avec scrypt (auth/password.test.ts le vérifie).
      ...(password && { password }),
      // Pas de connexion tant que l'adresse n'est pas vérifiée. Effet secondaire voulu :
      // une inscription avec une adresse existante répond comme une inscription normale.
      requireEmailVerification: true,
      // … et c'est le propriétaire de l'adresse qui est prévenu, par e-mail.
      onExistingUserSignUp: async ({ user }) => {
        await mailer.send({
          to: user.email,
          ...existingAccountEmail(languageOf(user), {
            name: user.name,
            signInUrl: `${appUrl}/sign-in`,
          }),
        })
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      // Tentative de connexion avec une adresse non vérifiée : on renvoie le lien.
      sendOnSignIn: true,
      // Cliquer sur le lien vérifie l'adresse ET connecte le membre.
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60, // le lien est valable une heure
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          ...verificationEmail(languageOf(user), { name: user.name, url }),
        })
      },
      // Juste après la vérification de l'adresse (le lien ouvert), le membre reçoit son pseudo
      // (tranche 6a) : pas avant, pour qu'un compte jamais vérifié n'en bloque aucun. Une panne ici
      // ne doit pas faire échouer la vérification, déjà enregistrée : on la note dans les logs, et
      // le pseudo sera donné en filet à la première lecture de « Mon profil ».
      afterEmailVerification: async (user) => {
        try {
          await ensureHandle(db, user.id)
        } catch (error) {
          console.error(
            'Handle not given after verification',
            describeError(error, { method: 'GET', path: '/api/auth/verify-email' }),
          )
        }
      },
    },

    user: {
      ...authSchemaOptions.user,
      // Suppression du compte par le membre lui-même (route POST /api/auth/delete-user),
      // après confirmation de son mot de passe. Les sessions et méthodes de connexion
      // disparaissent avec lui (suppression « en cascade » dans la base).
      deleteUser: {
        enabled: true,
        // Juste avant la suppression : on note les fichiers de l'avatar et des photos de ses
        // projets (leurs lignes vont disparaître avec le compte, on ne pourrait plus les retrouver).
        beforeDelete: async (user) => {
          const [row] = await db
            .select({ avatarKey: schema.profile.avatarKey })
            .from(schema.profile)
            .where(eq(schema.profile.userId, user.id))
          const projects = await db
            .select({ id: schema.project.id })
            .from(schema.project)
            .where(eq(schema.project.authorId, user.id))
          const keys = await mediaKeysOf(
            db,
            projects.map((p) => p.id),
          )
          filesToDelete.set(user.id, row?.avatarKey ? [row.avatarKey, ...keys] : keys)
          // Ses commentaires (tranche 5) : effacés, sauf ses racines auxquelles d'autres ont
          // répondu, qui deviennent « Commentaire supprimé » (voir comments/erase.ts). Ici et pas
          // après : une fois le compte parti, on ne saurait plus lesquels étaient les siens.
          await eraseCommentsOf(db, user.id)
        },
        // Juste après : on efface les fichiers eux-mêmes du stockage, les compteurs anti-abus
        // qui portent son identifiant, et les commentaires restés sans auteur (un commentaire
        // publié pendant la suppression, entre beforeDelete et maintenant : voir comments/erase.ts).
        afterDelete: async (user) => {
          const keys = filesToDelete.get(user.id) ?? []
          filesToDelete.delete(user.id)
          for (const key of keys) await storage.delete(key)
          await deleteMemberCounters(db, user.id)
          await sweepOrphanComments(db)
        },
      },
    },

    // Routes de Better Auth que l'appli n'utilise pas :
    // - update-user permettrait de changer son nom ou son image sans passer par nos règles (image
    //   hébergée n'importe où, qui révélerait l'adresse IP de chaque visiteur) : le profil passe
    //   par PATCH /v1/me ;
    // - expo-authorization-proxy (plugin Expo) ne sert qu'à la connexion par Google, Apple… sur
    //   téléphone, que l'appli ne propose pas. Elle renvoie vers n'importe quelle adresse donnée
    //   dans le lien : un lien sur notre domaine pourrait mener vers un faux site (hameçonnage).
    disabledPaths: ['/update-user', '/expo-authorization-proxy'],

    rateLimit: {
      ...authSchemaOptions.rateLimit,
      enabled: rateLimit,
      // Règle générale : 100 requêtes par minute et par adresse IP.
      window: 60,
      max: 100,
      // Règles plus strictes sur les routes sensibles. 5 essais de connexion par quart d'heure
      // rendent impossible de deviner un mot de passe en essayant des milliers de combinaisons.
      customRules: {
        '/sign-in/email': { window: 15 * 60, max: 5 },
        '/sign-up/email': { window: 60 * 60, max: 10 },
        '/send-verification-email': { window: 60 * 60, max: 5 },
        '/delete-user': { window: 15 * 60, max: 5 },
      },
    },

    advanced: {
      // L'adresse IP du visiteur est transmise par Caddy dans l'en-tête X-Real-IP
      // (Caddy remplace toute valeur envoyée par le visiteur : impossible de la falsifier).
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
      cookiePrefix: 'ruche',
      // Contrôles d'origine toujours actifs, y compris pendant les tests (Better Auth les coupe
      // par défaut quand il détecte un test). Ils refusent notamment un lien de retour
      // (callbackURL) vers un site extérieur, et les requêtes venues d'un autre site.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },

    // Un « hook » qui s'exécute avant chaque route de Better Auth. À l'inscription :
    // 1. le code d'invitation doit être le bon (s'il y en a un de réglé) ;
    // 2. le nom doit suivre les mêmes règles que dans le profil (1 à 80 caractères, aucun
    //    caractère invisible).
    // Ces contrôles ont lieu AVANT que Better Auth ne regarde si l'adresse existe déjà : la réponse
    // est la même dans les deux cas, elle ne révèle pas qui a un compte.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return
        const body: object = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}
        if (inviteCode !== null) {
          const sent = 'inviteCode' in body ? body.inviteCode : undefined
          if (!isRightInviteCode(sent, inviteCode)) {
            // Le message, dans la langue du visiteur ; le code, pour l'appli (accounts/errors.ts).
            const header =
              ctx.headers?.get('accept-language') ?? ctx.request?.headers.get('accept-language')
            const language = resolveLanguage(parseAcceptLanguage(header))
            throw new APIError('FORBIDDEN', {
              code: 'INVITE_CODE_INVALID',
              message: resources[language].translation.auth.errors.inviteInvalid,
            })
          }
        }
        const name = 'name' in body ? body.name : ''
        if (!DisplayName.safeParse(name).success) {
          throw new APIError('BAD_REQUEST', { message: 'Invalid name' })
        }
      }),
    },

    // Les « hooks » de base de données s'exécutent juste avant ou après une écriture.
    databaseHooks: {
      user: {
        create: {
          // Avant de créer un membre : on fixe sa langue. Celle envoyée par l'appli si elle est
          // valide, sinon celle de son navigateur, sinon le français.
          // On lit la demande d'origine (context.body) : à ce stade, `user.language` vaut déjà
          // la valeur par défaut 'fr' même si l'appli n'a rien envoyé.
          before: async (user, context) => {
            // Défense en profondeur : avec un code d'invitation, seule l'inscription par e-mail
            // (qui vérifie le code, voir hooks ci-dessus) peut créer un compte. Si un jour une
            // connexion par Google ou par lien magique est ajoutée, elle ne pourra pas créer de
            // compte en passant à côté du code. « return false » annule la création.
            if (inviteCode !== null && context?.path !== '/sign-up/email') return false
            const requested: unknown = context?.body?.language
            const header =
              context?.headers?.get('accept-language') ??
              context?.request?.headers.get('accept-language')
            const language = isLanguage(requested)
              ? requested
              : resolveLanguage(parseAcceptLanguage(header))
            return {
              data: {
                ...user,
                name: user.name.trim(),
                language,
                // Une image envoyée avec l'inscription est ignorée : un avatar ne vient que de
                // POST /v1/me/avatar, qui le nettoie et l'héberge chez nous.
                image: null,
              },
            }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
