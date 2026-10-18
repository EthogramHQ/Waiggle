// Routes du membre connecté : lire et modifier son profil, changer d'avatar, exporter ses données.
// Toutes exigent d'être connecté.
import { createRoute } from '@hono/zod-openapi'
import { AccountExport, AVATAR_MAX_BYTES, Me, ProfileUpdate } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { processAvatar } from '../media/avatar'
import type { FileStorage } from '../media/storage'
import { loadMe } from '../profile/me'
import { loadProjectsOf } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus de ces routes (voir docs/scenarios/phase-1.md, tranche 2).
const HOUR = 60 * 60 * 1000
const profileRule: RateRule = { windowMs: HOUR, max: 30 }
const avatarRule: RateRule = { windowMs: HOUR, max: 10 }

const meResponse = { description: 'The profile.', content: { 'application/json': { schema: Me } } }

const meRoute = createRoute({
  method: 'get',
  path: '/v1/me',
  summary: 'The signed-in member',
  responses: { 200: meResponse, 401: errorResponse('Not signed in.') },
})

const updateMeRoute = createRoute({
  method: 'patch',
  path: '/v1/me',
  summary: 'Update my profile and language',
  // La requête doit respecter ProfileUpdate ; sinon le routeur répond 400 avant même la route.
  // required: true : un corps JSON est obligatoire. Sans cette option, une requête envoyée dans un
  // autre format (text/plain…) passait sans être vérifiée.
  request: {
    body: { required: true, content: { 'application/json': { schema: ProfileUpdate } } },
  },
  responses: {
    200: meResponse,
    400: errorResponse('Invalid data.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many changes.'),
  },
})

const avatarRoute = createRoute({
  method: 'post',
  path: '/v1/me/avatar',
  summary: 'Upload my avatar',
  description:
    'multipart/form-data with an "avatar" file (JPEG, PNG or WebP, 5 MB at most). ' +
    'The image is re-encoded to a 512 px WebP square without metadata.',
  responses: {
    200: meResponse,
    400: errorResponse('No file.'),
    401: errorResponse('Not signed in.'),
    413: errorResponse('File too large.'),
    415: errorResponse('Not a JPEG, PNG or WebP image.'),
    429: errorResponse('Too many uploads.'),
    503: errorResponse('Too many images being processed; retry later.'),
  },
})

const exportRoute = createRoute({
  method: 'get',
  path: '/v1/me/export',
  summary: 'Download all my data (GDPR right of access)',
  responses: {
    200: {
      description: 'Everything the app stores about the member, without secrets.',
      content: { 'application/json': { schema: AccountExport } },
    },
    401: errorResponse('Not signed in.'),
  },
})

type Deps = {
  db: Database
  storage: FileStorage
  limiter: RateLimiter
  publicApiUrl: string
}

