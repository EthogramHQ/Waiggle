// Routes des visuels d'un projet (tranche 3b-1) : ajouter une photo à la galerie ou comme
// couverture verticale, en retirer une. L'ordre de la galerie se change avec le projet
// (PATCH /v1/projects/:id, champ visualOrder). Seul l'auteur touche à ses visuels.
import { createRoute, z } from '@hono/zod-openapi'
import { Project, VISUAL_MAX_BYTES, VISUALS_MAX, VisualSlot } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { processVisual } from '../media/visual'
import { loadVisibleProject, projectAccess } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (docs/scenarios/phase-1.md, tranche 3) : 30 envois de visuel par heure ; retirer
// un visuel compte comme une modification du projet (60 par heure).
const HOUR = 60 * 60 * 1000
const uploadRule: RateRule = { windowMs: HOUR, max: 30 }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const projectResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: Project } },
})

const uploadVisualRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/visuals',
  summary: 'Add a photo to my project',
  description:
    'multipart/form-data with a "visual" file (JPEG, PNG or WebP, 5 MB at most) and an optional ' +
    '"slot": "gallery" (default, 6 photos at most) or "portrait" (the vertical cover, taller than ' +
    'wide, replaces the previous one). The image is re-encoded to WebP, 1 600 px at most, without ' +
    'metadata, and summarized as a ThumbHash.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    201: projectResponse('The project with its new photo.'),
    400: errorResponse('No file, or an unknown slot.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Someone else’s project.'),
    404: errorResponse('No such project.'),
    409: errorResponse(
      'Six photos already (`too_many_visuals`), or my project removed by the moderation (`removed`).',
    ),
    413: errorResponse('File too large.'),
    415: errorResponse('Not a JPEG, PNG or WebP image, or a vertical cover wider than tall.'),
    429: errorResponse('Too many uploads.'),
    503: errorResponse('Too many images being processed; retry later.'),
  },
})

const deleteVisualRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}/visuals/{visualId}',
  summary: 'Remove a photo from my project',
  request: { params: z.object({ id: z.string(), visualId: z.string() }) },
  responses: {
    200: projectResponse('The project without that photo.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse('Someone else’s project.'),
    404: errorResponse('No such project or photo.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

export const visualRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  app.use('/v1/projects/:id/visuals', requireUser)
  app.use('/v1/projects/:id/visuals/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  /** Comme dans routes/projects.ts : « introuvable » s'il ne le voit pas, « refusé » s'il le voit. */
  const ownProject = async (id: string, userId: string) => {
    const project = await loadVisibleProject(db, id, userId, publicApiUrl)
    if (!project) return 'not_found' as const
    if (!project.isMine) return 'forbidden' as const
    return project
  }

  // Les droits sont vérifiés AVANT de toucher au corps de la requête : la limite de taille, juste
  // après, lit le flux pour compter les octets. Sans cet ordre, un autre membre pourrait faire lire
  // au serveur un envoi sans fin vers le projet de quelqu'un d'autre.
  app.use('/v1/projects/:id/visuals', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Une petite requête (l'auteur et la date de retrait) plutôt que tout le projet.
    const access = await projectAccess(db, c.req.param('id'), user.id)
    if (access === 'not_found') return notFound(c)
    if (access === 'forbidden') return forbidden(c)
    // Son projet retiré par la modération : on n'y ajoute pas de photo tant qu'il n'est pas
    // rétabli (tranche 7a, règle 30 de la relecture du plan). Supprimer une photo reste permis.
    if (access === 'removed') return c.json(errorBody(languageOf(c), 'removed'), 409)
    await next()
  })

  // Avant même de lire le fichier : on coupe tout envoi plus gros que la limite (+ 64 Ko pour
  // l'enveloppe du formulaire), comme pour l'avatar.
  app.use(
    '/v1/projects/:id/visuals',
    bodyLimit({
      maxSize: VISUAL_MAX_BYTES + 64 * 1024,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    }),
  )

  app.openapi(uploadVisualRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')
    // Les droits ont déjà été vérifiés plus haut, avant de lire quoi que ce soit ; puis la limite.
    const decision = await limiter.hit(memberCounterKeys(user.id).visualUpload, uploadRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    const form = await c.req.parseBody()
    const file = form.visual
    // Sans champ « slot » : la galerie. Une valeur inconnue est refusée.
    const slot = VisualSlot.safeParse(form.slot ?? 'gallery')
    if (!(file instanceof File) || !slot.success) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }
    if (file.size > VISUAL_MAX_BYTES) {
      return c.json(errorBody(languageOf(c), 'payload_too_large'), 413)
    }

    const result = await processVisual(new Uint8Array(await file.arrayBuffer()), slot.data)
    if (!result.ok && result.reason === 'busy') {
      c.header('Retry-After', '10')
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
    if (!result.ok) return c.json(errorBody(languageOf(c), 'unsupported_media_type'), 415)

    // Nom de fichier tiré au hasard par le serveur, jamais celui envoyé par le membre.
    const key = `visuals/${crypto.randomUUID()}.webp`
    await storage.put(key, result.data)

    // Une transaction (tout réussit, ou rien) qui VERROUILLE la ligne du projet (FOR UPDATE) :
    // deux envois simultanés passent l'un après l'autre. Sans ce verrou, ils compteraient tous
    // deux 5 photos et en ajouteraient chacun une : 7 au total.
    let outcome:
      | { gone: true }
      | { gone: false; removed: true }
      | { gone: false; removed: false; full: true }
      | { gone: false; removed: false; full: false; replacedKey: string | null }
    try {
      outcome = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ removedAt: schema.project.removedAt })
          .from(schema.project)
          .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
          .for('update')
        // Le projet a été supprimé pendant le traitement de l'image : il n'y a plus où la ranger.
        if (!locked) return { gone: true }
        // Ou retiré par la modération depuis la garde (lue avant le traitement de l'image) : on le
        // relit ici, sous le verrou. En READ COMMITTED, « FOR UPDATE » rend la version la plus
        // récente de la ligne, celle qu'a laissée une décision validée pendant qu'on attendait.
        if (locked.removedAt !== null) return { gone: false, removed: true }
        const existing = await tx
          .select({
            id: schema.projectMedia.id,
            position: schema.projectMedia.position,
            storageKey: schema.projectMedia.storageKey,
          })
          .from(schema.projectMedia)
          .where(
            and(eq(schema.projectMedia.projectId, id), eq(schema.projectMedia.slot, slot.data)),
          )

        let replacedKey: string | null = null
        if (slot.data === 'gallery' && existing.length >= VISUALS_MAX) {
          return { gone: false, removed: false, full: true }
        }
        if (slot.data === 'portrait') {
          // Une seule couverture verticale : la nouvelle remplace l'ancienne.
          for (const old of existing) {
            await tx.delete(schema.projectMedia).where(eq(schema.projectMedia.id, old.id))
            replacedKey = old.storageKey
          }
        }
        await tx.insert(schema.projectMedia).values({
          id: crypto.randomUUID(),
          projectId: id,
          slot: slot.data,
          // À la suite des photos existantes (0 pour la couverture verticale).
          position:
            slot.data === 'gallery' ? Math.max(-1, ...existing.map((m) => m.position)) + 1 : 0,
          storageKey: key,
          width: result.width,
          height: result.height,
          thumbhash: result.thumbhash,
        })
        return { gone: false, removed: false, full: false, replacedKey }
      })
    } catch (error) {
      await storage.delete(key) // la base n'a rien enregistré : le nouveau fichier ne sert à rien
      throw error
    }
    if (outcome.gone) {
      await storage.delete(key)
      return notFound(c)
    }
    if (outcome.removed) {
      await storage.delete(key) // rien n'a été enregistré : le fichier déjà écrit ne sert à rien
      return c.json(errorBody(languageOf(c), 'removed'), 409)
    }
    if (outcome.full) {
      await storage.delete(key)
      return c.json(errorBody(languageOf(c), 'too_many_visuals'), 409)
    }
    if (outcome.replacedKey) await storage.delete(outcome.replacedKey)

    const project = await loadVisibleProject(db, id, user.id, publicApiUrl)
    if (!project) return notFound(c)
    return c.json(project, 201)
  })

  app.openapi(deleteVisualRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le quota d'abord, puis le projet (audit de sécurité du 25/10/2026, C7) : chaque demande
    // compte, même celle qui vise un projet inconnu ou celui d'un autre, et le serveur ne lit pas
    // le projet pour un membre qui a déjà dépassé son quota.
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const { id, visualId } = c.req.valid('param')
    const access = await ownProject(id, user.id)
    if (access === 'not_found') return notFound(c)
    if (access === 'forbidden') return forbidden(c)

    // Un identifiant mal formé ne désigne aucune photo (et ferait échouer la requête SQL).
    if (!z.uuid().safeParse(visualId).success) return notFound(c)
    // returning : la ligne supprimée, pour connaître le fichier à effacer ensuite. La condition
    // « de ce projet » empêche de viser la photo d'un autre projet avec son identifiant.
    const [removed] = await db
      .delete(schema.projectMedia)
      .where(and(eq(schema.projectMedia.id, visualId), eq(schema.projectMedia.projectId, id)))
      .returning({ storageKey: schema.projectMedia.storageKey })
    if (!removed) return notFound(c)
    await storage.delete(removed.storageKey)

    const project = await loadVisibleProject(db, id, user.id, publicApiUrl)
    if (!project) return notFound(c)
    return c.json(project, 200)
  })

  return app
}
