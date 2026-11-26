// L'application API : la liste des routes et ce qui se passe autour de chaque requête.
// On la fabrique avec une fonction (createApp) plutôt qu'au chargement du fichier :
// les tests peuvent ainsi créer leur propre instance, sans démarrer de vrai serveur.

import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { appName } from '@ruche/brand'
import { type ErrorCode, HealthResponse, POLLEN_HEADER } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { parseAcceptLanguage, resolveLanguage } from '@ruche/i18n'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { activityMiddleware } from './account/activity'
import type { Auth } from './auth/auth'
import { sessionMiddleware } from './auth/session'
import type { Mailer } from './email/mailer'
import { errorBody, languageOf } from './errors'
import { describeError } from './log'
import type { FileStorage } from './media/storage'
import { createRateLimiter } from './rate-limit'
import { blockRoutes } from './routes/blocks'
import { commentRoutes } from './routes/comments'
import { emailRoutes, UNSUBSCRIBE_PATH } from './routes/email'
import { feedRoutes } from './routes/feed'
import { followRoutes } from './routes/follows'
import { gameRoutes } from './routes/game'
import { hiveInvitationRoutes } from './routes/hive-invitations'
import { hiveRoutes } from './routes/hives'
import { meRoutes } from './routes/me'
import { meCommentRoutes } from './routes/me-comments'
import { meTesterMessageRoutes } from './routes/me-tester-messages'
import { mediaRoutes } from './routes/media'
import { memberRoutes } from './routes/members'
import { moderationRoutes } from './routes/moderation'
import { moderationCatalogueRoutes } from './routes/moderation-catalogue'
import { notificationRoutes } from './routes/notifications'
import { projectRoutes } from './routes/projects'
import { publicRoutes } from './routes/public'
import { publicHeadRoutes } from './routes/public-head'
import { publicReportRoutes } from './routes/public-reports'
import { publicSitemapRoutes } from './routes/public-sitemap'
import { rankingRoutes } from './routes/rankings'
import { reactionRoutes } from './routes/reactions'
import { reportRoutes } from './routes/reports'
import { rulesRoutes } from './routes/rules'
import { scoutReportRoutes } from './routes/scout-reports'
import { scoutTriageRoutes } from './routes/scout-triage'
import { scoutRoutes } from './routes/scouts'
import { searchRoutes } from './routes/search'
import { showcaseRoutes } from './routes/showcase'
import { suggestionRoutes } from './routes/suggestions'
import { tagRoutes } from './routes/tags'
import { testerCallRoutes } from './routes/tester-calls'
import { testerMediaRoutes } from './routes/tester-media'
import { testerThreadRoutes } from './routes/tester-threads'
import { testerRoutes } from './routes/testers'
import { toolRoutes } from './routes/tools'
import { UNVERIFIED_EMAIL_PATH, unverifiedEmailRoutes } from './routes/unverified-email'
import { updateRoutes } from './routes/updates'
import { visualRoutes } from './routes/visuals'
import { rulesGuard } from './rules/guard'
import { sameOriginWrites } from './security/same-origin'
import { createVisitorLimit, visitorReadLimit } from './security/visitor-limit'
import { suspensionGuard } from './suspension/guard'
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
  /**
   * L'envoi des e-mails : depuis la tranche 7c, la modération prévient un membre suspendu
   * (moderation/suspend.ts). Le même que celui de Better Auth.
   */
  mailer: Mailer
  /**
   * R20 : le code des Éclaireuses (SCOUT_INVITE_CODE), pour « J'ai un code » dans les réglages
   * (POST /v1/me/scout) ; null, ou absent : aucun code ne marche.
   */
  scoutCode?: string | null
}

/**
 * R20 : l'envoi d'un retour d'Éclaireuse (multipart, capture comprise), seule route des Éclaireuses
 * sortie de la limite commune de 16 Ko. Le chemin exact, comparé à l'égalité (relecture de sécurité
 * A3) : sa propre limite (5 Mo et 64 Ko) est posée par la route, après la session et le quota.
 */
const SCOUT_REPORTS_PATH = '/v1/me/scout/reports'

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

/**
 * Les routes lues sans compte (R12) : tout `/v1/public/…`. `startsWith` sur « /v1/public/ », barre
 * comprise : « /v1/publicity » n'en est pas.
 */
