// Les routes des membres, réservées aux membres connectés :
// - GET /v1/members/{id} : la page d'un membre, son profil public et ses projets. Un membre
//   inconnu, supprimé ou jamais vérifié : « introuvable ». Tranche 7b : un membre qui m'a bloqué
//   aussi, mot pour mot ; un membre que j'ai bloqué, son en-tête seul (`isBlocked`). Tranche 7c :
//   `moderation` (sa suspension, ses décisions), pour un administrateur en fonction seulement ;
// - GET /v1/members/mentionable : les membres proposés après « @ » dans un commentaire (tranche 6b).
import { createRoute, z } from '@hono/zod-openapi'
import { Member, MemberId, MentionableList, MentionableQuery } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, count, eq, sql } from 'drizzle-orm'
import { requireUser } from '../auth/session'
import { blocksOf } from '../blocks/visibility'
import { reachableBy } from '../blocks/write'
import { viewerOf } from '../comments/load'
import { errorBody, languageOf } from '../errors'
import { memberFollowState } from '../follows/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { searchMentionable } from '../mentions/search'
import { mediaUrl } from '../profile/me'
import { loadSummaries, visibleTo, withSlugs } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import { loadActiveSuspension } from '../suspension/load'
import { createRouter, errorResponse } from './router'

// Anti-abus des suggestions (scénario 6b, « Suggestions ») : 600 recherches par heure et par
// membre, et 2 000 par jour. L'appli attend qu'on s'arrête de taper avant de chercher : 600 dans
// l'heure, c'est beaucoup d'écriture. Mais 600 par heure, jour et nuit, suffiraient à relever peu
// à peu tous les pseudos du réseau : le plafond du jour l'empêche, avec la règle des 3 caractères
// (mentions/search.ts : à 2 caractères, seulement les proches).
const mentionSearchRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }
const mentionSearchDayRule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: 2000 }

