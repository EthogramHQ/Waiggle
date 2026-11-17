// La route de « Mes retours envoyés » (R11), réservée aux membres connectés :
// GET /v1/me/tester-messages : les retours et réponses que le membre a écrits comme testeur, dans le
// coin de n'importe quel projet (coins fermés compris), du plus récent au plus ancien, 30 par page.
// Elle ne lit que ses propres messages : un autre membre n'a rien à y demander, il n'y a ni
// identifiant ni projet dans l'adresse. Supprimer un message reprend la route du coin
// (DELETE /v1/projects/{id}/messages/{messageId}, routes/tester-threads.ts).
import { createRoute } from '@hono/zod-openapi'
import { MyTesterMessagesPage, MyTesterMessagesQuery } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { requireUser } from '../auth/session'
import { readCursor } from '../cursor'
import { errorBody, languageOf } from '../errors'
import { myTesterMessagesPage } from '../testers/my-messages'
import { createRouter, errorResponse } from './router'

const listRoute = createRoute({
  method: 'get',
  path: '/v1/me/tester-messages',
  summary: 'My feedback sent as a tester',
  description:
    'The feedback and replies I wrote as a tester, on every project, newest first, 30 per page. ' +
    '`project` is null once I no longer see the project; `closed` says the corner is closed to ' +
    'me. Never a message of the author of a project.',
  request: { query: MyTesterMessagesQuery },
  responses: {
    200: {
      description: 'A page of my messages.',
      content: { 'application/json': { schema: MyTesterMessagesPage } },
    },
    400: errorResponse('Invalid cursor.'),
    401: errorResponse('Not signed in.'),
  },
})

type Deps = { db: Database; publicApiUrl: string }

export const meTesterMessageRoutes = ({ db, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste.
  app.use('/v1/me/tester-messages', requireUser)

  app.openapi(listRoute, async (ctx) => {
    const user = ctx.get('user')
    if (!user) return ctx.json(errorBody(languageOf(ctx), 'unauthorized'), 401)
    const cursor = readCursor(ctx.req.valid('query').cursor)
    // Un curseur illisible, ou daté hors des bornes de `CursorDate` (cursor.ts), est refusé (400).
    if (cursor === 'invalid') {
      return ctx.json(errorBody(languageOf(ctx), 'validation'), 400)
    }
    return ctx.json(
      MyTesterMessagesPage.parse(await myTesterMessagesPage(db, user.id, cursor, publicApiUrl)),
      200,
    )
  })

  return app
}
