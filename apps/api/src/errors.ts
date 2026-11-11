// Fabrication des réponses d'erreur, toujours de la même forme et dans la langue du visiteur.
import type { ErrorCode, ErrorResponse } from '@ruche/contracts'
import { fill, type Language, parseAcceptLanguage, resolveLanguage, resources } from '@ruche/i18n'
import type { Context } from 'hono'
import type { AppEnv } from './types'

// Correspondance entre un code d'erreur (pour les programmes) et sa clé de traduction (pour les humains).
const errorMessages = {
  not_found: 'notFound',
  validation: 'validation',
  unauthorized: 'unauthorized',
  forbidden: 'forbidden',
  rate_limited: 'rateLimited',
  payload_too_large: 'payloadTooLarge',
  unsupported_media_type: 'unsupportedMediaType',
  unavailable: 'unavailable',
  too_many_visuals: 'tooManyVisuals',
  cannot_follow_own: 'cannotFollowOwn',
  cannot_react_own: 'cannotReactOwn',
  handle_taken: 'handleTaken',
  handle_change_limit: 'handleChangeLimit',
  unsubscribe_invalid: 'unsubscribeInvalid',
  own_content: 'ownContent',
  already_reported: 'alreadyReported',
  already_decided: 'alreadyDecided',
  removed: 'removed',
  cannot_block_own: 'cannotBlockOwn',
  blocked_mention: 'blockedMention',
  already_examined: 'alreadyExamined',
  suspended: 'suspended',
  password_required: 'passwordRequired',
  wrong_password: 'wrongPassword',
  cannot_suspend_admin: 'cannotSuspendAdmin',
  // Tranche R2 : corriger l'adresse d'un compte déjà vérifié.
  already_verified: 'alreadyVerified',
  // Tranche R6a : les catégories d'un projet.
  category_required: 'categoryRequired',
  same_category: 'sameCategory',
  // Tranche R6b : le catalogue des outils et les catégories en base.
  unknown_category: 'unknownCategory',
  tool_name_taken: 'toolNameTaken',
  category_name_taken: 'categoryNameTaken',
  too_many_other_tools: 'tooManyOtherTools',
  own_project: 'ownProject',
  // Tranche R7a : les mises à jour et les testeurs.
  invalid_photos: 'invalidPhotos',
  cannot_test_own: 'cannotTestOwn',
  not_testable: 'notTestable',
  testers_full: 'testersFull',
  update_photos_full: 'updatePhotosFull',
  // Tranche R7b : le coin des testeurs.
  corner_closed: 'cornerClosed',
  thread_closed: 'threadClosed',
  invalid_photo: 'invalidPhoto',
  invalid_feedback: 'invalidFeedback',
  tester_media_full: 'testerMediaFull',
  internal: 'internal',
} as const satisfies Record<ErrorCode, string>

/** Le corps JSON d'une erreur, avec le message dans la langue demandée. */
export const errorBody = (language: Language, code: ErrorCode): ErrorResponse => ({
  // fill remplit {{appName}} (le nom de l'appli) présent dans certains messages.
  error: { code, message: fill(resources[language].translation.errors[errorMessages[code]]) },
})

// Langue de la requête. `??` signifie « sinon » : si la langue n'a pas encore été calculée
// (cas d'une erreur très précoce), on la recalcule à partir de l'en-tête.
export const languageOf = (c: Context<AppEnv>): Language =>
  c.get('language') ?? resolveLanguage(parseAcceptLanguage(c.req.header('accept-language')))
