// Les aides d'émission du temps réel (R21) : une route qui vient d'écrire dit ce qui a changé, et
// ces aides choisissent qui le reçoit, puis le remettent au bus (live/hub.ts). Le choix des
// destinataires est la règle B1 de la relecture de sécurité du plan : un signal sans contenu
// trahirait quand même « il s'est passé quelque chose » à qui ne pourrait pas le lire. Il ne part
// donc qu'aux connexions qui écoutent le sujet ET pour qui la relecture peut changer :
// - aucun blocage avec l'auteur du geste, dans un sens ni dans l'autre (sauf l'auteur du projet
//   sur la page de son projet : il lit les commentaires d'un membre bloqué chez lui, règle 1 des
//   blocages) ; ni avec l'auteur du projet (un membre bloqué avec lui ne voit pas le projet) ;
// - l'audience de l'objet : un projet réservé à une ruche, ses membres actuels (et son auteur) ; un
//   projet privé ou retiré, son auteur seul ; sinon tous les membres. Un commentaire écrit pour une
//   ruche (`readersHiveId`) ne se lit que dans cette ruche ;
// - `member:<id>` seulement pour un projet visible de tous les membres (`isMemberVisible`, pas
//   retiré) : la page d'un membre ne montre pas ses projets réservés ou privés ;
// - `feed` pour un projet visible de tous ; pour un projet réservé, `me` / `feed` aux seuls membres
//   de sa ruche ;
// - `me` / `notifications` aux membres que l'avis concerne, sous les mêmes conditions.
//
// Trois requêtes au plus par événement : le projet par sa clé primaire, les blocages de l'auteur du
// geste et de l'auteur du projet (`blockPartnersOf`, une requête), les membres de la ruche concernée
// (par la clé primaire de hive_member, hive_id en tête). Aucune quand personne n'écoute : le bus dit
// d'abord qui écoute (`hub.listeners`), et rien n'est lu pour un sujet sans écouteur, sauf le projet.
//
// **Quand émettre** : après la fin de `await db.transaction(...)`, jamais dedans (une écriture
// annulée ne doit pas être annoncée), et avant de répondre (le signal est dans le flux quand la
// réponse arrive : l'ordre des tests). Une panne de l'émission ne fait jamais échouer la route :
// l'écriture est faite, elle est notée dans les logs, et l'appli relira à sa prochaine connexion.
//
// L'interface, pour les routes (et les agents qui brancheront les suivantes) :
// - `projectChanged(live, { projectId | project, actorId, page?, member?, hive?, corner?, feed?,
//   notify?, readersHiveId? })` : un geste sur un projet. `page` : la sorte sur `project:<id>` ;
//   `member` : sur `member:<auteur>` ; `hive` : sur `hive:<ruche>` ; `corner` : sur `corner:<id>` ;
//   `feed` : le bouton des nouveautés ; `notify` : les membres dont l'Activité change. Passer
//   `project` (déjà lu, `projectScopeOf`) quand la ligne n'existe plus (projet supprimé) ou pour
//   éviter de la relire ;
// - `memberChanged(live, { memberId, actorId, page?, notify? })` : la page d'un membre (ses abonnés) ;
// - `notifyMembers(live, { actorId, recipients, kind? })` : le `me` de membres, hors de tout projet
//   (une invitation, un avis de jeu), sans blocage avec l'auteur du geste ;
// - `hiveChanged(live, { hiveId, actorId })` : la page d'une ruche (nom, membres, animateur…), pour
//   ses membres actuels ;
// - `toOwnDevices(live, userIds, kind)` : le `me` de membres, sans filtre, pour ce qui n'appartient
//   qu'à eux (le pollen, les deux personnes d'un fil de testeur, déjà vérifiées par la route) ;
// - `toAdmins(live, kind)` : `moderation` ou `scouts`, que seuls les administrateurs en fonction
//   écoutent (donnés d'office, retirés à la revérification).
import type { LiveKind } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { eq, inArray } from 'drizzle-orm'
import { blockPartnersOf } from '../blocks/visibility'
import { describeError } from '../log'
import { isMemberVisible } from '../projects/visibility'
import type { LiveHub } from './hub'

/** Ce qu'il faut à une aide : la base (pour le filtre) et le bus. */
export type Live = { db: Database; hub: LiveHub }

