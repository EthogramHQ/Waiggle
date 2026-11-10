// Routes des mises à jour d'un projet (R7a), qui remplacent les notes du Journal (tranche 4b) :
// POST /v1/projects/{id}/updates pour en publier une, GET pour lire la frise (20 par page),
// DELETE /v1/projects/{id}/updates/{updateId} pour en supprimer une. Seul l'auteur du projet
// publie et supprime, même sur son projet privé. Les photos sont envoyées avant, une par une, par
// POST /v1/projects/{id}/visuals (`slot=update`, routes/visuals.ts) ; la publication les cite par
// leur identifiant et les rattache. La dernière mise à jour se lit avec le projet (projects/load.ts).
import { createRoute, z } from '@hono/zod-openapi'
import {
  NewProjectUpdate,
  ProjectUpdate,
  ProjectUpdatePage,
  UPDATES_PAGE_SIZE,
  UPDATES_PER_DAY,
  UpdateId,
  UpdatesQuery,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { after, encodeCursor, readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { projectAccess } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { toUpdate, updatesPageOf } from '../updates/load'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (relecture de sécurité du plan de R7a) : 10 mises à jour par jour et par membre,
// tous ses projets ensemble (chaque demande compte, même refusée). Supprimer une mise à jour compte
// comme une modification du projet (60 par heure, le même compteur que routes/projects.ts).
const HOUR = 60 * 60 * 1000
const updateRule: RateRule = { windowMs: 24 * HOUR, max: UPDATES_PER_DAY }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const postUpdateRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/updates',
  summary: 'Publish an update on my project',
  description:
    'One to five lines, each with a family (new, fixed, polish); an optional title (60 characters) ' +
    'and version (20); up to four photos already uploaded with `slot=update`, cited by id and in ' +
    'order. Allowed on a private project too. The project itself is not modified.',
  request: {
    params: z.object({ id: z.string() }),
    body: { required: true, content: { 'application/json': { schema: NewProjectUpdate } } },
  },
  responses: {
    201: {
      description: 'The new update.',
      content: { 'application/json': { schema: ProjectUpdate } },
    },
    400: errorResponse('Invalid data, or a photo that is not a pending photo of this project.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The public project of another member, or a suspended account.'),
    404: errorResponse('No such project, or a private project of another member.'),
    409: errorResponse('My project, removed by the moderation (`removed`).'),
    413: errorResponse('Body too large.'),
    429: errorResponse('Too many updates today.'),
  },
})

const listUpdatesRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}/updates',
  summary: 'The timeline of a project',
  description:
    'The updates of a project, newest first, twenty per page. An update removed by the moderation ' +
    'is shown to the author of the project only, with the reason.',
  request: { params: z.object({ id: z.string() }), query: UpdatesQuery },
  responses: {
    200: {
      description: 'A page of updates.',
      content: { 'application/json': { schema: ProjectUpdatePage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such project, or a project this member cannot see.'),
  },
})

const deleteUpdateRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/updates/{updateId}',
  summary: 'Delete an update of my project',
  request: { params: z.object({ id: z.string(), updateId: z.string() }) },
  responses: {
    204: { description: 'Deleted, photos included.' },
    401: errorResponse('Not signed in.'),
    403: errorResponse('The public project of another member.'),
    404: errorResponse('No such project or update, or a private project of another member.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

/** Levée dans la transaction de publication pour l'annuler : une photo n'est pas rattachable. */
class InvalidPhotos extends Error {}

export const updateRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/updates', requireUser)
  app.use('/v1/projects/:id/updates/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const removed = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'removed'), 409)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // Publier : la session, le quota puis les droits sont vérifiés AVANT de lire le corps (relecture
  // A2). Le corps déclaré dans postUpdateRoute est vérifié par un middleware que Hono place juste
  // avant la route : ce garde-ci, enregistré plus tôt pour la même adresse et la même méthode,
  // passe avant lui. Ainsi chaque demande compte dans le quota, même mal écrite, et un autre membre
  // reçoit « refusé » ou « introuvable » sans jamais apprendre si son texte aurait été accepté.
  // `projectAccess` : une petite requête servie par la clé primaire de project (projects/load.ts).
  app.on('POST', '/v1/projects/:id/updates', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).update, updateRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const allowed = await projectAccess(db, c.req.param('id'), user.id)
    if (allowed === 'not_found') return notFound(c)
    if (allowed === 'forbidden') return forbidden(c)
    if (allowed === 'removed') return removed(c)
    await next()
  })

  // Supprimer : le quota « modifications d'un projet » passe avant la recherche du projet, pour que
  // chaque demande compte, même celle qui vise un projet inconnu (relecture A2).
  app.on('DELETE', '/v1/projects/:id/updates/:updateId', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  app.openapi(postUpdateRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande et vérifié que le projet est celui du membre.
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const update = {
      id: crypto.randomUUID(),
      projectId: id,
      title: body.title,
      version: body.version,
      lines: body.lines,
      beforeAfter: body.beforeAfter,
      // La date vient de l'horloge de JavaScript, comme la date de publication d'un projet. Publier
      // une mise à jour ne touche pas au projet : sa date de modification (updatedAt) ne bouge pas.
      createdAt: new Date(),
    }

    // Une transaction (tout réussit, ou rien). La garde a lu le projet AVANT cette écriture : la
    // modération a pu le retirer, ou son auteur le supprimer, entre-temps. On relit donc son état en
    // verrouillant sa ligne « FOR SHARE » : une écriture sur cette ligne (le retrait, la
    // suppression) attend la fin de la transaction, et deux lectures partagées ne se gênent pas.
    let outcome:
      | { kind: 'gone' }
      | { kind: 'removed' }
      | { kind: 'invalid_photos' }
      | { kind: 'ok'; photos: (typeof schema.projectMedia.$inferSelect)[] }
    try {
      outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ removedAt: schema.project.removedAt })
          .from(schema.project)
          .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
          .for('share')
        if (!locked) return { kind: 'gone' as const }
        if (locked.removedAt !== null) return { kind: 'removed' as const }
        await tx.insert(schema.projectUpdate).values(update)
        if (body.photos.length === 0) return { kind: 'ok' as const, photos: [] }

        // Le rattachement des photos : UNE seule écriture conditionnelle (relecture A1). La
        // condition « de ce projet, slot update, pas encore rattachée » est dans l'UPDATE lui-même,
        // pas dans une lecture faite avant : deux publications simultanées qui citent la même photo
        // ne la déplacent pas, la seconde ne trouve plus de ligne à écrire. `returning` rend les
        // lignes réellement écrites : s'il en manque, une photo est inconnue, d'ailleurs, de la
        // galerie ou déjà prise, et toute la publication est annulée (la même réponse pour tous
        // ces cas, qui ne disent rien de ce qui existe). `case when` : pour chaque photo, sa place
        // (son rang dans la liste citée) et sa description, dans la même écriture.
        const m = schema.projectMedia
        const place = sql.join(
          body.photos.map((photo, rank) => sql`when ${photo.id}::uuid then ${rank}::int`),
          sql` `,
        )
        const describe = sql.join(
          body.photos.map((photo) => sql`when ${photo.id}::uuid then ${photo.description}::text`),
          sql` `,
        )
        const attached = await tx
          .update(m)
          .set({
            updateId: update.id,
            position: sql`case ${m.id} ${place} end`,
            description: sql`case ${m.id} ${describe} end`,
          })
          .where(
            and(
              inArray(
                m.id,
                body.photos.map((photo) => photo.id),
              ),
              eq(m.projectId, id),
              eq(m.slot, 'update'),
              sql`${m.updateId} is null`,
            ),
          )
          .returning()
        if (attached.length !== body.photos.length) throw new InvalidPhotos()
        return { kind: 'ok' as const, photos: attached.sort((a, b) => a.position - b.position) }
      })
    } catch (error) {
      if (!(error instanceof InvalidPhotos)) throw error
      outcome = { kind: 'invalid_photos' }
    }
    if (outcome.kind === 'gone') return notFound(c)
    if (outcome.kind === 'removed') return removed(c)
    if (outcome.kind === 'invalid_photos') {
      return c.json(errorBody(languageOf(c), 'invalid_photos'), 400)
    }
    return c.json(toUpdate(update, outcome.photos, publicApiUrl), 201)
  })

  app.openapi(listUpdatesRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    // Sans quota : une lecture paginée et indexée (notée dans « À surveiller » de securite.md).
    // « Introuvable » pour tout projet que ce membre ne voit pas (inconnu, privé ou retiré d'un
    // autre, bloqué dans un sens ou l'autre : la même réponse). Un projet public d'un autre se lit.
    if ((await projectAccess(db, id, user.id)) === 'not_found') return notFound(c)

    // Le curseur se décode en trois étapes (cursor.ts : format, JSON, schéma strict). Sa date est
    // bornée des deux côtés : avant 2000 (PostgreSQL refuse l'an 0) et après 2100 (rien n'est publié
    // si tard) ; hors de ces bornes, 400 comme pour tout curseur qui ne veut rien dire.
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid' || (cursor !== null && cursor.at >= '2100')) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }

    // 21 lignes : la dernière dit s'il y a une suite, sans compter ni deviner.
    const rows = await updatesPageOf(
      db,
      id,
      user.id,
      cursor ? after(cursor, schema.projectUpdate.createdAt, schema.projectUpdate.id) : undefined,
      UPDATES_PAGE_SIZE + 1,
      publicApiUrl,
    )
    const items = rows.slice(0, UPDATES_PAGE_SIZE)
    const last = items.at(-1)
    return c.json(
      {
        items,
        nextCursor:
          rows.length > UPDATES_PAGE_SIZE && last
            ? encodeCursor({ at: last.createdAt, id: last.id })
            : null,
      },
      200,
    )
  })

  app.openapi(deleteUpdateRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le quota a déjà été compté par le garde ci-dessus.
    const { id, updateId } = c.req.valid('param')
    // Supprimer reste permis sur son projet retiré, et pour une mise à jour retirée : son auteur
    // peut toujours effacer ce qu'il a écrit ('removed' passe donc ici).
    const allowed = await projectAccess(db, id, user.id)
    if (allowed === 'not_found') return notFound(c)
    if (allowed === 'forbidden') return forbidden(c)
    if (!UpdateId.safeParse(updateId).success) return notFound(c)

    // Les fichiers à effacer, lus AVANT la suppression : les lignes de photos partent en cascade
    // avec la mise à jour, et on ne saurait plus quels fichiers ranger. La condition « de ce
    // projet » empêche de viser, par l'adresse de son projet, la mise à jour d'un autre.
    const m = schema.projectMedia
    const photos = await db
      .select({ storageKey: m.storageKey })
      .from(m)
      .where(and(eq(m.updateId, updateId), eq(m.projectId, id)))
    // « returning » renvoie les lignes effacées : aucune, et la mise à jour était introuvable.
    const deleted = await db
      .delete(schema.projectUpdate)
      .where(and(eq(schema.projectUpdate.id, updateId), eq(schema.projectUpdate.projectId, id)))
      .returning({ id: schema.projectUpdate.id })
    if (deleted.length === 0) return notFound(c)
    for (const photo of photos) await storage.delete(photo.storageKey)
    // 204 : « c'est fait », sans contenu à renvoyer.
    return c.body(null, 204)
  })

  return app
}
