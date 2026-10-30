// Tout ce que l'appli peut faire avec un compte, en un seul endroit.
// Les écrans n'appellent que ces fonctions : ils ne connaissent ni Better Auth, ni l'adresse de
// l'API. Avantage : dans les tests, on remplace ce fichier par de faux appels (jest.mock).
import { appName } from '@ruche/brand'
import {
  type ChangeEmailRequest,
  type ChangePasswordRequest,
  type ChangeUnverifiedEmailRequest,
  ChangeUnverifiedEmailResponse,
  type ForgotPasswordRequest,
  type ResendVerificationRequest,
  type ResetPasswordRequest,
  type SignInRequest,
  type SignUpRequest,
} from '@ruche/contracts'
import { Platform, Share } from 'react-native'
import { apiFetch } from '../api/client'
import { queryClient } from '../api/query-client'
import { webAppUrl } from '../config'
import { authClient } from './auth-client'
import { type AuthErrorKey, authErrorKey } from './errors'
import { setPendingEmail } from './pendingVerification'

/** Résultat d'une action : réussie, ou ratée avec la clé du message à afficher. */
export type Result<E extends string = AuthErrorKey> = { ok: true } | { ok: false; error: E }

// Better Auth renvoie { data, error } au lieu de lever une erreur : on transforme l'erreur
// éventuelle en clé de message.
const toResult = (error: { status: number; code?: string | undefined } | null): Result => {
  if (!error) return { ok: true }
  return { ok: false, error: authErrorKey(error) }
}

/**
 * Un refus pour « trop d'essais » (429), avec le délai lu dans l'en-tête Retry-After : l'écran en
 * fait « Nouvel essai possible à 21 h 47 » (RetryAt, décision D3). `null` quand l'en-tête manque ou
 * n'est pas un nombre de secondes (une date HTTP) : l'écran dit alors seulement « Trop d'essais ».
 */
export type TooManyAttempts = {
  ok: false
  error: 'tooManyAttempts'
  retryAfterSeconds: number | null
}

/**
 * Le résultat d'une action protégée par un quota : réussie, refusée avec la clé du message, ou
 * refusée pour trop d'essais (et alors seulement, avec son délai). `Exclude` retire
 * 'tooManyAttempts' des autres refus : quand l'écran teste `error === 'tooManyAttempts'`,
 * TypeScript sait que `retryAfterSeconds` existe.
 */
export type LimitedResult<E extends string = AuthErrorKey, Ok extends object = { ok: true }> =
  | Ok
  | { ok: false; error: Exclude<E, 'tooManyAttempts'> }
  | TooManyAttempts

/**
 * Lit l'en-tête Retry-After d'un 429 : un nombre entier de secondes, sinon null. L'API recopie
 * aussi en Retry-After l'en-tête X-Retry-After que Better Auth pose sur ses propres refus (A5) ;
 * on lit les deux, au cas où une réponse n'aurait que le second.
 */
export const retryAfterOf = (headers: Headers): number | null => {
  const value = (headers.get('Retry-After') ?? headers.get('X-Retry-After'))?.trim()
  // Une date HTTP (« Fri, 30 Oct 2026 21:47:00 GMT ») est permise par la norme, mais l'API n'en
  // envoie pas : la lire supposerait que l'horloge du téléphone est juste. On ne garde que les
  // secondes.
  return value && /^\d+$/.test(value) ? Number(value) : null
}

const tooManyAttempts = (headers: Headers): TooManyAttempts => ({
  ok: false,
  error: 'tooManyAttempts',
  retryAfterSeconds: retryAfterOf(headers),
})

/** Le code d'erreur d'un corps de réponse, qu'il vienne de Better Auth (`{ code }`) ou de /v1
 * (`{ error: { code } }`, contrat ErrorBody). */
