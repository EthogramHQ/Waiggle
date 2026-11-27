// Les ruches (R10), le cœur : mes ruches (GET /v1/hives), créer (POST), la page d'une ruche (GET
// /v1/hives/{id}), la changer (PATCH) ou la supprimer (DELETE), son actualité, ses projets réservés
// et ses membres, retirer un membre ou la quitter (DELETE …/members/{userId}), confier l'animation
// (POST …/animator). Les invitations ont leurs routes à part (routes/hive-invitations.ts).
//
// L'ordre des vérifications, le même partout (charte du pôle code) : la session, puis le quota
// (chaque demande compte, même mal formée), puis l'identifiant (mal formé → 404 sans lire la base),
// puis la ruche : un non-membre reçoit le 404 d'une ruche qui n'existe pas, mot pour mot ; un
// membre qui n'anime pas, 403. Les lectures sont dans hives/load.ts, les écritures dans
// hives/write.ts.
//
// Un membre suspendu lit ses ruches et peut les quitter. La garde (suspension/guard.ts) refuse déjà
// ses POST et PATCH ; elle laisse passer tout DELETE : retirer un membre et supprimer la ruche se
// refusent donc ici (403 `suspended`, relecture du plan, point 2).
import { createRoute, z } from '@hono/zod-openapi'
import {
  HiveActivityPage,
  HiveAnimator,
  HiveCreate,
  HiveMembers,
  HivePage,
  HivePageQuery,
  HivePatch,
  HiveProjectsPage,
  HiveSummary,
  MemberId,
  MyHives,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { setPollen } from '../game/award'
import { pollenHeaders } from '../game/gesture'
import {
  hiveSummariesOf,
  loadHiveActivity,
  loadHiveMembers,
  loadHivePage,
  loadHiveProjects,
  loadMyHives,
  membershipOf,
  readHivePageMark,
} from '../hives/load'
import {
  changeHive,
  createHive,
  deleteHive,
  type HiveDeparture,
  handAnimation,
  isForeignKeyViolation,
  markHiveSeen,
  removeFromHive,
} from '../hives/write'
import { hiveChanged, type Live, toOwnDevices } from '../live/emit'
import { projectTopics, recheckMembers, recheckTopics } from '../live/recheck'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { isSuspended } from '../suspension/load'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const HOUR = 60 * 60 * 1000
// Les quotas (relecture de sécurité du plan, point 7) : les écritures, 120 par heure, toutes ruches
// ensemble ; les lectures, 600 par heure, comme le Fil (chacune recalcule 30 jours d'actualité).
const writeRule: RateRule = { windowMs: HOUR, max: 120 }
const readRule: RateRule = { windowMs: HOUR, max: 600 }

const idParam = z.object({ id: z.string() })
const memberParams = z.object({ id: z.string(), userId: z.string() })
const done = { description: 'Done (no content).' }
const notFound404 = errorResponse(
  'No such hive for this member: unknown, malformed, or a hive they are not (or no longer) in.',
)
const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

const myHivesRoute = createRoute({
  method: 'get',
  path: '/v1/hives',
  summary: 'My hives and my invitations',
  responses: {
    200: json(MyHives, 'My hives (most recently active first), my valid invitations.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many reads.'),
  },
})

const createHiveRoute = createRoute({
  method: 'post',
  path: '/v1/hives',
  summary: 'Create a hive',
  description:
    'The creator becomes its animator and only member. 10 created and 20 joined at most.',
  request: { body: { required: true, content: { 'application/json': { schema: HiveCreate } } } },
  responses: {
    // R19 : la création peut porter le pollen gagné (game/award.ts).
    201: { ...json(HiveSummary, 'The new hive.'), headers: pollenHeaders },
    400: errorResponse('Invalid name or icon.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A suspended account.'),
    409: errorResponse('`hives_created_limit` or `hives_joined_limit`.'),
    429: errorResponse('Too many hive writes.'),
  },
})

const pageRoute = createRoute({
  method: 'get',
  path: '/v1/hives/{id}',
  summary: 'Open the page of a hive',
  description: 'For its members only. Opening the page marks the visit (the news count from it).',
  request: { params: idParam },
  responses: {
    200: json(HivePage, 'The page.'),
    401: errorResponse('Not signed in.'),
    404: notFound404,
    429: errorResponse('Too many reads.'),
  },
})

const changeRoute = createRoute({
  method: 'patch',
  path: '/v1/hives/{id}',
  summary: 'Change a hive (its animator)',
  request: {
    params: idParam,
    body: { required: true, content: { 'application/json': { schema: HivePatch } } },
  },
  responses: {
    200: json(HivePage, 'The page, changed.'),
    400: errorResponse('Invalid change.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A member who does not animate the hive, or a suspended account.'),
    404: notFound404,
    422: errorResponse('A project the whole hive cannot see (`pin_not_visible`).'),
    429: errorResponse('Too many hive writes.'),
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/hives/{id}',
  summary: 'Delete a hive (its animator)',
  description: 'Its reserved projects become private for their authors.',
  request: { params: idParam },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('A member who does not animate the hive (`forbidden`), or `suspended`.'),
    404: notFound404,
    429: errorResponse('Too many hive writes.'),
  },
})

const activityRoute = createRoute({
  method: 'get',
  path: '/v1/hives/{id}/activity',
  summary: 'The activity of a hive',
  request: { params: idParam, query: HivePageQuery },
  responses: {
    200: json(HiveActivityPage, '30 days, newest first, 20 per page.'),
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: notFound404,
    429: errorResponse('Too many reads.'),
  },
})

const projectsRoute = createRoute({
  method: 'get',
  path: '/v1/hives/{id}/projects',
  summary: 'The projects reserved to a hive',
  request: { params: idParam, query: HivePageQuery },
  responses: {
    200: json(HiveProjectsPage, 'Newest first, 20 per page.'),
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: notFound404,
    429: errorResponse('Too many reads.'),
  },
})

const membersRoute = createRoute({
  method: 'get',
  path: '/v1/hives/{id}/members',
  summary: 'The members of a hive',
  request: { params: idParam },
  responses: {
    200: json(HiveMembers, 'The animator first, then by date of entry.'),
    401: errorResponse('Not signed in.'),
    404: notFound404,
    429: errorResponse('Too many reads.'),
  },
})

const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/v1/hives/{id}/members/{userId}',
  summary: 'Leave a hive (oneself), or remove a member (its animator)',
  description:
    'Reserved projects of the member become private. An animator who leaves hands the animation ' +
    'to the oldest member; the last member leaving deletes the hive.',
  request: { params: memberParams },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('A member removing another (`forbidden`), or a suspended animator.'),
    404: notFound404,
    429: errorResponse('Too many hive writes.'),
  },
})

