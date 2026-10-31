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
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { search } from '../search/load'
import { createRouter, errorResponse } from './router'

// Anti-abus (plan de R3) : 600 recherches par heure et 2 000 par jour, comme les suggestions de
// mentions (routes/members.ts). L'appli cherche pendant qu'on tape, après une courte pause : 600
// dans l'heure, c'est beaucoup d'écriture ; le plafond du jour empêche de relever peu à peu tout
// l'annuaire, jour et nuit (avec la règle des 3 caractères pour les membres, search/load.ts).
const searchHourRule: RateRule = { windowMs: 60 * 60 * 1000, max: 600 }
const searchDayRule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: 2000 }

/** Le code d'erreur de PostgreSQL quand `statement_timeout` arrête une requête. */
const STATEMENT_TIMEOUT = '57014'

/**
 * Le code PostgreSQL d'une erreur, sur l'erreur elle-même ou sur sa cause (Drizzle enveloppe
 * l'erreur du pilote dans la sienne, qui la garde dans `cause`).
 */
const pgCodeOf = (error: unknown): string | undefined => {
  for (let current = error, depth = 0; current && depth < 3; depth++) {
    if (typeof current !== 'object') return undefined
    const code = Reflect.get(current, 'code')
    if (typeof code === 'string') return code
    current = Reflect.get(current, 'cause')
  }
  return undefined
}

const searchRoute = createRoute({
  method: 'get',
  path: '/v1/search',
  summary: 'Search projects, members and tools by words',
  description:
    'Every word of `q` (accents and capitals ignored, one-letter words and repeats dropped, five ' +
    'at most) must appear. Projects: title, pitch or description, the viewer’s own private ones ' +
    'included, never a removed one. Members: name or current handle; with words shorter than 3 ' +
    'characters, only the members the viewer follows. Tools: label or tag, from public projects. ' +
    'Twenty per group at most, `more` when there were more.',
  request: { query: SearchQuery },
  responses: {
    200: {
      description: 'The three groups, always present, even empty.',
      content: { 'application/json': { schema: SearchResults } },
    },
    400: errorResponse('Invalid query (too short, too long, no word left, or a repeated `q`).'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many searches (see Retry-After).'),
    503: errorResponse('The search took too long and was stopped.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const searchRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  app.use('/v1/search', requireUser)

  // Le quota passe avant la validation (comme les mentions) : une demande mal formée compte aussi,
  // sinon on pourrait sonder sans limite. Les deux compteurs avancent à chaque demande ; le premier
  // refus l'emporte, avec son délai d'attente.
  app.on('GET', '/v1/search', async (c, next) => {
    const user = c.get('user')
    if (!user) return c.json(errorBody(languageOf(c), 'unauthorized'), 401)
    const keys = memberCounterKeys(user.id)
    for (const [key, rule] of [
      [keys.searchHour, searchHourRule],
      [keys.searchDay, searchDayRule],
    ] as const) {
      const decision = await limiter.hit(key, rule)
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds))
        return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
      }
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
    const words = searchWords(c.req.valid('query').q)
    try {
      const results = await search(db, user.id, words, publicApiUrl)
      // .parse ne garde que les champs du contrat : rien d'autre ne peut sortir d'ici.
      return c.json(SearchResults.parse(results), 200)
    } catch (error) {
      if (pgCodeOf(error) !== STATEMENT_TIMEOUT) throw error
      // Trop long (sec-B3) : 503, et dans le journal un résumé sans le message de l'erreur, qui
      // cite le texte cherché, ni l'adresse complète (le chemin seul, sans « ?q= »).
      console.error('Search stopped', describeError(error, { method: 'GET', path: c.req.path }))
      return c.json(errorBody(languageOf(c), 'unavailable'), 503)
    }
  })

  return app
}
