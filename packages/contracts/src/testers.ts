// Le coin des testeurs d'un projet (R7b) : un espace privé tenu par l'auteur, à l'adresse
// /projects/<id>/testers. On y trouve les appels à tester (de l'auteur à tous ses testeurs), et un
// fil de retours privé entre chaque testeur et l'auteur, relié aux mises à jour par « Réglé dans la
// v1.3 ». Seuls l'auteur et ses testeurs y entrent ; un ancien testeur garde son fil en lecture
// seule (décision de Louis du 11/11/2026). Fichier sans autre import que les petites briques
// (textes, photos, retraits, mises à jour) : les notifications, les signalements et l'export le
// lisent, et le faire dépendre d'eux ferait une boucle d'imports.
import { z } from 'zod'
import { Removal } from './removal'
import { VisibleFreeText } from './text'
import { UpdateId } from './updates'
import { Thumbhash, VisualDescription } from './visuals'

/** Le texte d'un appel à tester : 500 caractères au plus. */
export const CALL_TEXT_MAX = 500
/** Le texte d'un retour ou d'une réponse : 1 000 caractères au plus. */
export const MESSAGE_TEXT_MAX = 1000
/** Au plus 5 appels par jour et par projet, comptés seulement pour l'auteur (sécurité B1). */
export const CALLS_PER_DAY_PER_PROJECT = 5
/**
 * Au plus 20 demandes d'appel par membre et par 24 heures, comptées avant tout examen : un autre
 * membre n'épuise jamais les 5 appels du projet (relecture de sécurité B1).
 */
export const TESTER_CALLS_PER_DAY = 20
/** Au plus 30 messages (retours et réponses) par membre et par 24 heures, tous projets confondus. */
export const TESTER_MESSAGES_PER_DAY = 30
/** « Marquer comme réglé » et « Remettre à traiter » : 120 par membre et par heure (sécurité A8). */
export const TESTER_SETTLES_PER_HOUR = 120
/** L'onglet « Appels » se lit 20 appels par 20. */
export const CALLS_PAGE_SIZE = 20
/** La liste des fils de l'auteur se lit 20 fils par 20. */
export const THREADS_PAGE_SIZE = 20
/** Un fil se lit 30 messages par 30, du plus récent au plus ancien. */
export const MESSAGES_PAGE_SIZE = 30
/** Une mise à jour règle 20 retours au plus. */
export const SETTLED_PER_UPDATE_MAX = 20
/** La partie « Retours réglés » de la feuille de mise à jour propose 50 retours au plus. */
export const OPEN_FEEDBACK_MAX = 50
/**
 * Au plus 2 images en attente par membre et par projet : une troisième remplace la plus ancienne.
 * Une image envoyée mais pas encore rattachée à un appel ou à un message est « en attente » ; la
 * purge de nuit l'efface après 24 heures.
 */
export const TESTER_MEDIA_PENDING_MAX = 2
/** Au plus 100 captures par fil, en attente comprises : au-delà, 409 `tester_media_full`. */
export const CAPTURES_PER_THREAD_MAX = 100
/** Au plus 100 photos d'appel par projet, en attente comprises : au-delà, 409 `tester_media_full`. */
export const CALL_PHOTOS_PER_PROJECT_MAX = 100
/** L'extrait d'un message dans la liste des fils ou dans une notification : 80 caractères au plus. */
export const TESTER_EXCERPT_MAX = 80

/**
 * Le marque-page d'une liste du coin (appels, fils, messages) : la même forme que celui du fil,
 * recopiée ici pour ne pas lire feed.ts (qui lit projects.ts, qui lit updates.ts).
 */
export const TesterCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/** « Ça a marché ? » : Oui, En partie ou Non. Des codes stables ; les noms sont dans les traductions. */
export const FeedbackOutcome = z.enum(['yes', 'partly', 'no'])
export type FeedbackOutcome = z.infer<typeof FeedbackOutcome>

/** « Sur quoi ? » : l'appareil du test, facultatif. */
export const FeedbackDevice = z.enum(['phone', 'computer', 'tablet'])
export type FeedbackDevice = z.infer<typeof FeedbackDevice>

/** Un message du fil : un retour (avec son issue), ou une réponse (du texte seul). */
export const TesterMessageKind = z.enum(['feedback', 'reply'])
export type TesterMessageKind = z.infer<typeof TesterMessageKind>

/** Qui a écrit, dans un fil : l'auteur du projet, ou le testeur. */
export const TesterRole = z.enum(['author', 'tester'])
export type TesterRole = z.infer<typeof TesterRole>

