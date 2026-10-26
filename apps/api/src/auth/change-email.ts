// Changer l'adresse e-mail de son compte (tranche « adresse », docs/scenarios/phase-1.md) : tout
// ce que l'API ajoute à Better Auth pour ce parcours, rangé ici pour que auth.ts reste lisible.
//
// Le parcours de Better Auth (1.7.13) a deux liens, envoyés par e-mail :
// 1. la demande (POST /api/auth/change-email) envoie un premier lien à l'adresse ACTUELLE ;
// 2. ce lien (GET /api/auth/verify-email) envoie un second lien à la NOUVELLE adresse ;
// 3. ce second lien change l'adresse ; un dernier e-mail prévient l'ancienne.
// Better Auth seul laisserait des trous (relecture de sécurité du plan, S1 à S9) ; les fonctions
// de ce fichier les ferment : mot de passe exigé, quotas par membre, liens à usage unique, pages
// de retour imposées, aucune connexion par le second lien.
//
// Les liens portent un « jeton » JWT : un petit texte signé avec notre secret, qui contient
// l'adresse du compte (`email`), la nouvelle (`updateTo`), l'étape (`requestType`) et sa date
// d'émission (`iat`, en secondes). Il est signé, pas chiffré : n'importe qui peut le lire. Le
// premier lien part vers l'adresse du membre, qui connaît les deux adresses ; le second part vers
// une adresse pas encore vérifiée (peut-être celle d'un inconnu, après une faute de frappe) : son
// jeton y est donc chiffré (relecture juridique R1, décision de Louis du 26/10/2026), voir
// `sealToken`. Ne jamais journaliser l'adresse d'une requête de /verify-email, ni une adresse tout
// court.