const mentionableRoute = createRoute({
  method: 'get',
  path: '/v1/members/mentionable',
  summary: 'Members to mention in a comment',
  description:
    'Members whose current handle starts with `q`, verified, never the viewer: first those ' +
    'close to the project (its author, the authors of its comments, the members followed), then ' +
    'the others, by handle (only from 3 characters on: with 2, the close ones only). Five at most.',
  request: { query: MentionableQuery },
  responses: {
    200: {
      description: 'The members proposed.',
      content: { 'application/json': { schema: MentionableList } },
    },
    400: errorResponse('Invalid query (less than 2 characters, or not a handle).'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such project, or a private project of another member.'),
    429: errorResponse('Too many searches.'),
  },
})

const readMemberRoute = createRoute({
  method: 'get',
  path: '/v1/members/{id}',
  summary: 'Read the page of a member',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description:
        'The member, and the projects the viewer may see. A member the viewer blocked: the ' +
        'header only (`isBlocked`), without bio, tools, followers or projects.',
      content: { 'application/json': { schema: Member } },
    },
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such member, an account whose email was never verified, or one who blocked the viewer (the same answer).',
    ),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

/**
 * Tranche 7c : ce que la page d'un membre dit de lui à un administrateur en fonction (relecture de
 * sécurité S15 : null pour tout autre lecteur, le membre suspendu compris ; un tiers voit la même
 * page avant et après une suspension). Il y lit :
 * - `isAdmin` : ce membre est-il administrateur en fonction (on ne suspend pas un administrateur) ;
 * - `suspension` : sa suspension active, avec la règle unique de suspension/load.ts (S10) ;
 * - `decisions` : le nombre de décisions qui le visent, pour mener à son historique ;
 * - `canSuspend` : la même règle que le rappel de la file (queue.ts) et que la décision elle-même
 *   (moderation/suspend.ts) : ni soi-même, ni un administrateur, ni un membre déjà suspendu, ni un
 *   membre que l'administrateur a bloqué (S4, J13). L'appli s'en sert pour montrer le bouton ; la
 *   décision revérifie tout sous son verrou.
 *
 * Quatre lectures courtes, chacune par un index, quelle que soit l'activité du membre :
 * - le rôle du lecteur et celui du membre : clé primaire de admin_member, plus l'index
 *   account_suspension_open_idx (isActiveAdmin, S19 : un administrateur suspendu n'en est plus un) ;
 * - la suspension : account_suspension_open_idx, une ligne au plus ;
 * - le nombre de décisions : moderation_decision_member_idx (target_member_id, …), dont
 *   PostgreSQL ne lit que les entrées de ce membre.
 * `isBlocked` : le lecteur a-t-il bloqué ce membre (déjà lu par la page).
 */
const moderationOf = async (
  db: Database,
  viewerId: string,
  memberId: string,
  isBlocked: boolean,
): Promise<Member['moderation']> => {
  const now = new Date()
  if (!(await isActiveAdmin(db, viewerId, now))) return null
  const d = schema.moderationDecision
  const [isAdmin, active, [counted]] = await Promise.all([
    isActiveAdmin(db, memberId, now),
    loadActiveSuspension(db, memberId, now),
    db.select({ decisions: count() }).from(d).where(eq(d.targetMemberId, memberId)),
  ])
  const suspension = active?.suspension ?? null
  return {
    isAdmin,
    suspension,
    decisions: counted?.decisions ?? 0,
    canSuspend: memberId !== viewerId && !isAdmin && suspension === null && !isBlocked,
  }
}

export const memberRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/members/*', requireUser)

  // Le quota AVANT la vérification de la demande (déclarée dans la route, vérifiée par un
  // middleware que Hono place juste avant elle, comme dans routes/comments.ts) : chaque demande
  // compte, même mal écrite.
  app.on('GET', '/v1/members/mentionable', async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const keys = memberCounterKeys(user.id)
    // Les deux compteurs avancent à chaque demande : celui de l'heure, puis celui du jour. Le
    // premier refus l'emporte (avec son délai d'attente).
    for (const [key, rule] of [
      [keys.mentionSearch, mentionSearchRule],
      [keys.mentionSearchDay, mentionSearchDayRule],
    ] as const) {
      const decision = await limiter.hit(key, rule)
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
    }
    await next()
  })

  // Enregistrée avant /v1/members/{id} : sinon « mentionable » serait pris pour un identifiant.
  app.openapi(mentionableRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const { q, projectId } = c.req.valid('query')
    // Le projet, s'il est visible par ce membre (public, ou le sien). Inconnu ou privé d'un
    // autre : la même réponse « introuvable », pour ne pas révéler qu'un projet privé existe.
    // L'identifiant est déjà un UUID bien formé (MentionableQuery) ; la clé primaire le trouve.
    // Ses blocages en même temps (blocksOf, par les deux index de member_block) : la recherche ne
    // lit que `seesSql`, qui les lit dans la base, mais le Viewer les porte toujours (viewerOf),
    // pour qu'une règle JavaScript ajoutée plus tard (`sees`) ne les ignore pas sans bruit.
    const [[project], blocks] = await Promise.all([
      db
        .select({
          id: schema.project.id,
          authorId: schema.project.authorId,
          visibility: schema.project.visibility,
          // Un projet retiré compte comme privé pour la recherche (viewerOf, comments/load.ts).
          removedAt: schema.project.removedAt,
        })
        .from(schema.project)
        .where(and(eq(schema.project.id, projectId), visibleTo(user.id))),
      blocksOf(db, user.id),
    ])
    if (!project) return c.json(errorBody(languageOf(c), 'not_found'), 404)
    const members = await searchMentionable(
      db,
      q,
      viewerOf(user.id, project, blocks),
      project,
      publicApiUrl,
    )
    // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(MentionableList.parse({ members }), 200)
  })

  app.openapi(readMemberRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const notFound = () => c.json(errorBody(languageOf(c), 'not_found'), 404)

    const { id } = c.req.valid('param')
    // Un identifiant mal formé ne peut désigner personne (MemberId, dans les contrats) : on répond
    // « introuvable » sans interroger la base.
    if (!MemberId.safeParse(id).success) return notFound()
    // Seulement les colonnes publiques : l'e-mail, la langue ou les dates ne sont même pas lus.
    // Le pseudo actuel vient par une jointure (index partiel member_handle_current_idx) ; jamais
    // l'ancien, qui ne regarde que son propriétaire.
    const [row] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        handle: schema.memberHandle.handle,
        bio: schema.profile.bio,
        favoriteTools: schema.profile.favoriteTools,
        avatarKey: schema.profile.avatarKey,
        // Tranche 7b : le visiteur l'a-t-il bloqué ? `exists` sur la clé primaire de member_block.
        isBlocked: sql<boolean>`exists (select 1 from ${schema.memberBlock}
          where ${schema.memberBlock.blockerId} = ${viewer.id}
          and ${schema.memberBlock.blockedId} = ${schema.user.id})`,
      })
      .from(schema.user)
      .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
      .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
      // Un compte jamais vérifié n'a pas de page : il ne peut ni se connecter ni publier. Un membre
      // qui a bloqué le visiteur non plus, pour lui (règle 6) : la condition est dans le même
      // `where`, et la réponse est celle d'un membre inconnu, mot pour mot (blocks/write.ts).
      .where(reachableBy(viewer.id, id))
    if (!row) return notFound()
    // Un membre d'avant la tranche 6a, pas encore servi par le rattrapage : il reçoit son pseudo
    // ici, en filet (ensureHandle lit lui-même sa langue, que cette route ne lit pas).
    const handle = row.handle ?? (await ensureHandle(db, row.id))
    if (handle === null) return notFound()
    const header = {
      id: row.id,
      name: row.name,
      handle,
      avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
      isMe: row.id === viewer.id,
    }

    // Un membre que j'ai bloqué (précision 2 et règle 6) : l'en-tête seul, pour le reconnaître, le
    // débloquer ou le signaler. Ni bio, ni outils, ni projets, ni abonnés : rien de ce qu'il écrit
    // ou fait n'est lu, et ses projets ne sont pas même cherchés.
    if (row.isBlocked) {
      return c.json(
        Member.parse({
          ...header,
          bio: '',
          favoriteTools: [],
          isBlocked: true,
          isFollowed: false,
          followerCount: 0,
          projects: [],
          // Un administrateur qui l'a bloqué lit encore sa suspension et ses décisions, mais ne
          // peut pas le suspendre (canSuspend faux, S4).
          moderation: await moderationOf(db, viewer.id, row.id, true),
        }),
        200,
      )
    }

    // Ses projets que le visiteur peut voir : publics, et aussi privés si c'est sa propre page.
    // Puis son nombre d'abonnés, et si le visiteur en fait partie (une requête, voir follows/load.ts).
    const projects = await loadSummaries(
      db,
      and(eq(schema.project.authorId, id), visibleTo(viewer.id)),
      viewer.id,
      publicApiUrl,
    )
    const follow = await memberFollowState(db, id, viewer.id)
    const { tools, toolSlugs } = withSlugs(row.favoriteTools ?? [])
    // Member.parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
    return c.json(
      Member.parse({
        ...header,
        bio: row.bio ?? '',
        favoriteTools: tools.map((label, i) => ({ label, slug: toolSlugs[i] ?? label })),
        isBlocked: false,
        ...follow,
        projects,
        moderation: await moderationOf(db, viewer.id, row.id, false),
      }),
      200,
    )
  })

  return app
}
