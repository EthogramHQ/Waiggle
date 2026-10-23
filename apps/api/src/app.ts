// L'application API : la liste des routes et ce qui se passe autour de chaque requête.
// On la fabrique avec une fonction (createApp) plutôt qu'au chargement du fichier :
// les tests peuvent ainsi créer leur propre instance, sans démarrer de vrai serveur.

import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { appName } from '@ruche/brand'
import { type ErrorCode, HealthResponse } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { parseAcceptLanguage, resolveLanguage } from '@ruche/i18n'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import type { Auth } from './auth/auth'
import { sessionMiddleware } from './auth/session'
import { errorBody, languageOf } from './errors'
import { describeError } from './log'
import type { FileStorage } from './media/storage'
import { createRateLimiter } from './rate-limit'
import { commentRoutes } from './routes/comments'
import { emailRoutes, UNSUBSCRIBE_PATH } from './routes/email'
import { feedRoutes } from './routes/feed'
import { followRoutes } from './routes/follows'
import { meRoutes } from './routes/me'
import { mediaRoutes } from './routes/media'
import { memberRoutes } from './routes/members'
import { moderationRoutes } from './routes/moderation'
import { noteRoutes } from './routes/notes'
import { notificationRoutes } from './routes/notifications'
import { projectRoutes } from './routes/projects'
import { reactionRoutes } from './routes/reactions'
import { reportRoutes } from './routes/reports'
import { tagRoutes } from './routes/tags'
import { visualRoutes } from './routes/visuals'
import { sameOriginWrites } from './security/same-origin'
import type { AppEnv } from './types'

export type AppOptions = {
  version: string
  auth: Auth
  db: Database
  /** Où sont rangés les fichiers envoyés par les membres (avatars…). */
  storage: FileStorage
  /** Adresse de l'appli web, seule autorisée à appeler l'API depuis un navigateur. */
  appUrl: string
  /** Adresse publique de l'API, pour fabriquer les liens des images. */
  publicApiUrl: string
  /**
   * La clé secrète de l'API (BETTER_AUTH_SECRET) : la clé des liens de désinscription des e-mails
   * en est dérivée (tranche 6c, email/unsubscribe-token.ts).
   */
  secret: string
}

// Déclaration de la route GET /health. createRoute décrit la route ET sa réponse attendue :
// c'est ce qui permet de générer automatiquement la documentation OpenAPI.
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Check that the API is running',
  responses: {
    200: {
      description: 'The API is up.',
      content: { 'application/json': { schema: HealthResponse } },
    },
  },
})

// Code HTTP d'un refus → code d'erreur de notre API. Partial<Record<…>> : un dictionnaire où
// certains codes HTTP seulement ont une entrée ; les autres refus sont des données invalides.
const codeByStatus: Partial<Record<number, ErrorCode>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
}
const codeForStatus = (status: number): ErrorCode => codeByStatus[status] ?? 'validation'

