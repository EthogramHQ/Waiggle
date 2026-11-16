// Le signalement d'un visiteur sans compte (tranche R12, « Les projets publics ») :
// - POST /v1/public/reports : signaler un projet public, une de ses mises à jour ou une page
//   publique, avec ou sans adresse e-mail ; réponse 204, sans corps ;
// - GET /v1/public/reports/target : ce que la feuille « Signaler » montre de la cible, sans pseudo,
//   sans auteur à bloquer, sans « déjà signalé », avec le nombre de signalements qu'il reste.
//
// Ces routes ne lisent jamais la session (app.ts) : un membre connecté est un visiteur ici, et le
// signalement n'est jamais rattaché à son compte (`reporter_id` reste nul). Le contrôle d'origine
// de `/v1/*` s'applique avant tout : un envoi venu d'un autre site est refusé en 403 sans être
// compté. Ce qui suit (plan R12, décisions 12 et 17, relectures de sécurité B2, I2 et I3) :
// - le quota, 5 par jour et par réseau, compte AVANT l'examen, même un envoi mal formé ;
// - une cible qu'un visiteur ne peut pas lire (privée, « Membres », retirée, page fermée, inconnue)
//   répond le même 404 ;
// - un doublon (même cible, même adresse, déjà ouvert) répond exactement comme un premier
//   signalement, sans nouvelle ligne ni second e-mail : la réponse ne dit jamais qu'une adresse
//   avait déjà signalé ;
// - au plus un accusé de réception par adresse et par jour, compté par l'empreinte de l'adresse.
import { createRoute } from '@hono/zod-openapi'
import {
  PublicReportTarget,
  PublicReportTargetQuery,
  VISITOR_REPORTS_PER_DAY,
  VisitorReport,
  VisitorReportTarget,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import type { Context } from 'hono'
import type { Mailer } from '../email/mailer'
import { visitorReportReceivedEmail } from '../email/templates'
import { errorBody, languageOf } from '../errors'
import {
  ADDRESS_COUNTER_PURPOSES,
  addressCounterKey,
  normalizeAddress,
  type RateLimiter,
  type RateRule,
  visitorReportKey,
} from '../rate-limit'
import { findPart, loadVisitorReportable } from '../reports/target'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

const DAY = 24 * 60 * 60 * 1000
/** 5 signalements par jour et par réseau (VISITOR_REPORTS_PER_DAY, contrat). */
const reportRule: RateRule = { windowMs: DAY, max: VISITOR_REPORTS_PER_DAY }
/** Un accusé de réception par adresse et par jour. */
const ackRule: RateRule = { windowMs: DAY, max: 1 }

const postRoute = createRoute({
  method: 'post',
  path: '/v1/public/reports',
  summary: 'Report a public content, without an account',
  description:
    'A public project, one of its updates or a public page. The text reported is read from the ' +
    'database. The e-mail address is optional: it only serves the acknowledgement and the ' +
    'decision, and is erased when the report is closed. The answer is the same for a first ' +
    'report and for a repeated one.',
  request: {
    body: { required: true, content: { 'application/json': { schema: VisitorReport } } },
  },
  responses: {
    204: { description: 'The report is recorded (or was already open: the same answer).' },
    400: errorResponse('Invalid target, reason, details or e-mail address.'),
    403: errorResponse('Sent from another site.'),
    404: errorResponse('No such content, or a content a visitor cannot see.'),
    429: errorResponse('Five reports a day from this network (visitor_report_quota).'),
  },
})

const targetRoute = createRoute({
  method: 'get',
  path: '/v1/public/reports/target',
  summary: 'What the report sheet of a visitor shows of its target',
  request: { query: PublicReportTargetQuery },
  responses: {
    200: {
      description: 'The target as a visitor sees it, and how many reports are left today.',
      content: { 'application/json': { schema: PublicReportTarget } },
    },
    400: errorResponse('Invalid kind or id.'),
    404: errorResponse('No such content, or a content a visitor cannot see.'),
    429: errorResponse('Too many reads from this network.'),
  },
})

type Deps = {
  db: Database
  limiter: RateLimiter
  mailer: Mailer
  /** Pour l'adresse des miniatures de la feuille. */
  publicApiUrl: string
  /** Pour le pied de l'e-mail (la page Confidentialité). */
  appUrl: string
  /** Le secret du serveur, pour l'empreinte de l'adresse du compteur d'accusés. */
  secret: string
}

export const publicReportRoutes = ({ db, limiter, mailer, publicApiUrl, appUrl, secret }: Deps) => {
  const app = createRouter()

  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)

  // Le quota passe AVANT la lecture du corps : ce garde, enregistré avant la route, passe devant le
  // validateur que Hono place juste devant elle. Chaque envoi compte, même mal formé, et au-delà du
  // plafond le corps n'est même pas lu (un JSON illisible reçoit aussi 429). Il passe après le
  // contrôle d'origine de `/v1/*` (app.ts) : un envoi d'un autre site, déjà refusé, ne compte pas.
  app.on('POST', '/v1/public/reports', async (c, next) => {
    const decision = await limiter.hit(visitorReportKey(c.req.header('x-real-ip')), reportRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'visitor_report_quota'), 429)
    }
    await next()
  })

  app.openapi(postRoute, async (c) => {
    // Validé par VisitorReport : la cible (trois sortes), la partie, le motif, la précision (obligatoire
    // pour un contenu illégal) et l'adresse, nettoyée (espaces retirés, vide = aucune).
    const { target, part, reason, details, email } = c.req.valid('json')

    // Visible d'un visiteur, sinon le 404 d'une cible inconnue (jamais « privé » ni « fermé »).
    const found = await loadVisitorReportable(db, target, publicApiUrl)
    if (!found) return notFound(c)
    // Une partie qui n'est pas sur la page publique (le pseudo, une photo retirée) : le même 404.
    const reported = part ? findPart(found, part) : null
    if (part && !reported) return notFound(c)

    // L'adresse est rangée en minuscules : « Voisine@… » et « voisine@… » sont la même boîte, et
    // l'index unique partiel content_report_visitor_target_idx (cible, adresse en minuscules, où
    // le signalement est ouvert) refuse alors un doublon.
    const address = email === undefined ? null : normalizeAddress(email)
    // « on conflict do nothing » : un doublon encore ouvert est refusé par cet index sans erreur,
    // et « returning » ne rend rien ; la réponse reste la même (décision 1, relecture B2). Sans
    // adresse, rien ne dit qui a signalé : chaque envoi crée sa ligne (le quota borne le nombre).
    // Une cible déjà examinée (adresse effacée) : l'API ne sait plus que c'est la même personne, une
    // nouvelle ligne est créée (décision 2).
    const inserted = await db
      .insert(schema.contentReport)
      .values({
        id: crypto.randomUUID(),
        // Jamais le membre de la session, même s'il en envoie une : il est un visiteur ici.
        reporterId: null,
        reporterEmail: address,
        reporterLanguage: address === null ? null : languageOf(c),
        targetKind: target.kind,
        targetId: target.id,
        projectId: found.projectId,
        targetAuthorId: found.authorId,
        reason,
        details: details === undefined || details === '' ? null : details,
        snapshot: reported ? reported.copy : found.snapshot,
        partField: part?.field ?? null,
        partMediaId: reported?.mediaId ?? null,
        status: 'open',
        // L'heure de JavaScript, comme toutes les dates qui rangent.
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.contentReport.id })

    if (address !== null) {
      // Le compteur de l'accusé se touche dans les deux cas, doublon ou non : le travail de la
      // route est ainsi le même, et seul l'e-mail dit la différence (que personne d'autre ne lit).
      const allowed = (
        await limiter.hit(
          addressCounterKey(secret, ADDRESS_COUNTER_PURPOSES.visitorReportAck, address),
          ackRule,
        )
      ).allowed
      if (inserted.length > 0 && allowed) {
        // Sans attendre l'envoi : la réponse ne dépend ni de sa durée ni de son échec (un doublon,
        // qui n'envoie rien, répond aussi vite). Un échec est noté sans l'adresse ni le détail.
        mailer
          .send({
            to: address,
            ...visitorReportReceivedEmail(
              languageOf(c),
              { kind: target.kind, reason, sentAt: new Date() },
              appUrl,
            ),
          })
          .catch((error: unknown) => {
            console.error('Visitor report acknowledgement failed', {
              error: error instanceof Error ? error.name : 'unknown',
            })
          })
      }
    }
    // Aucun journal ne note qui a signalé ni quoi : rien n'est écrit dans les logs ici.
    return c.body(null, 204)
  })

  app.openapi(targetRoute, async (c) => {
    // La sorte est connue ; l'identifiant doit encore avoir la forme de sa sorte (un uuid, ou l'id
    // d'un membre), sinon 400 sans requête en base.
    const parsed = VisitorReportTarget.safeParse(c.req.valid('query'))
    if (!parsed.success) return c.json(errorBody(languageOf(c), 'validation'), 400)
    const target = parsed.data

    const found = await loadVisitorReportable(db, target, publicApiUrl)
    if (!found) return notFound(c)
    // Le quota du jour, lu sans compter ni ouvrir de fenêtre (`peek`) : la feuille dit dès son
    // ouverture s'il n'en reste plus.
    const { remaining } = await limiter.peek(
      visitorReportKey(c.req.header('x-real-ip')),
      reportRule,
    )

    return c.json(
      PublicReportTarget.parse({
        target,
        text: found.text,
        projectId: found.projectId,
        // Le nom de l'auteur seulement : ni pseudo, ni identifiant, ni blocage.
        head: { ...found.head, authorName: found.authorName },
        parts: found.parts.map(({ field, mediaId, position, thumb }) => ({
          field,
          mediaId,
          position,
          thumb,
        })),
        remainingToday: remaining,
      }),
      200,
    )
  })

  return app
}
