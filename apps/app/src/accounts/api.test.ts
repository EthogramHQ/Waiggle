// Tests de l'export des données du membre (accounts/api.ts) : le fichier porte le nom de l'appli,
// jamais le nom de code du dépôt. Puis (tranche « adresse ») la demande de changement d'adresse.
// Puis (tranche R2) les cinq actions du compte qui lisent l'en-tête Retry-After d'un refus 429 :
// mot de passe oublié, nouveau mot de passe, changement du mot de passe, renvoi du lien de
// vérification, correction de l'adresse avant vérification.
import { appName } from '@ruche/brand'
import { Platform, Share } from 'react-native'
import {
  changeEmail,
  changePassword,
  changeUnverifiedEmail,
  downloadMyData,
  requestPasswordReset,
  resendVerification,
  resetPassword,
} from './api'
import { authClient } from './auth-client'

// On remplace Better Auth et l'appel réseau par de faux modules : seul compte ici ce qui part et
// ce qui revient. Le client Better Auth offre deux chemins vers POST /api/auth/change-email :
// sa méthode `changeEmail`, ou `$fetch` si le type de la méthode refuse le mot de passe (plan de la
// tranche). Les deux faux répondent pareil : le test vérifie ce qui part, pas le chemin choisi.
jest.mock('./auth-client', () => ({ authClient: { changeEmail: jest.fn(), $fetch: jest.fn() } }))
// apiFetch (le facteur de l'appli) passe par le fetch global, remplacé test par test : une action
// qui l'emprunte ou qui appelle fetch elle-même est vue pareil.
jest.mock('../api/client', () => ({
  apiFetch: jest.fn((path: string, init?: RequestInit) => globalThis.fetch(path, init)),
}))

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  // Par défaut, l'export de Léa (les premiers tests) ; les autres posent leur réponse.
  fetchMock.mockResolvedValue(
    new Response('{"name":"Léa"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  globalThis.fetch = fetchMock
})

describe('downloadMyData', () => {
  it('names the exported file after the app, never with the code name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })

    await expect(downloadMyData()).resolves.toEqual({ ok: true })

    expect(share).toHaveBeenCalledWith({
      message: '{"name":"Léa"}',
      title: `${appName.toLowerCase()}-export.json`,
    })
    expect(JSON.stringify(share.mock.calls)).not.toContain('ruche')
  })
})

describe('downloadMyData on the web', () => {
  it('downloads a file named after the app', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    const click = jest.fn()
    const link = { href: '', download: '', click }
    // Les tests tournent hors d'un navigateur : on fournit juste ce que la fonction utilise.
    Object.defineProperty(globalThis, 'document', {
      value: { createElement: () => link },
      configurable: true,
    })
    URL.createObjectURL = jest.fn(() => 'blob:export')
    URL.revokeObjectURL = jest.fn()

    await expect(downloadMyData()).resolves.toEqual({ ok: true })

    expect(link.download).toBe(`${appName.toLowerCase()}-export.json`)
    expect(click).toHaveBeenCalled()
    platform.restore()
    Reflect.deleteProperty(globalThis, 'document')
  })
})

// --- Tranche « adresse » : demander le changement d'adresse ---

// Les deux chemins possibles vers la route, vus comme de simples fausses fonctions.
const routes = () => [
  authClient.changeEmail as unknown as jest.Mock,
  authClient.$fetch as unknown as jest.Mock,
]
/** Ce que Better Auth répond, quel que soit le chemin pris : { data, error }, sans lever d'erreur. */
const serverAnswers = (answer: { data: unknown; error: unknown }) => {
  for (const route of routes()) route.mockReset().mockResolvedValue(answer)
}
/** Tous les appels faits à la route, par l'un ou l'autre chemin. */
const calls = () => routes().flatMap((route) => route.mock.calls)
const refused = (status: number, code?: string) =>
  serverAnswers({ data: null, error: { status, statusText: '', message: '', code } })

const request = { newEmail: 'lea.moreau@exemple.fr', password: 'mot-de-passe-de-lea' }

