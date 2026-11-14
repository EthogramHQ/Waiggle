// Routes des signalements (tranche 7a) : POST /v1/reports pour signaler un projet, une note, un
// commentaire (ou une réponse) ou un profil ; GET /v1/reports/target pour que la page « Signaler »
// montre la cible, lue avec la même règle de visibilité. Ce que l'administrateur en fait est dans
// routes/moderation.ts. Scénario : docs/scenarios/phase-1.md, « Tranche 7a — Signaler » ; règles
// 5 à 7 et 26 de la relecture du plan.
import { createRoute, z } from '@hono/zod-openapi'
import {
  CreatedReport,
  CreateReport,
  REPORTS_PER_DAY,
  ReportSnapshot,
  ReportTarget,
  ReportTargetKind,
  ReportTargetPreview,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Context } from 'hono'
import { requireUser } from '../auth/session'
import { errorBody, languageOf } from '../errors'
import { memberCounterKeys, type RateLimiter, type RateRule } from '../rate-limit'
import { findPart, loadReportable, sameSnapshot } from '../reports/target'
import type { AppEnv } from '../types'
import { createRouter, errorResponse } from './router'

// 20 signalements par jour et par membre, toutes cibles ensemble (REPORTS_PER_DAY, contrat).
const reportRule: RateRule = { windowMs: 24 * 60 * 60 * 1000, max: REPORTS_PER_DAY }

const postReportRoute = createRoute({
  method: 'post',
  path: '/v1/reports',
  summary: 'Report a content or a profile',
  description:
    'The reported text is read from the database, never taken from the request. The person ' +
    'reported is never told who reported.',
  request: {
    body: { required: true, content: { 'application/json': { schema: CreateReport } } },
  },
  responses: {
    201: {
      description: 'The report is recorded.',
      content: { 'application/json': { schema: CreatedReport } },
    },
    400: errorResponse('Invalid target, reason or details.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such content, or a content the member cannot see.'),
    409: errorResponse(
      'Already reported by this member and still open (already_reported), or unchanged since the ' +
        'moderation examined her last report (already_examined).',
    ),
    422: errorResponse('Her own content or profile.'),
    429: errorResponse('Too many reports today.'),
  },
})

// La cible arrive en deux paramètres d'adresse (?kind=…&id=…) ; l'identifiant est ensuite validé
// selon la sorte, par le même schéma que le signalement (ReportTarget).
const PreviewQuery = z.object({ kind: ReportTargetKind, id: z.string() })

const previewRoute = createRoute({
  method: 'get',
  path: '/v1/reports/target',
  summary: 'What the report page shows of its target',
  request: { query: PreviewQuery },
  responses: {
    200: {
      description: 'The target, as the member sees it now.',
      content: { 'application/json': { schema: ReportTargetPreview } },
    },
    400: errorResponse('Invalid kind or id.'),
    401: errorResponse('Not signed in.'),
    404: errorResponse('No such content, or a content the member cannot see.'),
    422: errorResponse('Her own content or profile.'),
  },
})

type Deps = {
  db: Database
  limiter: RateLimiter
  /** R9 : pour l'adresse des miniatures de la feuille (photos, photo de profil). */
  publicApiUrl: string
}

