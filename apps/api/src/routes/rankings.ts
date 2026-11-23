// Les classements de la semaine (R19, choix 14) : GET /v1/rankings?scope=close (soi et ceux que l'on
// suit) et GET /v1/rankings?scope=hive&hive=<id> (les membres d'une ruche). La lecture elle-même est
// dans game/rankings.ts.
//
// L'ordre des vérifications, le même partout (charte du pôle code) : la session, puis le quota
// (chaque demande compte, même mal formée), puis la requête (400 `validation`), puis la ruche : un
// non-membre reçoit le 404 d'une ruche qui n'existe pas, mot pour mot, comme sur GET /v1/hives/{id}.
// Enfin le réglage du lecteur : retiré des classements, il ne les lit plus (403 `rankings_off`).
// Un membre suspendu les lit encore (une lecture : la garde de la suspension ne la refuse pas).
import { createRoute } from '@hono/zod-openapi'
import { Ranking, RankingQuery } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { inRankings, loadRanking, type RankingCircle } from '../game/rankings'
import { membershipOf } from '../hives/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Le quota (règle « À surveiller » du plan : une lecture calculée à chaque appel) : 120 par heure,
// mal formées comprises.
const HOUR = 60 * 60 * 1000
const rankingsRule: RateRule = { windowMs: HOUR, max: 120 }

const rankingRoute = createRoute({
  method: 'get',
  path: '/v1/rankings',
  summary: 'Read the ranking of the week',
  description:
    'The pollen earned since Monday (Paris time) by the viewer and the members they follow ' +
    '(`scope=close`), or by the members of one of their hives (`scope=hive&hive=<id>`). Only ' +
    'members who earned pollen this week, 50 at most; never an example account, a member who ' +
    'opted out, nor one blocked either way.',
  request: { query: RankingQuery },
  responses: {
    200: {
      description: 'The ranking, ties sharing a rank; possibly empty.',
      content: { 'application/json': { schema: Ranking } },
    },
    400: errorResponse('An unknown scope, a hive without `scope=hive`, or the reverse.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('`rankings_off`: the viewer opted out of the rankings.'),
    404: errorResponse('No such hive for this member: unknown, or a hive they are not in.'),
    429: errorResponse('Too many reads.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const rankingRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (quota compris).
  app.use('/v1/rankings', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)

  // Le quota, dans un « middleware » posé avant la route : Hono vérifie la requête (le schéma
  // RankingQuery) juste avant la route, donc après lui ; une demande mal formée compte aussi.
  app.on('GET', '/v1/rankings', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).rankings, rankingsRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  app.openapi(rankingRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const query = c.req.valid('query')
    let circle: RankingCircle = { scope: 'close' }
    if (query.scope === 'hive') {
      // RankingQuery garantit `hive` avec `scope=hive` ; on le redit pour le typage.
      if (query.hive === undefined) return c.json(errorBody(languageOf(c), 'validation'), 400)
      // La même lecture que la page de la ruche : inconnue ou pas la sienne, le même 404.
      const membership = await membershipOf(db, query.hive, viewer.id)
      if (!membership) return c.json(errorBody(languageOf(c), 'not_found'), 404)
      circle = { scope: 'hive', hiveId: membership.hiveId }
    }
    if (!(await inRankings(db, viewer.id))) {
      return c.json(errorBody(languageOf(c), 'rankings_off'), 403)
    }
    const ranking = await loadRanking(db, viewer.id, circle, publicApiUrl, new Date())
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(Ranking.parse(ranking), 200)
  })

  return app
}
