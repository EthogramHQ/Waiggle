// Signaler un contenu, et le traiter (tranche 7a). Un membre signale un projet, une note, un
// commentaire (ou une réponse) ou un profil, avec un motif ; un administrateur voit la file, puis
// retire le contenu ou classe le signalement. Chaque décision est gardée : qui, quand, quoi,
// pourquoi. La personne qui signale n'apparaît dans aucune réponse destinée à l'auteur du contenu.
import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from './accounts'
import { CommentId } from './comments'
import { FeedCursor } from './feed'
import { MemberId } from './members'
import { ProjectNoteId } from './notes'
import { ProjectId } from './projects'
import { REMOVAL_EXPLANATION_MAX, RemovalGround } from './removal'
import { LiftCause, SuspensionDuration } from './suspension'
import { FreeText, isClean, VisibleFreeText } from './text'

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
/**
 * Au plus 50 décisions par administrateur et par jour (tranche 7c) : un compte d'administrateur
 * volé ne peut pas tout retirer d'un coup.
 */
export const MODERATION_DECISIONS_PER_DAY = 50
/** Au-delà de 10 retraits dans l'heure, l'administrateur retape son mot de passe (tranche 7c). */
export const REMOVALS_BEFORE_PASSWORD = 10
/**
 * Au-delà de 3 suspensions de 7 ou 30 jours dans la journée, il le retape aussi (relecture de
 * sécurité S11, Louis, 26/10/2026) ; une suspension sans fin le demande toujours.
 */
export const SUSPENSIONS_BEFORE_PASSWORD = 3
/** Au plus 5 mots de passe faux par administrateur et par jour, puis 429 (relecture S12). */
export const MODERATION_PASSWORD_FAILURES_PER_DAY = 5

/**
 * Les champs qu'un membre saisit (tranche 7b), nommés comme au registre des entrées
 * (apps/api/src/moderation/inputs.ts) : profil (name, handle, bio, favoriteTools, avatar), projet
 * (title, pitch, description, prompt, tools, demoUrl, cover, photo), note et commentaire (body).
 * `text` : la copie d'un signalement d'avant 7b, un texte seul (il ne se retire pas comme une partie).
 */
export const MemberInputField = z.enum([
  'text',
  'name',
  'handle',
  'bio',
  'favoriteTools',
  'avatar',
  'title',
  'pitch',
  'description',
  'prompt',
  'tools',
  'demoUrl',
  'cover',
  'photo',
  'body',
])
export type MemberInputField = z.infer<typeof MemberInputField>

/** Les champs qui sont des images : la copie n'en garde que la clé de stockage, jamais le fichier. */
export const IMAGE_INPUT_FIELDS = [
  'avatar',
  'cover',
  'photo',
] as const satisfies readonly MemberInputField[]

/**
 * La copie d'une cible au moment du signalement : un champ par entrée, dans l'ordre de la page (un
 * prompt ou une photo par ligne). Lue en base par l'API, jamais envoyée par l'appli. Une image y est
 * sa clé de stockage. Les outils sont une seule ligne, séparés par « , ».
 */
export const ReportSnapshotEntry = z.object({ field: MemberInputField, value: z.string() }).strict()
export type ReportSnapshotEntry = z.infer<typeof ReportSnapshotEntry>
export const ReportSnapshot = z.array(ReportSnapshotEntry)
export type ReportSnapshot = z.infer<typeof ReportSnapshot>

/**
 * Une image de la copie, telle que la file la montre : jamais sa clé, seulement si elle est encore
 * là (`present` : la même image est toujours affichée) ou partie depuis (`gone` : supprimée ou
 * remplacée).
 */
export const SnapshotImage = z
  .object({ field: z.enum(IMAGE_INPUT_FIELDS), state: z.enum(['present', 'gone']) })
  .strict()
export type SnapshotImage = z.infer<typeof SnapshotImage>

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
 * l'API le lit en base. Une précision vide compte comme aucune, sauf pour un contenu dit illégal :
 * elle y est obligatoire (article 16 du règlement européen sur les services numériques, une
 * explication suffisamment étayée ; décision du 23/10/2026). `refine` ajoute cette règle qui lie
 * deux champs ; `path` range l'erreur sous `details`. La précision doit montrer au moins un
 * caractère visible : des espaces exotiques ou un accent seul ne disent rien (relecture de
 * sécurité, 23/10/2026).
 */
