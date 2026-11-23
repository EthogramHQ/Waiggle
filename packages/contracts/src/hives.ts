// Les ruches (R10) : des groupes de proches, comme « Ma ruche Famille ». On y entre par une
// invitation ; ses membres se voient entre eux et partagent des projets réservés à la ruche. Ce
// fichier donne les limites, les formes que l'API renvoie (mes ruches, la page d'une ruche, son
// actualité, ses membres, la recherche de la feuille « Inviter ») et ce qu'elle accepte.
//
// Les routes (toutes réservées aux membres connectés et vérifiés) :
// - GET /v1/hives : mes ruches et mes invitations (`MyHives`) ;
// - POST /v1/hives : créer une ruche (`HiveCreate` → 201 `HiveSummary`) ;
// - GET /v1/hives/{id} : la page (`HivePage`), qui pose la date de visite (`seen_at`) ;
// - PATCH /v1/hives/{id} : l'animateur change le nom, l'icône, qui invite, l'épingle (`HivePatch`) ;
// - DELETE /v1/hives/{id} : l'animateur supprime la ruche (204) ;
// - GET /v1/hives/{id}/activity et /projects : l'actualité et les projets réservés, par pages ;
// - GET /v1/hives/{id}/members : les membres (`HiveMembers`) ;
// - DELETE /v1/hives/{id}/members/{userId} : retirer un membre (animateur), ou quitter (soi-même) ;
// - POST /v1/hives/{id}/animator : confier l'animation (`HiveAnimator`, 204) ;
// - GET /v1/hives/{id}/invitable?q= : la recherche de la feuille « Inviter » (`InvitableMembers`) ;
// - POST /v1/hives/{id}/invitations : inviter (`HiveInvite`, 201) ;
// - POST /v1/hive-invitations/{id}/accept : rejoindre (200 `HiveSummary`) ;
// - DELETE /v1/hive-invitations/{id} : refuser, sans prévenir personne (204).
//
// Une ruche qu'on n'a pas le droit de voir répond toujours le même 404 : celui d'une ruche qui
// n'existe pas, pour un inconnu, un invité ou un ancien membre (le scénario : « sans dire si la ruche
// existe »).
import { z } from 'zod'
import { HiveChallenge } from './game'
import { MemberId } from './members'
import { ProjectSummary } from './projects'
import { ShortLabel } from './text'

/**
 * Les limites (choix 1 du scénario) : 50 membres par ruche, invitations en attente comprises ; 10
 * ruches créées et 20 ruches par membre ; 20 invitations envoyées par jour ; une invitation vaut 30
 * jours ; un nom de 40 caractères. `noticeDays` : une ligne d'Activité gardée (retrait, animation,
 * suppression) s'efface au bout de 90 jours, comme les autres notifications.
 */
export const HIVE_LIMITS = {
  members: 50,
  created: 10,
  joined: 20,
  invitationsPerDay: 20,
  invitationDays: 30,
  noticeDays: 90,
} as const
export const HIVE_NAME_MAX = 40
/** L'actualité remonte 30 jours, par pages de 20 ; les projets réservés aussi par 20. */
export const HIVE_ACTIVITY_DAYS = 30
export const HIVE_PAGE_SIZE = 20
/** Au plus quatre photos dans la pile d'une ligne, six projets sous « … cherche des testeurs ». */
export const HIVE_FACES_MAX = 4
export const HIVE_TESTERS_MAX = 6
/** La recherche de la feuille « Inviter » : 2 caractères au moins, 20 résultats au plus. */
export const INVITABLE_QUERY_MIN = 2
export const INVITABLE_QUERY_MAX = 50
export const INVITABLE_MAX = 20
/**
 * Sous 3 caractères, la recherche « Inviter » ne propose que les membres que l'on suit et ceux de
 * ses ruches ; dès 3, tout le réseau (relecture du plan, sécurité A3 et juridique B1).
 */
export const INVITABLE_NETWORK_FROM = 3

/** L'identifiant d'une ruche, ou d'une invitation : un uuid tiré au hasard par le serveur. */
export const HiveId = z.uuid()
export const HiveInvitationId = z.uuid()

/**
 * Les douze icônes qu'on pose dans l'alvéole (décision du 28/10, option 4 des planches), dans
 * l'ordre de la grille. Ce sont des noms d'icônes Phosphor ; l'appli dit leur sens (« Maison »),
 * jamais ce code (relecture du plan, interface).
 */
