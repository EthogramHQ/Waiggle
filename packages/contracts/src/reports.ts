// Signaler un contenu, et le traiter (tranche 6d). Un membre signale un projet, une note, un
// commentaire (ou une réponse) ou un profil, avec un motif ; un administrateur voit la file, puis
// retire le contenu ou classe le signalement. Chaque décision est gardée : qui, quand, quoi,
// pourquoi. La personne qui signale n'apparaît dans aucune réponse destinée à l'auteur du contenu.
import { z } from 'zod'
import { CommentId } from './comments'
import { FeedCursor } from './feed'
import { MemberId } from './members'
import { ProjectNoteId } from './notes'
import { ProjectId } from './projects'
import { REMOVAL_EXPLANATION_MAX, RemovalGround } from './removal'
import { FreeText, VisibleFreeText } from './text'

/** La précision libre d'un signalement : 500 caractères au plus. */
export const REPORT_DETAILS_MAX = 500
/** Au plus 20 signalements par membre et par jour (anti-abus). */
export const REPORTS_PER_DAY = 20
/** La file de modération se lit 20 cibles par 20. */
export const MODERATION_PAGE_SIZE = 20
/** Au plus 20 précisions montrées par cible dans la file (les plus récentes). */
export const MODERATION_DETAILS_SHOWN = 20
/** Un signalement clos, et une décision, sont gardés un an (à faire valider par un professionnel). */
export const REPORT_RETENTION_DAYS = 365
/** Un signalement devenu sans objet (compte de l'auteur supprimé) est gardé 30 jours. */
export const VOID_REPORT_RETENTION_DAYS = 30

/** Ce qu'on peut signaler. Une réponse est un commentaire. */
export const ReportTargetKind = z.enum(['project', 'note', 'comment', 'member'])
export type ReportTargetKind = z.infer<typeof ReportTargetKind>

/**
 * La cible d'un signalement : sa sorte et son identifiant, validé selon la sorte (un uuid, ou l'id
 * d'un membre). Un identifiant mal formé est refusé ici (400), avant toute requête en base.
 * `discriminatedUnion` : Zod choisit la bonne forme d'après le champ `kind`.
 */
export const ReportTarget = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('project'), id: ProjectId }),
    z.object({ kind: z.literal('note'), id: ProjectNoteId }),
    z.object({ kind: z.literal('comment'), id: CommentId }),
    z.object({ kind: z.literal('member'), id: MemberId }),
  ])
  .meta({ id: 'ReportTarget' })
export type ReportTarget = z.infer<typeof ReportTarget>

/** Les motifs, dans l'ordre où l'appli les propose. */
export const ReportReason = z.enum([
  'illegal',
  'harassment',
  'sexual_violent',
  'scam_spam',
  'impersonation',
  'privacy',
  'other',
])
export type ReportReason = z.infer<typeof ReportReason>

/**
 * Ce que l'appli envoie pour signaler (POST /v1/reports). Le texte visé n'en fait pas partie :
 * l'API le lit en base. Une précision vide compte comme aucune.
 */
export const CreateReport = z
  .object({
    target: ReportTarget,
    reason: ReportReason,
    details: FreeText(REPORT_DETAILS_MAX).optional(),
  })
  .meta({ id: 'CreateReport' })
export type CreateReport = z.infer<typeof CreateReport>

/** La réponse à un signalement : son identifiant, rien de plus. */
export const CreatedReport = z.object({ id: z.uuid() }).meta({ id: 'CreatedReport' })
export type CreatedReport = z.infer<typeof CreatedReport>

/**
 * L'état actuel d'une cible dans la file : encore là, déjà retirée, ou disparue (supprimée par son
 * auteur, compte supprimé).
 */
export const ReportTargetState = z.enum(['present', 'removed', 'gone'])
export type ReportTargetState = z.infer<typeof ReportTargetState>

/**
 * Une cible en attente dans la file, avec tous ses signalements ouverts regroupés. Jamais qui a
 * signalé : ni identifiant, ni nom. `.strict()` : une clé de plus serait refusée par la validation
 * de la réponse, pour qu'aucun champ ne s'y glisse par mégarde.
 */
