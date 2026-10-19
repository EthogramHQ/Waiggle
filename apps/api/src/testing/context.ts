// Outils partagés par les tests de l'API : une API complète, branchée sur une base PGlite neuve
// (copiée d'un modèle déjà migré, voir createTestPgliteDb),
// une fausse boîte d'envoi d'e-mails et un stockage de fichiers en mémoire.
// Rien ici n'est utilisé en production.
import { createTestPgliteDb } from '@ruche/db/pglite'
import { createApp } from '../app'
import { createAuth } from '../auth/auth'
import { createMemoryMailer } from '../email/mailer'
import { createMemoryStorage } from '../media/storage'

export const TEST_APP_URL = 'http://localhost:8081'
export const TEST_API_URL = 'http://localhost:3000'

type Credentials = { email: string; password: string }
type SignUpBody = Credentials & { name: string; language?: string; inviteCode?: string }

/**
 * Une API complète pour un test. `inviteCode` : le code d'invitation exigé à l'inscription, comme
 * en production ; sans lui, l'inscription est libre (comme en développement).
 */
export const createTestContext = async ({
  version = 'test',
  inviteCode = null,
}: {
  version?: string
  inviteCode?: string | null
} = {}) => {
  const { db, close } = await createTestPgliteDb()
  const mailer = createMemoryMailer()
  const storage = createMemoryStorage()
  const auth = createAuth({
    db,
    mailer,
    storage,
    secret: 'test-secret-that-is-long-enough-for-tests',
    publicApiUrl: TEST_API_URL,
    appUrl: TEST_APP_URL,
    rateLimit: true,
    inviteCode,
  })
  const app = createApp({
    version,
    auth,
    db,
    storage,
    appUrl: TEST_APP_URL,
    publicApiUrl: TEST_API_URL,
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