export const HIVE_ICONS = [
  'house-line',
  'heart',
  'users-three',
  'baby',
  'coffee',
  'book-open',
  'game-controller',
  'music-notes',
  'rocket-launch',
  'leaf',
  'camera',
  'code',
] as const
export const HiveIcon = z.enum(HIVE_ICONS)
export type HiveIcon = z.infer<typeof HiveIcon>

/**
 * Le nom d'une ruche : 1 à 40 caractères sur une ligne, sans caractère invisible ni de ceux qui
 * retournent le texte (U+202E) : c'est le seul texte qu'un membre peut écrire à quelqu'un qui ne le
 * connaît pas encore, sur une invitation (choix 8 du scénario). Les règles viennent de text.ts.
 */
export const HiveName = ShortLabel(HIVE_NAME_MAX)

/** Qui peut inviter : tous les membres (par défaut), ou seulement l'animateur. */
export const HiveInvitePolicy = z.enum(['members', 'animator'])
export type HiveInvitePolicy = z.infer<typeof HiveInvitePolicy>

/** Le rôle d'un membre dans une ruche : un seul animateur, les autres membres. */
export const HiveRole = z.enum(['animator', 'member'])
export type HiveRole = z.infer<typeof HiveRole>

/**
 * Le visage d'un membre dans une ruche : son identifiant (pour mener à sa page), son nom et sa
 * photo (null : pas de photo, ou une forme réduite, voir `HiveMember.reduced`).
 */
export const MemberFace = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.url().nullable(),
})
export type MemberFace = z.infer<typeof MemberFace>

/**
 * Une ruche dans une liste (l'onglet Ruches, « Tes ruches » du Fil). `name` vaut null quand la
 * modération l'a retiré : l'appli écrit alors « Ruche sans nom ». `animator` : null s'il n'y en a
 * plus (compte supprimé, le temps que l'animation passe), ou si un blocage le sépare du lecteur,
 * dans un sens ou dans l'autre (« animée par » ne le nomme pas). `faces` : quelques membres pour la
 * pile, jamais un membre bloqué dans un sens ou dans l'autre. `news` : les projets publiés et les
 * mises à jour dans la ruche depuis la dernière visite de sa page (`seen_at`). Les ruches vont de la
 * plus récemment active à la plus calme.
 */
export const HiveSummary = z
  .object({
    id: HiveId,
    name: z.string().nullable(),
    icon: HiveIcon,
    memberCount: z.int().positive().max(HIVE_LIMITS.members),
    animator: z.object({ id: z.string(), name: z.string() }).nullable(),
    faces: z.array(MemberFace).max(HIVE_FACES_MAX),
    news: z.int().nonnegative(),
    role: HiveRole,
  })
  .meta({ id: 'HiveSummary' })
export type HiveSummary = z.infer<typeof HiveSummary>

/**
 * Une invitation reçue, telle que l'invité la voit avant d'accepter : le nom, l'icône, l'animateur
 * et le nombre de membres de la ruche, jamais son actualité ni ses membres. `inviter` : null si son
 * compte a été supprimé depuis (l'invitation reste valable). Une invitation refusée n'est plus
 * jamais rendue à l'invité.
 */
export const HiveInvitation = z
  .object({
    id: HiveInvitationId,
    hive: z.object({
      id: HiveId,
      name: z.string().nullable(),
      icon: HiveIcon,
      memberCount: z.int().positive().max(HIVE_LIMITS.members),
      animatorName: z.string().nullable(),
    }),
    inviter: MemberFace.nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'HiveInvitation' })
export type HiveInvitation = z.infer<typeof HiveInvitation>

/**
 * GET /v1/hives : ses ruches et ses invitations valables (moins de 30 jours, ni refusées ni
 * acceptées), des plus récentes aux plus anciennes. `createdCount` : les ruches qu'il a créées et
 * qui existent encore (« Créer une ruche » se grise à 10 ; à 20 ruches, aussi).
 */
export const MyHives = z
  .object({
    hives: z.array(HiveSummary).max(HIVE_LIMITS.joined),
    invitations: z.array(HiveInvitation),
    createdCount: z.int().nonnegative(),
  })
  .meta({ id: 'MyHives' })
export type MyHives = z.infer<typeof MyHives>

/**
 * Peut-il inviter maintenant : oui ; non, la ruche est pleine (50 membres, invitations en attente
 * comprises) ; non, l'animateur s'est réservé ce droit. (Un membre suspendu n'invite pas : l'appli
 * le sait par `Me.suspension`, et l'API refuse de toute façon.)
 */