export const createApp = ({
  version,
  auth,
  db,
  storage,
  appUrl,
  publicApiUrl,
  secret,
}: AppOptions) => {
  const app = new OpenAPIHono<AppEnv>()

  // Un « middleware » est une fonction exécutée pour chaque requête, avant (et après) la route.
  // secureHeaders ajoute des en-têtes de sécurité standards : interdiction d'afficher le site
  // dans une iframe étrangère, obligation du HTTPS, etc. « same-site » laisse l'appli web
  // (waiggle.io) lire les réponses de l'API (api.waiggle.io), qui est sur le même site.
  //
  // La CSP (Content-Security-Policy) dit au navigateur ce qu'une page a le droit de charger et
  // d'exécuter. L'API ne sert presque que du JSON, mais son domaine porte le cookie de session et
  // Better Auth y affiche une page HTML (/api/auth/error) : si une faille y glissait du code, cette
  // politique l'empêcherait de tourner. Elle n'autorise rien (default-src 'none') sauf les styles
  // écrits dans la page (ceux de la page d'erreur), interdit de l'afficher dans un cadre
  // (frame-ancestors 'none'), et isole la page comme dans un bac à sable (sandbox : ni script, ni
  // formulaire, ni accès aux cookies du domaine). Elle ne gêne pas l'appli : une CSP ne s'applique
  // qu'aux pages ouvertes par le navigateur, pas aux réponses lues par fetch.
  const apiHeaders = secureHeaders({
    crossOriginResourcePolicy: 'same-site',
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      styleSrc: ["'unsafe-inline'"],
      sandbox: [],
    },
  })
  // Les images de /media ont leur propre CSP, encore plus stricte (voir routes/media.ts) :
  // secureHeaders écrit ses en-têtes après la route et effacerait la sienne, d'où ce second
  // réglage, sans CSP.
  const mediaHeaders = secureHeaders({ crossOriginResourcePolicy: 'same-site' })
  app.use((c, next) =>
    c.req.path.startsWith('/media/') ? mediaHeaders(c, next) : apiHeaders(c, next),
  )

  // Middleware maison : détermine la langue de la requête et l'annonce dans la réponse.
  app.use(async (c, next) => {
    const language = resolveLanguage(parseAcceptLanguage(c.req.header('accept-language')))
    c.set('language', language)
    await next() // on laisse la route s'exécuter…
    c.header('Content-Language', language) // …puis on complète la réponse
  })

  // CORS : par défaut, un navigateur interdit à une page d'appeler une API d'un autre domaine.
  // On autorise explicitement l'appli web, et elle seule, avec ses cookies (credentials).
  app.use(
    cors({
      origin: (origin) => (origin === appUrl ? origin : null),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization'],
      // PUT : réagir à un projet et masquer un commentaire (tranche 5), deux gestes qu'on peut
      // répéter sans effet de plus.
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      // En-têtes de réponse que l'appli web a le droit de lire (Retry-After : dans combien de
      // secondes réessayer après un refus pour trop de demandes).
      exposeHeaders: ['Content-Disposition', 'Content-Language', 'Retry-After'],
    }),
  )

  // Taille maximale du corps des requêtes, vérifiée avant tout le reste, y compris la session :
  // personne, même anonyme, ne peut faire lire au serveur une requête géante.
  // - 16 Ko pour les requêtes ordinaires (du JSON de quelques lignes) ;
  // - 256 Ko pour les projets (description de 10 000 caractères et 5 prompts de 4 000, jusqu'à
  //   4 octets par caractère) ;
  // - l'envoi d'avatar et celui d'un visuel ont leur propre limite, plus grande, vérifiée juste
  //   après la session (voir routes/me.ts et routes/visuals.ts).
  const limitBody = (maxSize: number) =>
    bodyLimit({
      maxSize,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    })
  const small = limitBody(16 * 1024)
  const projects = limitBody(256 * 1024)
  app.use('/api/auth/*', small)
  app.use('/v1/*', (c, next) => {
    if (c.req.path === '/v1/me/avatar') return next()
    if (/^\/v1\/projects\/[^/]+\/visuals$/.test(c.req.path)) return next()
    // Une note ou un commentaire pèse au plus 1 000 caractères, une réaction n'a pas de corps :
    // la petite limite suffit largement.
    if (/^\/v1\/projects\/[^/]+\/(notes|comments|reactions)(\/|$)/.test(c.req.path)) {
      return small(c, next)
    }
    if (c.req.path === '/v1/projects' || c.req.path.startsWith('/v1/projects/')) {
      return projects(c, next)
    }
    return small(c, next)
  })

  // Toutes les routes de Better Auth (inscription, connexion, vérification…) sous /api/auth/.
  // c.req.raw est la requête HTTP standard, que Better Auth sait traiter seul.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  // Sur nos propres routes /v1/… : d'abord refuser les modifications venues d'un autre site
  // (voir security/same-origin.ts ; Better Auth fait la même vérification sur /api/auth/…),
  // puis retrouver le membre connecté.
  // Une exception : la désinscription depuis un e-mail (tranche 6c). Elle n'utilise jamais la
  // session (seul le jeton signé du lien compte, et il ne fait que couper des e-mails), et la
  // messagerie qui envoie le POST « Se désabonner » vient d'un autre site (le webmail) ou d'aucun :
  // ni le contrôle d'origine, ni la recherche de la session ne s'y appliquent.
  const outsideSession =
    (middleware: MiddlewareHandler<AppEnv>): MiddlewareHandler<AppEnv> =>
    (c, next) =>
      c.req.path === UNSUBSCRIBE_PATH ? next() : middleware(c, next)
  app.use('/v1/*', outsideSession(sameOriginWrites([appUrl, publicApiUrl])))
  app.use('/v1/*', outsideSession(sessionMiddleware(auth)))
  // Les images aussi demandent de savoir qui regarde : elles sont réservées aux membres.
  app.use('/media/*', sessionMiddleware(auth))
  // Les réponses de /v1/… sont personnelles (profil, export…) : aucun cache intermédiaire
  // (navigateur, proxy d'entreprise) ne doit les garder.
  app.use('/v1/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  // La route de santé : `as const` garantit que status vaut exactement 'ok', comme l'exige le schéma.
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const, version }, 200))

  // Les routes du membre connecté et le service des images, rangés dans leurs propres fichiers.
  const limiter = createRateLimiter(db)
  app.route('/', meRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', projectRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', visualRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', memberRoutes({ db, limiter, publicApiUrl }))
  app.route('/', tagRoutes({ db, publicApiUrl }))
  app.route('/', followRoutes({ db, limiter }))
  app.route('/', noteRoutes({ db, limiter }))
  app.route('/', reactionRoutes({ db, limiter }))
  app.route('/', commentRoutes({ db, limiter, publicApiUrl }))
  app.route('/', feedRoutes({ db, publicApiUrl }))
  app.route('/', notificationRoutes({ db, limiter, publicApiUrl }))
  app.route('/', emailRoutes({ db, limiter, secret, appUrl }))
  // Signaler (tout membre) et modérer (administrateurs seulement, tranche 7a).
  app.route('/', reportRoutes({ db, limiter }))
  app.route('/', moderationRoutes({ db }))
  app.route('/', mediaRoutes({ db, storage }))

  // La documentation de l'API, générée à partir des routes déclarées, servie en JSON.
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: `${appName} API`, version },
  })

  // Toute adresse inconnue : réponse 404 avec un message traduit.
  app.notFound((c) => {
    const language = languageOf(c)
    c.header('Content-Language', language)
    return c.json(errorBody(language, 'not_found'), 404)
  })

  // Les erreurs. Deux familles :
  // - les refus prévus, levés par Hono lui-même (HTTPException), par exemple une requête dont le
  //   corps n'est pas du JSON : on garde leur code (400…) avec notre message traduit ;
  // - les erreurs imprévues : notées dans les logs du serveur, mais le client ne reçoit qu'un message
  //   générique. Les détails techniques pourraient aider un attaquant.
  app.onError((err, c) => {
    const language = languageOf(c)
    c.header('Content-Language', language)
    if (err instanceof HTTPException && err.status < 500) {
      return c.json(errorBody(language, codeForStatus(err.status)), err.status)
    }
    // Un résumé sans données personnelles (voir log.ts), jamais l'erreur brute.
    console.error('Unhandled error', describeError(err, { method: c.req.method, path: c.req.path }))
    return c.json(errorBody(language, 'internal'), 500)
  })

  return app
}