import { createHash, createHmac } from 'node:crypto'
import { ChangeEmailRequest } from '@ruche/contracts'
import { parseAcceptLanguage, resolveLanguage, resources } from '@ruche/i18n'
import { APIError, createEmailVerificationToken, getSessionFromCtx } from 'better-auth/api'
import { expireCookie } from 'better-auth/cookies'
import { symmetricDecrypt, symmetricEncrypt, verifyJWT } from 'better-auth/crypto'
import { z } from 'zod'
import { languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
import type { Email } from '../email/templates'
import {
  changeEmailConfirmationEmail,
  emailChangedEmail,
  newEmailVerificationEmail,
} from '../email/templates'
import { describeError } from '../log'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'

/**
 * Le contexte d'une requête de Better Auth, tel que ses hooks le reçoivent : la requête (corps,
 * paramètres, cookies) et `ctx.context`, ses outils (base, secret, mots de passe). On reprend le
 * type qu'attend l'une de ses fonctions, faute d'un nom exporté.
 */
type AuthContext = Parameters<typeof expireCookie>[0]

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// Les quotas de la tranche (relecture de sécurité S1 et S4). Ils s'ajoutent à ceux de Better Auth,
// comptés par adresse IP (AUTH_RATE_RULES, dans auth.ts) : ceux-ci suivent le membre partout.
const REQUEST_RULE: RateRule = { windowMs: 15 * MINUTE, max: 5 }
const REQUEST_DAY_RULE: RateRule = { windowMs: 24 * HOUR, max: 10 }
const NEW_EMAIL_LINK_RULE: RateRule = { windowMs: HOUR, max: 3 }
// Un premier lien ne sert qu'une fois, pendant toute sa vie (une heure) : sans cela, l'ouvrir en
// boucle enverrait autant d'e-mails à la nouvelle adresse, qui peut être celle de n'importe qui.
const SINGLE_USE_RULE: RateRule = { windowMs: HOUR, max: 1 }

// Où dire qu'un envoi a échoué, dans les journaux : la demande, ou l'ouverture d'un lien.
const REQUEST = { method: 'POST', path: '/api/auth/change-email' }
const LINK = { method: 'GET', path: '/api/auth/verify-email' }

/** La durée de vie d'un lien, en secondes, si Better Auth n'en donne pas (la même : une heure). */
const LINK_LIFETIME_SECONDS = 60 * 60

/** Les deux étapes d'un changement d'adresse, telles que Better Auth les écrit dans le jeton. */
const ChangeEmailStep = z.enum(['change-email-confirmation', 'change-email-verification'])
type ChangeEmailStep = z.infer<typeof ChangeEmailStep>

/**
 * Le contenu d'un jeton de changement d'adresse, vérifié par Zod comme tout ce qui entre. Un jeton
 * d'inscription (sans `updateTo` ni `requestType`) n'y répond pas : il suit son chemin habituel.
 */
const ChangeEmailToken = z.object({
  email: z.string(),
  updateTo: z.string(),
  requestType: ChangeEmailStep,
  iat: z.number(),
})

/**
 * Lit le contenu d'un jeton SANS vérifier sa signature : la partie du milieu, en base64url. Sert
 * seulement à savoir de quelle étape parle un lien (pour choisir la page où il mène, même périmé)
 * ou à relire un jeton que Better Auth vient de fabriquer ou de vérifier. Jamais pour décider
 * d'un droit : pour cela, `verifyJWT`.
 */
const unverifiedPayload = (token: string): unknown => {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/** L'étape d'un lien, d'après son jeton (non vérifié) ; undefined pour un lien d'inscription. */
const stepOf = (token: string): ChangeEmailStep | undefined =>
  z.object({ requestType: ChangeEmailStep }).safeParse(unverifiedPayload(token)).data?.requestType

/**
 * Un jeton qui nomme une nouvelle adresse (`updateTo`), quelle que soit son étape. Better Auth a un
 * ancien parcours sans étape, qui change l'adresse aussitôt et connecte l'appareil : aucun de nos
 * liens n'en est un (relecture de sécurité A1).
 */
const namesNewAddress = (token: string) =>
  z.object({ updateTo: z.string() }).safeParse(unverifiedPayload(token)).success

/**
 * La partie signée d'un JWT, « en-tête.contenu », sans la signature. La bibliothèque des JWT
 * accepte plusieurs écritures d'une même signature (des blancs, un « = » final, les bits de
 * remplissage du dernier caractère : relecture de sécurité B1) ; la partie signée, elle, n'en a
 * qu'une une fois la signature vérifiée, puisque la signature est calculée sur ces caractères
 * exacts. C'est donc elle qui identifie un lien.
 */
const signedPart = (token: string) => token.split('.').slice(0, 2).join('.')

/**
 * L'empreinte (SHA-256) d'un texte : la clé du compteur « usage unique » ne garde pas le jeton
 * lui-même, qui contient les deux adresses.
 */
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Un jeton chiffré s'écrit en hexadécimal (0-9, a-f) ; un JWT contient toujours deux points. Les
 * deux ne se confondent jamais.
 */
const SEALED = /^[0-9a-f]+$/i

/**
 * Remplace la page de retour (callbackURL) d'un lien fabriqué par Better Auth. Il y écrit celle de
 * la demande, ou « / » ; nos liens mènent toujours à l'une des deux pages de l'appli.
 */
const withPage = (url: string, page: string) => {
  const link = new URL(url)
  link.searchParams.set('callbackURL', page)
  return link.toString()
}

/** La langue du visiteur, d'après l'en-tête Accept-Language (pour les messages d'erreur). */
const visitorLanguage = (ctx: AuthContext) =>
  resolveLanguage(
    parseAcceptLanguage(
      ctx.headers?.get('accept-language') ?? ctx.request?.headers.get('accept-language'),
    ),
  )

export type EmailChangeOptions = {
  mailer: Mailer
  rateLimiter: RateLimiter
  /** Adresse de l'appli web : les deux pages où mènent les liens, et la page de connexion. */
  appUrl: string
  /** BETTER_AUTH_SECRET : la clé qui chiffre le jeton du second lien en est dérivée. */
  secret: string
}

export const createEmailChange = ({ mailer, rateLimiter, appUrl, secret }: EmailChangeOptions) => {
  // La clé du chiffrement des seconds liens : un HMAC du secret sur une étiquette fixe, comme pour
  // les jetons de désinscription (email/unsubscribe-token.ts). Une clé à part pour chaque usage :
  // un texte chiffré par Better Auth avec le secret lui-même ne se déchiffre pas ici.
  const sealKey = createHmac('sha256', secret).update('waiggle:email-change-link:v1').digest('hex')

  /**
   * Chiffre le JWT du second lien (relecture juridique R1). `symmetricEncrypt` (Better Auth) le
   * chiffre en XChaCha20-Poly1305, un chiffrement « authentifié » : sans la clé, on ne peut ni le
   * lire ni le modifier sans que le déchiffrement échoue. Chaque appel tire un nombre au hasard
   * (le « nonce ») : deux chiffrements du même jeton ne se ressemblent pas. Le résultat est en
   * hexadécimal, sûr dans une adresse.
   */
  const sealToken = (token: string) => symmetricEncrypt({ key: sealKey, data: token })

  /**
   * Le JWT d'un lien : tel quel pour un lien d'inscription ou un premier lien, déchiffré pour un
   * second lien ; null pour un jeton chiffré abîmé ou fabriqué, qui ne se déchiffre pas.
   */
  const jwtOf = async (token: string): Promise<string | null> => {
    if (!SEALED.test(token)) return token
    try {
      return await symmetricDecrypt({ key: sealKey, data: token })
    } catch {
      return null
    }
  }

  // Où mène chaque lien, quoi qu'en dise son adresse (relecture de sécurité S2) : le premier vers
  // « Plus qu'une étape », le second vers « Adresse changée ».
  const pageOf: Record<ChangeEmailStep, string> = {
    'change-email-confirmation': `${appUrl}/email-change/confirmed`,
    'change-email-verification': `${appUrl}/email-change/done`,
  }

  /**
   * Envoie un e-mail sans attendre qu'il parte (relecture de sécurité S4) : sinon le temps de
   * réponse dirait si l'adresse demandée a déjà un compte (dans ce cas, rien ne part au premier
   * lien). Un échec d'envoi est noté dans les journaux, sans l'adresse ni le message de l'erreur
   * (describeError, log.ts).
   */
  const sendInBackground = (email: Email, where: { method: string; path: string }) => {
    void mailer.send(email).catch((error: unknown) => {
      console.error('Address change e-mail not sent', describeError(error, where))
    })
  }

  /** Le premier e-mail, vers l'adresse actuelle du membre. */
  const sendConfirmation = (
    user: { name: string; email: string },
    newEmail: string,
    url: string,
  ) => {
    sendInBackground(
      {
        to: user.email,
        ...changeEmailConfirmationEmail(languageOfMember(user), {
          name: user.name,
          newEmail,
          url: withPage(url, pageOf['change-email-confirmation']),
        }),
      },
      REQUEST,
    )
  }

  /**
   * Un refus de la demande : un message, et parfois un code que l'appli reconnaît
   * (INVALID_PASSWORD, SAME_EMAIL), sur le modèle de INVITE_CODE_INVALID (auth.ts).
   */
  const refuse = (status: 'BAD_REQUEST' | 'FORBIDDEN', message: string, code?: string) =>
    new APIError(status, { message, ...(code && { code }) })

  return {
    /**
     * Réglage `user.changeEmail.sendChangeEmailConfirmation` de Better Auth : il l'appelle pour une
     * adresse libre, avec le lien qu'il a fabriqué. (Pour une adresse prise, c'est notre hook qui
     * envoie le même e-mail : voir beforeRequest.)
     */
    sendChangeEmailConfirmation: async ({
      user,
      newEmail,
      url,
    }: {
      user: { name: string; email: string }
      newEmail: string
      url: string
    }) => {
      sendConfirmation(user, newEmail, url)
    },

    /**
     * Appelée par `emailVerification.sendVerificationEmail` (auth.ts) : si le jeton est celui du
     * second lien d'un changement d'adresse, envoie l'e-mail à la nouvelle adresse et répond true ;
     * sinon répond false, et l'e-mail d'inscription part comme avant. Better Auth vient de fabriquer
     * ce jeton : le lire sans le vérifier ne fait courir aucun risque.
     * Au plus 3 seconds liens par heure et par membre (S1) : au-delà, rien ne part, sans le dire.
     * Le lien porte le jeton chiffré (R1) : il contient l'ancienne adresse, et part vers une
     * adresse qui n'a encore rien prouvé. beforeLink le déchiffre à l'ouverture.
     */
    sendNewEmailLink: async ({
      user,
      url,
      token,
    }: {
      user: { id: string; email: string }
      url: string
      token: string
    }) => {
      if (stepOf(token) !== 'change-email-verification') return false
      const decision = await rateLimiter.hit(
        memberCounterKeys(user.id).emailChangeLink,
        NEW_EMAIL_LINK_RULE,
      )
      if (!decision.allowed) return true
      const link = new URL(withPage(url, pageOf['change-email-verification']))
      link.searchParams.set('token', await sealToken(token))
      sendInBackground(
        {
          to: user.email,
          ...newEmailVerificationEmail(languageOfMember(user), { url: link.toString() }),
        },
        LINK,
      )
      return true
    },

    /**
     * Appelée par `emailVerification.afterEmailVerification` (auth.ts), après une vérification
     * réussie. Si c'était le second lien d'un changement d'adresse : une ligne de journal, puis le
     * dernier e-mail à l'ancienne adresse ; répond true. Sinon (une inscription) répond false.
     * Better Auth vient de vérifier le jeton de la requête : on le relit sans le revérifier, après
     * l'avoir déchiffré (l'adresse de la requête garde le jeton chiffré du second lien).
     * `user` peut manquer (relecture de sécurité A2) : si deux seconds liens du même membre sont
     * ouverts en même temps, chacun change « le compte de l'ancienne adresse » ; le premier l'a
     * déjà changée, le second ne trouve plus de compte et nous passe null. Le premier a prévenu
     * l'ancienne adresse ; rien à faire ici.
     */
    afterEmailChanged: async (
      user: { id: string; name: string; email: string } | null | undefined,
      request: Request | undefined,
    ) => {
      if (!user) return true
      const raw = request ? new URL(request.url).searchParams.get('token') : null
      const token = raw ? await jwtOf(raw) : null
      const payload = token ? ChangeEmailToken.safeParse(unverifiedPayload(token)).data : undefined
      if (payload?.requestType !== 'change-email-verification') return false
      // Une sauvegarde restaurée ramènerait l'ancienne adresse : cette ligne dit à qui demander de
      // refaire le changement (docs/ops/serveur.md). L'identifiant seul, jamais d'adresse.
      console.log(`Email changed ${user.id}`)
      sendInBackground(
        {
          to: payload.email,
          ...emailChangedEmail(languageOfMember(user), {
            name: user.name,
            newEmail: user.email,
            signInUrl: `${appUrl}/sign-in`,
          }),
        },
        LINK,
      )
      return true
    },

    /**
     * Hook `before` de POST /api/auth/change-email, avant le code de Better Auth. Dans l'ordre :
     * 1. sans session, on laisse Better Auth répondre 401 ;
     * 2. le quota du membre (S4), compté avant tout contrôle : chaque demande compte, même mal
     *    formée, d'où qu'elle vienne ;
     * 3. le corps, validé par le contrat (il borne aussi la longueur du mot de passe, avant de le
     *    hacher) ;
     * 4. une adresse actuelle non vérifiée : refus (Better Auth sauterait l'accord de l'ancienne
     *    adresse, S7) ;
     * 5. le mot de passe ; un compte sans mot de passe est refusé de la même façon ;
     * 6. la même adresse : refus traduit ;
     * 7. une adresse déjà prise par un autre compte : Better Auth n'enverrait rien. On envoie le
     *    même premier e-mail, pour que le membre ne puisse pas savoir qui a un compte (décision de
     *    Louis) ; son lien ne mènera à rien (beforeLink).
     */
    beforeRequest: async (ctx: AuthContext) => {
      const session = await getSessionFromCtx(ctx)
      if (!session) return
      const keys = memberCounterKeys(session.user.id)
      // Les deux compteurs comptent chaque demande, même quand l'un refuse déjà.
      const decisions = [
        await rateLimiter.hit(keys.emailChange, REQUEST_RULE),
        await rateLimiter.hit(keys.emailChangeDay, REQUEST_DAY_RULE),
      ]
      const wait = Math.max(
        0,
        ...decisions.map((decision) => (decision.allowed ? 0 : decision.retryAfterSeconds)),
      )
      if (wait > 0) {
        throw new APIError(
          'TOO_MANY_REQUESTS',
          { message: 'Too many address change requests' },
          { 'Retry-After': String(wait) },
        )
      }

      const body: object = typeof ctx.body === 'object' && ctx.body !== null ? ctx.body : {}
      const password = 'password' in body ? body.password : undefined
      if (typeof password !== 'string' || password === '') {
        throw refuse('BAD_REQUEST', 'Password required')
      }
      const parsed = ChangeEmailRequest.safeParse(body)
      if (!parsed.success) throw refuse('BAD_REQUEST', 'Invalid request')

      if (!session.user.emailVerified) throw refuse('FORBIDDEN', 'Email not verified')

      // Le mot de passe se vérifie contre l'empreinte de la connexion « credential » (adresse et
      // mot de passe). Sans elle, rien à comparer : même réponse qu'un mauvais mot de passe.
      const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id)
      const hash = accounts.find((account) => account.providerId === 'credential')?.password
      const rightPassword = hash
        ? await ctx.context.password.verify({ hash, password: parsed.data.password })
        : false
      if (!rightPassword) throw refuse('BAD_REQUEST', 'Invalid password', 'INVALID_PASSWORD')

      // Better Auth range les adresses en minuscules : « INES@Exemple.fr » est la même.
      const newEmail = parsed.data.newEmail.toLowerCase()
      if (newEmail === session.user.email.toLowerCase()) {
        const language = visitorLanguage(ctx)
        throw refuse(
          'BAD_REQUEST',
          resources[language].translation.auth.errors.sameEmail,
          'SAME_EMAIL',
        )
      }

      if (await ctx.context.internalAdapter.findUserByEmail(newEmail)) {
        // Le jeton, fabriqué comme Better Auth le fait pour une adresse libre.
        const token = await createEmailVerificationToken(
          ctx.context.secret,
          session.user.email,
          newEmail,
          ctx.context.options.emailVerification?.expiresIn ?? LINK_LIFETIME_SECONDS,
          { requestType: 'change-email-confirmation' },
        )
        sendConfirmation(
          session.user,
          newEmail,
          `${ctx.context.baseURL}/verify-email?token=${token}`,
        )
      }
    },

    /**
     * Hook `before` de GET /api/auth/verify-email, pour les deux liens d'un changement d'adresse.
     * Un lien d'inscription passe sans changement. Pour les nôtres :
     * - la page de retour est imposée (S2), même pour un lien périmé ou faux ;
     * - un jeton plus ancien que le compte de son adresse est refusé (S9) : celui d'un compte
     *   supprimé depuis ne peut rien sur un compte neuf inscrit avec la même adresse ;
     * - chaque lien ne sert qu'une fois (S1) ;
     * - une adresse prise entre-temps : le premier lien mène à sa page sans rien envoyer, le
     *   second est refusé (S5 ; sinon une erreur 500 et une session orpheline).
     * Ce que Better Auth refuse déjà lui-même (jeton faux ou périmé, compte introuvable, lien
     * ouvert par un autre membre connecté), on le lui laisse : il redirige avec son code d'erreur,
     * vers la page imposée, sans que le lien soit compté comme servi.
     * Le jeton chiffré d'un second lien (R1) est d'abord déchiffré, puis rendu en clair à Better
     * Auth ; s'il ne se déchiffre pas, le lien est refusé. Un jeton qui nomme une nouvelle adresse
     * sans étape connue est refusé (A1).
     */
    beforeLink: async (ctx: AuthContext) => {
      const raw: unknown = ctx.query?.token
      if (typeof raw !== 'string') return
      const token = await jwtOf(raw)
      const refused = (page: string) => ctx.redirect(`${page}?error=INVALID_TOKEN`)
      // Seul un second lien porte un jeton chiffré : sa page, même abîmé.
      if (token === null) throw refused(pageOf['change-email-verification'])
      const step = stepOf(token)
      if (!step) {
        if (namesNewAddress(token)) throw refused(pageOf['change-email-verification'])
        return // un lien d'inscription
      }
      const page = pageOf[step]
      // Ce qu'un hook `before` retourne dans `context` est fusionné dans la requête : Better Auth
      // lira ce jeton (déchiffré) et cette page de retour à la place de ceux de l'adresse du lien.
      const proceed = { context: { query: { ...ctx.query, token, callbackURL: page } } }
      const redirect = (code?: string) => ctx.redirect(code ? `${page}?error=${code}` : page)

      const payload = ChangeEmailToken.safeParse(await verifyJWT(token, ctx.context.secret)).data
      if (!payload) return proceed
      const session = await getSessionFromCtx(ctx)
      if (session && session.user.email !== payload.email) return proceed
      const owner = await ctx.context.internalAdapter.findUserByEmail(payload.email)
      if (!owner) return proceed

      // `iat` est en secondes, `createdAt` en millisecondes : un vrai lien, ouvert dans la seconde
      // même de l'inscription, ne doit pas être pris pour plus ancien que le compte.
      if (payload.iat < Math.floor(new Date(owner.user.createdAt).getTime() / 1000)) {
        throw redirect('INVALID_TOKEN')
      }

      // Le compteur ne laisse passer qu'une ouverture (insertion atomique, rate-limit.ts). Sa clé
      // vient de la partie signée du jeton, la même pour toutes ses écritures (B1).
      const firstUse = await rateLimiter.hit(
        `email-change-token:${digest(signedPart(token))}`,
        SINGLE_USE_RULE,
      )
      if (!firstUse.allowed) throw redirect('LINK_USED')

      if (await ctx.context.internalAdapter.findUserByEmail(payload.updateTo)) {
        if (step === 'change-email-verification') throw redirect('INVALID_TOKEN')
        // Le premier lien d'une adresse prise compte comme un second lien envoyé : sinon le
        // plafond (3 par heure) dirait, par sa différence, quelles adresses ont un compte.
        await rateLimiter.hit(memberCounterKeys(owner.user.id).emailChangeLink, NEW_EMAIL_LINK_RULE)
        throw redirect()
      }
      return proceed
    },

    /**
     * Hook `after` de GET /api/auth/verify-email : le second lien ne connecte personne (S3). Better
     * Auth crée une session quand l'appareil qui l'ouvre n'en a pas ; avec une faute de frappe dans
     * la nouvelle adresse, c'est un inconnu qui serait connecté au compte. On l'efface aussitôt.
     * - `newSession` est posé par toute écriture du cookie de session, y compris quand une session
     *   déjà ouverte est rafraîchie : on n'efface que celle dont le jeton diffère de celui que
     *   l'appareil a présenté.
     * - Les cookies posés par un hook s'ajoutent aux autres : on retire d'abord tous ceux de la
     *   réponse, puis on expire celui de la session, puis on efface la session en base.
     * Une vérification d'inscription n'est pas concernée : elle connecte toujours.
     */
    afterLink: async (ctx: AuthContext) => {
      // beforeLink a déjà remplacé le jeton chiffré par le JWT ; on déchiffre quand même, au cas
      // où une version de Better Auth ne transmettrait plus ce remplacement aux hooks `after`.
      const raw: unknown = ctx.query?.token
      const token = typeof raw === 'string' ? await jwtOf(raw) : null
      if (token === null || stepOf(token) !== 'change-email-verification') return
      const created = ctx.context.newSession
      if (!created) return
      const presented = await ctx.getSignedCookie(
        ctx.context.authCookies.sessionToken.name,
        ctx.context.secret,
      )
      if (presented === created.session.token) return
      // Les en-têtes déjà prêts pour la réponse vivent dans `ctx.context.responseHeaders`, que le
      // type de Better Auth ne déclare pas : on le lit sans supposer sa forme.
      const outgoing: unknown = Reflect.get(ctx.context, 'responseHeaders')
      if (outgoing instanceof Headers) outgoing.delete('set-cookie')
      expireCookie(ctx, ctx.context.authCookies.sessionToken)
      try {
        await ctx.context.internalAdapter.deleteSession(created.session.token)
      } catch (error) {
        // Le jeton de cette session n'a jamais quitté le serveur : personne ne peut s'en servir.
        console.error(
          'Session not deleted after address change',
          describeError(error, { method: 'GET', path: '/api/auth/verify-email' }),
        )
      }
    },
  }
}
