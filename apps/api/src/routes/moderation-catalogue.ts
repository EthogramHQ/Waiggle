// Les routes de l'administration du catalogue (tranche R6b, plan B3), réservées aux
// administrateurs en fonction : les pages « Outils » et « Catégories » de la Modération.
// - GET  /v1/moderation/tools/pending          les « Autre » à vérifier ;
// - GET  /v1/moderation/tools?q&cursor          le catalogue, pour le modifier ;
// - POST /v1/moderation/tools                   créer un outil → 201 ;
// - POST /v1/moderation/tools/{slug}/admit      un « Autre » entre au catalogue → 200 ;
// - PATCH /v1/moderation/tools/{slug}           modifier un outil du catalogue → 200 ;
// - GET  /v1/moderation/tools/{slug}/impact     ce que changera un rattachement ;
// - POST /v1/moderation/tools/{slug}/merge      rattacher un « Autre » à un outil → 204 ;
// - POST /v1/moderation/tools/{slug}/dismiss    laisser un « Autre » hors du catalogue → 204 ;
// - GET  /v1/moderation/categories/pending      les projets classés « Autre », à ranger ;
// - POST /v1/moderation/projects/{id}/category  ranger un projet → 204 ;
// - POST /v1/moderation/categories              créer une catégorie → 201 ;
// - GET  /v1/moderation/catalogue-changes       « Changements récents ».
// Pour tout autre visiteur (anonyme, membre, administrateur révoqué ou suspendu), ces adresses
// répondent exactement comme une adresse qui n'existe pas, avant même de lire le corps (décision
// 13). Les écritures comptent dans le quota des décisions de modération (50 par jour), partagé.
import { createRoute, z } from '@hono/zod-openapi'
import {
  AdminCatalogueTool,
  AdminCatalogueToolsPage,
  CatalogueChangesPage,
  CataloguePageQuery,
  CatalogueToolsQuery,
  Category,
  CategoryCreate,
  type ErrorCode,
  OTHER_CATEGORY,
  PendingToolsPage,
  Recategorize,
  ToolAdmit,
  ToolEdit,
  ToolImpact,
  ToolMerge,
  ToolSlug,
  UncategorizedPage,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import {
  admitTool,
  createCategory,
  createTool,
  dismissTool,
  editTool,
  isUniqueViolation,
  mergeTool,
  recategorize,
  toolImpact,
} from '../catalogue/admin'
import {
  loadAdminTool,
  loadAdminTools,
  loadCatalogueChanges,
  loadPendingTools,
  loadUncategorized,
} from '../catalogue/pages'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { countDecision } from '../moderation/guard'
import type { RateLimiter } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import { NO_FREE_TOOL_SLUG, NoFreeToolSlugError } from '../tools/resolve'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const notFoundResponse = errorResponse(
  'Not an administrator, or no such item: as an unknown route.',
)

// Les paramètres d'adresse : un texte, vérifié dans la route. Un slug ou un identifiant mal formé
// reçoit ainsi le même 404 qu'un inconnu (jamais un 400 qui dirait « ceci n'est pas un slug »).
const SlugParam = z.object({ slug: z.string() })
const IdParam = z.object({ id: z.string() })

const json = <T extends z.ZodType>(schema: T) => ({
  required: true,
  content: { 'application/json': { schema } },
})
const ok = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
})

const pendingRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/tools/pending',
  summary: 'The « other » tools cited by a project the members see, newest first',
  request: { query: CataloguePageQuery },
  responses: {
    200: ok('A page of pending tools.', PendingToolsPage),
    400: errorResponse('Invalid cursor.'),
    404: notFoundResponse,
  },
})

const catalogueRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/tools',
  summary: 'The catalogue, newest first, optionally searched by name or alias',
  request: { query: CatalogueToolsQuery },
  responses: {
    200: ok('A page of the catalogue.', AdminCatalogueToolsPage),
    400: errorResponse('Invalid search or cursor.'),
    404: notFoundResponse,
  },
})

const createToolRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/tools',
  summary: 'Add a new tool to the catalogue',
  request: { body: json(ToolAdmit) },
  responses: {
    201: ok('The tool is in the catalogue.', AdminCatalogueTool),
    400: errorResponse('Invalid tool.'),
    404: notFoundResponse,
    409: errorResponse('The name is already a tool or an alias (tool_name_taken).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const admitRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/tools/{slug}/admit',
  summary: 'Let an « other » tool into the catalogue',
  description: 'The name typed by the members becomes an alias when the administrator corrects it.',
  request: { params: SlugParam, body: json(ToolAdmit) },
  responses: {
    200: ok('The tool is in the catalogue.', AdminCatalogueTool),
    400: errorResponse('Invalid tool.'),
    404: notFoundResponse,
    409: errorResponse('Already in the catalogue, or the name is taken (tool_name_taken).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const editRoute = createRoute({
  method: 'patch',
  path: '/v1/moderation/tools/{slug}',
  summary: 'Change a tool of the catalogue',
  request: { params: SlugParam, body: json(ToolEdit) },
  responses: {
    200: ok('The tool, changed.', AdminCatalogueTool),
    400: errorResponse('Invalid change.'),
    404: notFoundResponse,
    409: errorResponse('The name is already a tool or an alias (tool_name_taken).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const impactRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/tools/{slug}/impact',
  summary: 'How many projects (private ones included) and profiles cite an « other » tool',
  request: { params: SlugParam },
  responses: { 200: ok('The numbers.', ToolImpact), 404: notFoundResponse },
})

const mergeRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/tools/{slug}/merge',
  summary: 'Link an « other » tool to a tool of the catalogue',
  request: { params: SlugParam, body: json(ToolMerge) },
  responses: {
    204: { description: 'Linked: the « other » tool is gone, its name is an alias.' },
    400: errorResponse('Invalid target.'),
    404: notFoundResponse,
    429: errorResponse('Too many decisions today.'),
  },
})

const dismissRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/tools/{slug}/dismiss',
  summary: 'Leave an « other » tool out of the catalogue',
  request: { params: SlugParam },
  responses: {
    204: { description: 'Left out: it stays plain text on its projects.' },
    404: notFoundResponse,
    409: errorResponse('Already left out.'),
    429: errorResponse('Too many decisions today.'),
  },
})

const uncategorizedRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/categories/pending',
  summary: 'The projects the members see, filed under « other », oldest first',
  request: { query: CataloguePageQuery },
  responses: {
    200: ok('A page of projects to sort.', UncategorizedPage),
    400: errorResponse('Invalid cursor.'),
    404: notFoundResponse,
  },
})

const recategorizeRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/projects/{id}/category',
  summary: 'Sort a project filed under « other » into a category',
  request: { params: IdParam, body: json(Recategorize) },
  responses: {
    204: { description: 'Sorted.' },
    400: errorResponse('Invalid or unknown category, or « other » itself.'),
    403: errorResponse('Her own project (own_project).'),
    404: notFoundResponse,
    409: errorResponse('The project is not filed under « other » (already_decided).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/v1/moderation/categories',
  summary: 'Create a category, just before « other »',
  request: { body: json(CategoryCreate) },
  responses: {
    201: ok('The category, in the language of the request.', Category),
    400: errorResponse('Invalid category.'),
    404: notFoundResponse,
    409: errorResponse('A name or the code is taken (category_name_taken).'),
    429: errorResponse('Too many decisions today.'),
  },
})

const changesRoute = createRoute({
  method: 'get',
  path: '/v1/moderation/catalogue-changes',
  summary: 'The changes made to the catalogue, newest first',
  request: { query: CataloguePageQuery },
  responses: {
    200: ok('A page of changes.', CatalogueChangesPage),
    400: errorResponse('Invalid cursor.'),
    404: notFoundResponse,
  },
})

/**
 * Les écritures de ce routeur, celles qui comptent dans le quota : une expression régulière sur le
 * chemin, pour ne jamais compter deux fois POST /v1/moderation/decisions (qui a son propre garde
 * dans routes/moderation.ts).
 */
const CATALOGUE_WRITE =
  /^\/v1\/moderation\/(?:tools(?:\/[^/]+\/(?:admit|merge|dismiss)|\/[^/]+)?|projects\/[^/]+\/category|categories)$/

/** Un uuid : la forme des identifiants de projet (sinon, le même 404 qu'un projet inconnu). */
const Uuid = z.uuid()

type Deps = { db: Database; limiter: RateLimiter }

