// Middleware de session : pour chaque requête, retrouve le membre connecté grâce au cookie
// (ou au jeton envoyé par l'appli mobile) et le range dans c.var.user.
// Les routes n'ont plus qu'à regarder c.get('user') : null veut dire « personne de connecté ».
import type { MiddlewareHandler } from 'hono'
import { errorBody, languageOf } from '../errors'
import type { AppEnv } from '../types'
import type { Auth } from './auth'

export const sessionMiddleware =
  (auth: Auth): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    // Better Auth vérifie la signature du cookie et l'expiration de la session dans la base.
    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    c.set('user', result?.user ?? null)
    c.set('session', result?.session ?? null)
    await next()
  }

/**
 * Refuse tout de suite (401) une requête sans membre connecté, AVANT que quoi que ce soit ne lise
 * son contenu. Sans ce garde, un visiteur anonyme pourrait faire lire au serveur un envoi de
 * fichier entier, juste pour s'entendre répondre « connecte-toi ».
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  await next()
}
