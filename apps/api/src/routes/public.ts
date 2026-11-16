// Les lectures sans compte (tranche R12, « Les projets publics ») : ce qu'un visiteur, ou un moteur
// de recherche, lit d'un projet public (`web`) et de la page publique d'un membre.
// - GET /v1/public/projects/{id} : le projet, tout ce que l'auteur a écrit, jamais ce que font les
//   membres (commentaires, abonnés, qui a réagi, testeurs) ;
// - GET /v1/public/projects/{id}/updates : sa frise, de la plus récente à la plus ancienne ;
// - GET /v1/public/projects/{id}/updates/{updateId} : une seule mise à jour ;
// - GET /v1/public/members/{id} : la page publique d'un membre, avec ce qu'il a coché ;
// - GET /v1/public/showcase : la vitrine de l'accueil.
//
// Ces routes ne lisent jamais la session (app.ts) : un membre connecté reçoit exactement ce que
// reçoit un visiteur, et rien de ce qu'il voit en tant que membre. Chaque réponse est construite en
// liste blanche (public/load.ts) puis passée par son schéma (`.parse`). Un projet qui n'est pas
// public, inconnu, retiré, d'un auteur parti ou non vérifié, une page fermée : le même 404 que pour
// un identifiant inconnu, statut, corps et en-têtes (plan, choix 2 ; relecture de sécurité B3).
// Chaque lecture compte dans la limite d'un réseau (security/visitor-limit.ts), posée par app.ts.
import { createRoute, z } from '@hono/zod-openapi'
import {
  PublicLangQuery,
  PublicMember,
  PublicProject,
  PublicUpdate,
  PublicUpdatesPage,
  ShowcasePage,
  UPDATES_PAGE_SIZE,
  UpdatesQuery,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import type { Context } from 'hono'
import { after, encodeCursor, readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import {
  loadPublicMember,
  loadPublicProject,
  loadPublicUpdate,
  loadPublicUpdates,
  loadShowcase,
} from '../public/load'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

/**
 * Ce qu'un visiteur a le droit de garder (décision 3 de la relecture du plan) : son navigateur
 * seul (`private`, jamais un cache partagé), une minute au plus. Un projet qui cesse d'être public
 * disparaît donc pour lui en une minute, et pour tout nouveau visiteur à l'instant. `Vary` : la
 * réponse dépend aussi de la langue demandée (les noms des catégories). Les refus (404, 429) n'ont
 * pas cet en-tête : app.ts leur donne `no-store`, comme à toute réponse de /v1.
 */
const shareable = (c: Context<AppEnv>) => {
  c.header('Cache-Control', 'private, max-age=60')
  c.header('Vary', 'Accept-Language', { append: true })
}

const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)

const hiddenAnswer = 'Not public, unknown, removed, or of an author gone: the same answer.'
const tooMany = errorResponse('Too many reads from this network (300 per 10 minutes).')

const projectRoute = createRoute({
  method: 'get',
  path: '/v1/public/projects/{id}',
  summary: 'A public project, for a visitor without an account',
  description:
    'Everything its author wrote, the categories named in `lang` (else `Accept-Language`), the ' +
    'number of reactions of members; never comments, followers, hive, testers or handle.',
  request: { params: z.object({ id: z.string() }), query: PublicLangQuery },
  responses: {
    200: {
      description: 'The public project.',
      content: { 'application/json': { schema: PublicProject } },
    },
    400: errorResponse('Unknown language.'),
    404: errorResponse(hiddenAnswer),
    429: tooMany,
  },
})

const updatesRoute = createRoute({
  method: 'get',
  path: '/v1/public/projects/{id}/updates',
  summary: 'The timeline of a public project, for a visitor',
  description: 'Newest first, twenty per page, without removed updates or removed photos.',
  request: { params: z.object({ id: z.string() }), query: UpdatesQuery },
  responses: {
    200: {
      description: 'A page of updates.',
      content: { 'application/json': { schema: PublicUpdatesPage } },
    },
    400: errorResponse('Invalid cursor.'),
    404: errorResponse(hiddenAnswer),
    429: tooMany,
  },
})

const updateRoute = createRoute({
  method: 'get',
  path: '/v1/public/projects/{id}/updates/{updateId}',
  summary: 'One update of a public project, for a visitor',
  request: { params: z.object({ id: z.string(), updateId: z.string() }) },
  responses: {
    200: {
      description: 'The update.',
      content: { 'application/json': { schema: PublicUpdate } },
    },
    404: errorResponse(`${hiddenAnswer} Also a removed update, or one of another project.`),
    429: tooMany,
  },
})

const memberRoute = createRoute({
  method: 'get',
  path: '/v1/public/members/{id}',
  summary: 'The public page of a member, for a visitor',
  description:
    'The name and photo, then only what the member checked: an unchecked part is an absent field.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: 'The public page.',
      content: { 'application/json': { schema: PublicMember } },
    },
    404: errorResponse('A closed page, an unknown, unverified or deleted member: the same answer.'),
    429: tooMany,
  },
})

