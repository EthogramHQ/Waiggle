import { z } from 'zod'

// La liste fermée des codes d'erreur. Le code sert aux programmes (l'appli réagit selon le code),
// le message sert aux humains (il est traduit dans la langue du visiteur).
export const ErrorCode = z.enum([
  'not_found',
  'validation',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'payload_too_large',
  'unsupported_media_type',
  'unavailable',
  'too_many_visuals',
  'cannot_follow_own',
  'cannot_react_own',
  'handle_taken',
  'handle_change_limit',
  'unsubscribe_invalid',
  // Tranche 7a : signaler son propre contenu, ou décider de ce qui nous concerne ; signaler deux
  // fois la même chose ; une décision déjà prise entre-temps ; modifier un contenu retiré.
  'own_content',
  'already_reported',
  'already_decided',
  'removed',
  // Tranche 7b : se bloquer soi-même ; mentionner un membre qu'on a bloqué ; re-signaler un contenu
  // inchangé depuis que la modération l'a examiné.
  'cannot_block_own',
  'blocked_mention',
  'already_examined',
  // Tranche 7c : une action refusée à un compte suspendu ; le mot de passe redemandé à un
  // administrateur, absent ou faux ; suspendre un administrateur en fonction.
  'suspended',
  'password_required',
  'wrong_password',
  'cannot_suspend_admin',
  // Tranche R2 : corriger l'adresse d'un compte déjà vérifié (il suffit de se connecter).
  'already_verified',
  'internal',
])
export type ErrorCode = z.infer<typeof ErrorCode>

/** Toutes les erreurs renvoyées par l'API ont cette forme, quel que soit le problème. */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
    }),
  })
  .meta({ id: 'ErrorResponse' })

export type ErrorResponse = z.infer<typeof ErrorResponse>
