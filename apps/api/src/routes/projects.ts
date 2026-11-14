// Routes des projets : publier, lire, modifier, supprimer. Toutes exigent d'être connecté
// (« public » veut dire « visible par les membres »). Qui voit quoi : voir projects/load.ts.
import { createRoute, z } from '@hono/zod-openapi'
import { Project, ProjectChanges, ProjectInput } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import type { FileStorage } from '../media/storage'
import { dropProjectPartRemovals, replacedProjectParts } from '../moderation/replaced'
import { categoriesExist } from '../projects/categories'
import { loadVisibleProject, mediaKeysOf, projectAccess } from '../projects/load'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { suspendedProjectChange } from '../suspension/guard'
import { isSuspended } from '../suspension/load'
import { chargeOtherTools } from '../tools/quota'
import {
  countChargedOtherTools,
  NO_FREE_TOOL_SLUG,
  noFreeToolSlug,
  resolveTools,
} from '../tools/resolve'
import { dropOrphanOthers, replaceProjectTools } from '../tools/write'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Règles anti-abus (voir docs/scenarios/phase-1.md, tranche 3).
const HOUR = 60 * 60 * 1000
const createRule: RateRule = { windowMs: 24 * HOUR, max: 20 }
const changeRule: RateRule = { windowMs: HOUR, max: 60 }

const projectResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: Project } },
})
// L'identifiant du projet dans l'adresse : {id} dans /v1/projects/{id}.
const params = z.object({ id: z.string() })

const createProjectRoute = createRoute({
  method: 'post',
  path: '/v1/projects',
  summary: 'Publish a project',
  request: { body: { required: true, content: { 'application/json': { schema: ProjectInput } } } },
  responses: {
    201: projectResponse('The new project.'),
    400: errorResponse('Invalid data, or a category that does not exist (`unknown_category`).'),
    401: errorResponse('Not signed in.'),
    429: errorResponse(
      'Too many projects today, or too many new tools today (`too_many_other_tools`).',
    ),
  },
})

const readProjectRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}',
  summary: 'Read a project',
  request: { params },
  responses: {
    200: projectResponse(
      'The project. `removal` is filled for its author only, when the moderation removed it.',
    ),
    401: errorResponse('Not signed in.'),
    404: errorResponse(
      'No such project, or a private project of another member, or one removed by the moderation.',
    ),
  },
})

const updateProjectRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}',
  summary: 'Change my project',
  request: {
    params,
    body: { required: true, content: { 'application/json': { schema: ProjectChanges } } },
  },
  responses: {
    200: projectResponse('The changed project.'),
    400: errorResponse('Invalid data.'),
    401: errorResponse('Not signed in.'),
    403: errorResponse(
      'Someone else’s project, or a suspended account sending more than { visibility: private }.',
    ),
    404: errorResponse('No such project.'),
    409: errorResponse('My project, removed by the moderation (`removed`).'),
    429: errorResponse('Too many changes, or too many new tools today (`too_many_other_tools`).'),
  },
})

const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}',
  summary: 'Delete my project',
  request: { params },
  responses: {
    204: { description: 'Deleted.' },
    401: errorResponse('Not signed in.'),
    403: errorResponse('Someone else’s project.'),
    404: errorResponse('No such project.'),
    429: errorResponse('Too many changes.'),
  },
})

type Deps = { db: Database; storage: FileStorage; limiter: RateLimiter; publicApiUrl: string }

