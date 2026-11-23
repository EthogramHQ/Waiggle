// Routes des réactions (tranche 5) : PUT /v1/projects/{id}/reactions/{kind} pour réagir à un
// projet (« Bravo », « Utile »…), DELETE à la même adresse pour retirer sa réaction. Réservé aux
// membres connectés, sur le projet visible d'un autre. Les nombres se lisent avec le projet (champ
// `reactions` de GET /v1/projects/{id}), jamais la liste de qui a réagi. R19 : une réaction posée
// rapporte du pollen à qui réagit et à l'auteur du projet (en-tête `Waiggle-Pollen`).
import { createRoute, z } from '@hono/zod-openapi'
import { ProjectId, REACTION_KINDS, ReactionKind } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, ne, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { setPollen } from '../game/award'
import { awardOnProject, pollenHeaders } from '../game/gesture'
import { visibleTo } from '../projects/load'
import { hiveMemberOf, projectReachableBy } from '../projects/visibility'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règle anti-abus (docs/scenarios/phase-1.md, tranche 5) : 120 changements de réaction par heure
// et par membre, poser et retirer, tous les projets ensemble (comme pour suivre).
const reactionRule: RateRule = { windowMs: 60 * 60 * 1000, max: 120 }

// Le type est lu comme un simple texte dans l'adresse, puis vérifié par la route : un type inconnu
// reçoit la même réponse « introuvable » qu'un projet inconnu (et non une erreur de validation).
const params = z.object({
  id: z.string(),
  kind: z.string().meta({ description: `One of: ${REACTION_KINDS.join(', ')}.` }),
})
const done = { description: 'Done (no content).' }

const reactRoute = createRoute({
  method: 'put',
  path: '/v1/projects/{id}/reactions/{kind}',
  summary: 'React to a project',
  description: 'Asking twice changes nothing: there is one reaction of each kind per member.',
  request: { params },
  responses: {
    204: { ...done, headers: pollenHeaders },
    400: errorResponse('One cannot react to one’s own project.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such project or kind, or a private project of another member.'),
    429: errorResponse('Too many reaction changes.'),
  },
})

const unreactRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/reactions/{kind}',
  summary: 'Remove my reaction to a project',
  description: 'Succeeds too when the reaction was never put.',
  request: { params },
  responses: {
    204: done,
    400: errorResponse('One cannot react to one’s own project.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such project or kind, or a private project of another member.'),
    429: errorResponse('Too many reaction changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter }

export const reactionRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/reactions/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const ownProject = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'cannot_react_own'), 400)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  /**
   * Les vérifications communes à poser et retirer, dans l'ordre : le quota d'abord (toute demande
   * compte, même pour un projet ou un type inconnu : on ne sonde pas les adresses sans limite),
   * puis l'identifiant et le type (mal formés : « introuvable », sans interroger la base), puis le
   * projet. Un projet privé d'un autre reçoit la même réponse qu'un projet inconnu ; son propre
   * projet, « refusé » (400), pour poser comme pour retirer.
   *
   * La lecture du projet est une petite requête servie par sa clé primaire : on ne lit que son
   * auteur. Renvoie le type de réaction vérifié, ou la réponse de refus à renvoyer telle quelle.
   *
   * `undo` (tranche 7b, règle 7 de la relecture du plan) : retirer sa réaction défait son propre
   * geste, qu'un blocage ne refuse jamais. Le projet d'un membre bloqué avec lui, caché partout
   * ailleurs (visibleTo), reste donc trouvé ici : `projectReachableBy` (projects/visibility.ts),
   * la condition de visibleTo moins le blocage. Un projet privé ou retiré d'un autre reste
   * introuvable, comme avant.
   */
  const check = async (
    c: Context<AppEnv>,
    userId: string,
    id: string,
    rawKind: string,
    undo: boolean,
  ) => {
    const decision = await limiter.hit(memberCounterKeys(userId).reaction, reactionRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const kind = ReactionKind.safeParse(rawKind)
    if (!ProjectId.safeParse(id).success || !kind.success) return notFound(c)
    // R10, relecture de sécurité (A3) : `projectReachableBy` trouve tout projet réservé, ce qui
    // disait à une inconnue (204 contre 404) qu'il existe. En annulation, un projet réservé n'est
    // trouvé que par un membre de sa ruche (`hiveMemberOf`), ou par qui y a une réaction (un
    // ancien membre défait toujours son geste, décision Q2) : la sous-requête lit la clé primaire
    // de project_reaction (project_id, member_id, …) par son début, identifiants liés.
    // `sql.raw('project.id')` : écrit par Drizzle, la colonne perdrait le nom de sa table dans la
    // sous-requête (piège de la charte, 6b).
    const reachable = undo
      ? and(
          projectReachableBy(userId),
          or(
            ne(schema.project.visibility, 'hive'),
            eq(schema.project.authorId, userId),
            hiveMemberOf(userId),
            sql`(select 1 from ${schema.projectReaction} pr
                 where pr.project_id = ${sql.raw('project.id')} and pr.member_id = ${userId}
                 limit 1) is not null`,
          ),
        )
      : visibleTo(userId)
    const [project] = await db
      .select({ authorId: schema.project.authorId })
      .from(schema.project)
      .where(and(eq(schema.project.id, id), reachable))
    if (!project) return notFound(c)
    if (project.authorId === userId) return ownProject(c)
    return { kind: kind.data, authorId: project.authorId }
  }

  app.openapi(reactRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, kind } = c.req.valid('param')
    const checked = await check(c, user.id, id, kind, false)
    if (checked instanceof Response) return checked

    // R19 : la réaction et son pollen s'écrivent dans une même transaction (tout ou rien).
    // « on conflict do nothing » : la réaction existe déjà (même clé primaire) ? PostgreSQL n'écrit
    // rien et ne lève pas d'erreur. Réagir deux fois revient à réagir une fois, même si deux
    // demandes arrivent en même temps. `returning` rend la ligne écrite, ou rien : seule une
    // réaction nouvelle passe par le pollen. La date vient de l'horloge de JavaScript.
    const now = new Date()
    const pollen = await db.transaction(async (tx) => {
      const written = await tx
        .insert(schema.projectReaction)
        .values({ projectId: id, memberId: user.id, kind: checked.kind, createdAt: now })
        .onConflictDoNothing()
        .returning({ kind: schema.projectReaction.kind })
      if (written.length === 0) return 0
      // Chaque sorte de réaction se paie une fois par projet : retirer puis reposer retrouve la
      // même clé, et ne rapporte rien de plus (ni ne reprend rien, le retrait n'y touche pas).
      return awardOnProject(tx, {
        actorId: user.id,
        authorId: checked.authorId,
        projectId: id,
        gesture: 'reaction',
        received: 'receive_reaction',
        sourceKind: 'reaction',
        sourceId: id,
        sourceKey: `${id}:${checked.kind}`,
        receivedKey: `${id}:${checked.kind}:${user.id}`,
        now,
      })
    })
    // 204 : « c'est fait », sans corps : rien à lire, donc rien qui puisse fuiter. L'en-tête du
    // pollen, s'il y en a, se pose une fois la transaction validée.
    setPollen(c, pollen)
    return c.body(null, 204)
  })

  app.openapi(unreactRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id, kind } = c.req.valid('param')
    const checked = await check(c, user.id, id, kind, true)
    if (checked instanceof Response) return checked

    // N'efface que la réaction du membre qui demande ; s'il n'y en avait pas, rien à faire. Le
    // pollen déjà gagné reste (R19 : défaire ne retire rien).
    const r = schema.projectReaction
    await db
      .delete(r)
      .where(and(eq(r.projectId, id), eq(r.memberId, user.id), eq(r.kind, checked.kind)))
    return c.body(null, 204)
  })

  return app
}
