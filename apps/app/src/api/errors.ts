// Les erreurs de l'API vues par l'appli : une clé de message (errors.* dans packages/i18n) par cas.
// Fichier séparé de client.ts, sans dépendance : les écrans peuvent l'importer sans charger le
// client réseau (pratique dans les tests, où ce client n'existe pas). Le seul import est un type,
// effacé à la compilation.
import type { ErrorCode } from '@ruche/contracts'

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
  | 'handleTaken'
  | 'handleChangeLimit'
  // Tranche 7a : signaler et modérer.
  | 'ownContent'
  | 'alreadyReported'
  | 'alreadyDecided'
  | 'removed'
  // Tranche 7b : bloquer, et re-signaler un contenu déjà examiné.
  | 'cannotBlockOwn'
  | 'blockedMention'
  | 'alreadyExamined'
  // Tranche 7c : un compte suspendu ; le mot de passe redemandé à un administrateur ; suspendre un
  // administrateur.
  | 'suspended'
  | 'passwordRequired'
  | 'wrongPassword'
  | 'cannotSuspendAdmin'
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
  // 409 : « conflit ». Deux refus le partagent (une 7e photo, un pseudo déjà pris) : le code du
  // corps de la réponse les départage (byCode, plus bas). Sans corps lisible : la 7e photo, le plus
  // ancien des deux.
  409: 'tooManyVisuals',
  413: 'payloadTooLarge',
  415: 'unsupportedMediaType',
  // 422 : « demande impossible à traiter ». Sans corps lisible, le plus ancien de ses refus : son
  // propre contenu (own_content, tranche 7a), signaler ce qu'on a publié ou décider de ce qui nous
  // concerne. Les autres (tranche 7b) se lisent dans le corps (byCode).
  422: 'ownContent',
  // 429 : « trop de demandes ». Aussi le 6e changement de pseudo du jour (handle_change_limit),
  // qui a son propre message (réessayer demain, pas dans quelques minutes) : voir byCode.
  429: 'rateLimited',
  503: 'unavailable',
}

export const errorKeyForStatus = (status: number): ApiErrorKey => byStatus[status] ?? 'internal'

/**
 * Les statuts partagés par plusieurs refus : pour eux seuls, on lit le code du corps. Un 429 sans
 * corps JSON (un serveur placé devant l'API) reste « trop de demandes ».
 */
export const AMBIGUOUS_STATUSES: ReadonlySet<number> = new Set([403, 409, 422, 429])

// Code du corps (« handle_taken ») → message, pour les refus qu'un statut seul ne distingue pas.
// Partial : seuls quelques codes sont listés ; les autres retombent sur le statut.
const byCode: Partial<Record<ErrorCode, ApiErrorKey>> = {
  handle_taken: 'handleTaken',
  handle_change_limit: 'handleChangeLimit',
  too_many_visuals: 'tooManyVisuals',
  // Tranche 7a : trois 409 de plus (déjà signalé, déjà décidé, contenu retiré) et un 422.
  already_reported: 'alreadyReported',
  already_decided: 'alreadyDecided',
  removed: 'removed',
  own_content: 'ownContent',
  // Tranche 7b : deux 422 de plus (se bloquer soi-même ; mentionner un membre qu'on a bloqué) et un
  // 409 (re-signaler un contenu que la modération a déjà examiné, et qui n'a pas changé depuis).
  cannot_block_own: 'cannotBlockOwn',
  blocked_mention: 'blockedMention',
  already_examined: 'alreadyExamined',
  // Tranche 7c : trois 403 de plus (compte suspendu ; mot de passe absent ou faux) et un 422
  // (suspendre un administrateur). Un 403 sans code reste « action non autorisée ».
  suspended: 'suspended',
  password_required: 'passwordRequired',
  wrong_password: 'wrongPassword',
  cannot_suspend_admin: 'cannotSuspendAdmin',
}

/**
 * Le message d'un refus, d'après son statut et, si l'API l'a donné, le code de son corps
 * (`{ error: { code } }`). Un code inconnu (une API plus récente) ne casse rien : on garde le statut.
 */
export const errorKeyFor = (status: number, code?: string): ApiErrorKey =>
  (code !== undefined && Object.hasOwn(byCode, code) ? byCode[code as ErrorCode] : undefined) ??
  errorKeyForStatus(status)

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