describe('changeEmail', () => {
  it('sends the new address and the password to the server, once', async () => {
    serverAnswers({ data: { status: true }, error: null })

    await expect(changeEmail(request)).resolves.toEqual({ ok: true })

    expect(calls()).toHaveLength(1)
    const sent = JSON.stringify(calls())
    expect(sent).toContain('"newEmail":"lea.moreau@exemple.fr"')
    expect(sent).toContain('"password":"mot-de-passe-de-lea"')
  })

  it('says the password is wrong', async () => {
    refused(400, 'INVALID_PASSWORD')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'wrongPassword' })
  })

  it('says the new address is already the current one', async () => {
    refused(400, 'SAME_EMAIL')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'sameEmail' })
  })

  it('says there were too many attempts', async () => {
    refused(429)

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'tooManyAttempts' })
  })

  it('falls back to the generic message for anything unexpected', async () => {
    refused(500, 'SOMETHING_ELSE')

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'generic' })
  })

  it('turns a server out of reach into the generic message, without throwing', async () => {
    // Sans réseau, l'appel peut échouer au lieu de répondre : l'écran ne doit pas rester « occupé ».
    for (const route of routes()) route.mockReset().mockRejectedValue(new TypeError('offline'))

    await expect(changeEmail(request)).resolves.toEqual({ ok: false, error: 'generic' })
  })
})

// --- Tranche R2 : le mot de passe, le lien de vérification, l'adresse avant vérification ---
//
// Ces cinq actions envoient leur requête par fetch (directement, ou par apiFetch pour /v1) : c'est
// ainsi qu'elles voient la réponse entière, et son en-tête Retry-After quand l'API refuse par un
// 429 (quota atteint). L'écran en fait « Nouvel essai possible à 21 h 47 » (RetryAt, décision D3).

/** Une réponse de l'API, en JSON, avec les en-têtes voulus. */
const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
/** Un refus de Better Auth : le code dans le corps, comme il l'écrit. */
const betterAuthRefuses = (status: number, code: string) =>
  fetchMock.mockResolvedValue(answer(status, { code, message: code }))
/** Un refus de /v1 : le code dans `error.code`, comme l'API l'écrit (contrat ErrorBody). */
const apiRefuses = (status: number, code: string) =>
  fetchMock.mockResolvedValue(answer(status, { error: { code, message: code } }))
/** Le dernier appel à fetch : son adresse et ce qui est parti. */
const lastCall = () => {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined] | undefined
  if (!call) throw new Error('fetch was not called')
  const [url, init] = call
  return { url, method: init?.method, body: typeof init?.body === 'string' ? init.body : '' }
}
/** Un 429 avec Retry-After, pour chacune des cinq actions. */
const rateLimited = (headers: Record<string, string>) =>
  fetchMock.mockResolvedValue(answer(429, { code: 'TOO_MANY_REQUESTS' }, headers))

describe('requestPasswordReset', () => {
  it('sends the address to the API, once, and says it went well', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }))

    await expect(requestPasswordReset({ email: 'lea@exemple.fr' })).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, method, body } = lastCall()
    expect(url).toMatch(/\/api\/auth\/request-password-reset$/)
    expect(method).toBe('POST')
    expect(body).toContain('"email":"lea@exemple.fr"')
  })

  it('never sends a page address of its own: the server imposes the link (sec-S6)', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }))

    await requestPasswordReset({ email: 'lea@exemple.fr' })

    expect(lastCall().body).not.toMatch(/redirectTo|callbackURL/)
  })

  it('reads Retry-After when the quota is reached', async () => {
    rateLimited({ 'Retry-After': '900' })

    await expect(requestPasswordReset({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: 900,
    })
  })

  it('says too many attempts even without a readable Retry-After', async () => {
    rateLimited({})
    await expect(requestPasswordReset({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: null,
    })

    // Une valeur qui n'est pas un nombre de secondes (une date HTTP, du bruit) : pas d'heure.
    rateLimited({ 'Retry-After': 'Fri, 30 Oct 2026 21:47:00 GMT' })
    await expect(requestPasswordReset({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: null,
    })
  })

  it('turns a server out of reach into the generic message, without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(requestPasswordReset({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'generic',
    })
  })
})

describe('resetPassword', () => {
  const input = { token: 'jeton-recu-par-e-mail', newPassword: 'un-nouveau-mot-de-passe' }

  it('sends the token and the new password, and says it went well', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }))

    await expect(resetPassword(input)).resolves.toEqual({ ok: true })

    const { url, method, body } = lastCall()
    expect(url).toMatch(/\/api\/auth\/reset-password$/)
    expect(method).toBe('POST')
    expect(body).toContain('"token":"jeton-recu-par-e-mail"')
    expect(body).toContain('"newPassword":"un-nouveau-mot-de-passe"')
    // Le jeton voyage dans le corps, jamais dans l'adresse (journaux du serveur, référents).
    expect(url).not.toContain('jeton-recu-par-e-mail')
  })

  it('says the link is refused, whatever the cause (expired, used, damaged)', async () => {
    betterAuthRefuses(400, 'INVALID_TOKEN')

    await expect(resetPassword(input)).resolves.toEqual({ ok: false, error: 'invalidToken' })
  })

  it('says the new password is too short', async () => {
    betterAuthRefuses(400, 'PASSWORD_TOO_SHORT')

    await expect(resetPassword(input)).resolves.toEqual({ ok: false, error: 'passwordTooShort' })
  })

  it('reads Retry-After when the quota is reached', async () => {
    rateLimited({ 'Retry-After': '60' })

    await expect(resetPassword(input)).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: 60,
    })
  })
})

