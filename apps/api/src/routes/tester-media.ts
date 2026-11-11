// L'envoi des images du coin des testeurs (R7b) : POST /v1/projects/{id}/testers/media reçoit un
// fichier et son genre (`kind`), puis le ré-encode sans métadonnées. Une photo d'appel (`call`) vient
// de l'auteur, une capture d'écran (`capture`) d'un testeur ; l'image reste « en attente » tant
// qu'aucun appel ni message ne la cite (routes/tester-calls.ts, et les messages des fils). Sur le
// modèle de routes/visuals.ts : les droits et le quota passent AVANT la lecture du corps. Servir les
// fichiers est le travail de routes/media.ts.
import { createRoute, z } from '@hono/zod-openapi'
import {
  CALL_PHOTOS_PER_PROJECT_MAX,
  CAPTURES_PER_THREAD_MAX,
  TESTER_MEDIA_PENDING_MAX,
  TesterMedia,
  TesterMediaKind,
  VISUAL_MAX_BYTES,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { processVisual } from '../media/visual'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { cornerAccess } from '../testers/access'
import { toTesterMedia } from '../testers/media'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Le même quota que les visuels des projets : 30 envois par heure et par membre, comptés avant tout
// examen (chaque demande compte, même refusée).
const uploadRule: RateRule = { windowMs: 60 * 60 * 1000, max: 30 }

const uploadRoute = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/testers/media',
  summary: 'Upload an image of the testers corner',
  description:
    'multipart/form-data with a "file" (JPEG, PNG or WebP, 5 MB at most) and a "kind": "call" (a ' +
    'photo for a call, the author only) or "capture" (a screenshot for a feedback, a current ' +
    'tester only). The image is re-encoded to WebP, 1 600 px at most, without metadata. It stays ' +
    `pending until a call or a message cites it: ${TESTER_MEDIA_PENDING_MAX} pending images at ` +
    'most per member and project (a third replaces the oldest), 100 call photos per project and ' +
    '100 captures per thread, pending ones included.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    201: {
      description: 'The pending image.',
      content: { 'application/json': { schema: TesterMedia } },
    },
    400: errorResponse('No file, or an unknown kind.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse(
      'A kind that does not match the role (an author sends photos, a tester captures).',
    ),
    404: errorResponse('No such corner for this member.'),
    409: errorResponse(
      'The corner is closed (`corner_closed`), or the storage cap is reached (`tester_media_full`).',
    ),
    413: errorResponse('File too large.'),
    415: errorResponse('Not a JPEG, PNG or WebP image.'),
    429: errorResponse('Too many uploads.'),
    503: errorResponse('Too many images being processed; retry later.'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

export const testerMediaRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  app.use('/v1/projects/:id/testers/media', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const cornerClosed = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'corner_closed'), 409)

  // Avant même de lire le corps : le quota (chaque demande compte), puis le droit d'entrer dans le
  // coin. La limite de taille, juste après, lit le flux pour compter les octets : sans cet ordre, un
  // autre membre pourrait faire lire au serveur un envoi sans fin vers le coin de quelqu'un d'autre.
  app.on('POST', '/v1/projects/:id/testers/media', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).visualUpload, uploadRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    const access = await cornerAccess(db, c.req.param('id'), user.id)
    if (access === 'not_found' || access === 'former_tester') return notFound(c)
    if (access === 'author_closed') return cornerClosed(c)
    await next()
  })

  // Coupe tout envoi plus gros que la limite d'une image (+ 64 Ko pour l'enveloppe du formulaire).
  app.on(
    'POST',
    '/v1/projects/:id/testers/media',
    bodyLimit({
      maxSize: VISUAL_MAX_BYTES + 64 * 1024,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    }),
  )

  app.openapi(uploadRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const { id } = c.req.valid('param')

    const form = await c.req.parseBody()
    const file = form.file
    const kind = TesterMediaKind.safeParse(form.kind)
    if (!(file instanceof File) || !kind.success) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }
    // Chacun envoie son genre d'image : l'auteur des photos d'appel, un testeur des captures.
    const expected = kind.data === 'call' ? 'author' : 'tester'
    const access = await cornerAccess(db, id, user.id)
    if (access === 'not_found') return notFound(c)
    if (access !== expected) return forbidden(c)
    if (file.size > VISUAL_MAX_BYTES) {
      return c.json(errorBody(languageOf(c), 'payload_too_large'), 413)
    }

    const result = await processVisual(new Uint8Array(await file.arrayBuffer()), 'gallery')
    if (!result.ok && result.reason === 'busy') {
      c.header('Retry-After', '10')
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
    if (!result.ok) return c.json(errorBody(languageOf(c), 'unsupported_media_type'), 415)

    // Nom de fichier tiré au hasard par le serveur, jamais celui envoyé par le membre.
    const key = `testers/${crypto.randomUUID()}.webp`
    await storage.put(key, result.data)

    // Une transaction qui VERROUILLE la ligne du projet (`for update`) : deux envois simultanés
    // passent l'un après l'autre, sans quoi ils compteraient tous deux une attente de moins que la
    // vérité. Le droit est relu ici : le projet a pu se fermer pendant le traitement de l'image.
    const mediaId = crypto.randomUUID()
    const m = schema.testerMedia
    let outcome: { kind: 'closed' } | { kind: 'full' } | { kind: 'ok'; replacedKey: string | null }
    try {
      outcome = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, id))
          .for('update')
        if ((await cornerAccess(tx, id, user.id)) !== expected) return { kind: 'closed' as const }

        // Les images en attente de ce membre sur ce projet, la plus ancienne d'abord. En SQL :
        // select … from tester_media where project_id = $1 and owner_id = $2 and call_id is null
        // and message_id is null order by created_at. L'index partiel tester_media_pending_idx
        // (project_id, owner_id) where call_id is null and message_id is null les donne.
        const pending = await tx
          .select({ id: m.id, storageKey: m.storageKey })
          .from(m)
          .where(
            and(eq(m.projectId, id), eq(m.ownerId, user.id), isNull(m.callId), isNull(m.messageId)),
          )
          .orderBy(asc(m.createdAt))
        const oldest = pending.length >= TESTER_MEDIA_PENDING_MAX ? pending[0] : undefined

        // Le plafond de stockage, attentes comprises : 100 photos d'appel par projet, 100 captures
        // par fil (un membre n'envoie ses captures que dans son propre fil). L'index
        // tester_media_project_owner_idx (project_id, owner_id, kind) donne les lignes à compter ;
        // une image remplacée libère sa place.
        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(m)
          .where(and(eq(m.projectId, id), eq(m.ownerId, user.id), eq(m.kind, kind.data)))
        const cap = kind.data === 'call' ? CALL_PHOTOS_PER_PROJECT_MAX : CAPTURES_PER_THREAD_MAX
        if ((counted?.n ?? 0) - (oldest ? 1 : 0) >= cap) return { kind: 'full' as const }

        // Remplacer la plus ancienne attente : un DELETE conditionnel (« toujours en attente » est
        // dans la requête), pas une lecture d'avant. `returning` : s'il ne rend rien, l'image vient
        // d'être rattachée à un appel ou à un message, et on n'y touche pas.
        let replacedKey: string | null = null
        if (oldest) {
          const [deleted] = await tx
            .delete(m)
            .where(and(eq(m.id, oldest.id), isNull(m.callId), isNull(m.messageId)))
            .returning({ storageKey: m.storageKey })
          replacedKey = deleted?.storageKey ?? null
        }
        await tx.insert(m).values({
          id: mediaId,
          projectId: id,
          ownerId: user.id,
          kind: kind.data,
          storageKey: key,
          width: result.width,
          height: result.height,
          thumbhash: result.thumbhash,
          // La date vient de l'horloge de JavaScript (la purge de nuit compte 24 h depuis elle).
          createdAt: new Date(),
        })
        return { kind: 'ok' as const, replacedKey }
      })
    } catch (error) {
      await storage.delete(key) // la base n'a rien enregistré : le nouveau fichier ne sert à rien
      throw error
    }
    if (outcome.kind === 'closed') {
      await storage.delete(key)
      return cornerClosed(c)
    }
    if (outcome.kind === 'full') {
      await storage.delete(key)
      return c.json(errorBody(languageOf(c), 'tester_media_full'), 409)
    }
    if (outcome.replacedKey) await storage.delete(outcome.replacedKey)

    const [media] = await db.select().from(m).where(eq(m.id, mediaId))
    if (!media) return notFound(c)
    return c.json(toTesterMedia(media, publicApiUrl), 201)
  })

  return app
}
