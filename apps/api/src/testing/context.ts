// Outils partagés par les tests de l'API : une API complète, branchée sur une base PGlite neuve
// (copiée d'un modèle déjà migré, voir createTestPgliteDb),
// une fausse boîte d'envoi d'e-mails et un stockage de fichiers en mémoire.
// Rien ici n'est utilisé en production.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createTestPgliteDb } from '@ruche/db/pglite'
import { createApp } from '../app'
import { createAuth, type PasswordHashing } from '../auth/auth'
import { createMemoryMailer } from '../email/mailer'
import { createMemoryStorage } from '../media/storage'

export const TEST_APP_URL = 'http://localhost:8081'
export const TEST_API_URL = 'http://localhost:3000'
/**
 * La clé secrète de l'API des tests (BETTER_AUTH_SECRET en production). Les liens de
 * désinscription des e-mails sont signés avec une clé qui en est dérivée (tranche 6c) : les tests
 * s'en servent pour fabriquer un lien valide, comme le ferait un e-mail.
 */
export const TEST_AUTH_SECRET = 'test-secret-that-is-long-enough-for-tests'

/**
 * R12 : l'adresse IP du visiteur sans compte des tests (`ctx.visitor`), prise dans un bloc réservé
 * à la documentation (198.51.100.0/24), comme celle des membres (203.0.113.7) : elle ne désigne
 * personne.
 */
export const TEST_VISITOR_IP = '198.51.100.23'

/**
 * Un hachage de mot de passe rapide, pour les tests seulement. scrypt, celui de la production,
 * prend ~120 ms par inscription ou connexion, exprès (voir auth.ts) : multiplié par des centaines
 * de tests, cela coûtait des dizaines de secondes. Ici, le même scrypt, mais avec un coût
 * minuscule (N = 16 au lieu de 16 384) : une fraction de milliseconde. Un « sel » (valeur
 * aléatoire mêlée au mot de passe) fait que deux comptes au même mot de passe n'ont pas la même
 * empreinte. Cela suffit aux tests (mauvais mot de passe refusé, changement de mot de passe),
 * mais se calcule trop vite pour protéger une vraie base. (Un SHA-256 marchait aussi, mais
 * l'analyse de sécurité du dépôt, CodeQL, refuse à juste titre un hachage rapide généraliste
 * pour un mot de passe, même dans les tests.)
 */
const scryptCheap = (salt: string, password: string) =>
  scryptSync(password, salt, 32, { N: 16, r: 1, p: 1 }).toString('hex')

export const fastPasswordHashing: PasswordHashing = {
  // L'empreinte garde son sel, et une étiquette qui dit d'où elle vient : « test-scrypt:sel:empreinte ».
  hash: async (password) => {
    const salt = randomBytes(16).toString('hex')
    return `test-scrypt:${salt}:${scryptCheap(salt, password)}`
  },
  verify: async ({ hash, password }) => {
    const [kind, salt, digest] = hash.split(':')
    if (kind !== 'test-scrypt' || !salt || !digest) return false
    return timingSafeEqual(Buffer.from(scryptCheap(salt, password)), Buffer.from(digest))
  },
}

type Credentials = { email: string; password: string }
/**
 * R11 : `acceptRules` et `ageDeclared`, les deux cases de l'inscription, valent `true` si le test
 * ne les donne pas (`signUp` plus bas). `unknown` : un test de refus peut envoyer `false`, un texte,
 * ou `undefined`, que JSON.stringify retire du corps (la case absente).
 */
type SignUpBody = Credentials & {
  name: string
  language?: string
  inviteCode?: string
  acceptRules?: unknown
  ageDeclared?: unknown
}

/**
 * Une API complète pour un test. `inviteCode` : le code d'invitation exigé à l'inscription, comme
 * en production ; sans lui, l'inscription est libre (comme en développement). `publicApiUrl` :
 * l'adresse publique de l'API ; une adresse en https fait poser à Better Auth des cookies
 * « Secure », comme en production (les autres tests restent en http, comme en développement).
 */
