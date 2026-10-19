// Le « facteur » de l'appli : toutes les requêtes vers l'API de Ruche (/v1/…) passent par ici.
// Il ajoute la session du membre, puis traduit la réponse en résultat simple pour les écrans :
// { ok: true, data } quand tout va bien, { ok: false, error } avec la clé du message sinon.
import { Platform } from 'react-native'
import { authClient } from '../accounts/auth-client'
import { apiUrl } from '../config'
import { AMBIGUOUS_STATUSES, type ApiResult, errorKeyFor } from './errors'

/**
 * Envoie une requête à l'API avec la session du membre.
 * - Sur le web, le navigateur joint lui-même le cookie de session (credentials: 'include').
 * - Sur mobile, pas de cookies de navigateur : on ajoute celui gardé par le plugin Expo
 *   (dans le coffre-fort chiffré du téléphone).
 */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const isWeb = Platform.OS === 'web'
  const headers = new Headers(init.headers)
  if (!isWeb) {
    const cookie = await authClient.getCookie()
    if (cookie) headers.set('Cookie', cookie)
  }
  // Sur mobile, credentials: 'omit' : le système ne joint jamais de cookie gardé de son côté
  // (par exemple celui d'une session terminée). Seul compte celui qu'on vient d'ajouter.
  return fetch(`${apiUrl}${path}`, { ...init, headers, credentials: isWeb ? 'include' : 'omit' })
}

// La partie d'un schéma Zod dont on a besoin : safeParse. Décrire seulement cette forme évite que
// l'appli dépende directement de la bibliothèque Zod (elle utilise les schémas de @ruche/contracts).
type Schema<T> = { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }

/**
 * Envoie une requête et vérifie la réponse avec un schéma de @ruche/contracts.
 * Si la réponse n'a pas la forme attendue (API d'une autre version, par exemple), on le signale
 * comme une erreur plutôt que d'afficher des données incomplètes.
 */
export const request = async <T>(
  path: string,
  init: RequestInit,
  schema: Schema<T>,
): Promise<ApiResult<T>> => {
  const sent = await send(path, init)
  if (!sent.ok) return sent
  const parsed = schema.safeParse(await sent.data.json().catch(() => null))
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'internal' }
}

/** Pour les requêtes dont la réponse n'a pas de contenu (une suppression répond « 204 »). */
export const requestWithoutBody = async (
  path: string,
  init: RequestInit,
): Promise<ApiResult<null>> => {
  const sent = await send(path, init)
  return sent.ok ? { ok: true, data: null } : sent
}

// Partie commune : envoyer, et traduire un échec (réseau ou refus de l'API) en clé de message.
const send = async (path: string, init: RequestInit): Promise<ApiResult<Response>> => {
  let res: Response
  try {
    res = await apiFetch(path, init)
  } catch {
    // fetch ne lève une erreur que si le serveur est injoignable (pas de réseau, API arrêtée).
    return { ok: false, error: 'network' }
  }
  if (res.ok) return { ok: true, data: res }
  // Un statut partagé par plusieurs refus (409) : le code du corps dit lequel. Pour les autres, on
  // ne lit pas le corps : un « 413 » peut venir de Caddy, en HTML.
  const code = AMBIGUOUS_STATUSES.has(res.status) ? await readErrorCode(res) : undefined
  return { ok: false, error: errorKeyFor(res.status, code) }
}

/** Le code d'erreur du corps d'une réponse (`{ error: { code: 'handle_taken' } }`), s'il y en a un. */
const readErrorCode = async (res: Response): Promise<string | undefined> => {
  const body: unknown = await res.json().catch(() => null)
  // `in` vérifie qu'une propriété existe : TypeScript en déduit qu'on peut la lire.
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined
  const { error } = body
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}