const isPublicPath = (path: string) => path.startsWith('/v1/public/')

/** La seule route du mot de passe oublié que l'appli appelle (POST, le jeton dans le corps). */
const RESET_PASSWORD_PATH = '/api/auth/reset-password'

/**
 * Vrai pour toute écriture de /api/auth/reset-password/<quelque chose> (la route GET
 * /reset-password/:token de Better Auth, relecture de sécurité S11) : décodée jusqu'à ce qu'elle
 * ne change plus (« %252F » donne « %2F », puis « / »), « / » répétés réduits à un seul, sans
 * tenir compte des capitales. Seul le chemin exact de la vraie route est faux.
 */
const isResetCallbackPath = (pathname: string) => {
  let path = pathname
  for (let round = 0; round < 3; round++) {
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      // Un « % » qui n'annonce aucun caractère : on garde l'écriture telle quelle.
      break
    }
    if (decoded === path) break
    path = decoded
  }
  const normalized = path.replace(/\/+/g, '/').toLowerCase()
  return normalized.startsWith(RESET_PASSWORD_PATH) && normalized !== RESET_PASSWORD_PATH
}

/**
 * Les routes de Better Auth dont le quota par membre se compte dans un hook, avant la validation
 * du corps, et doit compter aussi les requêtes mal formées (tranche R2, relecture de sécurité
 * S10 : changer son mot de passe, auth/password.ts).
 */
const COUNTED_EVEN_MALFORMED = new Set(['/api/auth/change-password'])

/**
 * Un corps annoncé en JSON qui n'en est pas (« x ») est refusé par le routeur de Better Auth avant
 * tout hook : son quota ne le verrait pas. Pour ces routes, on le remplace par un objet vide :
 * le hook compte la demande, puis Better Auth la refuse quand même (400, champs manquants).
 * `clone()` lit une copie du corps : la requête d'origine reste lisible par Better Auth.
 */
const countableRequest = async (request: Request) => {
  if (request.method !== 'POST' || !COUNTED_EVEN_MALFORMED.has(new URL(request.url).pathname)) {
    return request
  }
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return request
  }
  try {
    JSON.parse(await request.clone().text())
    return request
  } catch {
    return new Request(request, { body: '{}' })
  }
}

