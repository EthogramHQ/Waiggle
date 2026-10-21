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
type SignUpBody = Credentials & { name: string; language?: string; inviteCode?: string }

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
    secret: 'test-secret-that-is-long-enough-for-tests',
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

  /** Inscription par e-mail ; le lien de vérification ramènera vers la page /verified de l'appli. */
  const signUp = (body: SignUpBody, headers?: Record<string, string>) =>
    postJson(
      '/api/auth/sign-up/email',
      { ...body, callbackURL: `${TEST_APP_URL}/verified` },
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
  }
}

export type TestContext = Awaited<ReturnType<typeof createTestContext>>
