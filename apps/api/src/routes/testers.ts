// Les testeurs d'un projet : rejoindre et quitter (R7a : POST et DELETE /v1/projects/{id}/testers),
// et, depuis R7b, entrer dans le coin des testeurs (GET, avec le nombre pour l'auteur et ses
// testeurs, la liste pour l'auteur seul) et retirer un testeur (DELETE …/testers/{memberId}). Un
// testeur est un membre inscrit à un projet « Testable » avec une démo ; il est prévenu de chaque
// mise à jour publiée après son inscription (notifications). Un membre retiré par l'auteur ne peut
// plus s'inscrire (table project_tester_removal), sans que le refus le dise.
import { createRoute, z } from '@hono/zod-openapi'
import { ProjectId, TESTERS_MAX, TesterCorner } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { blockedPair, lockPair } from '../blocks/write'
import { errorBody, languageOf } from '../errors'
import { currentHandleOf } from '../handles/load'
import { avatarUrlOf } from '../profile/me'
import { visibleTo } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { cornerAccess, isMissingMember } from '../testers/access'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règle anti-abus (relecture de sécurité du plan de R7a, A2) : 60 inscriptions ou départs par heure
// et par membre, tous projets ensemble ; chaque demande compte, même pour un projet inconnu.
const testerRule: RateRule = { windowMs: 60 * 60 * 1000, max: 60 }

const params = z.object({ id: z.string() })
const done = { description: 'Done (no content).' }

const joinRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/testers',
  summary: 'Join the testers of a project',
  description:
    'Idempotent: a member who already tests the project gets 204 before any other refusal. ' +
    'Only a testable project with a demo takes new testers, and at most 200.',
  request: { params },
  responses: {
    204: done,
    400: errorResponse('One cannot test one’s own project (`cannot_test_own`).'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A suspended account.'),
    404: errorResponse(
      'No such project, a private project of another member, or a member blocked with the author.',
    ),
    409: errorResponse('Not testable (`not_testable`), or already full (`testers_full`).'),
    429: errorResponse('Too many tester changes.'),
  },
})

const quitRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/testers',
  summary: 'Quit the testers of a project',
  description:
    'Always succeeds for a well-formed identifier, tester or not, project visible or not: the ' +
    'answer reveals nothing.',
  request: { params },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    404: errorResponse('Malformed identifier.'),
    429: errorResponse('Too many tester changes.'),
  },
})

const cornerRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/testers',
  summary: 'Open the testers corner of a project',
  description:
    'The author (and the testers) read the number of testers; the author alone reads the list, the ' +
    'most recent first. A former tester (left, removed, or blocked) opens the corner without the ' +
    'count. `closed` is true for the author of a removed, private or suspended project, who then ' +
    'only reads. Everyone else, and every tester of a closed corner, gets 404. No quota: a read ' +
    'served by the primary keys and by `project_tester_project_idx`.',
  request: { params },
  responses: {
    200: {
      description: 'The corner.',
      content: { 'application/json': { schema: TesterCorner } },
    },
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such corner for this member (unknown, private, closed, not a tester).'),
  },
})

const removeTesterRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/testers/{memberId}',
  summary: 'Remove a tester from my project',
  description:
    'The author removes a member from the testers: the inscription is erased and the member cannot ' +
    'join again (the refusal of a new inscription is the one of any closed project). The member is ' +
    'not told. Idempotent: 204 without writing for a member who does not test the project, or for ' +
    'oneself.',
  request: { params: z.object({ id: z.string(), memberId: z.string() }) },
  responses: {
    204: done,
    401: errorResponse('Not signed in.'),
    403: errorResponse('A tester: removing is the author’s gesture.'),
    404: errorResponse('No such corner for this member, or a malformed project identifier.'),
    409: errorResponse(
      'The corner is closed (`corner_closed`): removed or private project, suspended author.',
    ),
    429: errorResponse('Too many tester changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const testerRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (aussi pour …/testers/{memberId}).
  app.use('/v1/projects/:id/testers', requireUser)
  app.use('/v1/projects/:id/testers/:memberId', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const cornerClosed = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'corner_closed'), 409)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }
  // 204 : « c'est fait », sans corps : rien à lire, donc rien qui puisse fuiter.
  const ok = (c: Context<AppEnv>) => c.body(null, 204)

  /** Compte la demande dans le quota du membre, avant de regarder ce qu'elle demande. */
  const overLimit = async (userId: string) => {
    const decision = await limiter.hit(memberCounterKeys(userId).tester, testerRule)
    return decision.allowed ? null : decision.retryAfterSeconds
  }

  app.openapi(joinRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ferait échouer la requête SQL (ce n'est pas un uuid).
    if (!ProjectId.safeParse(id).success) return notFound(c)
    // Le projet, s'il est visible par le membre (public, pas retiré, pas d'un membre bloqué avec
    // lui, ou le sien) : sinon la même réponse qu'un projet inconnu. Clé primaire de project.
    const [project] = await db
      .select({ authorId: schema.project.authorId })
      .from(schema.project)
      .where(and(eq(schema.project.id, id), visibleTo(viewer.id)))
    if (!project) return notFound(c)
    if (project.authorId === viewer.id) {
      return c.json(errorBody(languageOf(c), 'cannot_test_own'), 400)
    }

    // Une transaction, sous deux verrous :
    // 1. celui de la paire (moi, l'auteur), que bloquer prend aussi (blocks/write.ts) : un blocage
    //    en cours finit avant la relecture, et un blocage qui arrive ensuite attend la fin de
    //    l'inscription puis l'efface ;
    // 2. celui de la ligne du projet (`for update`) : deux inscriptions simultanées ne comptent pas
    //    chacune 199 testeurs pour écrire la 201e. Le statut et la visibilité sont relus ici,
    //    parce que l'auteur a pu les changer depuis la première lecture.
    const outcome = await db.transaction(async (tx) => {
      await lockPair(tx, viewer.id, project.authorId)
      if (await blockedPair(tx, viewer.id, project.authorId)) return 'not_found' as const
      const [locked] = await tx
        .select({
          status: schema.project.status,
          demoUrl: schema.project.demoUrl,
          visibility: schema.project.visibility,
          removedAt: schema.project.removedAt,
        })
        .from(schema.project)
        .where(eq(schema.project.id, id))
        .for('update')
      if (locked?.visibility !== 'public' || locked.removedAt !== null) return 'not_found' as const
      const t = schema.projectTester
      // Déjà testeur : 204 avant tout autre refus (projet plein, ou plus « Testable »).
      const [mine] = await tx
        .select({ memberId: t.memberId })
        .from(t)
        .where(and(eq(t.memberId, viewer.id), eq(t.projectId, id)))
      if (mine) return 'done' as const
      // R7b : un membre que l'auteur a retiré ne revient pas. La ligne de retrait est relue ici,
      // sous le verrou du projet (le retrait la pose sous le même verrou : l'un des deux passe
      // avant l'autre). Le même refus qu'un projet fermé : rien ne dit qu'il a été retiré.
      const [barred] = await tx
        .select({ memberId: schema.projectTesterRemoval.memberId })
        .from(schema.projectTesterRemoval)
        .where(
          and(
            eq(schema.projectTesterRemoval.projectId, id),
            eq(schema.projectTesterRemoval.memberId, viewer.id),
          ),
        )
      if (barred) return 'not_testable' as const
      if (locked.status !== 'testable' || locked.demoUrl === null) return 'not_testable' as const
      // L'index project_tester_project_idx (project_id) compte les inscrits (200 au plus).
      const [counted] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(eq(t.projectId, id))
      if ((counted?.n ?? 0) >= TESTERS_MAX) return 'testers_full' as const
      // La date vient de l'horloge de JavaScript : la source des notifications la compare à celle
      // des mises à jour. `on conflict do nothing` : la clé primaire écarte un doublon sans erreur.
      await tx
        .insert(t)
        .values({ memberId: viewer.id, projectId: id, createdAt: new Date() })
        .onConflictDoNothing()
      return 'done' as const
    })
    if (outcome === 'not_found') return notFound(c)
    if (outcome === 'not_testable') return c.json(errorBody(languageOf(c), 'not_testable'), 409)
    if (outcome === 'testers_full') return c.json(errorBody(languageOf(c), 'testers_full'), 409)
    return ok(c)
  })

  app.openapi(quitRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id } = c.req.valid('param')
    if (!ProjectId.safeParse(id).success) return notFound(c)
    // On peut toujours quitter, même un projet devenu privé ou inconnu : seule la ligne du membre
    // qui demande s'efface (clé primaire), et la réponse ne dit rien du projet.
    await db
      .delete(schema.projectTester)
      .where(
        and(eq(schema.projectTester.memberId, viewer.id), eq(schema.projectTester.projectId, id)),
      )
    return ok(c)
  })

  // Entrer dans le coin : l'accès décide de tout (testers/access.ts), la réponse ne dit jamais plus
  // que ce que ce membre a le droit de savoir.
  app.openapi(cornerRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const { id } = c.req.valid('param')
    const access = await cornerAccess(db, id, viewer.id)
    if (access === 'not_found') return notFound(c)
    // Un ancien testeur ne voit ni le nombre ni la liste : seulement son fil, lu ailleurs.
    if (access === 'former_tester') {
      return c.json(
        { role: 'former_tester' as const, closed: false, testerCount: null, testers: null },
        200,
      )
    }

    const t = schema.projectTester
    if (access === 'tester') {
      // Les testeurs ne se voient pas entre eux : seulement le nombre. L'index
      // project_tester_project_idx (project_id) donne les inscrits (200 au plus).
      const [counted] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(eq(t.projectId, id))
      return c.json(
        { role: 'tester' as const, closed: false, testerCount: counted?.n ?? 0, testers: null },
        200,
      )
    }

    // L'auteur (coin ouvert ou fermé : il relit toujours) : la liste, du plus récent inscrit au plus
    // ancien. En SQL : select … from project_tester join "user" left join profile left join
    // member_handle (pseudo actuel) where project_id = $id order by created_at desc, member_id
    // desc. L'index project_tester_project_idx donne les inscrits du projet (200 au plus, un tri
    // en mémoire de cette taille suffit) ; chaque jointure suit une clé primaire. Une seule
    // requête pour toute la liste.
    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.memberHandle.handle,
        avatarKey: schema.profile.avatarKey,
        since: t.createdAt,
      })
      .from(t)
      .innerJoin(schema.user, eq(schema.user.id, t.memberId))
      .leftJoin(schema.profile, eq(schema.profile.userId, t.memberId))
      .leftJoin(schema.memberHandle, currentHandleOf(t.memberId))
      .where(eq(t.projectId, id))
      .orderBy(desc(t.createdAt), desc(t.memberId))
    return c.json(
      {
        role: 'author' as const,
        closed: access === 'author_closed',
        testerCount: rows.length,
        testers: rows.map((row) => ({
          id: row.id,
          name: row.name,
          handle: row.handle,
          avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey),
          since: row.since.toISOString(),
        })),
      },
      200,
    )
  })

  // Retirer un testeur. Le quota passe avant tout (chaque demande compte, projet inconnu compris),
  // puis le droit, puis une transaction : sous le verrou du projet (`for update`, comme
  // l'inscription), on relit l'accès et l'inscription, qu'une première lecture a pu manquer (le
  // membre vient de rejoindre) ; une inscription et un retrait simultanés passent l'un après l'autre.
  app.openapi(removeTesterRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const wait = await overLimit(viewer.id)
    if (wait !== null) return tooMany(c, wait)

    const { id, memberId } = c.req.valid('param')
    const access = await cornerAccess(db, id, viewer.id)
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    // Un testeur entre dans le coin, mais n'y retire personne : aucune écriture.
    if (access === 'tester') return forbidden(c)
    if (access === 'author_closed') return cornerClosed(c)
    // On ne se retire pas soi-même (l'auteur n'est pas testeur de son projet) : 204 sans écrire.
    if (memberId === viewer.id) return ok(c)

    try {
      const outcome = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, id))
          .for('update')
        // Sous le verrou, l'état a pu changer (projet passé en privé, auteur suspendu) : relu.
        if ((await cornerAccess(tx, id, viewer.id)) !== 'author') return 'closed' as const
        const t = schema.projectTester
        // `returning` : les lignes réellement effacées. Aucune, et le membre ne teste pas ce projet :
        // rien n'est écrit, pas même une ligne de retrait (l'auteur ne peut pas « bannir à
        // l'avance » un membre qui n'est pas testeur). Clé primaire (member_id, project_id).
        const erased = await tx
          .delete(t)
          .where(and(eq(t.projectId, id), eq(t.memberId, memberId)))
          .returning({ memberId: t.memberId })
        if (erased.length === 0) return 'done' as const
        // `on conflict do nothing` : la clé primaire écarte un doublon sans erreur (idempotent).
        await tx
          .insert(schema.projectTesterRemoval)
          .values({ projectId: id, memberId, createdAt: new Date() })
          .onConflictDoNothing()
        return 'done' as const
      })
      if (outcome === 'closed') return cornerClosed(c)
      return ok(c)
    } catch (error) {
      // 23503 : le compte retiré a été supprimé pendant l'écriture. Rien n'est écrit (la
      // transaction est annulée) et l'état a changé : un refus propre plutôt qu'un 500.
      if (isMissingMember(error)) return cornerClosed(c)
      throw error
    }
  })

  return app
}