export const createApp = ({
  version,
  auth,
  db,
  storage,
  appUrl,
  publicApiUrl,
  secret,
  mailer,
  scoutCode = null,
}: AppOptions) => {
  const app = new OpenAPIHono<AppEnv>()

  // Un « middleware » est une fonction exécutée pour chaque requête, avant (et après) la route.
  // secureHeaders ajoute des en-têtes de sécurité standards : interdiction d'afficher le site
  // dans une iframe étrangère, obligation du HTTPS, etc. « same-site » laisse l'appli web
  // (waiggle.com) lire les réponses de l'API (api.waiggle.com), qui est sur le même site.
  //
  // La CSP (Content-Security-Policy) dit au navigateur ce qu'une page a le droit de charger et
  // d'exécuter. L'API ne sert presque que du JSON, mais son domaine porte le cookie de session et
  // Better Auth y affiche une page HTML (/api/auth/error) : si une faille y glissait du code, cette
  // politique l'empêcherait de tourner. Elle n'autorise rien (default-src 'none') sauf les styles
  // écrits dans la page (ceux de la page d'erreur), interdit de l'afficher dans un cadre
  // (frame-ancestors 'none'), et isole la page comme dans un bac à sable (sandbox : ni script, ni
  // formulaire, ni accès aux cookies du domaine). Elle ne gêne pas l'appli : une CSP ne s'applique
  // qu'aux pages ouvertes par le navigateur, pas aux réponses lues par fetch.
  //
  // HSTS (Strict-Transport-Security) : le navigateur retient de n'appeler l'API qu'en HTTPS. Un an,
  // comme le site de l'appli (infra/Caddyfile), au lieu des 180 jours par défaut de Hono (audit de
  // sécurité du 7/11/2026).
  const hsts = 'max-age=31536000; includeSubDomains'
  const apiHeaders = secureHeaders({
    strictTransportSecurity: hsts,
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
  const mediaHeaders = secureHeaders({
    strictTransportSecurity: hsts,
    crossOriginResourcePolicy: 'same-site',
  })
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
      // secondes réessayer après un refus pour trop de demandes). R19 : Waiggle-Pollen, le pollen
      // qu'un geste vient de rapporter (POLLEN_HEADER du contrat), que l'appli montre en « +2 ».
      exposeHeaders: ['Content-Disposition', 'Content-Language', 'Retry-After', POLLEN_HEADER],
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
    // L'envoi d'une image du coin des testeurs (R7b) a sa propre limite, comme les visuels : la
    // route la pose juste après avoir vérifié les droits (routes/tester-media.ts).
    if (/^\/v1\/projects\/[^/]+\/testers\/media$/.test(c.req.path)) return next()
    // R20 : l'envoi d'un retour d'Éclaireuse, seulement en POST (« Mes retours », en GET, n'a pas
    // de corps et garde la petite limite) ; sa route pose sa limite (routes/scout-reports.ts).
    if (c.req.method === 'POST' && c.req.path === SCOUT_REPORTS_PATH) return next()
    // Une mise à jour (16 Ko : cinq lignes, un titre, quatre photos citées) ou un commentaire pèse
    // peu, une réaction ou une inscription de testeur n'a pas de corps : la petite limite suffit.
    // R7b : les appels (500 caractères), les fils, les messages (1 000 caractères), les retours
    // réglés, la lecture d'un fil et la liste des retours ouverts n'ont pas plus de corps. R19 :
    // l'offre de miel n'a pas de corps du tout.
    if (
      /^\/v1\/projects\/[^/]+\/(updates|testers|comments|reactions|calls|threads|messages|feedback|honey)(\/|$)/.test(
        c.req.path,
      )
    ) {
      return small(c, next)
    }
    // La description d'une photo (R6a, sec-A3) : 250 caractères, la petite limite suffit.
    if (/^\/v1\/projects\/[^/]+\/visuals\/[^/]+$/.test(c.req.path)) return small(c, next)
    if (c.req.path === '/v1/projects' || c.req.path.startsWith('/v1/projects/')) {
      return projects(c, next)
    }
    return small(c, next)
  })

  // La garde de GET /api/auth/reset-password/:token (tranche R2, relecture de sécurité S11). Cette
  // route de Better Auth redirige vers la page de retour choisie par le visiteur, le jeton dans
  // l'adresse ; nos liens n'en ont pas besoin (ils mènent à la page de l'appli, auth/password.ts).
  // Un chemin variable ne se ferme pas par `disabledPaths` (auth.ts) : on la ferme ici, avant
  // Better Auth, comme une adresse inconnue (404). Le chemin est d'abord décodé (« %2F » devient
  // « / ») et ses « / » répétés réduits à un seul, pour qu'aucune écriture ne passe à côté ; seul
  // POST /api/auth/reset-password, la vraie route, reste ouvert.
  app.use('/api/auth/*', async (c, next) => {
    if (isResetCallbackPath(new URL(c.req.url).pathname)) return c.notFound()
    await next()
  })

  // Toutes les routes de Better Auth (inscription, connexion, vérification…) sous /api/auth/.
  // c.req.raw est la requête HTTP standard, que Better Auth sait traiter seul.
  // Better Auth dit dans combien de secondes réessayer après son propre refus (429) dans l'en-tête
  // X-Retry-After, que l'appli web n'a pas le droit de lire (CORS n'expose que Retry-After, plus
  // haut). On le recopie dans Retry-After, comme nos propres routes (tranche R2, A5) : l'écran peut
  // dire « Nouvel essai possible à 21 h 47 ».
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const res = await auth.handler(await countableRequest(c.req.raw))
    // Une erreur du serveur que Better Auth rend lui-même (une APIError 500, prévue par son code) :
    // depuis `onAPIError.throw` (auth/auth.ts), il ne l'écrit plus. On note la route et le code,
    // jamais l'adresse complète, dont la requête peut porter un jeton (relecture de la PR #86, A4).
    if (res.status >= 500) {
      console.error('Better Auth server error', {
        method: c.req.method,
        path: c.req.path,
        status: res.status,
      })
    }
    const retryAfter = res.headers.get('x-retry-after')
    if (res.status !== 429 || retryAfter === null || res.headers.has('retry-after')) return res
    // Une copie de la réponse : les en-têtes d'une réponse reçue peuvent être en lecture seule.
    const copy = new Response(res.body, res)
    copy.headers.set('Retry-After', retryAfter)
    return copy
  })

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
  // Tranche R2 : corriger son adresse avant de l'avoir vérifiée (routes/unverified-email.ts) se fait
  // sans session (S9) : la session n'y est jamais lue, mais le contrôle d'origine s'applique.
  const readSession = sessionMiddleware(auth)
  app.use(
    '/v1/*',
    outsideSession((c, next) => {
      if (c.req.path === UNVERIFIED_EMAIL_PATH) return next()
      // R12 (relecture de sécurité du plan, I3) : les lectures sans compte, `/v1/public/*`, ne
      // sautent QUE la lecture de la session ; le contrôle d'origine, juste au-dessus, reste. Un
      // membre connecté y reçoit donc exactement ce que reçoit un visiteur : personne n'est connu.
      if (isPublicPath(c.req.path)) {
        c.set('user', null)
        c.set('session', null)
        return next()
      }
      return readSession(c, next)
    }),
  )
  // R12 (décision 6) : la limite de lecture d'un réseau sur `/v1/public/*`, en mémoire. Créée ici,
  // avec l'API : chaque instance (chaque test) a son propre compteur.
  app.use('/v1/public/*', visitorReadLimit(createVisitorLimit()))
  // R11 : la visite d'un membre connecté est notée (au plus une fois par jour), et un avertissement
  // d'inactivité déjà parti est effacé (account/activity.ts). Juste après la session, avant les
  // gardes de la suspension et de l'accord : une requête qu'elles refusent compte quand même.
  app.use('/v1/*', activityMiddleware(db))
  // Les images aussi demandent de savoir qui regarde : elles sont réservées aux membres.
  app.use('/media/*', sessionMiddleware(auth))
  // Les réponses de /v1/… sont personnelles (profil, export…) : aucun cache intermédiaire
  // (navigateur, proxy d'entreprise) ne doit les garder.
  // R12 : une lecture sans compte réussie garde l'en-tête que sa route a posé (routes/public.ts :
  // `private, max-age=60`, jamais `public`, décision 3 de la relecture du plan) ; ses refus, comme
  // toute autre réponse, reçoivent `no-store`.
  app.use('/v1/*', async (c, next) => {
    await next()
    if (isPublicPath(c.req.path) && c.res.status === 200 && c.res.headers.has('Cache-Control')) {
      return
    }
    c.header('Cache-Control', 'no-store')
  })
  // Un compte suspendu (tranche 7c) passe en lecture seule : la garde refuse ses écritures avant
  // toutes les routes, donc avant leur validateur et leur quota (suspension/guard.ts). Après
  // « no-store » (S14) : son refus n'est gardé par aucun cache non plus.
  app.use('/v1/*', suspensionGuard(db))
  // R11 : un membre qui n'a pas accepté les règles en vigueur lit tout, mais n'écrit que ce que la
  // garde de l'accord permet (rules/guard.ts). Après celle de la suspension : un compte suspendu
  // reçoit d'abord `suspended`, le refus qui dit ce qui l'attend vraiment (accepter ne lui rendrait
  // pas l'écriture).
  app.use('/v1/*', rulesGuard(db))

  // La route de santé : `as const` garantit que status vaut exactement 'ok', comme l'exige le schéma.
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const, version }, 200))

  // Les routes du membre connecté et le service des images, rangés dans leurs propres fichiers.
  const limiter = createRateLimiter(db)
  app.route('/', meRoutes({ db, storage, limiter, publicApiUrl }))
  // L'écran « Accepter » des règles (R11).
  app.route('/', rulesRoutes({ db, limiter, publicApiUrl }))
  app.route('/', projectRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', visualRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', memberRoutes({ db, limiter, publicApiUrl }))
  app.route('/', tagRoutes({ db, limiter, publicApiUrl }))
  // La recherche par mots et la liste des outils (tranche R3).
  app.route('/', searchRoutes({ db, limiter, publicApiUrl }))
  app.route('/', toolRoutes({ db, limiter }))
  app.route('/', followRoutes({ db, limiter }))
  // Bloquer, débloquer, la liste « Membres bloqués » (tranche 7b).
  app.route('/', blockRoutes({ db, limiter, publicApiUrl }))
  app.route('/', updateRoutes({ db, storage, limiter, publicApiUrl }))
  // Rejoindre et quitter les testeurs d'un projet (tranche R7a).
  app.route('/', testerRoutes({ db, limiter, publicApiUrl }))
  // Le coin des testeurs (tranche R7b) : les appels à tester et l'envoi de leurs images.
  app.route('/', testerCallRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', testerMediaRoutes({ db, storage, limiter, publicApiUrl }))
  // Les fils de retours entre l'auteur et chaque testeur, « réglé » et les retours à traiter.
  app.route('/', testerThreadRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', reactionRoutes({ db, limiter }))
  app.route('/', commentRoutes({ db, limiter, publicApiUrl }))
  // « Mes commentaires » (R11) : la liste, et la suppression depuis les réglages.
  app.route('/', meCommentRoutes({ db, limiter, publicApiUrl }))
  // « Mes retours envoyés » (R11) : ses messages de testeur, coins fermés compris.
  app.route('/', meTesterMessageRoutes({ db, publicApiUrl }))
  app.route('/', feedRoutes({ db, limiter, publicApiUrl }))
  // « Proches à suivre » : la liste et « × » (tranche R4).
  app.route('/', suggestionRoutes({ db, limiter, publicApiUrl }))
  // Les ruches (R10) : mes ruches, créer, la page, l'actualité, les membres, l'animateur, quitter.
  app.route('/', hiveRoutes({ db, limiter, publicApiUrl }))
  // Les invitations : la recherche « Inviter », inviter, rejoindre, refuser (R10).
  app.route('/', hiveInvitationRoutes({ db, limiter, publicApiUrl }))
  // Les classements de la semaine : les proches, ou une ruche (R19).
  app.route('/', rankingRoutes({ db, limiter, publicApiUrl }))
  app.route('/', notificationRoutes({ db, limiter, publicApiUrl }))
  // Le jeu (R19) : « Ma récolte », les réglages du jeu, la décoration du rayon, l'offre de miel.
  app.route('/', gameRoutes({ db, limiter }))
  // Les Éclaireuses (R20) : l'entrée, « Afficher la Goutte » et les missions ; les retours ; la
  // page de tri de l'administrateur.
  app.route('/', scoutRoutes({ db, limiter, publicApiUrl, scoutCode }))
  app.route('/', scoutReportRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', scoutTriageRoutes({ db, storage, limiter, publicApiUrl }))
  app.route('/', emailRoutes({ db, limiter, secret, appUrl }))
  // Corriger son adresse avant de l'avoir vérifiée (tranche R2, A4).
  app.route('/', unverifiedEmailRoutes({ db, limiter, auth, mailer, appUrl, secret }))
  // Signaler (tout membre) et modérer (administrateurs seulement, tranche 7a).
  app.route('/', reportRoutes({ db, limiter, publicApiUrl }))
  app.route('/', moderationRoutes({ db, limiter, auth, mailer, publicApiUrl, appUrl }))
  // L'administration du catalogue des outils et des catégories (tranche R6b).
  app.route('/', moderationCatalogueRoutes({ db, limiter }))
  // La vitrine de l'accueil (R12) : « À la une », l'onglet de la modération, « Retirer de l'accueil ».
  app.route('/', showcaseRoutes({ db, limiter, publicApiUrl }))
  app.route('/', mediaRoutes({ db, storage }))
  // Les lectures sans compte (R12) : un projet public, ses mises à jour, une page publique, la
  // vitrine de l'accueil.
  app.route('/', publicRoutes({ db, publicApiUrl }))
  // Le signalement d'un visiteur (R12) et la cible que sa feuille lit.
  app.route('/', publicReportRoutes({ db, limiter, mailer, publicApiUrl, appUrl, secret }))
  // La tête HTML des pages publiques et le plan du site (R12, plan, choix 5 et 6), que Caddy
  // demande pour les moteurs de recherche et les aperçus de liens.
  app.route('/', publicHeadRoutes({ db, appUrl, publicApiUrl }))
  app.route('/', publicSitemapRoutes({ db, appUrl }))

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
