// Rejoindre et quitter les testeurs d'un projet (R7a) : POST et DELETE /v1/projects/{id}/testers.
// Un testeur est un membre inscrit à un projet « Testable » avec une démo ; il est prévenu de chaque
// mise à jour publiée après son inscription (notifications). Seul l'auteur voit le nombre de
// testeurs (projects/testers.ts) ; la liste des testeurs n'est lue nulle part.
import { createRoute, z } from '@hono/zod-openapi'
import { ProjectId, TESTERS_MAX } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { blockedPair, lockPair } from '../blocks/write'
import { errorBody, languageOf } from '../errors'
import { visibleTo } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
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

type Deps = { db: Database; limiter: RateLimiter }

export const testerRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/testers', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
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

  return app
}
