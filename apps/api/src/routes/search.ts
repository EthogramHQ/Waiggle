// La recherche par mots (tranche R3) : GET /v1/search?q=… rend, en trois groupes, les projets, les
// membres et les outils dont le texte contient chaque mot tapé (search/load.ts). Réservée aux
// membres connectés, comptée par membre, et le texte cherché n'est gardé nulle part : ni en base
// (les compteurs portent l'identifiant du membre, jamais le mot), ni dans les journaux.
import { createRoute } from '@hono/zod-openapi'
import { SearchQuery, SearchResults, searchWords } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { describeError } from '../log'
import type { RateLimiter } from '../rate-limit'
import { hitSearchQuota, pgCodeOf, STATEMENT_TIMEOUT } from '../search/limits'
import { search } from '../search/load'
import { createSearchSlots } from '../search/slots'
import { createRouter, errorResponse } from './router'

// Anti-abus : 600 recherches par heure et 2 000 par jour (search/limits.ts), les mêmes compteurs
// que la recherche de la feuille « Inviter » d'une ruche (R10).

const searchRoute = createRoute({
  method: 'get',
  path: '/v1/search',
  summary: 'Search projects, members and tools by words',
  description:
    'Every word of `q` (accents and capitals ignored, one-letter words and repeats dropped, five ' +
    'at most) must appear. Projects: title, pitch or description, the viewer’s own private ones ' +
    'included, never a removed one. Members: name or current handle; with words shorter than 3 ' +
    'characters, only the members the viewer follows. Tools: name or alias of a catalogue tool ' +
    '(never an « other »), counted over the public projects the viewer can see. `category` keeps ' +
    'only the projects of that category (first or second place); tools and members ignore it. ' +
    'Twenty per group at most, `more` when there were more.',
  request: { query: SearchQuery },
  responses: {
    200: {
      description: 'The three groups, always present, even empty.',
      content: { 'application/json': { schema: SearchResults } },
    },
    400: errorResponse('Invalid query (too short, too long, no word left, or a repeated `q`).'),
    401: errorResponse('Not signed in.'),
    429: errorResponse(
      'Too many searches, or no search place freed within a second (one per member, three at once; see Retry-After).',
    ),
    503: errorResponse('The search took too long and was stopped.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const searchRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Les places de cette API : une seule réserve par application créée (chaque test a la sienne).
  const slots = createSearchSlots()
  app.use('/v1/search', requireUser)

  // Le quota passe avant la validation (comme les mentions) : une demande mal formée compte aussi,
  // sinon on pourrait sonder sans limite. Les deux compteurs avancent à chaque demande ; le premier
  // refus l'emporte, avec son délai d'attente.
  app.on('GET', '/v1/search', async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const decision = await hitSearchQuota(limiter, user.id)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  app.openapi(searchRoute, async (c) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    // Le validateur ne lit que le premier `q` : deux `q` (« q=carnet&q=cafes ») sont refusés ici,
    // pour qu'une seule recherche corresponde à une seule adresse (relecture sec-B4).
    if ((c.req.queries('q') ?? []).length !== 1) {
      return c.json(errorBody(languageOf(c), 'validation'), 400)
    }
    const { q, category } = c.req.valid('query')
    const words = searchWords(q)
    // Une place de recherche (relecture C1, search/slots.ts) : une recherche déjà en cours pour
    // ce membre, ou trois pour toute l'API, et la demande attend dans une courte file, jusqu'à
    // une seconde (SEARCH_WAIT_MS). Faute de place à temps, file pleine ou demande abandonnée par
    // l'appli (`signal`, qui quitte alors la file), elle est refusée comme un quota dépassé
    // (l'appli dit déjà « réessaie dans un instant »), à reprendre une seconde plus tard.
    const release = await slots.take(user.id, c.req.raw.signal)
    if (!release) {
      c.header('Retry-After', '1')
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    try {
      const results = await search(db, user.id, words, category, publicApiUrl)
      // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
      return c.json(SearchResults.parse(results), 200)
    } catch (error) {
      if (pgCodeOf(error) !== STATEMENT_TIMEOUT) throw error
      // Trop long (sec-B3) : 503, et dans le journal un résumé sans le message de l'erreur, qui
      // cite le texte cherché, ni l'adresse complète (le chemin seul, sans « ?q= »).
      console.error('Search stopped', describeError(error, { method: 'GET', path: c.req.path }))
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    } finally {
      // Toujours rendue, après une réponse, un délai dépassé ou une erreur inattendue.
      release()
    }
  })

  return app
}