export const HiveInviteState = z.enum(['allowed', 'full', 'animatorOnly'])
export type HiveInviteState = z.infer<typeof HiveInviteState>

/**
 * La page d'une ruche (GET /v1/hives/{id}), pour ses membres seulement. `pinned` : le projet épinglé
 * par l'animateur, seulement s'il est encore visible de toute la ruche (réservé à elle, ou
 * « Membres » d'un de ses membres) et du lecteur ; `pinnedBy` null si ce membre a supprimé son
 * compte. `seekingTesters` : les projets visibles de la ruche dont l'auteur en est membre et qui
 * cherchent des testeurs. `pendingInvitations` : les invitations en attente, refusées comprises
 * jusqu'à leurs 30 jours (elles comptent dans les 50 places). `successor` : qui animera la ruche si
 * le lecteur, animateur, la quitte (le plus ancien membre) ; null s'il n'est pas animateur, ou s'il
 * est seul (quitter supprime alors la ruche).
 */
export const HivePage = z
  .object({
    summary: HiveSummary,
    invite: HiveInviteState,
    invitePolicy: HiveInvitePolicy,
    pendingInvitations: z.int().nonnegative().max(HIVE_LIMITS.members),
    pinned: ProjectSummary.extend({
      pinnedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
    }).nullable(),
    seekingTesters: z.array(ProjectSummary).max(HIVE_TESTERS_MAX),
    projectCount: z.int().nonnegative(),
    successor: z.object({ name: z.string() }).nullable(),
    /**
     * R19 : le défi de la semaine de la ruche (game.ts), son avancée sans dire qui a fait quoi ;
     * null pour une ruche de moins de 3 membres. La page n'est lue que par ses membres.
     */
    challenge: HiveChallenge.nullable(),
  })
  .meta({ id: 'HivePage' })
export type HivePage = z.infer<typeof HivePage>

/** Le marque-page des listes d'une ruche : opaque pour l'appli, comme celui du Fil. */
export const HiveCursor = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
export const HivePageQuery = z.object({ cursor: HiveCursor.optional() })
export type HivePageQuery = z.infer<typeof HivePageQuery>

/**
 * Une ligne de l'actualité : un membre a publié un projet, l'a mis à jour (`version` : « v2 », ou
 * null), ou l'animateur l'a épinglé. Seulement des projets que le lecteur peut voir : réservés à
 * cette ruche, ou « Membres » d'un de ses membres ; jamais un projet réservé à une autre ruche,
 * privé, retiré, ou d'un membre bloqué. `reserved` : le projet est réservé à cette ruche (la
 * pastille « Réservé à Famille »).
 */
export const HiveActivityItem = z
  .object({
    kind: z.enum(['published', 'updated', 'pinned']),
    actor: MemberFace,
    project: ProjectSummary,
    version: z.string().nullable(),
    at: z.iso.datetime(),
    reserved: z.boolean(),
  })
  .meta({ id: 'HiveActivityItem' })
export type HiveActivityItem = z.infer<typeof HiveActivityItem>

/** GET /v1/hives/{id}/activity : 30 jours, du plus récent au plus ancien, par pages de 20. */
export const HiveActivityPage = z
  .object({
    items: z.array(HiveActivityItem).max(HIVE_PAGE_SIZE),
    nextCursor: HiveCursor.nullable(),
  })
  .meta({ id: 'HiveActivityPage' })
export type HiveActivityPage = z.infer<typeof HiveActivityPage>

/** GET /v1/hives/{id}/projects : les projets réservés à la ruche, du plus récent au plus ancien. */
export const HiveProjectsPage = z
  .object({
    items: z.array(ProjectSummary).max(HIVE_PAGE_SIZE),
    nextCursor: HiveCursor.nullable(),
  })
  .meta({ id: 'HiveProjectsPage' })
export type HiveProjectsPage = z.infer<typeof HiveProjectsPage>

/**
 * Un membre de la ruche, dans l'onglet Membres. `isMe` : « toi ». `reduced` : vrai seulement chez
 * l'animateur, pour un membre qui l'a bloqué : son nom seul, sans photo (`face.avatarUrl` null), ni
 * pseudo (`handle` null), ni lien vers sa page, avec « Retirer de la ruche » (choix de Louis du
 * 14/11/2026, Q3). Un membre bloqué dans un sens ou dans l'autre n'est sinon jamais listé.
 */
