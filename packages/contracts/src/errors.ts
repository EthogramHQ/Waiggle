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
