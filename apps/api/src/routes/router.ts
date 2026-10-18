// Fabrique de « routeurs » : un petit groupe de routes, rangé dans son propre fichier.
// Tous partagent le même comportement quand une requête ne respecte pas son schéma Zod :
// une erreur 400 au format habituel, avec un message traduit (et sans détailler le schéma).
import { OpenAPIHono } from '@hono/zod-openapi'
import { ErrorResponse } from '@ruche/contracts'
import { errorBody, languageOf } from '../errors'
import type { AppEnv } from '../types'

export const createRouter = () =>
  new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) return c.json(errorBody(languageOf(c), 'validation'), 400)
    },
  })

/** Description d'une réponse d'erreur pour la documentation OpenAPI. */
export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorResponse } },
})