/** Ce qu'on envoie à POST …/testers/media : une photo d'appel (auteur) ou une capture (testeur). */
export const TesterMediaKind = z.enum(['call', 'capture'])
export type TesterMediaKind = z.infer<typeof TesterMediaKind>

/**
 * Qui regarde le coin (GET /v1/projects/{id}/testers) : l'auteur ; un testeur actuel ; ou un ancien
 * testeur (parti, retiré par l'auteur, ou séparé de lui par un blocage), qui ne voit plus que son
 * fil, en lecture seule (décision de Louis du 11/11/2026). Tout autre membre reçoit 404.
 */
export const TesterCornerRole = z.enum(['author', 'tester', 'former_tester'])
export type TesterCornerRole = z.infer<typeof TesterCornerRole>

/** Un testeur dans la liste de l'auteur : photo, nom, pseudo et date d'inscription. */
export const TesterListItem = z.object({
  id: z.string(),
  name: z.string(),
  /** Null s'il n'a pas de pseudo. */
  handle: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  /** La date d'inscription (« depuis le 3 nov. »). */
  since: z.iso.datetime(),
})
export type TesterListItem = z.infer<typeof TesterListItem>

/**
 * Le coin, tel que GET /v1/projects/{id}/testers le renvoie. `closed` : projet retiré, privé ou
 * auteur suspendu ; seul l'auteur entre alors, en lecture seule (un testeur reçoit 404).
 * `testerCount` : « 12 testeurs », pour l'auteur et ses testeurs (R7b lève la règle R7a T3) ; null
 * pour un ancien testeur. `testers` : la liste, du plus récent inscrit au plus ancien, pour
 * l'auteur seul ; null pour les autres (les testeurs ne se voient pas entre eux).
 */
export const TesterCorner = z
  .object({
    role: TesterCornerRole,
    closed: z.boolean(),
    testerCount: z.int().nonnegative().nullable(),
    testers: z.array(TesterListItem).nullable(),
  })
  .meta({ id: 'TesterCorner' })
export type TesterCorner = z.infer<typeof TesterCorner>

/**
 * Une image du coin : la photo d'un appel ou la capture d'un retour, ré-encodée sans métadonnées.
 * Son adresse ne s'ouvre que pour ceux qui voient l'appel ou le message (et, pendant un signalement
 * ouvert, pour la modération), jamais depuis un cache partagé (`private, no-store`).
 * `description` : celle de la photo d'un appel, écrite par l'auteur ; toujours null pour une
 * capture, que l'appli nomme par une phrase fixe.
 */
export const TesterMedia = z
  .object({
    id: z.uuid(),
    url: z.url(),
    width: z.int().positive(),
    height: z.int().positive(),
    thumbhash: Thumbhash.nullable(),
    description: z.string().nullable(),
  })
  .meta({ id: 'TesterMedia' })
export type TesterMedia = z.infer<typeof TesterMedia>

/**
 * Ce que POST /v1/projects/{id}/calls accepte. La photo est envoyée avant (POST …/testers/media
 * avec `kind=call`) et citée ici ; sa description n'a de sens qu'avec elle. `VisibleFreeText`
 * refuse un texte vide ou fait seulement de caractères invisibles (sécurité A13).
 */
export const NewTesterCall = z
  .strictObject({
    text: VisibleFreeText(CALL_TEXT_MAX),
    photoId: z.uuid().nullable(),
    photoDescription: VisualDescription,
  })
  .refine((call) => call.photoId !== null || call.photoDescription === null, {
    message: 'a description needs a photo',
    path: ['photoDescription'],
  })
  .meta({ id: 'NewTesterCall' })
export type NewTesterCall = z.infer<typeof NewTesterCall>

/**
 * Un appel à tester. Un appel retiré par la modération ne paraît plus que pour l'auteur, avec
 * `removal` ; null pour les testeurs.
 */
export const TesterCall = z
  .object({
    id: z.uuid(),
    text: z.string(),
    photo: TesterMedia.nullable(),
    createdAt: z.iso.datetime(),
    removal: Removal.nullable(),
  })
  .meta({ id: 'TesterCall' })
export type TesterCall = z.infer<typeof TesterCall>

/** Une page d'appels, du plus récent au plus ancien ; `nextCursor` vaut null tout au bout. */
export const TesterCallPage = z
  .object({
    items: z.array(TesterCall).max(CALLS_PAGE_SIZE),
    nextCursor: TesterCursor.nullable(),
  })
  .meta({ id: 'TesterCallPage' })
export type TesterCallPage = z.infer<typeof TesterCallPage>

