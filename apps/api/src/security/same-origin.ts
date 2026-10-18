// Protection contre les requêtes « CSRF » (falsification de requête inter-sites).
//
// Le danger : Léa est connectée à Ruche. Elle visite une page piégée qui, en cachette, envoie un
// formulaire à notre API. Son navigateur y joint automatiquement son cookie de session : sans
// protection, l'API croirait que c'est Léa qui change sa photo.
//
// La parade : pour toute requête qui modifie quelque chose, un navigateur ajoute l'en-tête Origin,
// l'adresse du site d'où part la requête. Le site piégé ne peut pas le falsifier. On refuse donc
// toute modification dont l'Origin n'est pas l'appli web de Ruche.
// L'appli mobile n'envoie pas d'en-tête Origin (ce n'est pas un navigateur) : elle passe.
import type { MiddlewareHandler } from 'hono'
import { errorBody, languageOf } from '../errors'
import type { AppEnv } from '../types'

// Les lectures ne modifient rien : elles ne sont pas concernées.
const readOnlyMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Refuse (403) les modifications envoyées depuis un autre site que ceux de la liste. */
export const sameOriginWrites = (allowedUrls: string[]): MiddlewareHandler<AppEnv> => {
  // new URL(...).origin normalise l'adresse : « https://waiggle.io/ » devient « https://waiggle.io ».
  const allowed = new Set(allowedUrls.map((url) => new URL(url).origin))

  return async (c, next) => {
    const origin = c.req.header('origin')
    if (!readOnlyMethods.has(c.req.method) && origin !== undefined && !allowed.has(origin)) {
      return c.json(errorBody(languageOf(c), 'forbidden'), 403)
    }
    await next()
  }
}
