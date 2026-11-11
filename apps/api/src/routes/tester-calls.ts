// Les appels à tester d'un projet (R7b) : l'auteur lance un appel (un texte, une photo facultative)
// à tous ses testeurs. POST /v1/projects/{id}/calls en lance un, GET lit l'onglet « Appels » (20 par
// page, le plus récent en tête), DELETE /v1/projects/{id}/calls/{callId} en supprime un. Seul
// l'auteur lance et supprime ; l'auteur et les testeurs actuels lisent (un ancien testeur n'a que
// son fil). La photo est envoyée avant, par POST …/testers/media (routes/tester-media.ts), puis
// citée ici par son identifiant. Qui entre dans le coin se décide dans testers/access.ts.
import { createRoute, z } from '@hono/zod-openapi'
import {
  CALL_TEXT_MAX,
  CALLS_PAGE_SIZE,
  NewTesterCall,
  TesterCall,
  TesterCallPage,
  TesterPageQuery,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { after, encodeCursor, readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { memberCounterKeys, projectCallKey, type RateLimiter, type RateRule } from '../rate-limit'
import { removalsOf } from '../removals/load'
import { cornerAccess } from '../testers/access'
import { toTesterMedia } from '../testers/media'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (relecture de sécurité du plan de R7b, B1), toutes comptées « chaque demande
// compte », même refusée ou mal formée :
// - par membre : 20 demandes d'appel par jour, tous projets ensemble, avant tout examen ;
// - par projet : 5 appels par jour, comptés seulement après avoir vérifié que le membre est
//   l'auteur et que le coin est ouvert (sinon un autre membre épuiserait les appels de l'auteur) ;
// - supprimer un appel compte comme une modification du projet (60 par heure, comme routes/updates.ts).
const HOUR = 60 * 60 * 1000
const memberCallRule: RateRule = { windowMs: 24 * HOUR, max: 20 }
const projectCallRule: RateRule = { windowMs: 24 * HOUR, max: 5 }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const postCallRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/calls',
  summary: 'Launch a call for testers on my project',
  description:
    `A text (1 to ${CALL_TEXT_MAX} characters, line breaks allowed) and, optionally, a photo ` +
    'already uploaded with `kind=call` (POST …/testers/media), cited by id with its description. ' +
    'Five calls a day per project, twenty requests a day per member.',
  request: {
    params: z.object({ id: z.string() }),
    body: { required: true, content: { 'application/json': { schema: NewTesterCall } } },
  },
  responses: {
    201: { description: 'The new call.', content: { 'application/json': { schema: TesterCall } } },
    400: errorResponse(
      'Invalid data, or a photo that is not a pending call photo of this project (`invalid_photo`).',
    ),
    401: errorResponse('Not signed in.'),
    403: errorResponse('A tester (only the author launches calls), or a suspended account.'),
    404: errorResponse('No such corner for this member.'),
    409: errorResponse('The corner is closed (`corner_closed`).'),
    413: errorResponse('Body too large.'),
    429: errorResponse('Too many calls.'),
  },
})

const listCallsRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/calls',
  summary: 'The calls for testers of a project',
  description:
    'The calls, newest first, twenty per page. A call removed by the moderation is shown to the ' +
    'author only, with the reason. A former tester gets 404. No quota: a paginated read served by ' +
    '`tester_call_project_created_idx`.',
  request: { params: z.object({ id: z.string() }), query: TesterPageQuery },
  responses: {
    200: {
      description: 'A page of calls.',
      content: { 'application/json': { schema: TesterCallPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such corner for this member.'),
  },
})

const deleteCallRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/calls/{callId}',
  summary: 'Delete a call of my project',
  description: 'The author deletes a call, its photo included, even when the corner is closed.',
  request: { params: z.object({ id: z.string(), callId: z.string() }) },
  responses: {
    204: { description: 'Deleted, photo included.' },
    401: errorResponse('Not signed in.'),
    403: errorResponse('A tester.'),
    404: errorResponse('No such corner for this member, or no such call in this project.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

/** Levée dans la transaction de l'appel pour l'annuler : la photo citée n'est pas rattachable. */
class InvalidPhoto extends Error {}

export const testerCallRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/calls', requireUser)
  app.use('/v1/projects/:id/calls/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const cornerClosed = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'corner_closed'), 409)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // Lancer : le quota du membre, puis le droit, puis le quota du projet, TOUS avant de lire le corps.
  // Le corps déclaré dans postCallRoute est vérifié par un middleware que Hono place juste avant la
  // route ; ce garde-ci, enregistré plus tôt pour la même adresse et la même méthode, passe avant
  // lui (même technique que routes/updates.ts). Ainsi chaque demande compte, même mal écrite, et un
  // autre membre reçoit « introuvable » ou « refusé » sans jamais apprendre si son texte était bon.
  app.on('POST', '/v1/projects/:id/calls', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const member = await limiter.hit(memberCounterKeys(user.id).testerCall, memberCallRule)
    if (!member.allowed) return tooMany(c, member.retryAfterSeconds)
    const access = await cornerAccess(db, c.req.param('id'), user.id)
    // Un ancien testeur ne lance rien non plus : pour lui, ce geste n'existe pas.
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    // Un testeur lit les appels, mais n'en lance pas : refusé, sans rien compter pour le projet.
    if (access === 'tester') return forbidden(c)
    if (access === 'author_closed') return cornerClosed(c)
    const project = await limiter.hit(projectCallKey(c.req.param('id')), projectCallRule)
    if (!project.allowed) return tooMany(c, project.retryAfterSeconds)
    await next()
  })

  // Supprimer : le quota « modifications d'un projet » passe avant la recherche de l'appel.
  app.on('DELETE', '/v1/projects/:id/calls/:callId', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  app.openapi(postCallRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande et vérifié que le membre est l'auteur.
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const call = {
      id: crypto.randomUUID(),
      projectId: id,
      text: body.text,
      // La date vient de l'horloge de JavaScript, jamais de la base (charte).
      createdAt: new Date(),
    }

    // Une transaction (tout réussit, ou rien), sous le verrou partagé du projet (`for share`) : le
    // garde a lu le projet AVANT cette écriture, la modération a pu le retirer entre-temps. Une
    // écriture sur sa ligne attend la fin de la transaction, deux lectures partagées ne se gênent pas.
    let outcome:
      | { kind: 'closed' }
      | { kind: 'ok'; photo: typeof schema.testerMedia.$inferSelect | null }
    try {
      outcome = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, id))
          .for('share')
        if ((await cornerAccess(tx, id, user.id)) !== 'author') return { kind: 'closed' as const }
        await tx.insert(schema.testerCall).values(call)
        if (body.photoId === null) return { kind: 'ok' as const, photo: null }

        // Le rattachement de la photo : UNE écriture conditionnelle. « De ce projet, de ce membre,
        // pour un appel, pas encore rattachée » est dans l'UPDATE lui-même, pas dans une lecture
        // faite avant : deux appels simultanés qui citent la même photo ne la déplacent pas, le
        // second ne trouve plus de ligne à écrire. `returning` rend la ligne réellement écrite ;
        // s'il n'y en a pas, la photo est inconnue, d'ailleurs ou déjà prise (la même réponse pour
        // tous ces cas, qui ne disent rien de ce qui existe) et tout l'appel est annulé.
        const m = schema.testerMedia
        const [attached] = await tx
          .update(m)
          .set({ callId: call.id, description: body.photoDescription })
          .where(
            and(
              eq(m.id, body.photoId),
              eq(m.projectId, id),
              eq(m.ownerId, user.id),
              eq(m.kind, 'call'),
              isNull(m.callId),
              isNull(m.messageId),
            ),
          )
          .returning()
        if (!attached) throw new InvalidPhoto()
        return { kind: 'ok' as const, photo: attached }
      })
    } catch (error) {
      if (!(error instanceof InvalidPhoto)) throw error
      return c.json(errorBody(languageOf(c), 'invalid_photo'), 400)
    }
    if (outcome.kind === 'closed') return cornerClosed(c)
    return c.json(
      {
        id: call.id,
        text: call.text,
        photo: outcome.photo ? toTesterMedia(outcome.photo, publicApiUrl) : null,
        createdAt: call.createdAt.toISOString(),
        removal: null,
      },
      201,
    )
  })

  app.openapi(listCallsRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    const access = await cornerAccess(db, id, user.id)
    // L'auteur et les testeurs actuels lisent ; un ancien testeur n'a que son fil (404 ici).
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    const isAuthor = access === 'author' || access === 'author_closed'

    // Le curseur se décode en trois étapes (cursor.ts) ; hors de ses bornes, 400.
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid' || (cursor !== null && cursor.at >= '2100')) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }

    // En SQL : select … from tester_call where project_id = $id and (removed_at is null or $auteur)
    // [and (created_at, id) < (curseur)] order by created_at desc, id desc limit 21. L'index
    // tester_call_project_created_idx (project_id, created_at desc, id desc) range déjà les appels
    // dans l'ordre de la page : PostgreSQL part du curseur et s'arrête au 21e, sans tri. Un de plus
    // que la page : s'il existe, il y a une suite. Un appel retiré n'est lu que par l'auteur.
    const k = schema.testerCall
    const rows = await db
      .select()
      .from(k)
      .where(
        and(
          eq(k.projectId, id),
          isAuthor ? undefined : isNull(k.removedAt),
          cursor ? after(cursor, k.createdAt, k.id) : undefined,
        ),
      )
      .orderBy(desc(k.createdAt), desc(k.id))
      .limit(CALLS_PAGE_SIZE + 1)
    const page = rows.slice(0, CALLS_PAGE_SIZE)

    // Les photos et les retraits de toute la page : une requête chacun, quel que soit le nombre
    // d'appels. L'index tester_media_call_idx (call_id) donne la photo de chaque appel.
    const m = schema.testerMedia
    const [photos, removals] = await Promise.all([
      page.length === 0
        ? []
        : db
            .select()
            .from(m)
            .where(
              inArray(
                m.callId,
                page.map((row) => row.id),
              ),
            ),
      removalsOf(
        db,
        page.map((row) => (row.removedAt === null ? null : row.removalId)),
      ),
    ])
    const photoOf = new Map(
      photos.flatMap((photo) => (photo.callId ? [[photo.callId, photo]] : [])),
    )

    const last = page.at(-1)
    return c.json(
      {
        items: page.map((row) => {
          const photo = photoOf.get(row.id)
          return {
            id: row.id,
            text: row.text,
            photo: photo ? toTesterMedia(photo, publicApiUrl) : null,
            createdAt: row.createdAt.toISOString(),
            // Seul l'auteur reçoit les appels retirés (filtrés plus haut pour les autres).
            removal: row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null),
          }
        }),
        nextCursor:
          rows.length > CALLS_PAGE_SIZE && last
            ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
            : null,
      },
      200,
    )
  })

  app.openapi(deleteCallRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le quota a déjà été compté par le garde ci-dessus.
    const { id, callId } = c.req.valid('param')
    const access = await cornerAccess(db, id, user.id)
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    if (access === 'tester') return forbidden(c)
    // L'auteur supprime ce qu'il a publié même dans un coin fermé (projet privé, retiré, auteur
    // suspendu) : comme on supprime toujours son propre contenu.
    if (!z.uuid().safeParse(callId).success) return notFound(c)

    // Le fichier à effacer est lu AVANT la suppression : la ligne de la photo part en cascade avec
    // l'appel. La condition « de ce projet » empêche de viser l'appel d'un autre par l'adresse du sien.
    const m = schema.testerMedia
    const k = schema.testerCall
    const photos = await db
      .select({ storageKey: m.storageKey })
      .from(m)
      .innerJoin(k, eq(k.id, m.callId))
      .where(and(eq(m.callId, callId), eq(k.projectId, id)))
    // `returning` : les lignes effacées ; aucune, et l'appel était introuvable.
    const deleted = await db
      .delete(k)
      .where(and(eq(k.id, callId), eq(k.projectId, id)))
      .returning({ id: k.id })
    if (deleted.length === 0) return notFound(c)
    for (const photo of photos) await storage.delete(photo.storageKey)
    return c.body(null, 204)
  })

  return app
}