/**
 * Ce que POST /v1/projects/{id}/threads/{testerId}/messages accepte. Un retour (du testeur seul) :
 * l'issue est obligatoire, l'appareil, le texte et la capture facultatifs. Une réponse (de l'un ou
 * de l'autre) : du texte seul. La capture est envoyée avant (POST …/testers/media, `kind=capture`).
 */
export const NewTesterMessage = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('feedback'),
      outcome: FeedbackOutcome,
      device: FeedbackDevice.nullable(),
      text: VisibleFreeText(MESSAGE_TEXT_MAX).nullable(),
      captureId: z.uuid().nullable(),
    }),
    z.strictObject({ kind: z.literal('reply'), text: VisibleFreeText(MESSAGE_TEXT_MAX) }),
  ])
  .meta({ id: 'NewTesterMessage' })
export type NewTesterMessage = z.infer<typeof NewTesterMessage>

/**
 * La mise à jour qui a réglé un retour (« Réglé dans la v1.3 »). Null quand le retour a été réglé à
 * la main, et, pour un autre que l'auteur, quand cette mise à jour a été retirée (sécurité A10).
 */
export const SettledUpdate = z.object({
  id: UpdateId,
  version: z.string().nullable(),
  createdAt: z.iso.datetime(),
})
export type SettledUpdate = z.infer<typeof SettledUpdate>

/**
 * Un message d'un fil. `sender` : qui l'a écrit, l'auteur ou le testeur (la couleur de la bulle
 * suit ce rôle). `outcome` et `device` : pour un retour seulement. `settled` : un retour réglé ;
 * null sinon. Un message retiré par la modération ne paraît plus que pour son expéditeur, avec
 * `removal`. `mine` : vrai si le lecteur l'a écrit (« Supprimer » au lieu de « Signaler »). Jamais
 * d'accusé de lecture (relecture juridique J11).
 */
export const TesterMessage = z
  .object({
    id: z.uuid(),
    kind: TesterMessageKind,
    sender: TesterRole,
    outcome: FeedbackOutcome.nullable(),
    device: FeedbackDevice.nullable(),
    text: z.string().nullable(),
    capture: TesterMedia.nullable(),
    createdAt: z.iso.datetime(),
    settled: z.object({ at: z.iso.datetime(), update: SettledUpdate.nullable() }).nullable(),
    removal: Removal.nullable(),
    mine: z.boolean(),
  })
  .meta({ id: 'TesterMessage' })
export type TesterMessage = z.infer<typeof TesterMessage>

/** Une page d'un fil, du plus récent au plus ancien (l'appli l'affiche dans l'autre sens). */
export const TesterMessagePage = z
  .object({
    items: z.array(TesterMessage).max(MESSAGES_PAGE_SIZE),
    nextCursor: TesterCursor.nullable(),
  })
  .meta({ id: 'TesterMessagePage' })
export type TesterMessagePage = z.infer<typeof TesterMessagePage>

/**
 * L'état d'un fil pour l'auteur (décision de Louis 3) : « À traiter » (`open`) s'il a au moins un
 * retour non réglé, « Réglés » (`settled`) sinon. Un fil est toujours dans un seul des deux.
 */
export const TesterThreadState = z.enum(['open', 'settled'])
export type TesterThreadState = z.infer<typeof TesterThreadState>

/**
 * Un fil dans la liste de l'auteur. `tester.current` : faux pour un ancien testeur (« Ne teste
 * plus »). `handle` et `avatarUrl` : null s'il n'en a pas, ou si un blocage les sépare (règle de
 * 7b : le nom reste, la photo et le pseudo partent ; sécurité A11). `since` : la date d'inscription
 * d'un testeur actuel, null pour un ancien. `lastFrom` : qui a écrit le dernier message (« Toi : »).
 * `unread` : un message du testeur arrivé après la dernière lecture de l'auteur. L'extrait, `unread`
 * et `state` ignorent les messages retirés que l'auteur n'a pas écrits (sécurité A9).
 */
export const TesterThreadSummary = z
  .object({
    tester: z.object({
      id: z.string(),
      name: z.string(),
      handle: z.string().nullable(),
      avatarUrl: z.url().nullable(),
      current: z.boolean(),
      since: z.iso.datetime().nullable(),
    }),
    lastAt: z.iso.datetime(),
    lastFrom: TesterRole,
    unread: z.boolean(),
    state: TesterThreadState,
    /** Le début du dernier message ; null pour un retour sans texte. */
    excerpt: z
      .string()
      .max(TESTER_EXCERPT_MAX + 1)
      .nullable(),
  })
  .meta({ id: 'TesterThreadSummary' })
