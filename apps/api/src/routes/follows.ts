// Suivre et ne plus suivre (tranche 4a) : POST et DELETE sur /v1/members/{id}/follow et
// /v1/projects/{id}/follow. Réservé aux membres connectés. La personne ou l'auteur suivi n'est pas
// prévenu (les notifications viendront en tranche 6), et la liste des abonnés n'est lue nulle part.
import { createRoute, z } from '@hono/zod-openapi'
import { MemberId, ProjectId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { visibleTo } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règle anti-abus (voir docs/scenarios/phase-1.md, tranche 4) : 120 changements d'abonnement par
// heure et par membre, suivre et ne plus suivre, membres et projets ensemble.
const followRule: RateRule = { windowMs: 60 * 60 * 1000, max: 120 }

const params = z.object({ id: z.string() })
const done = { description: 'Done (no content).' }

const followMemberRoute = createRoute({
  method: 'post',
  path: '/v1/members/{id}/follow',
  summary: 'Follow a member',
  request: { params },
  responses: {
    204: done,
    400: errorResponse('One cannot follow oneself.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such member, or an account whose email was never verified.'),
    429: errorResponse('Too many follow changes.'),
  },
})

const unfollowMemberRoute = createRoute({
  method: 'delete',
  path: '/v1/members/{id}/follow',
  summary: 'Stop following a member',
  description:
    'Always succeeds for a well-formed identifier, whether the member was followed or not.',
  request: { params },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: errorResponse('Malformed identifier.'),
    429: errorResponse('Too many follow changes.'),
  },
})

const followProjectRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/follow',
  summary: 'Follow a project',
  request: { params },
  responses: {
    204: done,
    400: errorResponse('One cannot follow one’s own project.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such project, or a private project of another member.'),
    429: errorResponse('Too many follow changes.'),
  },
})

const unfollowProjectRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/follow',
  summary: 'Stop following a project',
  description:
    'Always succeeds for a well-formed identifier, even for a project gone private or unknown: ' +
    'the answer reveals nothing.',
  request: { params },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: errorResponse('Malformed identifier.'),
    429: errorResponse('Too many follow changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter }

export const followRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/members/:id/follow', requireUser)
  app.use('/v1/projects/:id/follow', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const ownThing = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'cannot_follow_own'), 400)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }
  // 204 : « c'est fait », sans corps : rien à lire, donc rien qui puisse fuiter.
  const ok = (c: Context<AppEnv>) => c.body(null, 204)

  /**
   * Compte la demande dans le quota du membre, AVANT de regarder ce qu'elle demande : toute demande
   * compte, même pour un identifiant inconnu, et un refus ne change rien en base.
   */
  const overLimit = async (userId: string) => {
    const decision = await limiter.hit(memberCounterKeys(userId).follow, followRule)
    return decision.allowed ? null : decision.retryAfterSeconds
  }

  app.openapi(followMemberRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ne peut désigner personne : « introuvable », sans interroger la base.
    if (!MemberId.safeParse(id).success) return notFound(c)
    if (id === viewer.id) return ownThing(c)
    // Seulement un compte vérifié (comme sa page) ; un compte supprimé n'a plus de ligne.
    const [member] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, id), eq(schema.user.emailVerified, true)))
    if (!member) return notFound(c)

    // « insert … on conflict do nothing » : si la ligne existe déjà (même clé primaire, donc déjà
    // suivi), PostgreSQL n'écrit rien et ne lève pas d'erreur. Suivre deux fois revient ainsi à
    // suivre une fois, même si deux demandes arrivent en même temps.
    await db
      .insert(schema.memberFollow)
      .values({ followerId: viewer.id, memberId: id })
      .onConflictDoNothing()
    return ok(c)
  })

  app.openapi(unfollowMemberRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    if (!MemberId.safeParse(id).success) return notFound(c)
    // Efface seulement l'abonnement du membre qui demande, s'il existe ; sinon, rien à faire. On ne
    // cherche rien d'autre : la réponse est la même que le membre existe ou non.
    await db
      .delete(schema.memberFollow)
      .where(
        and(eq(schema.memberFollow.followerId, viewer.id), eq(schema.memberFollow.memberId, id)),
      )
    return ok(c)
  })

  app.openapi(followProjectRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ferait échouer la requête SQL (ce n'est pas un uuid).
    if (!ProjectId.safeParse(id).success) return notFound(c)
    // Le projet, s'il est visible par le membre (public, ou le sien) : un projet privé d'un autre
    // reçoit la même réponse qu'un projet inconnu.
    const [project] = await db
      .select({ authorId: schema.project.authorId })
      .from(schema.project)
      .where(and(eq(schema.project.id, id), visibleTo(viewer.id)))
    if (!project) return notFound(c)
    if (project.authorId === viewer.id) return ownThing(c)

    await db
      .insert(schema.projectFollow)
      .values({ followerId: viewer.id, projectId: id })
      .onConflictDoNothing()
    return ok(c)
  })

  app.openapi(unfollowProjectRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    if (!ProjectId.safeParse(id).success) return notFound(c)
    // Même principe que pour un membre : on peut toujours se désabonner, même d'un projet devenu
    // privé, et la réponse ne dit rien du projet.
    await db
      .delete(schema.projectFollow)
      .where(
        and(eq(schema.projectFollow.followerId, viewer.id), eq(schema.projectFollow.projectId, id)),
      )
    return ok(c)
  })

  return app
}
