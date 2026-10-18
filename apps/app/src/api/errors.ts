// Les erreurs de l'API vues par l'appli : une clé de message (errors.* dans packages/i18n) par cas.
// Fichier séparé de client.ts, sans dépendance : les écrans peuvent l'importer sans charger le
// client réseau (pratique dans les tests, où ce client n'existe pas).

/** Clés des messages d'erreur génériques. */
export type ApiErrorKey =
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'payloadTooLarge'
  | 'unsupportedMediaType'
  | 'rateLimited'
  | 'unavailable'
  | 'tooManyVisuals'
  | 'internal'
  | 'network'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiErrorKey }

// Code HTTP → message. On se fie au code plutôt qu'au corps de la réponse : un « 413 fichier trop
// gros » peut venir du serveur web placé devant l'API (Caddy), qui ne répond pas en JSON.
const byStatus: Record<number, ApiErrorKey> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  // 409 : « conflit » ; la seule route qui le renvoie refuse une 7e photo.
  409: 'tooManyVisuals',
  413: 'payloadTooLarge',
  415: 'unsupportedMediaType',
  429: 'rateLimited',
  503: 'unavailable',
}

export const errorKeyForStatus = (status: number): ApiErrorKey => byStatus[status] ?? 'internal'

/**
 * Une erreur d'API transformée en exception, pour les lectures faites avec React Query :
 * React Query attend qu'une lecture ratée « lève » une erreur pour afficher l'état d'échec.
 */
export class ApiError extends Error {
  constructor(readonly key: ApiErrorKey) {
    super(key)
  }
}

/** La clé du message d'une erreur venue de l'API (« notFound », « rateLimited »…), ou « internal ». */
export const errorKey = (error: unknown): ApiErrorKey =>
  error instanceof ApiError ? error.key : 'internal'
