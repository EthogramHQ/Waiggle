// La page d'un membre (GET /v1/members/{id}) : son profil public et ses projets.
// Réservée aux membres connectés. Un membre inconnu, supprimé ou jamais vérifié : « introuvable ».
import { createRoute, z } from '@hono/zod-openapi'
import { Member, MemberId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { memberFollowState } from '../follows/load'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { mediaUrl } from '../profile/me'
import { loadSummaries, visibleTo, withSlugs } from '../projects/load'
import { createRouter, errorResponse } from './router'

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

type Deps = { db: Database; publicApiUrl: string }

export const memberRoutes = ({ db, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/members/*', requireUser)

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
