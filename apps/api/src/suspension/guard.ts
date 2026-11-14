// La garde des comptes suspendus (tranche 7c) : un « middleware » monté sur toutes les routes /v1/…
// (app.ts), qui met un compte suspendu en lecture seule. Elle laisse passer :
// - tout GET (et HEAD) : lire ce qu'il lisait avant, exporter ses données ;
// - tout DELETE : supprimer ses contenus, retirer ses réactions, ne plus suivre, débloquer ;
// - une courte liste de gestes permis (ALLOWED_WRITES) : signaler, bloquer, masquer un commentaire
//   sur son projet, marquer ses notifications vues, régler ses e-mails, sa langue (PATCH /v1/me,
//   que la route restreint elle-même : S9 ; depuis R9, aussi vider sa bio ou ses outils, et choisir
//   un nom ou un pseudo provisoire), passer son projet en privé (PATCH /v1/projects/:id, restreint
//   par la route au seul `{ visibility: 'private' }`, R9), se désinscrire par le lien d'un e-mail, et
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
  // R4 : lire son fil et écarter une suggestion ne touchent que ce qui est à lui, comme « vu ».
  'PUT /v1/feed/read',
  'PUT /v1/suggestions/members/:id/dismissed',
  // R7a : supprimer sa mise à jour reste permis (ce qui défait ne punit pas, comme « Retirer »).
  'DELETE /v1/projects/:id/updates/:updateId',
  // R7b : marquer un fil lu ne touche qu'à sa propre date de lecture, comme « vu ». « Marquer comme
  // réglé » est permis pour que la route réponde elle-même 409 `corner_closed` à un auteur
  // suspendu (le coin est fermé), comme « Remettre à traiter » (un DELETE) : sécurité A7.
  'POST /v1/projects/:id/threads/:testerId/read',
  'POST /v1/projects/:id/messages/:messageId/settled',
  'PATCH /v1/me/email-preferences',
  // Permises « en partie » (R9, relecture de sécurité P7) : la route juge elle-même le corps, par
  // `suspendedProfileChange` et `suspendedProjectChange` ci-dessous, et répond 403 `suspended` à
  // tout le reste (route-inventory.test.ts, colonne « partial »).
  'PATCH /v1/me',
  'PATCH /v1/projects/:id',
  'POST /v1/email/unsubscribe',
  'POST /v1/moderation/decisions',
])

/** Un objet JSON (pas un tableau, ni null) : le seul corps dont on puisse juger les clés. */
export const isJsonObject = (body: unknown): body is Record<string, unknown> =>
  typeof body === 'object' && body !== null && !Array.isArray(body)

/**
 * R9 (P7) : ce qu'un compte suspendu peut encore changer à son profil. Retirer, jamais ajouter
 * (jur-R5) : vider sa bio (`''`) et ses outils favoris (`[]`) ; changer sa langue ; choisir un nom
 * ou un pseudo tant que celui qu'il a est provisoire (mis d'office par la modération). Toute autre
 * clé, ou une autre valeur, est refusée, même la valeur actuelle. Le corps est celui que le
 * validateur lira ensuite (lu une seule fois) : pour une clé répétée, JSON garde la dernière, c'est
 * donc bien la valeur qui serait écrite qui est jugée ici.
 */
export const suspendedProfileChange = (
  body: Record<string, unknown>,
  provisional: { name: boolean; handle: boolean },
) =>
  Object.entries(body).every(([key, value]) => {
    switch (key) {
      case 'language':
        return true
      case 'bio':
        return value === ''
      case 'favoriteTools':
        return Array.isArray(value) && value.length === 0
      case 'name':
        return provisional.name
      case 'handle':
        return provisional.handle
      default:
        return false
    }
  })

/**
 * R9 (P7, décision L6 de Louis) : un compte suspendu peut seulement passer son projet en privé,
 * jamais en public, et rien d'autre dans la même demande. Le corps doit être exactement
 * `{ "visibility": "private" }`. Les droits sur le projet restent vérifiés par la route : le projet
 * d'une autre répond 403, comme à tout membre.
 */
export const suspendedProjectChange = (body: unknown) =>
  isJsonObject(body) && Object.keys(body).length === 1 && body.visibility === 'private'

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