export const reportRoutes = ({ db, limiter, publicApiUrl }: Deps) => {
  const app = createRouter()

  // Connecté obligatoire, avant tout le reste (401).
  app.use('/v1/reports', requireUser)
  app.use('/v1/reports/*', requireUser)

  const unauthorized = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'unauthorized'), 401)
  const notFound = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'not_found'), 404)
  const ownContent = (c: Context<AppEnv>) => c.json(errorBody(languageOf(c), 'own_content'), 422)
  const alreadyReported = (c: Context<AppEnv>) =>
    c.json(errorBody(languageOf(c), 'already_reported'), 409)

  // Le quota passe AVANT la lecture du corps (règle 5) : ce garde, enregistré avant la route pour
  // la même adresse et la même méthode, passe avant le validateur que Hono place juste devant elle
  // (même façon de faire que routes/notes.ts). Chaque demande compte, même mal écrite, et au-delà
  // du plafond le corps n'est même pas lu.
  app.on('POST', '/v1/reports', async (c, next) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    const decision = await limiter.hit(memberCounterKeys(user.id).report, reportRule)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSeconds))
      return c.json(errorBody(languageOf(c), 'rate_limited'), 429)
    }
    await next()
  })

  // Une décision « restore » de cette cible, après `since`, qui vise la même partie, ou le contenu
  // entier (qui rend toutes ses parties). Photo et couverture se défont ensemble (une même image
  // retirée comme l'une ou l'autre, comme dans reports/queue.ts). L'index
  // moderation_decision_target_idx (target_kind, target_id, created_at) donne les décisions de la
  // cible ; `limit 1` suffit à savoir s'il y en a une. La date est liée en paramètre.
  const restoredSince = async (
    since: Date,
    target: ReportTarget,
    part: { field: string; mediaId?: string | undefined } | undefined,
  ) => {
    const d = schema.moderationDecision
    const sameImage =
      part?.mediaId === undefined
        ? undefined
        : and(inArray(d.partField, ['cover', 'photo']), eq(d.partMediaId, part.mediaId))
    const [row] = await db
      .select({ id: d.id })
      .from(d)
      .where(
        and(
          eq(d.targetKind, target.kind),
          eq(d.targetId, target.id),
          eq(d.action, 'restore'),
          gt(d.createdAt, since),
          or(
            isNull(d.partField),
            part === undefined ? undefined : eq(d.partField, part.field),
            sameImage,
          ),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  app.openapi(postReportRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // Validé par CreateReport : la cible (id conforme à sa sorte), le motif, la précision (500
    // caractères au plus ; vide, elle compte comme absente). Tout autre champ (un `snapshot`
    // envoyé par l'appli) est ignoré.
    const { target, part, reason, details } = c.req.valid('json')

    // L'ordre de la règle 5 : visibilité, puis « son propre contenu », puis « déjà signalé ».
    // Inconnu, privé, retiré, masqué ou supprimé : la même réponse, qui ne révèle rien.
    const found = await loadReportable(db, user.id, target, publicApiUrl)
    if (!found) return notFound(c)
    if (found.authorId === user.id) return ownContent(c)
    // R9 : une partie doit être sur la page que ce membre voit (une photo d'un autre contenu, une
    // photo retirée, un prompt absent) : sinon le même 404 qu'un contenu inconnu. La copie ne garde
    // alors que cette partie.
    const reported = part ? findPart(found, part) : null
    if (part && !reported) return notFound(c)
    const snapshot = reported ? reported.copy : found.snapshot
    const partField = part?.field ?? null
    const partMediaId = reported?.mediaId ?? null

    // Re-signaler (tranche 7b, règle 14) : le dernier signalement de ce membre pour cette cible et
    // cette partie (R9 : le contenu entier et chaque partie se signalent à part). Encore ouvert :
    // « déjà signalé ». Clos (retiré, classé, sans objet) avec la même copie : la modération a déjà
    // examiné ce contenu tel qu'il est, un code à part (« already_examined »). Clos et le contenu a
    // changé depuis : un nouveau signalement est permis. L'index content_report_target_idx
    // (target_kind, target_id) donne les quelques signalements de la cible, filtrés ensuite par
    // leur auteur et leur partie. `is not distinct from` : l'égalité qui tient aussi entre deux null
    // (le contenu entier n'a ni champ ni photo).
    const r = schema.contentReport
    const [previous] = await db
      .select({ status: r.status, snapshot: r.snapshot, decidedAt: r.decidedAt })
      .from(r)
      .where(
        and(
          eq(r.targetKind, target.kind),
          eq(r.targetId, target.id),
          eq(r.reporterId, user.id),
          sql`${r.partField} is not distinct from ${partField}`,
          sql`${r.partMediaId} is not distinct from ${partMediaId}::uuid`,
        ),
      )
      .orderBy(desc(r.createdAt), desc(r.id))
      .limit(1)
    if (previous?.status === 'open') return alreadyReported(c)
    if (previous) {
      // safeParse : une copie mal formée en base ne fait pas tomber la route ; elle compte alors
      // comme différente, et le signalement est accepté.
      const before = ReportSnapshot.safeParse(previous.snapshot)
      if (before.success && sameSnapshot(before.data, snapshot)) {
        // Relecture de sécurité R9 (sec-A1) : un retrait que personne n'a rétabli, et la partie
        // est pourtant de nouveau visible : son auteur l'a remise lui-même (le même lien de démo
        // renvoyé). La modération n'a pas examiné cette version : le signalement est accepté.
        const writtenBack =
          previous.status === 'removed' &&
          previous.decidedAt !== null &&
          !(await restoredSince(previous.decidedAt, target, part))
        if (!writtenBack) return c.json(errorBody(languageOf(c), 'already_examined'), 409)
      }
    }

    // « on conflict do nothing » : si ce membre a déjà un signalement ouvert de cette cible,
    // l'index unique partiel content_report_reporter_target_idx (où status = 'open') refuse la
    // ligne, sans erreur, et « returning » ne rend rien. Sans cible nommée : PostgreSQL ne sait
    // désigner un index partiel dans « on conflict (colonnes) » qu'avec sa condition ; sans rien,
    // toute contrainte unique compte. Deux demandes simultanées ne créent donc jamais deux
    // signalements ouverts, même entre la lecture ci-dessus et l'écriture.
    const id = crypto.randomUUID()
    const inserted = await db
      .insert(schema.contentReport)
      .values({
        id,
        reporterId: user.id,
        targetKind: target.kind,
        targetId: target.id,
        projectId: found.projectId,
        targetAuthorId: found.authorId,
        reason,
        details: details === undefined || details === '' ? null : details,
        snapshot,
        partField,
        partMediaId,
        status: 'open',
        // L'heure de JavaScript, comme toutes les dates qui rangent (la file, la purge).
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: schema.contentReport.id })
    if (inserted.length === 0) return alreadyReported(c)
    // Aucun journal ne note qui a signalé (règle 14) : rien n'est écrit dans les logs ici.
    return c.json(CreatedReport.parse({ id }), 201)
  })

  app.openapi(previewRoute, async (c) => {
    const user = c.get('user')
    if (!user) return unauthorized(c)
    // safeParse : la sorte est connue, mais l'identifiant doit encore avoir la forme de sa sorte
    // (un uuid, ou l'id d'un membre) ; sinon 400, sans requête en base.
    const parsed = ReportTarget.safeParse(c.req.valid('query'))
    if (!parsed.success) return c.json(errorBody(languageOf(c), 'validation'), 400)
    const target = parsed.data

    const found = await loadReportable(db, user.id, target, publicApiUrl)
    if (!found) return notFound(c)
    if (found.authorId === user.id) return ownContent(c)

    // R9 : ce que ce membre a déjà signalé et qui reste ouvert, le contenu entier ou ses parties.
    // Servi par l'index unique partiel content_report_reporter_target_idx (reporter_id,
    // target_kind, target_id…, où status = 'open') : seules ses lignes ouvertes sur cette cible.
    const r = schema.contentReport
    const mine = await db
      .select({ field: r.partField, mediaId: r.partMediaId })
      .from(r)
      .where(
        and(
          eq(r.reporterId, user.id),
          eq(r.targetKind, target.kind),
          eq(r.targetId, target.id),
          eq(r.status, 'open'),
        ),
      )
    const reportedByMe = (field: string | null, mediaId: string | null) =>
      mine.some((row) => row.field === field && row.mediaId === mediaId)
    // Le quota du jour, lu sans compter ni ouvrir de fenêtre (`peek`, relecture de sécurité P8).
    const { remaining } = await limiter.peek(memberCounterKeys(user.id).report, reportRule)

    return c.json(
      ReportTargetPreview.parse({
        target,
        text: found.text,
        projectId: found.projectId,
        // L'auteur (le membre lui-même pour un profil) : son nom et son pseudo publics, rien de
        // son compte ; `isBlocked` dit si l'appli peut encore proposer « Bloquer aussi @x ».
        author: found.author,
        head: { ...found.head, authorName: found.author.name },
        // La copie de chaque partie reste ici : elle n'est que pour le signalement.
        parts: found.parts.map(({ field, mediaId, position, thumb }) => ({
          field,
          mediaId,
          position,
          thumb,
          reportedByMe: reportedByMe(field, mediaId),
        })),
        reportedByMe: reportedByMe(null, null),
        remainingToday: remaining,
      }),
      200,
    )
  })

  return app
}