const animatorRoute = createRoute({
  method: 'post',
  path: '/v1/hives/{id}/animator',
  summary: 'Hand the animation over to another member',
  request: {
    params: idParam,
    body: { required: true, content: { 'application/json': { schema: HiveAnimator } } },
  },
  responses: {
    204: done,
    400: errorResponse('Invalid member.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A member who does not animate the hive, or a suspended account.'),
    404: errorResponse('No such hive for this member, or a member who is not in it.'),
    429: errorResponse('Too many hive writes.'),
  },
})

/** R21 : `live`, la base et le bus du temps réel (live/emit.ts). */
type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string; live: Live }

export const hiveRoutes = ({ db, limiter, publicApiUrl, live }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use('/v1/hives', requireUser)
  app.use('/v1/hives/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const invalid = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'validation'), 400)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const suspended = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'suspended'), 403)

  // Un « middleware » (une fonction qui passe avant la route, et peut répondre à sa place) qui
  // compte la demande dans le compteur du membre et répond 429 au-delà de la règle. Posé AVANT la
  // vérification de la demande (que Hono place juste avant la route) : chaque demande compte, même
  // mal écrite (un corps qui n'est pas un objet, une icône inconnue).
  const quota =
    (counter: 'hiveWrite' | 'hiveRead', rule: RateRule) =>
    async (c: Context<AppEnv>, next: () => Promise<void>) => {
      const user = c.get('user')
      if (!user) return unauthorized(c)
      const decision = await limiter.hit(memberCounterKeys(user.id)[counter], rule)
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
      await next()
    }
  const reads = quota('hiveRead', readRule)
  const writes = quota('hiveWrite', writeRule)
  app.on('GET', ['/v1/hives', '/v1/hives/:id', '/v1/hives/:id/activity'], reads)
  app.on('GET', ['/v1/hives/:id/projects', '/v1/hives/:id/members'], reads)
  app.on('POST', ['/v1/hives', '/v1/hives/:id/animator'], writes)
  app.on(['PATCH', 'DELETE'], '/v1/hives/:id', writes)
  app.on('DELETE', '/v1/hives/:id/members/:userId', writes)

  /** Une écriture dont la ruche (ou un membre) a disparu en route : 23503 → 404, jamais 500. */
  const orGone = async <T>(write: () => Promise<T>): Promise<T | 'not_found'> => {
    try {
      return await write()
    } catch (error) {
      if (isForeignKeyViolation(error)) return 'not_found'
      throw error
    }
  }

  /**
   * R21 : après une suppression ou un départ (la transaction finie, avant la réponse).
   * 1. La revérification (live/recheck.ts) : qui ne peut plus lire la ruche, ses projets rendus
   *    privés ou leurs coins reçoit `gone` ; `leaver`, le membre parti ou retiré, est revérifié sur
   *    tous ses sujets (la ruche, les projets réservés des autres, leurs coins).
   * 2. La page de la ruche, pour ses membres restants (un membre de moins, un nouvel animateur).
   * 3. Le `me` des membres concernés : leur liste de ruches (`hive`) et, pour qui lit un avis neuf
   *    (ruche supprimée, retiré, nouvel animateur), leur Activité. Ce sont leurs propres avis,
   *    écrits par la transaction : aucun filtre de plus (`toOwnDevices`).
   */
  const departed = async (
    hiveId: string,
    actorId: string,
    outcome: HiveDeparture,
    leaver: string | null,
  ) => {
    await recheckTopics(live, [
      ...(outcome.hiveDeleted ? [`hive:${hiveId}`] : []),
      ...projectTopics(outcome.privatized),
    ])
    if (leaver !== null) await recheckMembers(live, [leaver])
    if (!outcome.hiveDeleted) await hiveChanged(live, { hiveId, actorId })
    toOwnDevices(live, [...outcome.noticed, ...(leaver === null ? [] : [leaver])], 'hive')
    toOwnDevices(live, outcome.noticed, 'notifications')
  }

  app.openapi(myHivesRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const mine = await loadMyHives(db, viewer.id, publicApiUrl, new Date())
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(MyHives.parse(mine), 200)
  })

  app.openapi(createHiveRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const now = new Date()
    // Le nom arrive sans ses espaces de bord (HiveName fait le `trim`).
    const outcome = await createHive(db, viewer.id, c.req.valid('json'), now)
    if (outcome === 'hives_created_limit' || outcome === 'hives_joined_limit') {
      return c.json(errorBody(languageOf(c), outcome), 409)
    }
    const [summary] = await hiveSummariesOf(db, viewer.id, [outcome.id], publicApiUrl, now)
    // Elle vient d'être créée, avec son créateur pour membre : son absence serait une erreur du code.
    if (!summary) throw new Error('The hive just created has no summary')
    setPollen(c, outcome.pollen)
    return c.json(HiveSummary.parse(summary), 201)
  })

  app.openapi(pageRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    const now = new Date()
    // La visite d'abord : la ligne de la page compte déjà zéro nouveauté.
    await markHiveSeen(db, membership.hiveId, viewer.id, now)
    const page = await loadHivePage(db, viewer.id, membership, publicApiUrl, now)
    if (!page) return notFound(c)
    return c.json(HivePage.parse(page), 200)
  })

  app.openapi(changeRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    if (membership.role !== 'animator') return forbidden(c)
    const now = new Date()
    const outcome = await orGone(() =>
      changeHive(db, membership.hiveId, viewer.id, c.req.valid('json'), now),
    )
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return forbidden(c)
    if (outcome === 'pin_not_visible') {
      return c.json(errorBody(languageOf(c), 'pin_not_visible'), 422)
    }
    // R21 : son nom, son icône ou son épingle ont changé : sa page se relit chez ses membres.
    await hiveChanged(live, { hiveId: membership.hiveId, actorId: viewer.id })
    // Relue après la transaction (sous PGlite, une lecture par `db` pendant elle attendrait).
    const fresh = await membershipOf(db, membership.hiveId, viewer.id)
    const page = fresh && (await loadHivePage(db, viewer.id, fresh, publicApiUrl, now))
    if (!page) return notFound(c)
    return c.json(HivePage.parse(page), 200)
  })

  app.openapi(deleteRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    if (membership.role !== 'animator') return forbidden(c)
    const now = new Date()
    if (await isSuspended(db, viewer.id, now)) return suspended(c)
    const outcome = await orGone(() => deleteHive(db, membership.hiveId, viewer.id, now))
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return forbidden(c)
    await departed(membership.hiveId, viewer.id, outcome, null)
    return c.body(null, 204)
  })

  app.openapi(activityRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    // Le marque-page vient du client : sa forme est vérifiée ici, et il n'entre dans la requête que
    // par des paramètres liés. Un marque-page qui ne veut rien dire est refusé (400).
    const cursor = readHivePageMark(c.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(c)
    const page = await loadHiveActivity(
      db,
      viewer.id,
      membership.hiveId,
      cursor,
      publicApiUrl,
      new Date(),
    )
    return c.json(HiveActivityPage.parse(page), 200)
  })

  app.openapi(projectsRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    const cursor = readHivePageMark(c.req.valid('query').cursor)
    if (cursor === 'invalid') return invalid(c)
    const page = await loadHiveProjects(db, viewer.id, membership.hiveId, cursor, publicApiUrl)
    return c.json(HiveProjectsPage.parse(page), 200)
  })

  app.openapi(membersRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    const members = await loadHiveMembers(db, viewer.id, membership, publicApiUrl)
    return c.json(HiveMembers.parse({ members }), 200)
  })

  app.openapi(removeMemberRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const { id, userId } = c.req.valid('param')
    const membership = await membershipOf(db, id, viewer.id)
    if (!membership || !MemberId.safeParse(userId).success) return notFound(c)
    const now = new Date()
    if (userId !== viewer.id) {
      // Retirer un autre : le geste de l'animateur, refusé s'il est suspendu (la garde laisse passer
      // les DELETE). Quitter, lui, reste toujours permis.
      if (membership.role !== 'animator') return forbidden(c)
      if (await isSuspended(db, viewer.id, now)) return suspended(c)
    }
    const outcome = await orGone(() =>
      removeFromHive(db, membership.hiveId, viewer.id, userId, now),
    )
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return forbidden(c)
    await departed(membership.hiveId, viewer.id, outcome, userId)
    return c.body(null, 204)
  })

  app.openapi(animatorRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const membership = await membershipOf(db, c.req.valid('param').id, viewer.id)
    if (!membership) return notFound(c)
    if (membership.role !== 'animator') return forbidden(c)
    const { userId } = c.req.valid('json')
    const outcome = await orGone(() =>
      handAnimation(db, membership.hiveId, viewer.id, userId, new Date()),
    )
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'forbidden') return forbidden(c)
    // R21 : un nouvel animateur. Sa page se relit chez les membres, et l'Activité du successeur
    // (« Tu animes maintenant la ruche… ») sur ses appareils. Confier à soi-même ne change rien.
    if (userId !== viewer.id) {
      await hiveChanged(live, { hiveId: membership.hiveId, actorId: viewer.id })
      toOwnDevices(live, [userId], 'notifications')
    }
    return c.body(null, 204)
  })

  return app
}
