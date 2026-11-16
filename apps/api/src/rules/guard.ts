// La garde de l'accord aux règles (tranche R11) : un « middleware » monté sur toutes les routes
// /v1/… (app.ts), juste après celle de la suspension. Un membre qui n'a pas accepté la version des
// règles en vigueur (inscrit avant R11, ou avant une nouvelle version) lit tout, mais ses écritures
// reçoivent 403 `rules_required`, avant le validateur et le quota de la route. Elle laisse passer :
// - tout GET, HEAD et DELETE (décision D1 de la relecture du plan) : lire, et retirer ce qui est à
//   soi (un commentaire, un retour de testeur, une réaction, un suivi) sans avoir à accepter ;
// - les écritures de RULES_ALLOWED_WRITES (décision D4 de Louis, 15/11/2026) : accepter (la sortie
//   de l'écran « Accepter »), et les gestes qu'une suspension permet entièrement, parce que se
//   protéger ne demande pas d'accepter (signaler, bloquer, masquer un commentaire sur son projet,
//   marquer vu ou lu, régler ses e-mails, se désinscrire par le lien d'un e-mail…).
// Se déconnecter et supprimer son compte passent par Better Auth (/api/auth/*), hors de /v1 : la
// garde ne les voit pas. Sans session, elle laisse passer : la session obligatoire répond 401.
//
// Copiée sur la garde de la suspension (suspension/guard.ts, relecture de sécurité S2) : elle
// compare la route TROUVÉE par Hono, à l'égalité exacte, jamais l'adresse demandée. « /v1/me/rulesX »
// ou « /v1/me/rules/x » ne passent donc pas pour l'écran « Accepter », et une adresse inconnue est
// refusée elle aussi (aucune route trouvée). Une route ajoutée un jour est refusée d'office, tant
// que quelqu'un n'a pas décidé de la permettre (route-inventory.test.ts, troisième colonne).
import type { Database } from '@ruche/db'
import type { MiddlewareHandler } from 'hono'
import { errorBody, languageOf } from '../errors'
import { ALLOWED_WRITES, routesOf } from '../suspension/guard'
import type { AppEnv } from '../types'
import { hasAcceptedRules } from './acceptance'

/** Les méthodes qui ne font que lire, ou qu'effacer ce qui est à soi (D1). */
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'DELETE'])

/**
 * Les écritures que la suspension ne permet qu'« en partie » (la route juge le corps : son profil,
 * son projet) ou qu'à un administrateur (la décision de modération). D4 les laisse refusées sans
 * l'accord : changer son profil ou son projet, c'est publier, et modérer suppose les règles.
 */
const PARTLY_ALLOWED_WRITES = new Set([
  'PATCH /v1/me',
  'PATCH /v1/projects/:id',
  'POST /v1/moderation/decisions',
])

/**
 * Les écritures permises sans l'accord aux règles en vigueur, « MÉTHODE modèle » tel que Hono les
 * enregistre (la colonne « sans l'accord » de route-inventory.test.ts, qui la compare à celle-ci).
 * Décision D4 : les écritures entièrement permises pendant une suspension (ALLOWED_WRITES, sans
 * ses DELETE, déjà permis ici par leur méthode, ni les trois « en partie »), dont accepter les
 * règles (POST /v1/me/rules, qui y figure depuis S-B1). Tirée de la liste de la suspension plutôt
 * que recopiée : un geste de protection ajouté là un jour vaut aussi ici, et l'inventaire oblige à
 * le décider pour les deux colonnes.
 */
export const RULES_ALLOWED_WRITES: ReadonlySet<string> = new Set(
  [...ALLOWED_WRITES].filter(
    (route) => !route.startsWith('DELETE ') && !PARTLY_ALLOWED_WRITES.has(route),
  ),
)

/**
 * Permise sans l'accord ? Une écriture ne l'est que si toutes les routes trouvées sont dans la
 * liste. Aucune route trouvée (une adresse inconnue) : refusée aussi, par défaut.
 */
const allowedWrite = (routes: string[]) =>
  routes.length > 0 && routes.every((route) => RULES_ALLOWED_WRITES.has(route))

export const rulesGuard =
  (db: Database): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user')
    if (!user || ALLOWED_METHODS.has(c.req.method) || allowedWrite(routesOf(c))) return next()
    // La seule lecture de la base, et seulement pour une écriture que la liste ne permet pas : une
    // ligne au plus, trouvée par la clé primaire (user_id, version) de rules_acceptance
    // (rules/acceptance.ts). Lue à chaque demande : un accord donné vaut aussitôt.
    if (!(await hasAcceptedRules(db, user.id))) {
      return c.json(errorBody(languageOf(c), 'rules_required'), 403)
    }
    return next()
  }