/** Ce qu'il faut savoir d'un projet pour dire qui le voit. */
export type ProjectScope = {
  id: string
  authorId: string
  visibility: string
  hiveId: string | null
  removedAt: Date | null
}

/**
 * Le projet tel qu'il est maintenant (après la transaction), par sa clé primaire. null : il n'existe
 * plus (supprimé entre-temps) ; l'aide n'émet alors rien.
 */
export const projectScopeOf = async (
  db: Pick<Database, 'select'>,
  projectId: string,
): Promise<ProjectScope | null> => {
  const [row] = await db
    .select({
      id: schema.project.id,
      authorId: schema.project.authorId,
      visibility: schema.project.visibility,
      hiveId: schema.project.hiveId,
      removedAt: schema.project.removedAt,
    })
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
  return row ?? null
}

/**
 * Qui voit un projet : tous les membres (visible de tous et pas retiré), les membres de sa ruche
 * (réservé, pas retiré), ou son auteur seul (privé ou retiré). La règle de `sharedWith`
 * (projects/visibility.ts), vue de l'émetteur, qui ne connaît pas encore le lecteur.
 */
type Audience = 'members' | 'hive' | 'author'
const audienceOf = (project: ProjectScope): Audience => {
  if (project.removedAt !== null) return 'author'
  if (isMemberVisible(project.visibility)) return 'members'
  if (project.visibility === 'hive' && project.hiveId !== null) return 'hive'
  return 'author'
}

/** Une émission ratée est notée sans données de membre, et la route répond quand même. */
export const safely = async (what: string, task: () => Promise<void>) => {
  try {
    await task()
  } catch (error) {
    console.error('Live signal failed', describeError(error, { method: 'LIVE', path: what }))
  }
}

/**
 * Les membres de ces ruches, aujourd'hui : « hive_id in (…) », par la clé primaire de hive_member
 * (hive_id, user_id), dont hive_id est la première colonne. Une ruche a peu de membres.
 */
export const hiveMembersOf = async (db: Pick<Database, 'select'>, hiveIds: readonly string[]) => {
  const members = new Map<string, Set<string>>(hiveIds.map((id) => [id, new Set<string>()]))
  if (hiveIds.length === 0) return members
  const rows = await db
    .select({ hiveId: schema.hiveMember.hiveId, userId: schema.hiveMember.userId })
    .from(schema.hiveMember)
    .where(inArray(schema.hiveMember.hiveId, [...hiveIds]))
  for (const row of rows) members.get(row.hiveId)?.add(row.userId)
  return members
}

/**
 * Les testeurs inscrits aujourd'hui sur un projet, quand quelqu'un écoute son coin (relecture de
 * sécurité de R21, point 2). Un sujet `corner:` déclaré juste avant d'être retiré du coin peut
 * survivre à la revérification (la déclaration lisait encore l'inscription) : seule cette relecture,
 * au moment du signal, garantit qu'il ne part qu'aux testeurs actuels.
 * En SQL : select member_id from project_tester where project_id = $1 (index
 * project_tester_project_idx).
 */
const currentTestersOf = async (db: Pick<Database, 'select'>, projectId: string) => {
  const rows = await db
    .select({ memberId: schema.projectTester.memberId })
    .from(schema.projectTester)
    .where(eq(schema.projectTester.projectId, projectId))
  return new Set(rows.map((row) => row.memberId))
}

export type ProjectSignals = {
  /** L'auteur du geste (qui commente, réagit, suit, publie). */
  actorId: string
  /** La sorte sur la page du projet, `project:<id>`. */
  page?: LiveKind
  /** La sorte sur la page de son auteur, `member:<auteur>` (projet visible de tous seulement). */
  member?: LiveKind
  /** La sorte sur la page de sa ruche, `hive:<ruche>` (projet réservé seulement). */
  hive?: LiveKind
  /** La sorte sur le coin de ses testeurs, `corner:<id>`. */
  corner?: LiveKind
  /** Le bouton des nouveautés : `feed` pour tous, ou `me` / `feed` pour les membres de la ruche. */
  feed?: boolean
  /** Les membres dont l'Activité change (`me` / `notifications`), filtrés comme les autres. */
  notify?: readonly string[]
  /** La ruche pour laquelle l'objet a été écrit (`project_comment.hive_id`) : seuls ses membres le lisent. */
  readersHiveId?: string | null
} & ({ projectId: string; project?: undefined } | { project: ProjectScope; projectId?: undefined })