export type TesterThreadSummary = z.infer<typeof TesterThreadSummary>

/**
 * Une page de la liste des fils, le plus récent en tête, avec le nombre de fils de chaque filtre
 * (« À traiter 5 » · « Réglés 3 »).
 */
export const TesterThreadPage = z
  .object({
    items: z.array(TesterThreadSummary).max(THREADS_PAGE_SIZE),
    nextCursor: TesterCursor.nullable(),
    counts: z.object({ open: z.int().nonnegative(), settled: z.int().nonnegative() }),
  })
  .meta({ id: 'TesterThreadPage' })
export type TesterThreadPage = z.infer<typeof TesterThreadPage>

/** Les paramètres d'adresse d'une liste du coin (appels, messages) : sans curseur, la première page. */
export const TesterPageQuery = z.object({ cursor: TesterCursor.optional() })
export type TesterPageQuery = z.infer<typeof TesterPageQuery>

/** Les paramètres d'adresse de GET …/threads : le filtre (« À traiter » par défaut) et la page. */
export const TesterThreadsQuery = z.object({
  state: TesterThreadState.default('open'),
  cursor: TesterCursor.optional(),
})
export type TesterThreadsQuery = z.infer<typeof TesterThreadsQuery>

/**
 * Un retour encore à traiter, proposé dans la partie « Retours réglés » de la feuille de mise à
 * jour (GET /v1/projects/{id}/feedback/open). `tester.current` : faux pour un ancien testeur, qui
 * ne lira rien et ne sera pas prévenu (« Ne teste plus », relecture juridique J9).
 */
export const OpenFeedback = z
  .object({
    id: z.uuid(),
    tester: z.object({ name: z.string(), current: z.boolean() }),
    outcome: FeedbackOutcome,
    excerpt: z
      .string()
      .max(TESTER_EXCERPT_MAX + 1)
      .nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'OpenFeedback' })
export type OpenFeedback = z.infer<typeof OpenFeedback>

/** La liste des retours à traiter, le plus récent en tête. */
export const OpenFeedbackList = z
  .array(OpenFeedback)
  .max(OPEN_FEEDBACK_MAX)
  .meta({ id: 'OpenFeedbackList' })
export type OpenFeedbackList = z.infer<typeof OpenFeedbackList>

/**
 * Dans l'export de l'auteur : un appel qu'il a lancé. `title` vaut null quand le projet n'est plus
 * visible (comme `testerOf`) ; `photoUrl` est l'adresse de la photo, pas le fichier.
 */
export const TesterCallExport = z.object({
  projectId: z.uuid(),
  title: z.string().nullable(),
  id: z.uuid(),
  text: z.string(),
  photoUrl: z.url().nullable(),
  photoDescription: z.string().nullable(),
  createdAt: z.iso.datetime(),
  removal: Removal.nullable(),
})
export type TesterCallExport = z.infer<typeof TesterCallExport>

/**
 * Dans l'export : un message qu'il a écrit, retour ou réponse (jamais ceux de l'autre). `role` : il
 * l'a écrit comme auteur du projet ou comme testeur. `captureUrl` est l'adresse, pas le fichier.
 */
export const TesterMessageExport = z.object({
  projectId: z.uuid(),
  title: z.string().nullable(),
  id: z.uuid(),
  role: TesterRole,
  kind: TesterMessageKind,
  outcome: FeedbackOutcome.nullable(),
  device: FeedbackDevice.nullable(),
  text: z.string().nullable(),
  captureUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
  settledAt: z.iso.datetime().nullable(),
  removal: Removal.nullable(),
})
export type TesterMessageExport = z.infer<typeof TesterMessageExport>

/**
 * Dans l'export de l'auteur : un membre qu'il a retiré de ses testeurs, par son pseudo (null s'il
 * n'en a pas), comme les blocages (relecture juridique J11).
 */
export const TesterRemovalExport = z.object({
  projectId: z.uuid(),
  title: z.string().nullable(),
  handle: z.string().nullable(),
  at: z.iso.datetime(),
})
export type TesterRemovalExport = z.infer<typeof TesterRemovalExport>

/**
 * Dans l'export : jusqu'où il a lu chacun de ses fils, comme auteur ou comme testeur (la seule
 * trace gardée de ses lectures, comme `feed.readAt`).
 */
export const TesterThreadReadExport = z.object({
  projectId: z.uuid(),
  testerId: z.string(),
  role: TesterRole,
  readAt: z.iso.datetime(),
})
export type TesterThreadReadExport = z.infer<typeof TesterThreadReadExport>
