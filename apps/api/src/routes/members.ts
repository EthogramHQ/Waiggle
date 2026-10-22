// Les routes des membres, réservées aux membres connectés :
// - GET /v1/members/{id} : la page d'un membre, son profil public et ses projets. Un membre
//   inconnu, supprimé ou jamais vérifié : « introuvable » ;
// - GET /v1/members/mentionable : les membres proposés après « @ » dans un commentaire (tranche 6b).
import { createRoute, z } from '@hono/zod-openapi'
import { Member, MemberId, MentionableList, MentionableQuery } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { requireUser } from '../auth/session'
import { viewerOf } from '../comments/load'
import { errorBody, languageOf } from '../errors'
import { memberFollowState } from '../follows/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { searchMentionable } from '../mentions/search'
import { mediaUrl } from '../profile/me'
import { loadSummaries, visibleTo, withSlugs } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
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
      description: 'The member, and the projects the viewer may see.',
      content: { 'application/json': { schema: Member } },
    },
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such member, or an account whose email was never verified.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

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
    const [project] = await db
      .select({
        id: schema.project.id,
        authorId: schema.project.authorId,
        visibility: schema.project.visibility,
        // Un projet retiré compte comme privé pour la recherche (viewerOf, comments/load.ts).
        removedAt: schema.project.removedAt,
      })
      .from(schema.project)
      .where(and(eq(schema.project.id, projectId), visibleTo(user.id)))
    if (!project) return c.json(errorBody(languageOf(c), 'not_found'), 404)
    const members = await searchMentionable(
      db,
      q,
      viewerOf(user.id, project),
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
      })
      .from(schema.user)
      .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
      .leftJoin(schema.memberHandle, currentHandleOf(schema.user.id))
      // Un compte jamais vérifié n'a pas de page : il ne peut ni se connecter ni publier.
      .where(and(eq(schema.user.id, id), eq(schema.user.emailVerified, true)))
    if (!row) return notFound()
    // Un membre d'avant la tranche 6a, pas encore servi par le rattrapage : il reçoit son pseudo
    // ici, en filet (ensureHandle lit lui-même sa langue, que cette route ne lit pas).
    const handle = row.handle ?? (await ensureHandle(db, row.id))
    if (handle === null) return notFound()

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
        id: row.id,
        name: row.name,
        handle,
        avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
        bio: row.bio ?? '',
        favoriteTools: tools.map((label, i) => ({ label, slug: toolSlugs[i] ?? label })),
        isMe: row.id === viewer.id,
        ...follow,
        projects,
      }),
      200,
    )
  })

  return app
}
