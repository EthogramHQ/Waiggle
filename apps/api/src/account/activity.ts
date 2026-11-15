// La dernière activité d'un membre (R11, comptes inactifs) : chaque requête d'un membre connecté
// sur /v1/… la note dans `user.last_active_at`, au plus une fois par jour, et efface
// l'avertissement d'inactivité déjà parti (`user.inactive_notice_at`). La tâche de nuit
// (jobs/inactive-accounts.ts) lit ces deux dates : un compte sans visite depuis 3 ans est prévenu,
// puis supprimé ; une visite, même une seule lecture, suffit à le garder.
//
// Montée dans app.ts juste après la lecture de la session, et avant les gardes de la suspension
// et de l'accord des règles : un compte suspendu, ou qui n'a pas accepté les règles en vigueur,
// visite lui aussi, et ces gardes peuvent refuser sa requête sans que la visite soit perdue.
import { type Database, schema } from '@ruche/db'
import { and, eq, isNotNull, lt, or } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { describeError } from '../log'
import type { AppEnv } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Note la visite de ce membre à l'heure `now`, si la dernière notée a plus de 24 heures, ou si un
 * avertissement d'inactivité est noté : dans ce cas, il est effacé, même quand la visite du jour
 * est déjà notée (un avertissement parti juste après une visite, une sauvegarde restaurée), sinon
 * le compte serait supprimé malgré la visite.
 *
 * Une seule requête : un `update … where`, qui ne réécrit la ligne que si l'une des deux
 * conditions est vraie. Le reste du temps (presque toujours), PostgreSQL trouve la ligne par sa clé
 * primaire (`user.id`), voit qu'elle ne remplit pas le `where` et n'écrit rien : une visite par jour
 * coûte une écriture, les autres requêtes une lecture d'index.
 */
export const noteActivity = async (db: Database, userId: string, now: Date) => {
  await db
    .update(schema.user)
    .set({ lastActiveAt: now, inactiveNoticeAt: null })
    .where(
      and(
        eq(schema.user.id, userId),
        or(
          lt(schema.user.lastActiveAt, new Date(now.getTime() - DAY_MS)),
          isNotNull(schema.user.inactiveNoticeAt),
        ),
      ),
    )
}

/**
 * Le middleware : après la route trouvée par la session, avant tout le reste. Sans membre connecté
 * (visiteur, désinscription par un lien d'e-mail), il ne fait rien. L'heure vient de l'API
 * (`new Date()`), jamais de `now()` en SQL : les tests posent leur propre horloge.
 *
 * Une panne de cette écriture ne fait pas échouer la requête du membre : elle est notée (sans rien
 * de personnel, log.ts) et la visite suivante la rattrape. Un compte n'est de toute façon supprimé
 * qu'un mois après un e-mail, et l'activité est relue juste avant (jobs/inactive-accounts.ts).
 */
export const activityMiddleware =
  (db: Database): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const user = c.get('user')
    if (user) {
      try {
        await noteActivity(db, user.id, new Date())
      } catch (error) {
        console.error(
          'Activity not noted',
          describeError(error, { method: c.req.method, path: c.req.path }),
        )
      }
    }
    await next()
  }