/** Un geste sur un projet : voir l'interface en tête du fichier. */
export const projectChanged = (live: Live, signals: ProjectSignals) =>
  safely('project', async () => {
    const { db, hub } = live
    // Avant toute lecture : personne ne pourrait recevoir ce geste ? Les sujets dont on connaît déjà
    // l'identifiant (la page, le coin) et les destinataires de l'Activité se comptent sans la base ;
    // les autres (la page de l'auteur, la ruche, le Fil) demandent au moins un flux ouvert.
    const id = signals.project?.id ?? signals.projectId
    const someone =
      hub.listeners(`project:${id}`).size > 0 ||
      hub.listeners(`corner:${id}`).size > 0 ||
      (signals.notify ?? []).some((member) => hub.isConnected(member)) ||
      ((signals.member !== undefined || signals.hive !== undefined || signals.feed === true) &&
        !hub.isIdle())
    if (!someone || id === undefined) return
    const project = signals.project ?? (await projectScopeOf(db, id))
    if (!project) return
    const audience = audienceOf(project)

    // Les sujets de cet événement, chacun avec sa sorte. `exempt` : l'auteur du projet reçoit
    // le geste d'un membre bloqué avec lui sur la page de son propre projet (règle 1).
    const topics: { topic: string; kind: LiveKind; exempt: boolean }[] = []
    if (signals.page)
      topics.push({ topic: `project:${project.id}`, kind: signals.page, exempt: true })
    if (signals.member && audience === 'members') {
      topics.push({ topic: `member:${project.authorId}`, kind: signals.member, exempt: false })
    }
    if (signals.hive && audience === 'hive' && project.hiveId !== null) {
      topics.push({ topic: `hive:${project.hiveId}`, kind: signals.hive, exempt: false })
    }
    if (signals.corner) {
      topics.push({ topic: `corner:${project.id}`, kind: signals.corner, exempt: false })
    }
    if (signals.feed && audience === 'members') {
      topics.push({ topic: 'feed', kind: 'feed', exempt: false })
    }
    const feedToHive = signals.feed === true && audience === 'hive'
    const notify = (signals.notify ?? []).filter((id) => hub.isConnected(id))

    // Qui écoute ? Personne : rien de plus à lire.
    const listening = new Set<string>(notify)
    for (const { topic } of topics) for (const id of hub.listeners(topic)) listening.add(id)
    if (feedToHive) for (const id of hub.listeners('me')) listening.add(id)
    if (listening.size === 0) return

    // Les blocages des deux auteurs, et les membres des ruches qui lisent l'objet, en même temps.
    const readersHiveId = signals.readersHiveId ?? null
    const hiveIds = [
      ...new Set(
        [audience === 'hive' ? project.hiveId : null, readersHiveId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ]
    const cornerHeard =
      signals.corner !== undefined && hub.listeners(`corner:${project.id}`).size > 0
    const [partners, hives, testers] = await Promise.all([
      blockPartnersOf(db, [...new Set([signals.actorId, project.authorId])]),
      hiveMembersOf(db, hiveIds),
      cornerHeard ? currentTestersOf(db, project.id) : new Set<string>(),
    ])
    const blockedWithActor = partners.get(signals.actorId) ?? new Set<string>()
    const blockedWithAuthor = partners.get(project.authorId) ?? new Set<string>()
    const inHive = (hiveId: string | null, userId: string) =>
      hiveId !== null && (hives.get(hiveId)?.has(userId) ?? false)

    /** Ce membre lirait-il un changement, s'il rechargeait ? */
    const reads = (userId: string, exempt: boolean) => {
      const isAuthor = userId === project.authorId
      if (audience === 'author' && !isAuthor) return false
      if (audience === 'hive' && !isAuthor && !inHive(project.hiveId, userId)) return false
      if (readersHiveId !== null && !isAuthor && !inHive(readersHiveId, userId)) return false
      if (blockedWithAuthor.has(userId)) return false
      if (blockedWithActor.has(userId) && !(exempt && isAuthor)) return false
      return true
    }

    // Le coin : l'auteur et les testeurs inscrits aujourd'hui, rien qu'eux (cornerAccess).
    const inCorner = (userId: string) => userId === project.authorId || testers.has(userId)
    for (const { topic, kind, exempt } of topics) {
      const corner = topic.startsWith('corner:')
      hub.emit({ topic, kind }, (userId) => reads(userId, exempt) && (!corner || inCorner(userId)))
    }
    if (feedToHive) {
      hub.toMembers(
        [...(hives.get(project.hiveId ?? '') ?? [])].filter((id) => reads(id, false)),
        'feed',
      )
    }
    hub.toMembers(
      notify.filter((id) => reads(id, false)),
      'notifications',
    )
  })

/**
 * La page d'un membre (`member:<id>`), changée par le geste d'un autre (un abonné de plus ou de
 * moins), et l'Activité de `notify`. Ni l'un ni l'autre ne part vers qui est bloqué avec l'auteur
 * du geste ou avec le membre de la page.
 */
export const memberChanged = (
  live: Live,
  {
    memberId,
    actorId,
    page,
    notify = [],
  }: { memberId: string; actorId: string; page?: LiveKind; notify?: readonly string[] },
) =>
  safely('member', async () => {
    const { db, hub } = live
    const topic = `member:${memberId}`
    const recipients = notify.filter((id) => hub.isConnected(id))
    if (!page && recipients.length === 0) return
    if (page && hub.listeners(topic).size === 0 && recipients.length === 0) return
    const partners = await blockPartnersOf(db, [...new Set([actorId, memberId])])
    const blocked = (userId: string) =>
      (partners.get(actorId)?.has(userId) ?? false) ||
      (partners.get(memberId)?.has(userId) ?? false)
    if (page) hub.emit({ topic, kind: page }, (userId) => !blocked(userId))
    hub.toMembers(
      recipients.filter((id) => !blocked(id)),
      'notifications',
    )
  })

/** Le `me` de ces membres, hors de tout projet, sans blocage avec l'auteur du geste. */
export const notifyMembers = (
  live: Live,
  {
    actorId,
    recipients,
    kind = 'notifications',
  }: { actorId: string; recipients: readonly string[]; kind?: LiveKind },
) =>
  safely('members', async () => {
    const { db, hub } = live
    const connected = recipients.filter((id) => hub.isConnected(id))
    if (connected.length === 0) return
    const blocked = (await blockPartnersOf(db, [actorId])).get(actorId) ?? new Set<string>()
    hub.toMembers(
      connected.filter((id) => !blocked.has(id)),
      kind,
    )
  })

/**
 * La page d'une ruche (`hive:<id>`) a changé sans qu'un projet soit en cause : son nom, son
 * icône, son épingle, ses membres, son animateur. Le signal ne part qu'à ses membres d'aujourd'hui
 * (un ancien membre a déjà reçu `gone`, live/recheck.ts), sans blocage avec l'auteur du geste.
 * Deux requêtes, et aucune sans écouteur : les membres par la clé primaire de hive_member
 * (hive_id en tête), les blocages de l'acteur par `blockPartnersOf`.
 */
export const hiveChanged = (
  live: Live,
  { hiveId, actorId }: { hiveId: string; actorId: string | null },
) =>
  safely('hive', async () => {
    const { db, hub } = live
    const topic = `hive:${hiveId}`
    if (hub.listeners(topic).size === 0) return
    // `actorId` null : un geste de la modération (le nom de la ruche retiré), sans membre derrière.
    const [members, partners] = await Promise.all([
      hiveMembersOf(db, [hiveId]),
      blockPartnersOf(db, actorId === null ? [] : [actorId]),
    ])
    const inHive = members.get(hiveId) ?? new Set<string>()
    const blocked = (actorId === null ? undefined : partners.get(actorId)) ?? new Set<string>()
    hub.emit({ topic, kind: 'hive' }, (userId) => inHive.has(userId) && !blocked.has(userId))
  })

/** Le `me` de ces membres, sans filtre : ce qui n'appartient qu'à eux (voir l'en-tête). */
export const toOwnDevices = (live: Live, userIds: readonly string[], kind: LiveKind) =>
  live.hub.toMembers(userIds, kind)

/**
 * La file de modération ou la page de tri : `moderation` et `scouts` ne sont écoutés que par les
 * administrateurs en fonction (sujets d'office, revérifiés toutes les minutes), qui voient tout.
 */
export const toAdmins = (live: Live, kind: 'moderation' | 'scouts') =>
  live.hub.emit({ topic: kind, kind })