export const meRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Toutes ces routes exigent un membre connecté. Ce contrôle passe en premier, avant la lecture
  // du corps de la requête (vérification du JSON, limite de taille de l'avatar…).
  app.use('/v1/me', requireUser)
  app.use('/v1/me/*', requireUser)

  // Réponses d'erreur courantes, dans la langue du visiteur.
  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    // Retry-After : en-tête standard qui dit dans combien de secondes réessayer.
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  app.openapi(meRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  app.openapi(updateMeRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).profile, profileRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    // c.req.valid('json') : le corps de la requête, déjà vérifié par le schéma ProfileUpdate.
    const { name, language, bio, favoriteTools } = c.req.valid('json')

    // Le nom et la langue sont dans la table `user`…
    if (name !== undefined || language !== undefined) {
      await db
        .update(schema.user)
        // On n'écrit que ce qui a été envoyé : { name } seulement si name existe, etc.
        .set({ ...(name !== undefined && { name }), ...(language !== undefined && { language }) })
        .where(eq(schema.user.id, user.id))
    }
    // … la bio et les outils dans `profile`. « Upsert » : créer la ligne si elle n'existe pas
    // encore, sinon la mettre à jour (insert … on conflict do update).
    if (bio !== undefined || favoriteTools !== undefined) {
      await db
        .insert(schema.profile)
        .values({ userId: user.id, bio: bio ?? '', favoriteTools: favoriteTools ?? [] })
        .onConflictDoUpdate({
          target: schema.profile.userId,
          set: {
            ...(bio !== undefined && { bio }),
            ...(favoriteTools !== undefined && { favoriteTools }),
          },
        })
    }

    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  // Avant même de lire le fichier : on coupe tout envoi plus gros que la limite (+ 64 Ko pour
  // l'enveloppe du formulaire). Un envoi géant ne remplira jamais la mémoire du serveur.
  app.use(
    '/v1/me/avatar',
    bodyLimit({
      maxSize: AVATAR_MAX_BYTES + 64 * 1024,
      onError: (c) => c.json(errorBody(languageOf(c), 'payload_too_large'), 413),
    }),
  )

  app.openapi(avatarRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).avatar, avatarRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    // parseBody lit un formulaire « multipart » : les champs texte et les fichiers.
    const form = await c.req.parseBody()
    const file = form.avatar
    if (!(file instanceof File)) return c.json(errorBody(languageOf(c), 'validation'), 400)
    if (file.size > AVATAR_MAX_BYTES) {
      return c.json(errorBody(languageOf(c), 'payload_too_large'), 413)
    }

    const result = await processAvatar(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok && result.reason === 'busy') {
      // 503 : service momentanément indisponible. Retry-After : réessayer dans 10 secondes.
      c.header('Retry-After', '10')
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
    if (!result.ok) return c.json(errorBody(languageOf(c), 'unsupported_media_type'), 415)

    // Nom de fichier tiré au hasard par le serveur : jamais celui envoyé par le membre.
    const key = `avatars/${crypto.randomUUID()}.webp`
    await storage.put(key, result.data)

    // On échange l'ancien avatar contre le nouveau, puis on efface l'ancien fichier.
    // Une « transaction » regroupe plusieurs opérations : elles réussissent toutes, ou aucune.
    // Le verrou (FOR UPDATE) fait patienter un second envoi simultané jusqu'à la fin de celle-ci :
    // sans lui, deux envois liraient le même « ancien » avatar et l'un des nouveaux fichiers
    // resterait orphelin (jamais effacé, même à la suppression du compte).
    let previousKey: string | null
    try {
      previousKey = await db.transaction(async (tx) => {
        // La ligne du profil doit exister pour pouvoir être verrouillée.
        await tx.insert(schema.profile).values({ userId: user.id }).onConflictDoNothing()
        const [row] = await tx
          .select({ avatarKey: schema.profile.avatarKey })
          .from(schema.profile)
          .where(eq(schema.profile.userId, user.id))
          .for('update')
        await tx
          .update(schema.profile)
          .set({ avatarKey: key })
          .where(eq(schema.profile.userId, user.id))
        return row?.avatarKey ?? null
      })
    } catch (error) {
      await storage.delete(key) // la base n'a rien enregistré : le nouveau fichier ne sert à rien
      throw error
    }
    if (previousKey) await storage.delete(previousKey)

    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)
    return c.json(me, 200)
  })

  app.openapi(exportRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const me = await loadMe(db, user.id, publicApiUrl)
    if (!me) return unauthorized(c)

    // On choisit les colonnes une par une (select({...})) : impossible d'exporter par erreur
    // l'empreinte du mot de passe ou un jeton, qui ne sont jamais demandés.
    const loginMethods = await db
      .select({ provider: schema.account.providerId, createdAt: schema.account.createdAt })
      .from(schema.account)
      .where(eq(schema.account.userId, user.id))
    const sessions = await db
      .select({
        createdAt: schema.session.createdAt,
        expiresAt: schema.session.expiresAt,
        ipAddress: schema.session.ipAddress,
        userAgent: schema.session.userAgent,
      })
      .from(schema.session)
      .where(eq(schema.session.userId, user.id))

    // Tous ses projets, privés compris (c'est lui qui regarde).
    const projects = await loadProjectsOf(db, user.id, user.id, publicApiUrl)

    // Content-Disposition: attachment → le navigateur propose d'enregistrer le fichier.
    c.header('Content-Disposition', 'attachment; filename="ruche-export.json"')
    return c.json(
      {
        exportedAt: new Date().toISOString(),
        user: me,
        projects,
        loginMethods: loginMethods.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
        sessions: sessions.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        })),
      },
      200,
    )
  })

  return app
}
