// Les routes des e-mails de notification (tranche 6c) :
// - GET et PATCH /v1/me/email-preferences : les deux réglages du membre connecté (Mon profil) ;
// - POST /v1/email/unsubscribe?token=…[&scope=all] : la désinscription depuis un e-mail, sans
//   connexion. Deux chemins y mènent : le bouton « Confirmer » de la page de désinscription de
//   l'appli, et le bouton « Se désabonner » de la messagerie (en-tête List-Unsubscribe, RFC 8058) ;
// - GET /v1/email/unsubscribe : un lien seulement ouvert (antivirus, aperçu) ne change rien et mène
//   à la page de l'appli, qui demande confirmation.
//
// La désinscription n'utilise jamais la session (app.ts ne lui applique ni la session ni le
// contrôle d'origine) : seul le jeton signé du lien donne le droit, et il ne permet que de couper.
import { createRoute } from '@hono/zod-openapi'
import {
  EmailPreferences,
  EmailPreferencesUpdate,
  type UnsubscribeKind,
  UnsubscribeQuery,
  UnsubscribeToken,
} from '@ruche/contracts'
import type { Database } from '@ruche/db'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import {
  readEmailPreferences,
  unsubscribeMember,
  updateEmailPreferences,
} from '../email/preferences'
import { readUnsubscribeToken } from '../email/unsubscribe-token'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

/** Le chemin de la désinscription : app.ts l'exempte de la session et du contrôle d'origine. */
export const UNSUBSCRIBE_PATH = '/v1/email/unsubscribe'

const preferencesResponse = {
  description: 'My two e-mail settings.',
  content: { 'application/json': { schema: EmailPreferences } },
}

const readRoute = createRoute({
  method: 'get',
  path: '/v1/me/email-preferences',
  summary: 'Read my e-mail settings',
  responses: { 200: preferencesResponse, 401: errorResponse('Not signed in.') },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/me/email-preferences',
  summary: 'Change my e-mail settings',
  description: 'One setting or both; the answer gives both.',
  request: {
    body: { required: true, content: { 'application/json': { schema: EmailPreferencesUpdate } } },
  },
  responses: {
    200: preferencesResponse,
    400: errorResponse('Empty body, unknown field or wrong value.'),
    401: errorResponse('Not signed in.'),
    429: errorResponse('Too many changes.'),
  },
})

const unsubscribeRoute = createRoute({
  method: 'post',
  path: UNSUBSCRIBE_PATH,
  summary: 'Unsubscribe from an e-mail link (no session)',
  description:
    'Turns off the kind of e-mail of the signed token (or both with scope=all). Never turns ' +
    'anything on. The body is never read (RFC 8058 sends « List-Unsubscribe=One-Click »).',
  request: { query: UnsubscribeQuery },
  responses: {
    204: { description: 'Done (no content).' },
    400: errorResponse('Invalid link (the same answer whatever the reason).'),
    429: errorResponse('Too many links.'),
  },
})

const openedRoute = createRoute({
  method: 'get',
  path: UNSUBSCRIBE_PATH,
  summary: 'An unsubscribe link opened (changes nothing)',
  responses: { 303: { description: 'To the unsubscribe page of the app, which asks to confirm.' } },
})

// Les quotas :
// - réglages : 60 changements par minute (l'appli en envoie un par interrupteur touché) ;
// - désinscription : 300 liens par heure et par adresse IP, comptés avant l'examen du lien, faux
//   liens compris (Gmail envoie les « Se désabonner » de tous ses utilisateurs depuis peu
//   d'adresses : 300 laisse passer une vraie messagerie et arrête qui essaierait des jetons au
//   hasard) ; puis 10 liens valides par heure pour un même membre, toutes adresses confondues.
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const preferencesRule: RateRule = { windowMs: MINUTE, max: 60 }
const unsubscribeIpRule: RateRule = { windowMs: HOUR, max: 300 }
const unsubscribeMemberRule: RateRule = { windowMs: HOUR, max: 10 }

/**
 * Une ligne de journal par refus : « Unsubscribe <identifiant> <recap|mentions|all> ». Une
 * sauvegarde restaurée ramènerait les réglages d'avant ; ces lignes disent quels refus réappliquer
 * (docs/ops/serveur.md, « Sauvegardes »). Seulement l'identifiant du membre : ni adresse, ni nom, ni
 * jeton (les journaux sont gardés et lus par d'autres outils). L'identifiant vient de la session ou
 * d'un jeton signé par nous : jamais d'un texte tapé, qui pourrait imiter une ligne.
 */
