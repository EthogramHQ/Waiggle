// Routes des notes d'un projet (tranche 4b) : POST /v1/projects/{id}/notes pour en publier une,
// DELETE /v1/projects/{id}/notes/{noteId} pour en retirer une. Seul l'auteur du projet le peut,
// même sur son projet privé. Le journal se lit avec le projet (champ `notes` de GET
// /v1/projects/{id}) ; les notes des projets suivis arrivent dans le fil (feed/load.ts).
import { createRoute, z } from '@hono/zod-openapi'
import { NewProjectNote, ProjectNote, ProjectNoteId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { toNote } from '../notes/load'
import { projectAccess } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (docs/scenarios/phase-1.md, tranche 4) : 30 notes par jour et par membre, tous
// ses projets ensemble. Retirer une note compte comme une modification du projet (60 par heure,
// le même compteur que dans routes/projects.ts).
const HOUR = 60 * 60 * 1000
const noteRule: RateRule = { windowMs: 24 * HOUR, max: 30 }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const postNoteRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/notes',
  summary: 'Publish a note on my project',
  description:
    'Plain text, 1 to 1 000 characters, trimmed, shown as typed. Allowed on a private project too.',
  request: {
    params: z.object({ id: z.string() }),
    body: { required: true, content: { 'application/json': { schema: NewProjectNote } } },
  },
  responses: {
    201: {
      description: 'The new note.',
      content: { 'application/json': { schema: ProjectNote } },
    },
    400: errorResponse('Invalid text.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('The public project of another member.'),
    404: errorResponse('No such project, or a private project of another member.'),
    409: errorResponse('My project, removed by the moderation (`removed`).'),
    429: errorResponse('Too many notes today.'),
  },
})

const deleteNoteRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/notes/{noteId}',
  summary: 'Delete a note of my project',
  request: { params: z.object({ id: z.string(), noteId: z.string() }) },
  responses: {
    204: { description: 'Deleted.' },
    401: errorResponse('Not signed in.'),
    403: errorResponse('The public project of another member.'),
    404: errorResponse('No such project or note, or a private project of another member.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter }

export const noteRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/projects/:id/notes', requireUser)
  app.use('/v1/projects/:id/notes/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  /**
   * Le membre peut-il écrire dans le journal de ce projet ? Seulement s'il en est l'auteur.
   * Sinon : « introuvable » s'il ne le voit pas (identifiant mal formé, projet inconnu, privé ou
   * retiré d'un autre : la même réponse, pour ne rien révéler), « refusé » s'il le voit sans en
   * être l'auteur (un projet public d'un autre membre). 'removed' : son projet, retiré par la
   * modération (tranche 6d). Une petite requête, servie par la clé primaire de project
   * (projectAccess, projects/load.ts) : on ne lit pas tout le projet.
   */
  const access = (projectId: string, userId: string) => projectAccess(db, projectId, userId)

  // 409 « removed » (règle 30 de la relecture du plan de 6d) : on n'ajoute pas de note à son
  // projet retiré tant qu'il n'est pas rétabli. Seul son auteur peut recevoir cette réponse.
  const removed = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'removed'), 409)

  // Publier : le quota et les droits sont vérifiés AVANT de lire le texte de la note. Le corps
  // déclaré dans postNoteRoute est en effet vérifié par un middleware que Hono place juste avant la
  // route : ce garde-ci, enregistré plus tôt pour la même adresse et la même méthode, passe avant
  // lui. Ainsi chaque demande compte dans le quota, même mal écrite, et un autre membre reçoit
  // « refusé » ou « introuvable » sans jamais apprendre si son texte aurait été accepté.
  app.on('POST', '/v1/projects/:id/notes', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).note, noteRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const allowed = await access(c.req.param('id'), user.id)
    if (allowed === 'not_found') return notFound(c)
    if (allowed === 'forbidden') return forbidden(c)
    if (allowed === 'removed') return removed(c)
    await next()
  })

  app.openapi(postNoteRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande et vérifié que le projet est celui du membre.
    const { id } = c.req.valid('param')
    // Le texte, vérifié par NewProjectNote (et débarrassé des espaces de ses bords).
    const { body } = c.req.valid('json')
    // L'identifiant est tiré par le serveur ; la date vient de l'horloge de JavaScript, comme la
    // date de publication d'un projet. Publier une note ne touche pas au projet : sa date de
    // modification (updatedAt) ne bouge pas.
    const note = { id: crypto.randomUUID(), projectId: id, body, createdAt: new Date() }
    await db.insert(schema.projectNote).values(note)
    return c.json(toNote(note), 201)
  })

  app.openapi(deleteNoteRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    const { id, noteId } = c.req.valid('param')
    // Supprimer une note reste permis sur son projet retiré, et pour une note retirée : son auteur
    // peut toujours effacer ce qu'il a écrit ('removed' passe donc ici).
    const allowed = await access(id, user.id)
    if (allowed === 'not_found') return notFound(c)
    if (allowed === 'forbidden') return forbidden(c)
    if (!ProjectNoteId.safeParse(noteId).success) return notFound(c)

    // La note n'est effacée que si elle appartient bien au projet de l'adresse, dont le membre est
    // l'auteur (vérifié juste au-dessus) : une note d'un autre projet, même du sien, n'est pas
    // touchée. « returning » renvoie les lignes effacées : aucune, et la note était introuvable.
    const deleted = await db
      .delete(schema.projectNote)
      .where(and(eq(schema.projectNote.id, noteId), eq(schema.projectNote.projectId, id)))
      .returning({ id: schema.projectNote.id })
    if (deleted.length === 0) return notFound(c)
    // 204 : « c'est fait », sans contenu à renvoyer.
    return c.body(null, 204)
  })

  return app
}
