// Les routes du blocage (tranche 7b), réservées aux membres connectés :
// - PUT /v1/members/{id}/block : bloquer un membre ; 204, et bloquer deux fois ne change rien ;
// - DELETE /v1/members/{id}/block : débloquer ; 204 à tout identifiant bien formé ;
// - GET /v1/me/blocks : la liste « Membres bloqués », du plus récent au plus ancien.
// Le membre bloqué n'est jamais prévenu : aucune notification, aucun e-mail ne part d'ici.
import { createRoute, z } from '@hono/zod-openapi'
import {
  BLOCKS_PER_DAY,
  BlockedPage,
  BlocksQuery,
  MemberId,
  UNBLOCKS_PER_DAY,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { loadBlockedPage, readBlocksCursor } from '../blocks/list'
import { blockMember, unblockMember } from '../blocks/write'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Anti-abus (scénario 7b) : 100 blocages et 100 déblocages par jour et par membre, chacun son
// compteur (règle 10 de la relecture du plan).
const DAY = 24 * 60 * 60 * 1000
const blockRule: RateRule = { windowMs: DAY, max: BLOCKS_PER_DAY }
const unblockRule: RateRule = { windowMs: DAY, max: UNBLOCKS_PER_DAY }

const params = z.object({ id: z.string() })
const done = { description: 'Done (no content).' }

const blockRoute = createRoute({
  method: 'put',
  path: '/v1/members/{id}/block',
  summary: 'Block a member',
  description:
    'Idempotent. Neither member sees the contents of the other any more, and the follows ' +
    'between them (members and projects, both ways) are removed for good. The blocked member is ' +
    'not told.',
  request: { params },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such member, an account whose email was never verified, or one who blocked the viewer (the same answer).',
    ),
    422: errorResponse('One cannot block oneself.'),
    429: errorResponse('Too many blocks today.'),
  },
})

const unblockRoute = createRoute({
  method: 'delete',
  path: '/v1/members/{id}/block',
  summary: 'Unblock a member',
  description:
    'Always succeeds for a well-formed identifier, whether the member was blocked, exists, or ' +
    'blocked the viewer: the answer reveals nothing. Removes only the block set by the viewer.',
  request: { params },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: errorResponse('Malformed identifier.'),
    429: errorResponse('Too many unblocks today.'),
  },
})

const listRoute = createRoute({
  method: 'get',
  path: '/v1/me/blocks',
  summary: 'The members I blocked',
  description: 'Newest first, 50 per page. Never the members who blocked me.',
  request: { query: BlocksQuery },
  responses: {
    200: {
      description: 'A page of blocked members.',
      content: { 'application/json': { schema: BlockedPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const blockRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/members/:id/block', requireUser)
  app.use('/v1/me/blocks', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }
  // 204 : « c'est fait », sans corps : rien à lire, donc rien qui puisse fuiter.
  const ok = (c: Context<AppEnv>) => c.body(null, 204)

  /**
   * Compte la demande dans un quota du membre, AVANT de regarder ce qu'elle demande : toute demande
   * compte, même pour un identifiant inconnu ou soi-même, et un refus ne change rien en base.
   */
  const overLimit = async (key: string, rule: RateRule) => {
    const decision = await limiter.hit(key, rule)
    return decision.allowed ? null : decision.retryAfterSeconds
  }

  app.openapi(blockRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(memberCounterKeys(viewer.id).block, blockRule)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ne peut désigner personne : « introuvable », sans interroger la base.
    if (!MemberId.safeParse(id).success) return notFound(c)
    // 422 : la demande est comprise, mais elle n'a pas de sens (la base le refuserait aussi :
    // contrainte member_block_not_self).
    if (id === viewer.id) return c.json(errorBody(languageOf(c), 'cannot_block_own'), 422)
    // Inconnu, jamais vérifié, ou qui m'a bloqué : la même réponse, mot pour mot (blocks/write.ts).
    const blocked = await blockMember(db, viewer.id, id, new Date())
    return blocked ? ok(c) : notFound(c)
  })

  app.openapi(unblockRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(memberCounterKeys(viewer.id).unblock, unblockRule)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    if (!MemberId.safeParse(id).success) return notFound(c)
    // Débloquer est permis même si l'autre est devenu invisible : la table des membres n'est même
    // pas lue (règle 6), seule ma ligne de blocage s'efface.
    await unblockMember(db, viewer.id, id)
    return ok(c)
  })

  app.openapi(listRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    // Un curseur qui ne veut rien dire est refusé (400), comme toute donnée invalide, plutôt que de
    // renvoyer en silence la première page.
    const cursor = readBlocksCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return c.json(errorBody(languageOf(c), 'validation'), 400)
    const page = await loadBlockedPage(db, viewer.id, cursor, publicApiUrl)
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(BlockedPage.parse(page), 200)
  })

  return app
}