export const HiveMember = z
  .object({
    face: MemberFace,
    handle: z.string().nullable(),
    role: HiveRole,
    isMe: z.boolean(),
    reduced: z.boolean(),
  })
  .meta({ id: 'HiveMember' })
export type HiveMember = z.infer<typeof HiveMember>

/** GET /v1/hives/{id}/members : l'animateur d'abord, puis les membres par date d'entrée. */
export const HiveMembers = z
  .object({ members: z.array(HiveMember).max(HIVE_LIMITS.members) })
  .meta({ id: 'HiveMembers' })
export type HiveMembers = z.infer<typeof HiveMembers>

/**
 * La recherche de la feuille « Inviter » (GET /v1/hives/{id}/invitable?q=) : par nom ou pseudo,
 * sans tenir compte des accents ; 2 caractères au moins.
 */
export const InvitableQuery = z.object({
  q: z.string().trim().min(INVITABLE_QUERY_MIN).max(INVITABLE_QUERY_MAX),
})
export type InvitableQuery = z.infer<typeof InvitableQuery>

/**
 * Un résultat de la recherche « Inviter » : `member` (« Déjà membre »), `invited` (« Invitation
 * envoyée », une invitation refusée comprise jusqu'à ses 30 jours), `none` (« Inviter »). Jamais un
 * membre bloqué dans un sens ou dans l'autre, ni le lecteur lui-même.
 */
export const InvitableMember = z
  .object({
    face: MemberFace,
    handle: z.string(),
    state: z.enum(['member', 'invited', 'none']),
  })
  .meta({ id: 'InvitableMember' })
export type InvitableMember = z.infer<typeof InvitableMember>

export const InvitableMembers = z
  .object({ members: z.array(InvitableMember).max(INVITABLE_MAX) })
  .meta({ id: 'InvitableMembers' })
export type InvitableMembers = z.infer<typeof InvitableMembers>

// --- Ce que l'API accepte ---

/** POST /v1/hives : un nom et une icône. strictObject refuse tout autre champ. */
export const HiveCreate = z
  .strictObject({ name: HiveName, icon: HiveIcon })
  .meta({ id: 'HiveCreate' })
export type HiveCreate = z.infer<typeof HiveCreate>

/**
 * PATCH /v1/hives/{id} (l'animateur seul) : n'importe quelle partie. `pinnedProjectId` : le projet à
 * épingler (il remplace le précédent), ou null pour retirer l'épingle ; un projet que la ruche ne
 * peut pas voir répond 422, le même pour un projet inconnu, privé ou réservé à une autre ruche.
 * Un nouveau nom efface la marque d'un nom retiré par la modération.
 */
export const HivePatch = z
  .strictObject({
    name: HiveName,
    icon: HiveIcon,
    invitePolicy: HiveInvitePolicy,
    pinnedProjectId: z.uuid().nullable(),
  })
  .partial()
  .meta({ id: 'HivePatch' })
export type HivePatch = z.infer<typeof HivePatch>

/** POST /v1/hives/{id}/invitations : le membre invité. */
export const HiveInvite = z.strictObject({ userId: MemberId }).meta({ id: 'HiveInvite' })
export type HiveInvite = z.infer<typeof HiveInvite>

/** POST /v1/hives/{id}/animator : le membre à qui l'animateur confie l'animation. */
export const HiveAnimator = z.strictObject({ userId: MemberId }).meta({ id: 'HiveAnimator' })
export type HiveAnimator = z.infer<typeof HiveAnimator>

// --- L'export des données (RGPD) ---

/**
 * Ce que l'export dit des ruches : celles dont il est membre (nom, rôle, entrée, dernière visite),
 * les invitations qu'il a reçues (refusées comprises jusqu'à leur effacement) et celles qu'il a
 * envoyées, sans le nom de l'invité au-delà de son pseudo actuel.
 */
export const HiveExport = z.object({
  hives: z.array(
    z.object({
      id: HiveId,
      name: z.string().nullable(),
      role: HiveRole,
      joinedAt: z.iso.datetime(),
      seenAt: z.iso.datetime().nullable(),
    }),
  ),
  invitationsReceived: z.array(
    z.object({
      hiveId: HiveId,
      hiveName: z.string().nullable(),
      at: z.iso.datetime(),
      refusedAt: z.iso.datetime().nullable(),
    }),
  ),
  invitationsSent: z.array(
    z.object({
      hiveId: HiveId,
      inviteeHandle: z.string().nullable(),
      at: z.iso.datetime(),
    }),
  ),
})
export type HiveExport = z.infer<typeof HiveExport>