export const CreateReport = z
  .object({
    target: ReportTarget,
    reason: ReportReason,
    details: FreeText(REPORT_DETAILS_MAX).optional(),
  })
  .refine(
    (report) =>
      report.reason !== 'illegal' ||
      // isClean laisse passer un texte vide (c'est l'affaire de min(1)) : on l'écarte d'abord.
      (!!report.details && isClean(report.details, { lineBreaks: true, needsVisible: true })),
    {
      path: ['details'],
      message: 'an illegal content needs an explanation',
    },
  )
  .meta({ id: 'CreateReport' })
export type CreateReport = z.infer<typeof CreateReport>

/** La réponse à un signalement : son identifiant, rien de plus. */
export const CreatedReport = z.object({ id: z.uuid() }).meta({ id: 'CreatedReport' })
export type CreatedReport = z.infer<typeof CreatedReport>

/**
 * Ce que la page « Signaler » montre de la cible (GET /v1/reports/target?kind=…&id=…), lu par l'API
 * avec la même règle de visibilité que le signalement : un lien fabriqué ne fait donc jamais
 * signaler autre chose que ce que le membre voit. 404 pour une cible inconnue ou invisible.
 */
export const ReportTargetPreview = z
  .object({
    target: ReportTarget,
    /** Le texte actuel : titre et pitch d'un projet, texte d'une note ou d'un commentaire, nom et pseudo d'un membre. */
    text: z.string(),
    /** Le projet de la cible, pour revenir à sa page ; null pour un profil. */
    projectId: ProjectId.nullable(),
    /**
     * L'auteur de la cible (le membre lui-même pour un profil), pour proposer « Bloquer aussi @x »
     * après l'envoi (tranche 7b) ; `isBlocked` : le visiteur l'a déjà bloqué (rien à proposer).
     * `handle` vaut null quand un blocage les sépare, dans un sens ou dans l'autre (un commentaire
     * lu malgré le blocage, règles 1 et 2) : le nom reste, le pseudo et la photo non (24/10/2026).
     */
    author: z
      .object({
        id: z.string(),
        name: z.string(),
        handle: z.string().nullable(),
        isBlocked: z.boolean(),
      })
      .strict(),
  })
  .meta({ id: 'ReportTargetPreview' })
export type ReportTargetPreview = z.infer<typeof ReportTargetPreview>

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
    /**
     * Les textes de la copie la plus récente parmi les signalements ouverts (tranche 7b : un texte
     * changé puis signalé de nouveau se lit tel qu'il est), sans les images.
     */
    snapshot: z.array(ReportSnapshotEntry),
    /** Les images de cette copie : encore là, ou parties depuis. */
    images: z.array(SnapshotImage),
    /** Vrai si les signalements ouverts n'ont pas tous la même copie (le contenu a changé entre-temps). */
    snapshotsDiffer: z.boolean(),
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
    /**
     * Ce que la modération a déjà décidé pour le membre visé (l'auteur, ou le membre lui-même pour
     * un profil), sur l'année gardée (tranche 7c) ; null si son compte a été supprimé. Ne comptent
     * ni les retraits rétablis depuis, ni les suspensions levées pour erreur (J10).
     * `canSuspend` : faux pour l'administrateur qui regarde, pour un administrateur en fonction, ou
     * un membre déjà suspendu.
     */
    authorRecord: z
      .object({
        memberId: z.string(),
        removals: z.int().nonnegative(),
        suspensions: z.int().nonnegative(),
        suspendedNow: z.boolean(),
        canSuspend: z.boolean(),
      })
      .strict()
      .nullable(),
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
 * Le mot de passe de l'administrateur, redemandé pour une suspension sans fin ou au-delà de
 * REMOVALS_BEFORE_PASSWORD retraits dans l'heure (tranche 7c). Facultatif : sans lui, l'API répond
 * `password_required` quand il le faut. Jamais gardé ni journalisé.
 */
export const ModerationPassword = z.string().min(1).max(PASSWORD_MAX_LENGTH)

/**
 * Une décision (POST /v1/moderation/decisions) : retirer (avec un fondement et une explication),
 * classer sans suite, ou rétablir un contenu retiré ; suspendre un compte ou lever sa suspension
 * (tranche 7c). Un profil n'accepte que « classer » (le retrait d'une partie vient en 7d).
 */
