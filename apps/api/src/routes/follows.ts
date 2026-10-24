// Suivre et ne plus suivre (tranche 4a) : POST et DELETE sur /v1/members/{id}/follow et
// /v1/projects/{id}/follow. Réservé aux membres connectés. La personne ou l'auteur suivi en est
// prévenu par ses notifications (tranche 6b), par un nombre, jamais par un nom : la liste des
// abonnés n'est lue nulle part.
import { createRoute, z } from '@hono/zod-openapi'
import { MemberId, ProjectId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { notBlockedWith } from '../blocks/visibility'
import { blockedPair, lockPair } from '../blocks/write'
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

  /**
   * Écrit un abonnement, sauf s'il existe un blocage entre moi et l'autre membre (règle 5 de la
   * relecture du plan 7b). Renvoie false s'il y en a un : la route répond alors « introuvable ».
   *
   * Tout se passe dans une transaction, sous le verrou de la paire (blocks/write.ts, `lockPair`),
   * que bloquer prend aussi : un blocage en cours finit avant que le suivi ne relise quoi que ce
   * soit, et un blocage qui arrive ensuite attend la fin du suivi, puis efface l'abonnement.
   *
   * L'écriture : « insert … select … where not exists (blocage) on conflict do nothing returning ».
   * Le `select` sans `from` fabrique une seule ligne (moi, la cible, la date) ; le `where` la garde
   * seulement s'il n'y a aucun blocage (deux `exists`, chacun servi par un index de member_block) ;
   * `on conflict do nothing` : déjà suivi, PostgreSQL n'écrit rien et ne lève pas d'erreur, et
   * suivre deux fois revient à suivre une fois. `returning` dit si une ligne a été écrite. Sinon,
   * deux raisons possibles, que l'on départage par une dernière lecture, sous le même verrou :
   * déjà suivi (c'est fait : 204), ou bloqués (404).
   */
  const followUnlessBlocked = ({
    viewerId,
    otherMemberId,
    insert,
  }: {
    viewerId: string
    otherMemberId: string
    insert: (now: SQL) => SQL
  }): Promise<boolean> =>
    db.transaction(async (tx) => {
      await lockPair(tx, viewerId, otherMemberId)
      // La date passe par la colonne (sql.param), comme dans cursor.ts : jamais écrite dans le
      // texte SQL, et toujours en heure UTC.
      const now = sql`${sql.param(new Date(), schema.memberFollow.createdAt)}::timestamp`
      const result = await tx.execute(
        sql`${insert(now)} where ${notBlockedWith(viewerId, sql`${otherMemberId}`)}
          on conflict do nothing returning follower_id`,
      )
      // Les lignes d'un `execute` brut ne sont pas typées : Zod les vérifie.
      const { rows } = z
        .object({ rows: z.array(z.object({ follower_id: z.string() })) })
        .parse(result)
      if (rows.length > 0) return true
      return !(await blockedPair(tx, viewerId, otherMemberId))
    })

  app.openapi(followMemberRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ne peut désigner personne : « introuvable », sans interroger la base.
    if (!MemberId.safeParse(id).success) return notFound(c)
    if (id === viewer.id) return ownThing(c)
    // Seulement un compte vérifié (comme sa page) ; un compte supprimé n'a plus de ligne. Un membre
    // bloqué avec moi, dans un sens ou dans l'autre (tranche 7b) : « introuvable » aussi, comme
    // un inconnu.
    const [member] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.id, id),
          eq(schema.user.emailVerified, true),
          // L'identifiant passé comme valeur (paramètre lié), pas comme colonne : PostgreSQL lit
          // alors chaque `exists` une seule fois, par la clé primaire de member_block, au lieu de
          // ranger dans une table de hachage tous les blocages du visiteur.
          notBlockedWith(viewer.id, sql`${id}`),
        ),
      )
    if (!member) return notFound(c)

    // La date vient de l'horloge de JavaScript, pas de la valeur par défaut de la base (now() en
    // SQL) : elle date la notification « de nouveaux abonnés » (tranche 6b), et les tests la
    // maîtrisent ainsi.
    const followed = await followUnlessBlocked({
      viewerId: viewer.id,
      otherMemberId: id,
      insert: (now) => sql`insert into ${schema.memberFollow} (follower_id, member_id, created_at)
        select ${viewer.id}, ${id}, ${now}`,
    })
    return followed ? ok(c) : notFound(c)
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

    // Le verrou et le blocage portent sur la paire « moi et l'auteur du projet ».
    const followed = await followUnlessBlocked({
      viewerId: viewer.id,
      otherMemberId: project.authorId,
      insert: (now) => sql`insert into ${schema.projectFollow} (follower_id, project_id, created_at)
        select ${viewer.id}, ${id}::uuid, ${now}`,
    })
    return followed ? ok(c) : notFound(c)
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