export const projectRoutes = ({ db, storage, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, vérifié avant même de lire le contenu de la requête.
  app.use('/v1/projects', requireUser)
  app.use('/v1/projects/*', requireUser)

  // Réponses d'erreur courantes, dans la langue du visiteur. Une fonction par code : chaque route
  // déclare les codes qu'elle peut renvoyer, et TypeScript vérifie qu'elle s'y tient.
  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const forbidden = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'forbidden'), 403)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // 429 « too_many_other_tools » (R6b, sec-A5) : 30 nouveaux « Autre » par membre et par jour.
  const tooManyOtherTools = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'too_many_other_tools'), 429)
  }
  const unknownCategory = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'unknown_category'), 400)

  // 409 « removed » (tranche 7a, règle 4 de la relecture du plan) : son projet retiré par la
  // modération ne se modifie plus tant qu'il n'est pas rétabli ; il peut encore le supprimer. Seul
  // son auteur reçoit cette réponse : pour les autres, un projet retiré est introuvable (404).
  const removed = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'removed'), 409)

  // Les quotas comptent AVANT de lire le corps de la demande (audit de sécurité du 25/10/2026, C7,
  // comme routes/notes.ts). Le corps déclaré dans une route OpenAPI est vérifié par un middleware
  // que Hono place juste avant elle : un garde enregistré plus tôt, pour la même adresse et la même
  // méthode, passe donc avant lui. Ainsi chaque demande compte, même mal écrite : sinon, des
  // demandes invalides feraient travailler le serveur (lecture du JSON, schéma Zod) sans fin.
  app.on('POST', '/v1/projects', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectCreate, createRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  // Modifier un projet : même garde, même quota que sa suppression et celle de ses photos. Les
  // droits restent vérifiés par la route, après le schéma, comme avant.
  app.on('PATCH', '/v1/projects/:id', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    // Un compte suspendu (R9, relecture de sécurité P7, décision L6) : la garde des suspendus le
    // laisse entrer ici, et seul `{ "visibility": "private" }` passe (suspension/guard.ts) ; tout
    // autre corps reçoit 403 `suspended`, avant le validateur. Le corps n'est lu qu'une fois :
    // `c.req.json()` garde sa lecture, que le validateur reprend telle quelle ; une clé répétée
    // est donc jugée sur la valeur qui sera écrite (JSON garde la dernière).
    if (await isSuspended(db, user.id, new Date())) {
      const body: unknown = await c.req.json().catch(() => null)
      if (!suspendedProjectChange(body)) return c.json(errorBody(languageOf(c), 'suspended'), 403)
    }
    await next()
  })

  app.openapi(createProjectRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande dans le quota du jour.

    const input = c.req.valid('json')
    // L'identifiant est tiré par le serveur ; l'auteur est le membre connecté, jamais une donnée
    // envoyée par l'appli. Les valeurs absentes prennent leur valeur par défaut.
    const id = crypto.randomUUID()
    const visibility = input.visibility ?? 'public'
    const toolNames = input.tools ?? []
    // Le contrat accepte tout code de catégorie bien formé : la table `category` dit s'il existe.
    if (!(await categoriesExist(db, [input.primaryCategory, input.secondaryCategory]))) {
      return unknownCategory(c)
    }
    // Les noms hors catalogue se comptent AVANT d'écrire (sec-A5, sec-B1) : trop nombreux, rien
    // n'est gardé.
    const counted = await countChargedOtherTools(db, user.id, toolNames)
    const retryAfter = await chargeOtherTools(limiter, user.id, counted)
    if (retryAfter !== null) return tooManyOtherTools(c, retryAfter)
    // Une transaction : le projet, ses outils et les « Autre » créés pour lui s'écrivent ensemble,
    // ou pas du tout.
    const created = await db
      .transaction(async (tx) => {
        const resolved = await resolveTools(tx, toolNames)
        await tx.insert(schema.project).values({
          id,
          authorId: user.id,
          title: input.title,
          pitch: input.pitch,
          description: input.description ?? '',
          status: input.status ?? 'idea',
          visibility,
          demoUrl: input.demoUrl ?? null,
          // Les anciennes colonnes de texte (tools, tool_slugs) n'existent plus (migration 0018) :
          // les outils ne s'écrivent que dans project_tool.
          // R6a : la catégorie principale est obligatoire (contrat) ; la seconde, le mois de départ et
          // la difficulté sont facultatifs. Le contrat a déjà refusé une seconde égale à la principale.
          primaryCategory: input.primaryCategory,
          secondaryCategory: input.secondaryCategory ?? null,
          difficulty: input.difficulty ?? null,
          startedOn: input.startedOn ?? null,
          prompts: input.prompts ?? [],
          // La date de publication (sa date dans les fils), prise à l'horloge de JavaScript : publié
          // tout de suite, c'est maintenant ; brouillon privé, elle attendra qu'il devienne public.
          publishedAt: visibility === 'public' ? new Date() : null,
        })
        await replaceProjectTools(tx, id, resolved.tools)
        return resolved.created
      })
      .catch(noFreeToolSlug)
    // sec-B4 : plus d'adresse libre pour un nouvel « Autre » : la demande est refusée, rien n'est écrit.
    if (created === NO_FREE_TOOL_SLUG) return c.json(errorBody(languageOf(c), 'validation'), 400)
    // Une création de plus que celles comptées (un nom effacé entre-temps) : comptée après coup.
    if (created > counted) await chargeOtherTools(limiter, user.id, created - counted)

    const project = await loadVisibleProject(db, id, user.id, publicApiUrl)
    if (!project) throw new Error('project not found right after its creation')
    return c.json(project, 201)
  })

  app.openapi(readProjectRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const project = await loadVisibleProject(db, c.req.valid('param').id, user.id, publicApiUrl)
    if (!project) return notFound(c)
    return c.json(project, 200)
  })

  app.openapi(updateProjectRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Le garde ci-dessus a déjà compté la demande dans le quota de l'heure.

    const { id } = c.req.valid('param')
    // Sinon : « introuvable » s'il ne le voit pas (projet privé ou retiré d'un autre, ou
    // inexistant), « refusé » s'il le voit mais n'en est pas l'auteur (projectAccess).
    const access = await projectAccess(db, id, user.id)
    if (access === 'not_found') return notFound(c)
    if (access === 'forbidden') return forbidden(c)
    if (access === 'removed') return removed(c)

    // On n'écrit que les champs envoyés (même astuce que pour le profil).
    const changes = c.req.valid('json')
    // Les noms hors catalogue se comptent AVANT d'écrire (sec-A5, sec-B1) : trop nombreux, rien
    // n'est gardé.
    const counted =
      changes.tools === undefined ? 0 : await countChargedOtherTools(db, user.id, changes.tools)
    const retryAfter = await chargeOtherTools(limiter, user.id, counted)
    if (retryAfter !== null) return tooManyOtherTools(c, retryAfter)
    const set = {
      ...(changes.title !== undefined && { title: changes.title }),
      ...(changes.pitch !== undefined && { pitch: changes.pitch }),
      ...(changes.description !== undefined && { description: changes.description }),
      ...(changes.status !== undefined && { status: changes.status }),
      ...(changes.visibility !== undefined && { visibility: changes.visibility }),
      // Rendu public : sa date de publication, si c'est la première fois. coalesce(a, b) vaut a
      // s'il n'est pas null, sinon b : une date déjà là est gardée (repasser en privé puis en
      // public ne fait pas remonter le projet dans les fils). « Maintenant » vient de l'horloge de
      // JavaScript, passé comme paramètre lié par la colonne elle-même (sql.param).
      ...(changes.visibility === 'public' && {
        publishedAt: sql`coalesce(${schema.project.publishedAt}, ${sql.param(new Date(), schema.project.publishedAt)}::timestamp)`,
      }),
      ...(changes.demoUrl !== undefined && { demoUrl: changes.demoUrl }),
      ...(changes.prompts !== undefined && { prompts: changes.prompts }),
      // R6a : la principale ne se remet jamais à nul (le contrat l'interdit) ; les trois autres, si.
      ...(changes.primaryCategory !== undefined && { primaryCategory: changes.primaryCategory }),
      ...(changes.secondaryCategory !== undefined && {
        secondaryCategory: changes.secondaryCategory,
      }),
      ...(changes.difficulty !== undefined && { difficulty: changes.difficulty }),
      ...(changes.startedOn !== undefined && { startedOn: changes.startedOn }),
    }
    // Tout dans une transaction : si le nouvel ordre des photos est refusé, rien n'est enregistré,
    // pas même le titre envoyé avec lui.
    // Combien de nouveaux « Autre » la transaction a vraiment créés (rempli dans la transaction).
    let createdHere = 0
    const outcome = await db
      .transaction(async (tx) => {
        // Le verrou sur le projet (FOR UPDATE) fait patienter un envoi de photo simultané : l'ordre
        // est vérifié sur la galerie telle qu'elle est vraiment, pas telle qu'elle était un instant avant.
        const [locked] = await tx
          .select({
            removedAt: schema.project.removedAt,
            primaryCategory: schema.project.primaryCategory,
            secondaryCategory: schema.project.secondaryCategory,
          })
          .from(schema.project)
          .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
          .for('update')
        // La garde (projectAccess) a lu le projet AVANT cette transaction : la modération a pu le
        // retirer, ou son auteur le supprimer, entre-temps. On relit donc son état ici, sous le
        // verrou. PostgreSQL travaille en READ COMMITTED : un « SELECT … FOR UPDATE » qui a dû attendre
        // la fin d'une autre écriture sur la ligne rend sa version la plus récente, déjà validée.
        // Ce qui est lu ici ne peut donc plus changer avant la fin de la transaction.
        if (!locked) return 'gone' as const
        if (locked.removedAt !== null) return 'removed' as const
        // Les catégories qui resteront après la modification : celle du corps, sinon celle déjà
        // enregistrée (lue sous le verrou, donc sûre). Le contrat ne peut comparer que ce que le corps
        // contient ; ici on compare avec l'enregistré (sec-M2). Seule une modification qui touche une
        // catégorie est contrôlée : passer en « Privé » un ancien projet sans catégorie reste permis.
        if (changes.primaryCategory !== undefined || changes.secondaryCategory !== undefined) {
          // Un code bien formé mais inconnu : 400 `unknown_category` (la clé étrangère le refuserait aussi).
          if (!(await categoriesExist(tx, [changes.primaryCategory, changes.secondaryCategory]))) {
            return 'unknown_category' as const
          }
          const primary = changes.primaryCategory ?? locked.primaryCategory
          const second =
            changes.secondaryCategory !== undefined
              ? changes.secondaryCategory
              : locked.secondaryCategory
          // Une seconde sans principale (ancien projet sans catégorie, rien dans le corps).
          if (second !== null && primary === null) return 'category_required' as const
          if (second !== null && second === primary) return 'same_category' as const
        }
        if (changes.visualOrder !== undefined) {
          const gallery = await tx
            .select({ id: schema.projectMedia.id })
            .from(schema.projectMedia)
            .where(
              and(eq(schema.projectMedia.projectId, id), eq(schema.projectMedia.slot, 'gallery')),
            )
          // Exactement les photos de la galerie, chacune une fois (le contrat a déjà vérifié
          // qu'aucune n'apparaît deux fois) : ni une de moins, ni une d'ailleurs.
          const current = new Set(gallery.map((m) => m.id))
          const order = changes.visualOrder
          if (order.length !== current.size || !order.every((visualId) => current.has(visualId))) {
            return 'invalid_order' as const
          }
          for (const [position, visualId] of order.entries()) {
            await tx
              .update(schema.projectMedia)
              .set({ position })
              .where(
                and(eq(schema.projectMedia.id, visualId), eq(schema.projectMedia.projectId, id)),
              )
          }
        }
        // Les outils : reliés au catalogue, écrits dans project_tool, anciennes colonnes comprises.
        if (changes.tools !== undefined) {
          const resolved = await resolveTools(tx, changes.tools)
          createdHere = resolved.created
          await replaceProjectTools(tx, id, resolved.tools)
        }
        const fullSet = set
        if (Object.keys(fullSet).length > 0) {
          // Double précaution : la condition « dont l'auteur est le membre » est répétée dans la
          // requête, même si ownProject l'a déjà vérifiée (au cas où le code changerait un jour).
          await tx
            .update(schema.project)
            .set(fullSet)
            .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
        }
        // R9 (P5) : une nouvelle valeur non vide d'une partie retirée la remplace ; sa marque
        // s'efface, dans la même transaction que l'écriture (moderation/replaced.ts). Le titre, la
        // visibilité ou l'ordre des photos ne touchent à aucune marque.
        await dropProjectPartRemovals(tx, user.id, id, replacedProjectParts(changes))
        return 'ok' as const
      })
      .catch(noFreeToolSlug)
    if (outcome === NO_FREE_TOOL_SLUG) return c.json(errorBody(languageOf(c), 'validation'), 400)
    // Une création de plus que celles comptées (un nom effacé entre-temps) : comptée après coup.
    if (createdHere > counted) await chargeOtherTools(limiter, user.id, createdHere - counted)
    if (outcome === 'gone') return notFound(c)
    if (outcome === 'removed') return removed(c)
    if (outcome === 'unknown_category') return unknownCategory(c)
    if (outcome === 'category_required') {
      return c.json(errorBody(languageOf(c), 'category_required'), 400)
    }
    if (outcome === 'same_category') return c.json(errorBody(languageOf(c), 'same_category'), 400)
    if (outcome === 'invalid_order') return c.json(errorBody(languageOf(c), 'validation'), 400)

    const project = await loadVisibleProject(db, id, user.id, publicApiUrl)
    if (!project) return notFound(c)
    return c.json(project, 200)
  })

  app.openapi(deleteProjectRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).projectChange, changeRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

    const { id } = c.req.valid('param')
    // Un projet retiré se supprime quand même : son auteur peut toujours effacer ce qu'il a écrit.
    const access = await projectAccess(db, id, user.id)
    if (access === 'not_found') return notFound(c)
    if (access === 'forbidden') return forbidden(c)

    // Les fichiers des photos, notés avant que leurs lignes ne disparaissent avec le projet. Le
    // verrou (FOR UPDATE) fait attendre un envoi de photo en cours : il ne peut pas glisser une
    // photo entre la lecture des fichiers et la suppression (son fichier resterait sur le disque).
    const keys = await db.transaction(async (tx) => {
      await tx
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
        .for('update')
      const found = await mediaKeysOf(tx, [id])
      // Les outils du projet, notés avant que leurs lignes ne disparaissent avec lui : un « Autre »
      // qu'il était seul à citer s'efface dans cette transaction (décision 5, sec-A5).
      const toolIds = await tx
        .select({ id: schema.projectTool.toolId })
        .from(schema.projectTool)
        .where(eq(schema.projectTool.projectId, id))
      await tx
        .delete(schema.project)
        .where(and(eq(schema.project.id, id), eq(schema.project.authorId, user.id)))
      await dropOrphanOthers(
        tx,
        toolIds.map((row) => row.id),
      )
      return found
    })
    for (const key of keys) await storage.delete(key)
    // 204 : « c'est fait », sans contenu à renvoyer.
    return c.body(null, 204)
  })

  return app
}