export const createTestContext = async ({
  version = 'test',
  inviteCode = null,
  publicApiUrl = TEST_API_URL,
}: {
  version?: string
  inviteCode?: string | null
  publicApiUrl?: string
} = {}) => {
  const { db, close } = await createTestPgliteDb()
  const mailer = createMemoryMailer()
  const storage = createMemoryStorage()
  const auth = createAuth({
    db,
    mailer,
    storage,
    secret: TEST_AUTH_SECRET,
    publicApiUrl,
    appUrl: TEST_APP_URL,
    rateLimit: true,
    inviteCode,
    password: fastPasswordHashing,
  })
  const app = createApp({
    version,
    auth,
    db,
    storage,
    appUrl: TEST_APP_URL,
    publicApiUrl,
    secret: TEST_AUTH_SECRET,
    mailer,
  })

  /**
   * Envoie une requête à l'API, comme si elle venait de l'appli web (en-tête Origin)
   * et d'un visiteur précis (adresse IP fixe, transmise par Caddy en production).
   */
  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has('origin')) headers.set('origin', TEST_APP_URL)
    if (!headers.has('x-real-ip')) headers.set('x-real-ip', '203.0.113.7')
    return app.request(path, { ...init, headers })
  }

  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

  /**
   * Inscription par e-mail ; le lien de vérification ramènera vers la page /verified de l'appli.
   * R11 : les deux accords (les règles, « 15 ans ou plus ») sont cochés par défaut, comme le fait
   * tout membre qui s'inscrit ; un test qui les donne lui-même l'emporte.
   */
  const signUp = (body: SignUpBody, headers?: Record<string, string>) =>
    postJson(
      '/api/auth/sign-up/email',
      { acceptRules: true, ageDeclared: true, ...body, callbackURL: `${TEST_APP_URL}/verified` },
      headers,
    )

  /** Transforme les cookies posés par une réponse en en-tête `cookie` pour les requêtes suivantes. */
  const cookiesFrom = (res: Response) =>
    res.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ')

  /**
   * Inscrit un membre, ouvre le lien de vérification reçu par e-mail, et renvoie son cookie
   * de session : le point de départ de la plupart des tests.
   */
  const verifiedMember = async (member: SignUpBody) => {
    await signUp(member)
    const email = mailer.sent.findLast((sent) => sent.to === member.email)
    const link = email?.text.match(/https?:\/\/\S+/)?.[0]
    if (!link) throw new Error(`no verification link for ${member.email}`)
    const url = new URL(link)
    return cookiesFrom(await request(url.pathname + url.search))
  }

  /**
   * R12 : une demande d'un visiteur sans compte : jamais de cookie (un test qui en passe un dans
   * `init` le voit retiré), et sa propre adresse IP (`x-real-ip`, posée par Caddy en production),
   * distincte de celle des membres : ses quotas par IP (5 signalements par jour, limite de lecture)
   * ne se mêlent pas aux leurs. Un autre `ip` simule un autre visiteur, ou un autre réseau.
   */
  const visitor = (path: string, init: RequestInit = {}, ip: string = TEST_VISITOR_IP) => {
    const headers = new Headers(init.headers)
    headers.delete('cookie')
    headers.set('x-real-ip', ip)
    return request(path, { ...init, headers })
  }

  /** R12 : un envoi JSON d'un visiteur sans compte (le signalement), depuis l'appli web (Origin). */
  const visitorPostJson = (path: string, body: unknown, ip: string = TEST_VISITOR_IP) =>
    visitor(
      path,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      ip,
    )

  /**
   * R12 : publie, par l'API comme dans l'appli, un projet « Public » (`visibility: 'web'`, lisible
   * sans compte) du membre au `cookie`, et rend son identifiant. `fields` complète ou remplace le
   * titre, le pitch et la catégorie par défaut. Un refus dit son statut, au lieu de laisser le test
   * échouer plus loin sans qu'on sache pourquoi.
   */
  const webProject = async (cookie: string, fields: Record<string, unknown> = {}) => {
    const body = {
      title: 'Décollage !',
      pitch: 'Un compte à rebours pour la fusée du jardin.',
      primaryCategory: 'home-garden',
      ...fields,
      visibility: 'web',
    }
    const res = await postJson('/v1/projects', body, { cookie })
    if (res.status !== 201) throw new Error(`POST /v1/projects (web) → ${res.status}`)
    const { id } = (await res.json()) as { id: string }
    return id
  }

  /**
   * R12 : ouvre la page publique du membre au `cookie` (PATCH /v1/me/public-page), avec les cases
   * par défaut ou celles de `settings` (`showBio: false`…). Un refus dit son statut.
   */
  const openPublicPage = async (cookie: string, settings: Record<string, boolean> = {}) => {
    const res = await request('/v1/me/public-page', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ ...settings, publicPage: true }),
    })
    if (res.status !== 200) throw new Error(`PATCH /v1/me/public-page → ${res.status}`)
  }

  return {
    app,
    db,
    mailer,
    storage,
    auth,
    request,
    close,
    signUp,
    signIn: ({ email, password }: Credentials) =>
      postJson('/api/auth/sign-in/email', { email, password }),
    cookiesFrom,
    verifiedMember,
    visitor,
    visitorPostJson,
    webProject,
    openPublicPage,
  }
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>
