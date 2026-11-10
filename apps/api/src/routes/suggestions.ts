// « Proches à suivre » (tranche R4) : GET /v1/suggestions/members (la liste, suggestions/load.ts)
// et PUT /v1/suggestions/members/{id}/dismissed (« × », « Ne plus suggérer Léa »). Réservés aux
// membres connectés, comptés par membre. Écarter ne prévient personne : l'écarté n'en sait jamais
// rien, et la réponse ne dit jamais qu'un blocage existe (relecture de sécurité sec-B1).
import { createRoute, z } from '@hono/zod-openapi'
import { MemberId, MemberSuggestions } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { notBlockedWith } from '../blocks/visibility'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { loadSuggestions } from '../suggestions/load'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// Anti-abus (relecture de sécurité sec-A3). Lire : 600 fois par heure (l'appli relit la liste à
// chaque ouverture du fil). Écarter : 120 par heure, comme « Suivre », et 500 par jour, pour
// qu'un script ne puisse pas parcourir tout l'annuaire en écartant membre après membre.
const HOUR = 60 * 60 * 1000
const readRule: RateRule = { windowMs: HOUR, max: 600 }
const dismissHourRule: RateRule = { windowMs: HOUR, max: 120 }
const dismissDayRule: RateRule = { windowMs: 24 * HOUR, max: 500 }

const listRoute = createRoute({
  method: 'get',
  path: '/v1/suggestions/members',
  summary: 'Read the members suggested to follow',
  description:
    'Up to five authors of a recent public project, newest first, each with that latest project. ' +
    'Never the viewer, a member followed or dismissed, nor one blocked either way.',
  responses: {
    200: {
      description: 'The suggested members, possibly none.',
      content: { 'application/json': { schema: MemberSuggestions } },
    },
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many reads.'),
  },
})

const dismissRoute = createRoute({
  method: 'put',
  path: '/v1/suggestions/members/{id}/dismissed',
  summary: 'Stop suggesting a member',
  description:
    'Kept on every device of the viewer, and told to nobody. Dismissing twice keeps the first date.',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: 'Done (no content).' },
    400: errorResponse('One cannot dismiss oneself.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such member, or an account whose email was never verified.'),
    429: errorResponse('Too many dismissals.'),
  },
})

type Deps = { db: Database; limiter: RateLimiter; publicApiUrl: string }

export const suggestionRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()
  // Connecté obligatoire, avant tout le reste (quota compris).
  app.use('/v1/suggestions/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }

  // Le quota de « × », dans un « middleware » posé avant la route : il compte chaque demande, même
  // mal formée (sec-A3), avant que la route ne regarde l'identifiant. Les deux compteurs avancent
  // à chaque demande ; le premier refus l'emporte, avec son délai d'attente.
  app.on('PUT', '/v1/suggestions/members/:id/dismissed', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const keys = memberCounterKeys(user.id)
    for (const [key, rule] of [
      [keys.suggestionDismissHour, dismissHourRule],
      [keys.suggestionDismissDay, dismissDayRule],
    ] as const) {
      const decision = await limiter.hit(key, rule)
      if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    }
    await next()
  })

  app.openapi(listRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    // Pas de paramètre à valider : le quota passe ici, avant toute lecture.
    const decision = await limiter.hit(memberCounterKeys(viewer.id).suggestionsHour, readRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    const members = await loadSuggestions(db, viewer.id, publicApiUrl)
    // .parse ne garde que les champs du contrat (strictObject : un champ de trop serait refusé).
    return c.json(MemberSuggestions.parse({ members }), 200)
  })

  app.openapi(dismissRoute, async (c) => {
    const viewer = c.get('user')
    if (!viewer) return unauthorized(c)
    const notFound = () => c.json(errorBody(languageOf(c), 'not_found'), 404)

    const { id } = c.req.valid('param')
    // Les mêmes réponses que « Suivre » (routes/follows.ts), dans le même ordre : un identifiant
    // mal formé ne désigne personne (404 sans interroger la base) ; soi-même, le même refus que
    // « Suivre » sur soi (décision de R4).
    if (!MemberId.safeParse(id).success) return notFound()
    if (id === viewer.id) return c.json(errorBody(languageOf(c), 'cannot_follow_own'), 400)
    // Seulement un compte vérifié, sans blocage avec moi dans un sens ou dans l'autre : sinon le
    // même 404 qu'un inconnu (sec-B1). L'identifiant passe comme valeur liée : chaque `exists` de
    // notBlockedWith est lu une fois, par un index de member_block. La ligne de "user" se lit par
    // sa clé primaire.
    const [member] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.id, id),
          eq(schema.user.emailVerified, true),
          notBlockedWith(viewer.id, sql`${id}`),
        ),
      )
    if (!member) return notFound()

    // « on conflict do nothing » : déjà écarté, rien ne change (la date du premier « × » reste,
    // décision de R4), et la réponse est la même. La date vient de l'horloge de
    // JavaScript (les tests la maîtrisent). Un blocage posé juste après la vérification laisserait
    // une ligne sans effet : un écart n'ouvre aucun droit et ne se montre à personne.
    await db
      .insert(schema.suggestionDismissal)
      .values({ memberId: viewer.id, dismissedId: id, at: new Date() })
      .onConflictDoNothing()
    // 204 : « c'est fait », sans corps.
    return c.body(null, 204)
  })

  return app
}