const codeOf = async (res: Response): Promise<string | undefined> => {
  const body: unknown = await res.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return undefined
  if ('code' in body && typeof body.code === 'string') return body.code
  if (!('error' in body)) return undefined
  const { error } = body
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

// L'adresse de l'appli mobile (le `scheme` d'auth-client.ts). Le plugin Expo de Better Auth
// l'envoie dans l'en-tête `expo-origin`, que le serveur lit comme l'origine de la requête : sans
// elle, Better Auth refuserait une demande accompagnée d'un cookie (protection CSRF).
const NATIVE_ORIGIN = 'ruche://'

/**
 * Envoie un formulaire à une route de Better Auth (/api/auth/…) sans passer par son client.
 * Pourquoi : le client Better Auth ne rend que `{ data, error }`, sans les en-têtes de la réponse,
 * et ces actions ont besoin de Retry-After. `apiFetch` ajoute la session du membre (le cookie, sur
 * téléphone). Aucune adresse de page (callbackURL, redirectTo) ne part : le serveur impose la
 * page où mènent ses liens (sec-S6), et le jeton du lien voyage dans le corps, jamais dans
 * l'adresse (journaux du serveur, référents).
 */
const postToAuth = (path: string, body: object): Promise<Response> =>
  apiFetch(`/api/auth${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(Platform.OS === 'web' ? {} : { 'expo-origin': NATIVE_ORIGIN }),
    },
    body: JSON.stringify(body),
  })

/**
 * La partie commune des actions sur Better Auth : envoyer, puis traduire la réponse. Serveur
 * injoignable : le message général, sans lever d'erreur (l'écran ne reste pas « occupé »).
 */
const authAction = async (path: string, body: object): Promise<LimitedResult> => {
  let res: Response
  try {
    res = await postToAuth(path, body)
  } catch {
    return { ok: false, error: 'generic' }
  }
  if (res.ok) return { ok: true }
  if (res.status === 429) return tooManyAttempts(res.headers)
  const error = authErrorKey({ status: res.status, code: await codeOf(res) })
  // authErrorKey ne rend 'tooManyAttempts' que pour un 429, déjà traité : ce cas ne se produit pas,
  // mais TypeScript ne peut pas le savoir.
  return error === 'tooManyAttempts' ? tooManyAttempts(res.headers) : { ok: false, error }
}

/** Mot de passe oublié : la réponse est la même qu'un compte existe ou non. */
export const requestPasswordReset = (input: ForgotPasswordRequest): Promise<LimitedResult> =>
  authAction('/request-password-reset', { email: input.email })

/** Choisir un nouveau mot de passe avec le jeton du lien reçu (refusé : 'invalidToken'). */
export const resetPassword = (input: ResetPasswordRequest): Promise<LimitedResult> =>
  authAction('/reset-password', { token: input.token, newPassword: input.newPassword })

/**
 * Changer son mot de passe depuis les réglages. Le serveur déconnecte les autres appareils (il
 * l'impose, quoi que dise la requête) ; on n'envoie donc pas `revokeOtherSessions`.
 */
export const changePassword = (input: ChangePasswordRequest): Promise<LimitedResult> =>
  authAction('/change-password', {
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
  })

/** Renvoyer le lien de vérification (« Vérifie ta boîte mail »). */
export const resendVerification = (input: ResendVerificationRequest): Promise<LimitedResult> =>
  authAction('/send-verification-email', { email: input.email })

/** Les refus possibles d'une correction d'adresse avant vérification. */
export type ChangeUnverifiedEmailError = 'invalidCredentials' | 'alreadyVerified' | 'generic'

/**
 * Corriger son adresse avant de l'avoir vérifiée (POST /v1/account/unverified-email), sans
 * session : l'adresse actuelle et le mot de passe prouvent qu'on est le nouveau membre. Rend
 * l'adresse à laquelle le lien est parti (`sentTo`), vérifiée par le schéma du contrat.
 */
export const changeUnverifiedEmail = async (
  input: ChangeUnverifiedEmailRequest,
): Promise<LimitedResult<ChangeUnverifiedEmailError, { ok: true; sentTo: string }>> => {
  let res: Response
  try {
    res = await apiFetch('/v1/account/unverified-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        newEmail: input.newEmail,
      }),
    })
  } catch {
    return { ok: false, error: 'generic' }
  }
  if (res.status === 429) return tooManyAttempts(res.headers)
  // 401 : adresse ou mot de passe incorrect (une seule réponse pour les deux, on ne dit pas lequel).
  if (res.status === 401) return { ok: false, error: 'invalidCredentials' }
  if (res.status === 409 && (await codeOf(res)) === 'already_verified') {
    return { ok: false, error: 'alreadyVerified' }
  }
  if (!res.ok) return { ok: false, error: 'generic' }
  // Une réponse sans adresse valable : on ne montre pas une adresse inconnue.
  const parsed = ChangeUnverifiedEmailResponse.safeParse(await res.json().catch(() => null))
  return parsed.success ? { ok: true, sentTo: parsed.data.sentTo } : { ok: false, error: 'generic' }
}

/** Le membre connecté (ou null), mis à jour automatiquement : un hook React. */
export const useSession = authClient.useSession

/**
 * Sur téléphone : le cookie de session, gardé dans le coffre-fort du téléphone par le plugin Expo.
 * Il accompagne les demandes d'images, réservées aux membres (voir api/media.ts).
 */
export const getSessionCookie = (): Promise<string> => authClient.getCookie()

/**
 * Connexion et inscription passent par le client Better Auth, qui garde la session (le cookie sur
 * téléphone, le signal de `useSession`). Son résultat `{ data, error }` n'a pas les en-têtes ; mais
 * son option `onError` reçoit la réponse entière : on y lit Retry-After au passage. Ce petit
 * « témoin » est créé pour chaque appel : deux connexions en même temps ne mêlent pas leurs délais.
 */
const retryAfterWitness = () => {
  let headers: Headers | null = null
  return {
    fetchOptions: {
      onError: (context: { response: Response }) => {
        headers = context.response.headers
      },
    },
    /** Le résultat final : un 429 reçoit le délai lu ; les autres refus, leur clé de message. */
    result: (error: { status: number; code?: string | undefined } | null): LimitedResult => {
      if (!error) return { ok: true }
      const key = authErrorKey(error)
      return key === 'tooManyAttempts'
        ? tooManyAttempts(headers ?? new Headers())
        : { ok: false, error: key }
    },
  }
}

export const signUp = async (input: SignUpRequest): Promise<LimitedResult> => {
  const witness = retryAfterWitness()
  try {
    const { error } = await authClient.signUp.email({
      ...input,
      // Le lien de l'e-mail ramènera sur cette page de l'appli web une fois l'adresse vérifiée.
      callbackURL: `${webAppUrl}/verified`,
      fetchOptions: witness.fetchOptions,
    })
    return witness.result(error)
  } catch {
    return { ok: false, error: 'generic' }
  }
}

export const signIn = async (input: SignInRequest): Promise<LimitedResult> => {
  const witness = retryAfterWitness()
  try {
    const { error } = await authClient.signIn.email({
      ...input,
      fetchOptions: witness.fetchOptions,
    })
    // Nouveau membre connecté : on repart d'un cache vide (voir signOut), et l'adresse qui attendait
    // sa vérification dans l'onglet s'oublie (relecture de sécurité C1 : sur un PC partagé, la
    // personne suivante la lisait sur « Vérifie ta boîte mail »).
    if (!error) {
      queryClient.clear()
      setPendingEmail(null)
    }
    return witness.result(error)
  } catch {
    return { ok: false, error: 'generic' }
  }
}

/**
 * Oublie la session dans l'appli, une fois que le serveur l'a fermée (déconnexion, compte
 * supprimé). Better Auth relit alors la session sans la vider d'abord : si cette relecture échoue
 * (réseau, panne), il garde l'ancienne, et la personne suivante sur un appareil partagé verrait le
 * nom et l'adresse du membre précédent (relecture de sécurité de la PR #62). On remet donc nous-mêmes
 * son magasin (un « atome » : une valeur partagée que `useSession` suit) à « personne ».
 */
const forgetSession = () => {
  const session = authClient.$store.atoms.session
  if (!session) return
  session.set({ ...session.get(), data: null, error: null, isPending: false, isRefetching: false })
}

export const signOut = async (): Promise<void> => {
  try {
    const { error } = await authClient.signOut()
    // Un refus du serveur : le membre est encore connecté, sa session reste.
    if (!error) forgetSession()
  } finally {
    // On vide le cache des données (profil…), même si le serveur n'a pas répondu : sur un appareil
    // partagé, la personne suivante ne doit rien voir de ce qui appartenait au membre précédent,
    // pas même l'adresse qui attendait sa vérification.
    queryClient.clear()
    setPendingEmail(null)
  }
}

/** Supprime le compte après vérification du mot de passe par le serveur. */
export const deleteAccount = async (
  password: string,
): Promise<Result<'wrongPassword' | AuthErrorKey>> => {
  const { error } = await authClient.deleteUser({ password })
  if (!error) {
    // Même raison qu'à la déconnexion.
    forgetSession()
    queryClient.clear()
    setPendingEmail(null)
    return { ok: true }
  }
  if (error.code === 'INVALID_PASSWORD') return { ok: false, error: 'wrongPassword' }
  return toResult(error)
}

/**
 * Demande à changer l'adresse du compte (tranche « adresse », POST /api/auth/change-email).
 * Rien ne change tout de suite : le serveur envoie un premier lien à l'adresse ACTUELLE, qui doit
 * donner son accord, puis un second à la nouvelle. Le mot de passe est exigé (contrat
 * ChangeEmailRequest) : une session ouverte sur un téléphone trouvé ne suffit pas.
 *
 * On passe par `$fetch`, l'appel brut du client Better Auth : sa méthode `changeEmail` ne connaît
 * pas le mot de passe, que notre serveur ajoute à la route. L'adresse où mènent les liens
 * (callbackURL) est imposée par le serveur : l'appli n'en envoie pas.
 */
export const changeEmail = async (
  input: ChangeEmailRequest,
): Promise<Result<'wrongPassword' | 'sameEmail' | AuthErrorKey>> => {
  try {
    const { error } = await authClient.$fetch('/change-email', { method: 'POST', body: input })
    return toResult(error)
  } catch {
    // Serveur injoignable : l'appel échoue au lieu de répondre. L'écran ne reste pas « occupé ».
    return { ok: false, error: 'generic' }
  }
}

/**
 * Télécharge l'export des données du membre (GET /v1/me/export).
 * Sur le web : le navigateur enregistre un fichier. Sur mobile : la feuille de partage s'ouvre.
 */
export const downloadMyData = async (): Promise<Result> => {
  // apiFetch ajoute la session du membre (voir api/client.ts).
  const res = await apiFetch('/v1/me/export').catch(() => null)
  if (!res) return { ok: false, error: 'generic' } // serveur injoignable
  if (!res.ok) return { ok: false, error: authErrorKey({ status: res.status }) }
  const json = await res.text()

  // Le nom du fichier vient du nom de l'appli (« waiggle-export.json ») : le nom de code du dépôt
  // n'apparaît jamais aux membres.
  const fileName = `${appName.toLowerCase()}-export.json`
  if (Platform.OS === 'web') {
    // Astuce web classique : un lien invisible vers le fichier, sur lequel on « clique ».
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
  } else {
    await Share.share({ message: json, title: fileName })
  }
  return { ok: true }
}