export const ModerationQueueItem = z
  .object({
    target: ReportTarget,
    /** Le projet de la cible, pour le lien « Voir » ; null pour un profil. */
    projectId: ProjectId.nullable(),
    /** Le texte au moment du premier signalement (les images, elles, sont celles d'aujourd'hui). */
    snapshot: z.string(),
    state: ReportTargetState,
    /** Vrai si la cible est un contenu ou le profil de l'administrateur qui regarde : il ne peut pas en décider. */
    concernsMe: z.boolean(),
    /** Les motifs avec leur nombre, du plus fréquent au moins fréquent. */
    reasons: z.array(z.object({ reason: ReportReason, count: z.int().positive() }).strict()),
    /** Les précisions non vides, des plus récentes aux plus anciennes. */
    details: z.array(z.string()).max(MODERATION_DETAILS_SHOWN),
    count: z.int().positive(),
    firstReportedAt: z.iso.datetime(),
    lastReportedAt: z.iso.datetime(),
  })
  .strict()
  .meta({ id: 'ModerationQueueItem' })
export type ModerationQueueItem = z.infer<typeof ModerationQueueItem>

/** Les paramètres d'adresse d'une liste de modération : sans curseur, la première page. */
export const ModerationQuery = z.object({ cursor: FeedCursor.optional() })
export type ModerationQuery = z.infer<typeof ModerationQuery>

/** La file (GET /v1/moderation/reports) : du signalement le plus ancien au plus récent. */
export const ModerationQueuePage = z
  .object({
    items: z.array(ModerationQueueItem).max(MODERATION_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'ModerationQueuePage' })
export type ModerationQueuePage = z.infer<typeof ModerationQueuePage>

/** Un contenu retiré (GET /v1/moderation/removed), pour pouvoir le rétablir. */
export const RemovedItem = z
  .object({
    target: ReportTarget,
    projectId: ProjectId.nullable(),
    /** Son texte actuel (titre et pitch d'un projet, texte d'une note ou d'un commentaire). */
    text: z.string(),
    ground: RemovalGround,
    explanation: z.string(),
    removedAt: z.iso.datetime(),
    concernsMe: z.boolean(),
  })
  .strict()
  .meta({ id: 'RemovedItem' })
export type RemovedItem = z.infer<typeof RemovedItem>

/** Les contenus retirés, du plus récent au plus ancien. */
export const RemovedPage = z
  .object({
    items: z.array(RemovedItem).max(MODERATION_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'RemovedPage' })
export type RemovedPage = z.infer<typeof RemovedPage>

/** L'explication d'un retrait : obligatoire, et elle doit montrer quelque chose. */
export const RemovalExplanation = VisibleFreeText(REMOVAL_EXPLANATION_MAX)

/**
 * Une décision (POST /v1/moderation/decisions) : retirer (avec un fondement et une explication),
 * classer sans suite, ou rétablir un contenu retiré. Un profil n'accepte que « classer ».
 */
export const ModerationDecisionInput = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('remove'),
      target: ReportTarget,
      ground: RemovalGround,
      explanation: RemovalExplanation,
    }),
    z.object({ action: z.literal('dismiss'), target: ReportTarget }),
    z.object({ action: z.literal('restore'), target: ReportTarget }),
  ])
  .meta({ id: 'ModerationDecisionInput' })
export type ModerationDecisionInput = z.infer<typeof ModerationDecisionInput>

export const ModerationAction = z.enum(['remove', 'dismiss', 'restore'])
export type ModerationAction = z.infer<typeof ModerationAction>

/** La décision enregistrée. */
export const ModerationDecision = z
  .object({ id: z.uuid(), action: ModerationAction, createdAt: z.iso.datetime() })
  .meta({ id: 'ModerationDecision' })
export type ModerationDecision = z.infer<typeof ModerationDecision>

/** L'issue d'un signalement : en attente, contenu retiré, classé sans suite, ou sans objet. */
export const ReportOutcome = z.enum(['open', 'removed', 'dismissed', 'void'])
export type ReportOutcome = z.infer<typeof ReportOutcome>

/**
 * Un signalement fait par le membre, dans l'export de ses données : ni le texte visé (il appartient
 * à un autre, et a pu devenir privé), ni l'explication de la décision.
 */
export const ReportExport = z.object({
  targetKind: ReportTargetKind,
  targetId: z.string(),
  reason: ReportReason,
  details: z.string().nullable(),
  createdAt: z.iso.datetime(),
  outcome: ReportOutcome,
  decidedAt: z.iso.datetime().nullable(),
})
export type ReportExport = z.infer<typeof ReportExport>