describe('changePassword', () => {
  const input = { currentPassword: 'ancien-mot-de-passe', newPassword: 'un-nouveau-mot-de-passe' }

  it('sends both passwords, and says it went well', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }))

    await expect(changePassword(input)).resolves.toEqual({ ok: true })

    const { url, method, body } = lastCall()
    expect(url).toMatch(/\/api\/auth\/change-password$/)
    expect(method).toBe('POST')
    expect(body).toContain('"currentPassword":"ancien-mot-de-passe"')
    expect(body).toContain('"newPassword":"un-nouveau-mot-de-passe"')
  })

  it('says the current password is wrong', async () => {
    betterAuthRefuses(400, 'INVALID_PASSWORD')

    await expect(changePassword(input)).resolves.toEqual({ ok: false, error: 'wrongPassword' })
  })

  it('says the session has expired on a 401 without a known code', async () => {
    betterAuthRefuses(401, 'UNAUTHORIZED')

    await expect(changePassword(input)).resolves.toEqual({ ok: false, error: 'sessionExpired' })
  })

  it('reads Retry-After when the quota is reached', async () => {
    rateLimited({ 'Retry-After': '900' })

    await expect(changePassword(input)).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: 900,
    })
  })
})

describe('resendVerification', () => {
  it('sends the address, and says it went well', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true }))

    await expect(resendVerification({ email: 'lea@exemple.fr' })).resolves.toEqual({ ok: true })

    const { url, method, body } = lastCall()
    expect(url).toMatch(/\/api\/auth\/send-verification-email$/)
    expect(method).toBe('POST')
    expect(body).toContain('"email":"lea@exemple.fr"')
    // La page du lien est imposée par le serveur (sec-S6) : rien de tel ne part.
    expect(body).not.toMatch(/callbackURL/)
  })

  it('reads Retry-After when the quota is reached', async () => {
    rateLimited({ 'Retry-After': '3600' })

    await expect(resendVerification({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: 3600,
    })
  })

  it('turns a server out of reach into the generic message, without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(resendVerification({ email: 'lea@exemple.fr' })).resolves.toEqual({
      ok: false,
      error: 'generic',
    })
  })
})

describe('changeUnverifiedEmail', () => {
  const input = {
    email: 'lea@exemple.fr',
    password: 'mot-de-passe-de-lea',
    newEmail: 'lea.moreau@exemple.fr',
  }

  it('sends the current address, the password and the new address to /v1', async () => {
    fetchMock.mockResolvedValue(answer(200, { sentTo: 'lea.moreau@exemple.fr' }))

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({
      ok: true,
      sentTo: 'lea.moreau@exemple.fr',
    })

    const { url, method, body } = lastCall()
    expect(url).toMatch(/\/v1\/account\/unverified-email$/)
    expect(method).toBe('POST')
    expect(body).toContain('"email":"lea@exemple.fr"')
    expect(body).toContain('"password":"mot-de-passe-de-lea"')
    expect(body).toContain('"newEmail":"lea.moreau@exemple.fr"')
  })

  it('says the address or the password is wrong on a 401 (the same answer for both)', async () => {
    apiRefuses(401, 'unauthorized')

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({
      ok: false,
      error: 'invalidCredentials',
    })
  })

  it('says the account is already verified on a 409', async () => {
    apiRefuses(409, 'already_verified')

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({
      ok: false,
      error: 'alreadyVerified',
    })
  })

  it('reads Retry-After when the quota is reached', async () => {
    fetchMock.mockResolvedValue(
      answer(429, { error: { code: 'rate_limited', message: '' } }, { 'Retry-After': '900' }),
    )

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({
      ok: false,
      error: 'tooManyAttempts',
      retryAfterSeconds: 900,
    })
  })

  it('refuses a malformed answer rather than showing an unknown address', async () => {
    fetchMock.mockResolvedValue(answer(200, { nothing: true }))

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({ ok: false, error: 'generic' })
  })

  it('turns a server out of reach into the generic message, without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))

    await expect(changeUnverifiedEmail(input)).resolves.toEqual({ ok: false, error: 'generic' })
  })
})