const showcaseRoute = createRoute({
  method: 'get',
  path: '/v1/public/showcase',
  summary: 'The showcase of the home page, for a visitor',
  description: 'Four public projects at most, in the order chosen by the moderation.',
  responses: {
    200: {
      description: 'The showcase, maybe empty.',
      content: { 'application/json': { schema: ShowcasePage } },
    },
    429: tooMany,
  },
})

type Deps = { db: Database; publicApiUrl: string }

export const publicRoutes = ({ db, publicApiUrl }: Deps) => {
  const app = createRouter()

  app.openapi(projectRoute, async (c) => {
    const { id } = c.req.valid('param')
    // La langue de l'adresse de la page (`/fr/…`, `/en/…`), sinon celle du navigateur.
    const language = c.req.valid('query').lang ?? languageOf(c)
    const project = await loadPublicProject(db, id, publicApiUrl, language)
    if (!project) return notFound(c)
    shareable(c)
    return c.json(PublicProject.parse(project), 200)
  })

  app.openapi(updatesRoute, async (c) => {
    const { id } = c.req.valid('param')
    // Le curseur se lit après la règle du projet : pour un projet caché, la réponse est celle d'un
    // projet inconnu, quel que soit le curseur. Il est lu comme pour un membre (routes/updates.ts) :
    // trois étapes (cursor.ts), une date bornée des deux côtés.
    const cursor = readCursor(c.req.valid('query').cursor)
    const bad = cursor === 'invalid' || (cursor !== null && cursor.at >= '2100')
    // 21 lignes : la dernière dit s'il y a une suite, sans compter ni deviner.
    const rows = await loadPublicUpdates(
      db,
      id,
      cursor && cursor !== 'invalid' && !bad
        ? after(cursor, schema.projectUpdate.createdAt, schema.projectUpdate.id)
        : undefined,
      UPDATES_PAGE_SIZE + 1,
      publicApiUrl,
    )
    if (!rows) return notFound(c)
    if (bad) return c.json(errorBody(languageOf(c), 'validation'), 400)
    const items = rows.slice(0, UPDATES_PAGE_SIZE)
    const last = items.at(-1)
    shareable(c)
    return c.json(
      PublicUpdatesPage.parse({
        items,
        nextCursor:
          rows.length > UPDATES_PAGE_SIZE && last
            ? encodeCursor({ at: last.createdAt, id: last.id })
            : null,
      }),
      200,
    )
  })

  app.openapi(updateRoute, async (c) => {
    const { id, updateId } = c.req.valid('param')
    const update = await loadPublicUpdate(db, id, updateId, publicApiUrl)
    if (!update) return notFound(c)
    shareable(c)
    return c.json(PublicUpdate.parse(update), 200)
  })

  app.openapi(memberRoute, async (c) => {
    const member = await loadPublicMember(db, c.req.valid('param').id, publicApiUrl)
    if (!member) return notFound(c)
    shareable(c)
    return c.json(PublicMember.parse(member), 200)
  })

  app.openapi(showcaseRoute, async (c) => {
    const items = await loadShowcase(db, { publicApiUrl })
    shareable(c)
    return c.json(ShowcasePage.parse({ items }), 200)
  })

  return app
}
