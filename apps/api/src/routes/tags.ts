// La page d'une étiquette (GET /v1/tags/{slug}) : les projets publics faits avec un outil.
// Réservée aux membres connectés. Elle répond toujours, même vide : une étiquette portée seulement
// par des projets privés ressemble ainsi à une étiquette inconnue, et ne révèle rien.
import { createRoute, z } from '@hono/zod-openapi'
import { TagPage, TagParam, toolSlug } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, arrayContains } from 'drizzle-orm'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { loadSummaries } from '../projects/load'
import { listedVerifiedProjectFor } from '../projects/visibility'
import { createRouter, errorResponse } from './router'

const readTagRoute = createRoute({
  method: 'get',
  path: '/v1/tags/{slug}',
  summary: 'Read the page of a tag',
  request: { params: z.object({ slug: TagParam }) },
  responses: {
    200: {
      description: 'The public projects made with this tool, newest first.',
      content: { 'application/json': { schema: TagPage } },
    },
    400: errorResponse('Tag too long, or made only of spaces and symbols that give no tag.'),
    401: errorResponse('Not signed in.'),
  },
})

type Deps = { db: Database; publicApiUrl: string }

export const tagRoutes = ({ db, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/tags/*', requireUser)

  app.openapi(readTagRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)

    // « Claude Code », « claude code » ou « CLAUDE-CODE » : la même étiquette, « claude-code ».
    const slug = toolSlug(c.req.valid('param').slug)
    // Une étiquette faite seulement d'espaces ne donne rien : aucun projet ne peut la porter.
    if (!slug) return c.json(errorBody(languageOf(c), 'validation'), 400)
    // arrayContains : « la liste tool_slugs contient cette étiquette » (opérateur @> de
    // PostgreSQL, accéléré par l'index GIN de la table). Seulement les projets publics et pas
    // retirés, même pour leur auteur : ses brouillons n'ont rien à faire sur une page partagée, ni
    // un projet que la modération a retiré. Tranche 7b : ni ceux d'un membre bloqué avec le
    // visiteur, dans un sens ou dans l'autre (listedProjectFor). R3 (sec-A3) : ni celui d'un
    // auteur qui n'a jamais vérifié son adresse, la même règle que la recherche et les outils.
    const projects = await loadSummaries(
      db,
      and(listedVerifiedProjectFor(viewer.id), arrayContains(schema.project.toolSlugs, [slug])),
      viewer.id,
      publicApiUrl,
    )
    // Le nom à afficher : celui tapé sur le projet le plus récent.
    const label = projects[0]?.tools.find((tool) => tool.slug === slug)?.label ?? null
    return c.json(TagPage.parse({ slug, label, projects }), 200)
  })

  return app
}