const logUnsubscribe = (userId: string, what: UnsubscribeKind | 'all') => {
  console.log(`Unsubscribe ${userId} ${what}`)
}

type Deps = {
  db: Database
  limiter: RateLimiter
  /** La clé secrète de l'API (BETTER_AUTH_SECRET) : la clé des jetons en est dérivée. */
  secret: string
  /** L'adresse de l'appli web : la page de désinscription. */
  appUrl: string
}

export const emailRoutes = ({ db, limiter, secret, appUrl }: Deps) => {
  const app = createRouter()
  // Les réglages : connecté obligatoire, avant tout le reste (même avant la lecture du corps).
  app.use('/v1/me/email-preferences', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const tooMany = (c: Context<AppEnv>, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
  }
  // Un lien invalide reçoit toujours cette réponse, quelle qu'en soit la raison (jeton faux ou
  // abîmé, compte supprimé, paramètre inconnu) : elle ne dit pas si le compte existe.
  const invalidLink = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'unsubscribe_invalid'), 400)

  // Le quota des réglages, posé AVANT la vérification du corps (que Hono place juste avant la
  // route) : chaque demande compte, même mal écrite.
  app.on('PATCH', '/v1/me/email-preferences', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).emailPreferences, preferencesRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  // Le quota par adresse IP de la désinscription, avant l'examen du lien. X-Real-IP est posé par
  // Caddy, qui remplace toute valeur envoyée par le visiteur.
  app.on('POST', UNSUBSCRIBE_PATH, async (c, next) => {
    const ip = c.req.header('x-real-ip') ?? 'unknown'
    const decision = await limiter.hit(`unsubscribe-ip:${ip}`, unsubscribeIpRule)
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)
    await next()
  })

  app.openapi(readRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // .parse ne garde que les champs du contrat : ni date d'envoi, ni rien d'autre.
    return c.json(EmailPreferences.parse(await readEmailPreferences(db, user.id)), 200)
  })

  app.openapi(updateRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const update = c.req.valid('json')
    const preferences = await updateEmailPreferences(db, user.id, update, new Date())
    // Couper un réglage dans l'appli est aussi un refus : il laisse la même ligne de journal
    // qu'une désinscription par le lien (voir logUnsubscribe).
    const recapOff = update.weeklyRecap === false
    const mentionsOff = update.mentionEmails === false
    if (recapOff || mentionsOff) {
      logUnsubscribe(user.id, recapOff && mentionsOff ? 'all' : recapOff ? 'recap' : 'mentions')
    }
    return c.json(EmailPreferences.parse(preferences), 200)
  })

  app.openapi(
    unsubscribeRoute,
    async (c) => {
      // Le jeton et la portée viennent de l'adresse, jamais du corps (qui n'est pas lu). Un
      // paramètre répété (deux jetons) est refusé : on ne choisit pas lequel croire.
      if (
        (c.req.queries('token') ?? []).length !== 1 ||
        (c.req.queries('scope') ?? []).length > 1
      ) {
        return invalidLink(c)
      }
      const { token, scope } = c.req.valid('query')
      const link = readUnsubscribeToken(secret, token)
      if (!link) return invalidLink(c)

      // Le quota du membre, seulement pour un lien signé par nous : un faux lien ne peut pas
      // épuiser le quota d'un autre.
      const key = memberCounterKeys(link.userId).unsubscribe
      const decision = await limiter.hit(key, unsubscribeMemberRule)
      if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds)

      const done = await unsubscribeMember(db, link.userId, link.kind, scope === 'all', new Date())
      if (!done) return invalidLink(c)
      logUnsubscribe(link.userId, scope === 'all' ? 'all' : link.kind)
      return c.body(null, 204)
    },
    // Une adresse mal formée (jeton absent, de mauvaise forme, portée inconnue) : la même réponse
    // qu'un lien invalide, et non l'erreur de validation habituelle.
    (result, c) => {
      if (!result.success) return invalidLink(c)
    },
  )

  app.openapi(openedRoute, (c) => {
    // Rien ne change : on mène à la page de l'appli, qui demande « Ne plus recevoir… ? ». Le jeton
    // n'y est recopié que s'il a la forme attendue ; l'adresse de destination est toujours la nôtre.
    const page = new URL('/unsubscribe', appUrl)
    const token = c.req.query('token')
    if (token !== undefined && UnsubscribeToken.safeParse(token).success) {
      page.searchParams.set('token', token)
    }
    return c.redirect(page.toString(), 303)
  })

  return app
}
