// Configuration de Better Auth, la bibliothèque qui gère les comptes : inscription, connexion,
// sessions, vérification de l'adresse e-mail, suppression du compte.
// Écrire soi-même ces mécanismes est risqué (stockage des mots de passe, jetons, attaques) :
// on s'appuie sur une bibliothèque éprouvée, et on règle ici son comportement pour Waiggle.

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
import { parseAcceptLanguage, resolveLanguage, resources } from '@ruche/i18n'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import { eraseCommentsOf, sweepOrphanComments } from '../comments/erase'
import { isLanguage, languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
// L'e-mail de vérification part de auth/verification-resend.ts (tranche R2).
import { existingAccountEmail } from '../email/templates'
import { ensureHandle } from '../handles/claim'
import { describeError } from '../log'
import type { FileStorage } from '../media/storage'
import { suspensionEmailKey } from '../moderation/suspend'
import { mediaKeysOf } from '../projects/load'
import { createRateLimiter, deleteAddressCounters, deleteMemberCounters } from '../rate-limit'
import { voidReportsOfDepartedAuthors } from '../reports/queue'
import { closeSuspensionsOfDeparted } from '../suspension/load'
import { createEmailChange } from './change-email'
import { createPasswordFlows, forgetResetLinks, RESET_LINK_LIFETIME_SECONDS } from './password'
import { authSchemaOptions } from './schema-options'
import { createVerificationResend } from './verification-resend'

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

// Les quotas de Better Auth (fenêtres en secondes, comme il les attend). Règle générale : 100
// requêtes par minute et par adresse IP. Règles plus strictes sur les routes sensibles : 5 essais
// de connexion par quart d'heure rendent impossible de deviner un mot de passe en essayant des
// milliers de combinaisons.
const AUTH_RATE_GENERAL = { window: 60, max: 100 }
export const AUTH_RATE_RULES = {
  '/sign-in/email': { window: 15 * 60, max: 5 },
  '/sign-up/email': { window: 60 * 60, max: 10 },
  '/delete-user': { window: 15 * 60, max: 5 },
  // Changer d'adresse (tranche « adresse ») : la demande, et l'ouverture des deux liens reçus par
  // e-mail. Un plafond par membre s'y ajoute (auth/change-email.ts) : celui-ci suit l'adresse IP.
  '/change-email': { window: 15 * 60, max: 5 },
  '/verify-email': { window: 15 * 60, max: 30 },
  // Le mot de passe (tranche R2) : demander un lien, choisir le nouveau mot de passe depuis le lien,
  // le changer depuis les réglages. Des plafonds par adresse e-mail et par membre s'y ajoutent
  // (auth/password.ts).
  '/request-password-reset': { window: 15 * 60, max: 5 },
  '/reset-password': { window: 15 * 60, max: 10 },
  '/change-password': { window: 15 * 60, max: 5 },
  // Renvoyer le lien de vérification (tranche R2, A3, relecture de sécurité S4) : des plafonds par
  // adresse s'y ajoutent (auth/verification-resend.ts).
  '/send-verification-email': { window: 15 * 60, max: 5 },
} satisfies Record<string, { window: number; max: number }>

/**
 * La plus longue fenêtre de ces quotas, en millisecondes. La purge de nuit (jobs/nightly-purge.ts)
 * n'efface un compteur de Better Auth qu'après elle : une règle d'un jour ajoutée ici allonge donc
 * d'elle-même la durée de garde, au lieu d'être remise à zéro chaque nuit (relecture de sécurité
 * A4).
 */
export const AUTH_RATE_WINDOW_MAX_MS =
  1000 *
  Math.max(AUTH_RATE_GENERAL.window, ...Object.values(AUTH_RATE_RULES).map((rule) => rule.window))

// La langue d'un membre déjà inscrit (celle de son profil, le français sinon) : email/language.ts,
// partagé avec les e-mails de notification (tranche 6c).
const languageOf = languageOfMember

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
  // Changer son adresse (tranche « adresse ») : les hooks et les envois de ce parcours, avec leurs
  // propres quotas, comptés dans la table api_rate_limit comme ceux de nos routes. Le secret sert
  // à chiffrer le jeton du second lien.
  const emailChange = createEmailChange({
    mailer,
    rateLimiter: createRateLimiter(db),
    appUrl,
    secret,
  })
  // Le mot de passe oublié et le changement de mot de passe (tranche R2) : hooks, envois et quotas
  // par adresse et par membre (auth/password.ts).
  const passwordFlows = createPasswordFlows({
    db,
    mailer,
    rateLimiter: createRateLimiter(db),
    appUrl,
    secret,
  })
  // Renvoyer le lien de vérification (tranche R2, A3) : ses quotas et ses envois
  // (auth/verification-resend.ts).
  const verificationResend = createVerificationResend({
    mailer,
    rateLimiter: createRateLimiter(db),
    appUrl,
    secret,
  })

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
      // Mot de passe oublié (tranche R2, A1) : le lien vaut une heure et ne sert qu'une fois ; une
      // fois le mot de passe changé, toutes les sessions du membre sont coupées (un voleur connecté
      // perd l'accès). Le lien mène à la page de l'appli (auth/password.ts). La suite du reset :
      // autres liens effacés et e-mail « mot de passe changé » dans onPasswordReset, que Better
      // Auth appelle avec le membre (relecture de sécurité de R2, B1) ; l'adresse vérifiée dans le
      // hook `after` de /reset-password, plus bas.
      sendResetPassword: passwordFlows.sendResetPassword,
      onPasswordReset: passwordFlows.onPasswordReset,
      resetPasswordTokenExpiresIn: RESET_LINK_LIFETIME_SECONDS,
      revokeSessionsOnPasswordReset: true,
    },

    // Les jetons rangés dans la table `verification` (ceux du mot de passe oublié) n'y sont gardés
    // que sous leur empreinte (relecture de sécurité S12) : quelqu'un qui lirait la base, ou une
    // sauvegarde, ne pourrait pas s'en servir. Better Auth calcule la même empreinte pour retrouver
    // un jeton reçu.
    verification: { storeIdentifier: 'hashed' },

    emailVerification: {
      sendOnSignUp: true,
      // Tentative de connexion avec une adresse non vérifiée : on renvoie le lien.
      sendOnSignIn: true,
      // Cliquer sur le lien vérifie l'adresse ET connecte le membre.
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60, // le lien est valable une heure
      // Le même réglage envoie le second lien d'un changement d'adresse, vers la nouvelle adresse :
      // emailChange le reconnaît à son jeton et envoie son propre e-mail (auth/change-email.ts).
      sendVerificationEmail: async ({ user, url, token }, request) => {
        if (await emailChange.sendNewEmailLink({ user, url, token })) return
        // Tranche R2 : page imposée, envoi en arrière-plan, quota du renvoi par la connexion.
        await verificationResend.sendSignUpLink({ user, url }, request)
      },
      // Juste après la vérification de l'adresse (le lien ouvert), le membre reçoit son pseudo
      // (tranche 6a) : pas avant, pour qu'un compte jamais vérifié n'en bloque aucun. Une panne ici
      // ne doit pas faire échouer la vérification, déjà enregistrée : on la note dans les logs, et
      // le pseudo sera donné en filet à la première lecture de « Mon profil ».
      // Après le second lien d'un changement d'adresse, le membre a déjà son pseudo : emailChange
      // écrit le journal et prévient l'ancienne adresse (auth/change-email.ts).
      // Un changement d'adresse abouti efface aussi les liens de mot de passe oublié envoyés à
      // l'ancienne adresse (tranche R2, relecture de sécurité B2).
      afterEmailVerification: async (user, request) => {
        if (await emailChange.afterEmailChanged(user, request)) {
          if (user) await forgetResetLinks(db, user.id)
          return
        }
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
      // Changer son adresse (route POST /api/auth/change-email), après l'accord de l'adresse
      // actuelle puis la vérification de la nouvelle : deux liens envoyés par e-mail. Jamais
      // `updateEmailWithoutVerification`, qui changerait l'adresse sans aucun lien.
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: emailChange.sendChangeEmailConfirmation,
      },
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
        //
        // D'abord, une ligne dans les journaux : seulement l'identifiant (ni nom, ni adresse). Une
        // sauvegarde restaurée ramènerait ce compte ; cette ligne dit qu'il faut le supprimer de
        // nouveau (docs/ops/serveur.md, « Sauvegardes »). Écrite en premier, elle ne dépend pas du
        // ménage qui suit : le compte est déjà parti.
        afterDelete: async (user) => {
          console.log(`Account deleted ${user.id}`)
          const keys = filesToDelete.get(user.id) ?? []
          filesToDelete.delete(user.id)
          for (const key of keys) await storage.delete(key)
          await deleteMemberCounters(db, user.id)
          // Tranche R2, jur-6 : ses liens de mot de passe oublié encore valides, et tous les
          // compteurs de son adresse (mot de passe oublié, renvoi du lien, correction de l'adresse :
          // des empreintes, mais qui désignent toujours cette adresse).
          await forgetResetLinks(db, user.id)
          await deleteAddressCounters(db, secret, user.email)
          await sweepOrphanComments(db)
          // Les signalements qui visaient ses contenus ou son profil (tranche 7a, règle 16) : la
          // base a déjà remis leur target_author_id à null ; les ouverts et les classés passent à
          // « sans objet » (effacés 30 jours plus tard), ceux suivis d'un retrait restent un an. Ici,
          // après la suppression, et pas dans beforeDelete : une suppression refusée ne touche à
          // rien. Ceux qu'elle a faits restent, sans son nom (reporter_id remis à null par la base).
          // Une panne ici ne doit pas faire échouer la suppression, déjà faite : la purge de nuit
          // rattrape (reports/retention.ts).
          try {
            await voidReportsOfDepartedAuthors(db, new Date())
          } catch (error) {
            console.error(
              'Reports not voided after deletion',
              describeError(error, { method: 'POST', path: '/api/auth/delete-user' }),
            )
          }
          // Sa suspension en cours (tranche 7c, J1) : partir est permis, et n'efface pas la
          // preuve. Elle est close à la date du départ, sans décision de levée, et gardée un an
          // avec ses décisions. Ici, après la suppression : une suppression refusée laisse la
          // suspension en cours. Le compteur de ses e-mails de suspension (S18) porte son
          // identifiant : effacé aussi. Une panne ne fait pas échouer la suppression, déjà faite.
          try {
            await closeSuspensionsOfDeparted(db, new Date())
            await db
              .delete(schema.apiRateLimit)
              .where(eq(schema.apiRateLimit.key, suspensionEmailKey(user.id)))
          } catch (error) {
            console.error(
              'Suspension not closed after deletion',
              describeError(error, { method: 'POST', path: '/api/auth/delete-user' }),
            )
          }
        },
      },
    },

    // Routes de Better Auth que l'appli n'utilise pas :
    // - update-user permettrait de changer son nom ou son image sans passer par nos règles (image
    //   hébergée n'importe où, qui révélerait l'adresse IP de chaque visiteur) : le profil passe
    //   par PATCH /v1/me ;
    // - expo-authorization-proxy (plugin Expo) ne sert qu'à la connexion par Google, Apple… sur
    //   téléphone, que l'appli ne propose pas. Elle renvoie vers n'importe quelle adresse donnée
    //   dans le lien : un lien sur notre domaine pourrait mener vers un faux site (hameçonnage) ;
    // - list-sessions et revoke-* : lister ou couper ses sessions, que l'appli ne montre pas ;
    // - sign-in/social et link-social : la connexion par Google, Apple… que l'appli ne propose pas.
    //   Ouvertes, elles écrivent dans les logs le nom de fournisseur envoyé par n'importe qui ;
    // - verify-password (audit du 25/10/2026, C4) : elle dit seulement si un mot de passe est le
    //   bon. Avec une session volée, elle servait à deviner le mot de passe du membre, 100 essais
    //   par minute, sans laisser de trace. La suppression du compte vérifie le sien elle-même ;
    // - les autres (C6), qu'aucun écran n'appelle : list-accounts, unlink-account, account-info,
    //   get-access-token et refresh-token (les comptes liés et les jetons d'un fournisseur comme
    //   Google, que nous n'avons pas) ; update-session (écrire dans sa session) ;
    //   delete-user/callback (suppression confirmée par e-mail : la nôtre l'est par le mot de
    //   passe) ; ok (une sonde : /health suffit).
    //   N'y sont plus, rouvertes avec leurs hooks et leurs quotas : change-email (tranche
    //   « adresse », auth/change-email.ts) ; request-password-reset, reset-password et
    //   change-password (tranche R2, auth/password.ts) ; send-verification-email (tranche R2,
    //   auth/verification-resend.ts).
    //   Un chemin variable (/callback/:id, /reset-password/:token) ne se ferme pas par cette
    //   liste, qui compare des chemins exacts. /callback/:id ne mène à rien sans fournisseur réglé ;
    //   /reset-password/:token, qui redirigerait avec le jeton vers la page choisie par le
    //   visiteur, est fermé par une garde avant Better Auth (app.ts).
    // Une route fermée répond 404, comme une adresse inconnue (test dans accounts.test.ts). Le jour
    // où l'appli s'en sert, on la retire de cette liste, avec ses tests.
    disabledPaths: [
      '/update-user',
      '/expo-authorization-proxy',
      '/list-sessions',
      '/revoke-session',
      '/revoke-sessions',
      '/revoke-other-sessions',
      '/sign-in/social',
      '/link-social',
      '/verify-password',
      '/list-accounts',
      '/unlink-account',
      '/account-info',
      '/get-access-token',
      '/refresh-token',
      '/update-session',
      '/delete-user/callback',
      '/ok',
    ],

    rateLimit: {
      ...authSchemaOptions.rateLimit,
      enabled: rateLimit,
      // Les règles, écrites plus haut (AUTH_RATE_RULES) : la purge de nuit lit leur durée.
      ...AUTH_RATE_GENERAL,
      customRules: AUTH_RATE_RULES,
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
    //
    // À la suppression du compte : le mot de passe est obligatoire. Sans lui, Better Auth se
    // contente d'une session de moins d'un jour (« fraîche ») ; quelqu'un qui trouverait un
    // téléphone ouvert pourrait alors tout effacer. Le champ `token` (suppression confirmée par
    // e-mail, que nous n'utilisons pas) est refusé pour la même raison.
    //
    // Pour changer d'adresse : la demande et les deux liens passent par emailChange
    // (auth/change-email.ts), qui dit dans l'ordre ce qu'il vérifie. Pour le mot de passe
    // (tranche R2) : passwordFlows (auth/password.ts).
    //
    // Un aiguillage par chemin : chaque route a sa ligne, et la fonction qui la garde est rangée
    // dans le fichier de son parcours.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        switch (ctx.path) {
          case '/change-email':
            return emailChange.beforeRequest(ctx)
          case '/verify-email':
            return emailChange.beforeLink(ctx)
          case '/request-password-reset':
            return passwordFlows.beforeResetRequest(ctx)
          case '/change-password':
            return passwordFlows.beforeChange(ctx)
          case '/send-verification-email':
            return verificationResend.beforeResend(ctx)
        }
        const body: object = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}
        if (ctx.path === '/delete-user') {
          const password = 'password' in body ? body.password : undefined
          if (typeof password !== 'string' || password === '' || 'token' in body) {
            throw new APIError('BAD_REQUEST', { message: 'Password required' })
          }
          return
        }
        if (ctx.path !== '/sign-up/email') return
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
      // Un hook `after` s'exécute après la route, même quand elle a répondu par une redirection.
      // Le second lien d'un changement d'adresse ne doit connecter personne (auth/change-email.ts).
      // Après un mot de passe changé, par le lien ou depuis les réglages : la suite du parcours
      // (auth/password.ts). Chaque fonction regarde d'abord si la route a réussi.
      after: createAuthMiddleware(async (ctx) => {
        switch (ctx.path) {
          case '/verify-email':
            return emailChange.afterLink(ctx)
          case '/reset-password':
            return passwordFlows.afterReset(ctx)
          case '/change-password':
            return passwordFlows.afterChange(ctx)
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