export const ModerationDecisionInput = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('remove'),
      target: ReportTarget,
      ground: RemovalGround,
      explanation: RemovalExplanation,
      password: ModerationPassword.optional(),
    }),
    z.object({ action: z.literal('dismiss'), target: ReportTarget }),
    z.object({ action: z.literal('restore'), target: ReportTarget }),
    z.object({
      action: z.literal('suspend'),
      memberId: MemberId,
      duration: SuspensionDuration,
      ground: RemovalGround,
      explanation: RemovalExplanation,
      /**
       * Le signalement d'où part la suspension (la carte de la file), s'il y en a un : l'API vérifie
       * qu'il est ouvert et vise ce membre, et la suspension est dite « après un signalement » (J2).
       */
      fromReport: ReportTarget.optional(),
      password: ModerationPassword.optional(),
    }),
    z.object({
      action: z.literal('lift'),
      memberId: MemberId,
      cause: LiftCause,
      explanation: RemovalExplanation,
    }),
  ])
  .meta({ id: 'ModerationDecisionInput' })
export type ModerationDecisionInput = z.infer<typeof ModerationDecisionInput>

export const ModerationAction = z.enum(['remove', 'dismiss', 'restore', 'suspend', 'lift'])
export type ModerationAction = z.infer<typeof ModerationAction>

/** La décision enregistrée. */
export const ModerationDecision = z
  .object({ id: z.uuid(), action: ModerationAction, createdAt: z.iso.datetime() })
  .meta({ id: 'ModerationDecision' })
export type ModerationDecision = z.infer<typeof ModerationDecision>

/** Les paramètres de l'historique : sans curseur, la première page ; `member` filtre sur un membre. */
export const DecisionHistoryQuery = z.object({
  cursor: FeedCursor.optional(),
  member: MemberId.optional(),
})
export type DecisionHistoryQuery = z.infer<typeof DecisionHistoryQuery>

/** Un membre nommé dans l'historique : l'administrateur qui décide, ou le membre visé. */
const HistoryMember = z
  .object({ id: z.string(), name: z.string(), handle: z.string().nullable() })
  .strict()

/**
 * Une décision dans l'historique (GET /v1/moderation/decisions, tranche 7c), lu par les seuls
 * administrateurs. Jamais qui a signalé.
 */
export const DecisionHistoryItem = z
  .object({
    id: z.uuid(),
    action: ModerationAction,
    at: z.iso.datetime(),
    /** L'administrateur qui a décidé ; null si son compte a été supprimé. */
    admin: HistoryMember.nullable(),
    /** La cible : un contenu, ou le membre pour un profil, une suspension ou une levée. */
    target: ReportTarget,
    /** Le projet de la cible, pour le lien ; null pour un membre, ou un contenu supprimé depuis. */
    projectId: ProjectId.nullable(),
    /** Le membre visé (l'auteur du contenu, ou le membre lui-même) ; null si son compte est parti. */
    member: HistoryMember.nullable(),
    /** Le fondement d'un retrait ou d'une suspension ; null sinon. */
    ground: RemovalGround.nullable(),
    /** L'explication d'un retrait, d'une suspension ou d'une levée ; null sinon. */
    explanation: z.string().nullable(),
    /** La durée d'une suspension ; null sinon. */
    duration: SuspensionDuration.nullable(),
    /** La raison d'une levée (plus tôt, ou erreur) ; null sinon. */
    liftCause: LiftCause.nullable(),
    /** Vrai pour une suspension partie d'un signalement ; faux sinon (et pour toute autre action). */
    afterReport: z.boolean(),
  })
  .strict()
  .meta({ id: 'DecisionHistoryItem' })
export type DecisionHistoryItem = z.infer<typeof DecisionHistoryItem>

/** L'historique, de la décision la plus récente à la plus ancienne. */
export const DecisionHistoryPage = z
  .object({
    items: z.array(DecisionHistoryItem).max(MODERATION_PAGE_SIZE),
    nextCursor: FeedCursor.nullable(),
  })
  .meta({ id: 'DecisionHistoryPage' })
export type DecisionHistoryPage = z.infer<typeof DecisionHistoryPage>

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
