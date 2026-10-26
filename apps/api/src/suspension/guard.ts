// La garde des comptes suspendus (tranche 7c) : un « middleware » monté sur toutes les routes /v1/…
// (app.ts), qui met un compte suspendu en lecture seule. Elle laisse passer :
// - tout GET (et HEAD) : lire ce qu'il lisait avant, exporter ses données ;
// - tout DELETE : supprimer ses contenus, retirer ses réactions, ne plus suivre, débloquer ;
// - une courte liste de gestes permis (ALLOWED_WRITES) : signaler, bloquer, masquer un commentaire
//   sur son projet, marquer ses notifications vues, régler ses e-mails, sa langue (PATCH /v1/me,
//   que la route restreint elle-même à la langue : S9), se désinscrire par le lien d'un e-mail, et
//   la décision de modération (un administrateur suspendu n'en est plus un : la garde de la
//   modération lui répond le même 404 qu'à tout membre, S16 et S19).
// Tout le reste reçoit 403 `suspended`, avant le validateur et avant le quota de la route : elle
// est montée avant toutes les routes. Une route ajoutée un jour est donc refusée d'office, tant
// que quelqu'un n'a pas décidé de la permettre (route-inventory.test.ts oblige à décider).
//
// Relecture de sécurité S2 : la garde compare la route TROUVÉE par Hono (sa méthode et son modèle,
// « PUT /v1/members/:id/block »), à l'égalité exacte, jamais l'adresse demandée par une expression
// régulière ou un « commence par » : « /v1/reports/../projects » ou « /v1/reportsX » ne peuvent
// pas se faire passer pour une route permise. Les routes de Better Auth (/api/auth/* : changer
// d'adresse, supprimer son compte, se déconnecter) ne sont pas sous /v1 : la garde ne les voit pas.
// Sans session (S14), elle laisse passer : la session obligatoire de chaque route répond 401.
import type { Database } from '@ruche/db'
import type { MiddlewareHandler } from 'hono'
import { matchedRoutes } from 'hono/route'
import { errorBody, languageOf } from '../errors'
import type { AppEnv } from '../types'
import { isSuspended } from './load'

/** Les méthodes qui ne font que lire, ou qu'effacer ce qui est à soi. */
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'DELETE'])

/**
 * Les écritures permises à un compte suspendu, « MÉTHODE modèle » tel que Hono les enregistre
 * (la même écriture que route-inventory.test.ts, colonne « allowed »).
 */
export const ALLOWED_WRITES: ReadonlySet<string> = new Set([
  'POST /v1/reports',
  'PUT /v1/members/:id/block',
  'PUT /v1/projects/:id/comments/:commentId/hide',
  'PUT /v1/notifications/seen',
  'PATCH /v1/me/email-preferences',
  'PATCH /v1/me',
  'POST /v1/email/unsubscribe',
  'POST /v1/moderation/decisions',
])

/**
 * Les routes que Hono a trouvées pour cette requête, sans les middlewares (méthode « ALL », comme
 * celui-ci ou la limite de taille). `matchedRoutes` (hono/route) les donne toutes, dans l'ordre
 * d'enregistrement : une route de @hono/zod-openapi y figure plusieurs fois (son validateur, son
 * garde de quota, puis elle-même), toujours sous la même méthode et le même modèle.
 */
const routesOf = (c: Parameters<MiddlewareHandler<AppEnv>>[0]) =>
  matchedRoutes(c)
    .filter((route) => route.method !== 'ALL')
    .map((route) => `${route.method} ${route.path}`)

/**
 * Permise à un compte suspendu ? Une écriture ne l'est que si toutes les routes trouvées sont dans
 * la liste. Aucune route trouvée (une adresse inconnue) : refusée aussi, par défaut.
 */
const allowedWrite = (routes: string[]) =>
  routes.length > 0 && routes.every((route) => ALLOWED_WRITES.has(route))

export const suspensionGuard =
  (db: Database): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user')
    if (!user || ALLOWED_METHODS.has(c.req.method) || allowedWrite(routesOf(c))) return next()
    // La seule lecture de la base, et seulement pour une écriture refusée à un suspendu : la ligne
    // non close du membre, par l'index unique partiel (suspension/load.ts). L'heure de JavaScript :
    // la fin se lit à la milliseconde, sans tâche planifiée (S10).
    if (await isSuspended(db, user.id, new Date())) {
      return c.json(errorBody(languageOf(c), 'suspended'), 403)
    }
    return next()
  }