export const moderationCatalogueRoutes = ({ db, limiter }: Deps) => {
  const app = createRouter()

  // Le statut est un paramètre de type (`S`) : chaque appel garde son statut exact (404, pas
  // « 400 | 404 »), que le typage des routes compare à celles qu'elles déclarent.
  const fail = <S extends 400 | 403 | 404 | 409>(c: Context<AppEnv>, code: ErrorCode, status: S) =>
    c.json(errorBody(languageOf(c), code), status)
  const notFound = (c: Context<AppEnv>) => fail(c, 'not_found', 404)

  // La garde, AVANT tout le reste (avant le validateur que Hono place devant chaque route) : le
  // rôle est relu en base à chaque requête. Anonyme, membre, révoqué ou suspendu : le même 404
  // que app.notFound (app.ts), mot pour mot. Celle de routes/moderation.ts fait de même sur les
  // mêmes adresses ; celle-ci reste, pour que ce routeur ne dépende pas de l'ordre de montage.
  app.use('/v1/moderation/*', async (c, next) => {
    const user = c.get('user')
    if (!user || !(await isActiveAdmin(db, user.id))) return notFound(c)
    await next()
  })

  // Le quota, après la garde (un membre ne voit jamais un 429) et avant la validation : chaque
  // écriture compte, même mal formée (comme routes/moderation.ts). Les lectures ne comptent pas.
  app.use('/v1/moderation/*', async (c, next) => {
    const user = c.get('user')
    if (!user) return notFound(c)
    if (c.req.method !== 'GET' && CATALOGUE_WRITE.test(c.req.path)) {
      const quota = await countDecision(limiter, user.id)
      if (!quota.allowed) {
        c.header('Retry-After', String(quota.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
    }
    await next()
  })

  /** L'administrateur connecté (la garde l'a déjà vérifié). */
  const adminOf = (c: Context<AppEnv>) => c.get('user')?.id ?? null

  /** Un slug d'adresse bien formé, ou null (alors 404, comme un slug inconnu). */
  const slugOf = (slug: string) => (ToolSlug.safeParse(slug).success ? slug : null)

  app.openapi(pendingRoute, async (c) => {
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return fail(c, 'validation', 400)
    return c.json(PendingToolsPage.parse(await loadPendingTools(db, cursor)), 200)
  })

  app.openapi(catalogueRoute, async (c) => {
    const query = c.req.valid('query')
    const cursor = readCursor(query.cursor)
    if (cursor === 'invalid') return fail(c, 'validation', 400)
    return c.json(AdminCatalogueToolsPage.parse(await loadAdminTools(db, query.q, cursor)), 200)
  })

  /** La réponse d'une écriture d'outil : l'outil relu, hors de la transaction. */
  const toolResponse = async (id: string) => AdminCatalogueTool.parse(await loadAdminTool(db, id))

  /**
   * Une écriture d'outil peut croiser un membre qui crée au même instant un « Autre » de ce nom
   * (il ne prend pas notre verrou) : l'index unique refuse alors l'une des deux, et c'est « nom
   * déjà pris », jamais une erreur 500.
   */
  const guarded = async <T>(
    write: () => Promise<T>,
  ): Promise<T | 'tool_name_taken' | typeof NO_FREE_TOOL_SLUG> => {
    try {
      return await write()
    } catch (error) {
      if (isUniqueViolation(error)) return 'tool_name_taken'
      // Les 51 adresses de ce nom déjà prises (comme sec-B4 pour un « Autre ») : 400 traduit,
      // jamais 500 ; la transaction annulée n'a rien écrit.
      if (error instanceof NoFreeToolSlugError) return NO_FREE_TOOL_SLUG
      throw error
    }
  }

  app.openapi(createToolRoute, async (c) => {
    const adminId = adminOf(c)
    if (adminId === null) return notFound(c)
    const result = await guarded(() => createTool(db, adminId, c.req.valid('json'), new Date()))
    if (result === NO_FREE_TOOL_SLUG) return fail(c, 'validation', 400)
    if (result === 'tool_name_taken' || !result.ok) return fail(c, 'tool_name_taken', 409)
    return c.json(await toolResponse(result.value), 201)
  })

  app.openapi(admitRoute, async (c) => {
    const adminId = adminOf(c)
    const slug = slugOf(c.req.valid('param').slug)
    if (adminId === null || slug === null) return notFound(c)
    const input = c.req.valid('json')
    const result = await guarded(() => admitTool(db, adminId, slug, input, new Date()))
    if (result === NO_FREE_TOOL_SLUG) return fail(c, 'validation', 400)
    if (result === 'tool_name_taken') return fail(c, 'tool_name_taken', 409)
    if (!result.ok) {
      if (result.error === 'not_found') return notFound(c)
      return fail(c, result.error, 409)
    }
    return c.json(await toolResponse(result.value), 200)
  })

  app.openapi(editRoute, async (c) => {
    const adminId = adminOf(c)
    const slug = slugOf(c.req.valid('param').slug)
    if (adminId === null || slug === null) return notFound(c)
    const input = c.req.valid('json')
    const result = await guarded(() => editTool(db, adminId, slug, input, new Date()))
    if (result === NO_FREE_TOOL_SLUG) return fail(c, 'validation', 400)
    if (result === 'tool_name_taken') return fail(c, 'tool_name_taken', 409)
    if (!result.ok) {
      if (result.error === 'not_found') return notFound(c)
      return fail(c, result.error, 409)
    }
    return c.json(await toolResponse(result.value), 200)
  })

  app.openapi(impactRoute, async (c) => {
    const slug = slugOf(c.req.valid('param').slug)
    const impact = slug === null ? null : await toolImpact(db, slug)
    if (impact === null) return notFound(c)
    return c.json(ToolImpact.parse(impact), 200)
  })

  app.openapi(mergeRoute, async (c) => {
    const adminId = adminOf(c)
    const slug = slugOf(c.req.valid('param').slug)
    if (adminId === null || slug === null) return notFound(c)
    const result = await mergeTool(db, adminId, slug, c.req.valid('json').into, new Date())
    if (!result.ok) return notFound(c)
    return c.body(null, 204)
  })

  app.openapi(dismissRoute, async (c) => {
    const adminId = adminOf(c)
    const slug = slugOf(c.req.valid('param').slug)
    if (adminId === null || slug === null) return notFound(c)
    const result = await dismissTool(db, adminId, slug, new Date())
    if (!result.ok) {
      if (result.error === 'not_found') return notFound(c)
      return fail(c, result.error, 409)
    }
    return c.body(null, 204)
  })

  app.openapi(uncategorizedRoute, async (c) => {
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return fail(c, 'validation', 400)
    return c.json(UncategorizedPage.parse(await loadUncategorized(db, cursor)), 200)
  })

  app.openapi(recategorizeRoute, async (c) => {
    const adminId = adminOf(c)
    if (adminId === null) return notFound(c)
    const { category } = c.req.valid('json')
    // Ranger en « Autre » n'a pas de sens : refusé avant de chercher le projet.
    if (category === OTHER_CATEGORY) return fail(c, 'validation', 400)
    const id = c.req.valid('param').id
    if (!Uuid.safeParse(id).success) return notFound(c)
    const result = await recategorize(db, adminId, id, category, new Date())
    if (result.ok) return c.body(null, 204)
    switch (result.error) {
      case 'not_found':
        return notFound(c)
      case 'own_project':
        return fail(c, 'own_project', 403)
      case 'unknown_category':
        return fail(c, 'unknown_category', 400)
      case 'already_decided':
        return fail(c, 'already_decided', 409)
    }
  })

  app.openapi(createCategoryRoute, async (c) => {
    const adminId = adminOf(c)
    if (adminId === null) return notFound(c)
    const input = c.req.valid('json')
    let result: Awaited<ReturnType<typeof createCategory>>
    try {
      result = await createCategory(db, adminId, input, new Date())
    } catch (error) {
      // Les noms exacts sont aussi uniques en base : une création croisée devient « nom pris ».
      if (isUniqueViolation(error)) return fail(c, 'category_name_taken', 409)
      throw error
    }
    if (!result.ok) return fail(c, 'category_name_taken', 409)
    const language = languageOf(c)
    return c.json(
      Category.parse({
        code: result.value,
        name: language === 'en' ? input.nameEn : input.nameFr,
        icon: input.icon,
        projectCount: 0,
      }),
      201,
    )
  })

  app.openapi(changesRoute, async (c) => {
    const cursor = readCursor(c.req.valid('query').cursor)
    if (cursor === 'invalid') return fail(c, 'validation', 400)
    const page = await loadCatalogueChanges(db, cursor, languageOf(c))
    return c.json(CatalogueChangesPage.parse(page), 200)
  })

  return app
}
