// Les lectures des ruches (R10) : qui en est membre, ce que la ruche peut montrer, et les réponses
// des routes de lecture (mes ruches et mes invitations, la page, l'actualité, les projets réservés,
// les membres). Les écritures sont dans write.ts. Les routes des invitations reprennent d'ici
// `membershipOf`, `invitationValidSince`, `pendingInvitationsOf` et `hiveSummariesOf`, pour que
// « est membre » et la ligne d'une ruche ne soient écrits qu'une fois.
//
// Une ruche n'existe que pour ses membres : toute route commence par `membershipOf`, et la même
// réponse 404 sert à un inconnu, un invité, un ancien membre et un identifiant mal formé.
import {
  HIVE_ACTIVITY_DAYS,
  HIVE_FACES_MAX,
  HIVE_LIMITS,
  HIVE_PAGE_SIZE,
  HIVE_TESTERS_MAX,
  type HiveActivityItem,
  HiveIcon,
  HiveId,
  type HiveInvitation,
  HiveInvitePolicy,
  type HiveInviteState,
  type HiveMember,
  type HivePage,
  type HiveRole,
  type HiveSummary,
  type MemberFace,
  type MyHives,
  type ProjectSummary,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import {
  and,
  asc,
  Column,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  is,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { type Blocks, blocksOf, notBlockedWith } from '../blocks/visibility'
import { currentHandleOf } from '../handles/load'
import { avatarUrlOf } from '../profile/me'
import { rowsToSummaries, selectProjects } from '../projects/load'
import { listedProject } from '../projects/visibility'
import { hasReadableLines, updateOnCards } from '../updates/load'

/** Une lecture seule : la base, ou une transaction (les deux ont `select`). */
type Reader = Pick<Database, 'select'>

const DAY = 24 * 60 * 60 * 1000
const h = schema.hive
const hm = schema.hiveMember
const hi = schema.hiveInvitation
const p = schema.project
const u = schema.projectUpdate

// ─── Qui est membre ───────────────────────────────────────────────────────────────────────────────

/** Ce que les routes savent d'un membre dans sa ruche, lu en une requête. */
export type Membership = {
  hiveId: string
  role: HiveRole
  joinedAt: Date
  seenAt: Date | null
  invitePolicy: HiveInvitePolicy
}

/**
 * La place de ce membre dans cette ruche, ou null : identifiant mal formé (il ferait échouer la
 * requête : ce n'est pas un uuid), ruche inconnue, ou membre qui n'en est pas (invité, parti). Les
 * trois cas rendent null, et les routes répondent le même 404 : rien ne dit que la ruche existe.
 * Servie par la clé primaire de hive_member (hive_id, user_id), puis celle de hive.
 */
export const membershipOf = async (
  db: Reader,
  hiveId: string,
  userId: string,
): Promise<Membership | null> => {
  if (!HiveId.safeParse(hiveId).success) return null
  const [row] = await db
    .select({
      joinedAt: hm.joinedAt,
      seenAt: hm.seenAt,
      animatorId: h.animatorId,
      invitePolicy: h.invitePolicy,
    })
    .from(hm)
    .innerJoin(h, eq(h.id, hm.hiveId))
    .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, userId)))
  if (!row) return null
  return {
    hiveId,
    role: row.animatorId === userId ? 'animator' : 'member',
    joinedAt: row.joinedAt,
    seenAt: row.seenAt,
    // .parse revérifie la valeur lue (la contrainte de la base dit la même chose).
    invitePolicy: HiveInvitePolicy.parse(row.invitePolicy),
  }
}

/** Vrai si ce membre est dans cette ruche (même réponse pour une ruche inconnue). */
export const isHiveMember = async (db: Reader, hiveId: string, userId: string) =>
  (await membershipOf(db, hiveId, userId)) !== null

/** Vrai si ce membre anime cette ruche. */
export const isHiveAnimator = async (db: Reader, hiveId: string, userId: string) =>
  (await membershipOf(db, hiveId, userId))?.role === 'animator'

/**
 * Une invitation vaut 30 jours : elle compte (et se montre) si elle date d'après cette limite. Une
 * seule définition pour la liste de l'invité, les places de la ruche et les routes des invitations.
 */
export const invitationValidSince = (now: Date) =>
  new Date(now.getTime() - HIVE_LIMITS.invitationDays * DAY)

/**
 * Les invitations qui prennent une place dans la ruche : celles de moins de 30 jours, refusées
 * comprises (choix de Louis du 14/11/2026, Q1). Index unique hive_invitation_hive_invitee_idx
 * (hive_id, invitee_id), lu par son début. Prend une transaction pour être relu sous le verrou de la
 * ruche avant d'inviter.
 */
export const pendingInvitationsOf = async (db: Reader, hiveId: string, now: Date) => {
  const [row] = await db
    .select({ n: count() })
    .from(hi)
    .where(and(eq(hi.hiveId, hiveId), gt(hi.createdAt, invitationValidSince(now))))
  return row?.n ?? 0
}

/** Le nombre de membres de la ruche (clé primaire de hive_member, lue par son début). */
export const memberCountOf = async (db: Reader, hiveId: string) => {
  const [row] = await db.select({ n: count() }).from(hm).where(eq(hm.hiveId, hiveId))
  return row?.n ?? 0
}

// ─── Ce que la ruche peut montrer ─────────────────────────────────────────────────────────────────

/**
 * Un projet réservé à cette ruche, et pas retiré par la modération. Ses membres le voient tous :
 * l'auteur d'un projet réservé est toujours membre (le quitter le rend privé, dans la même
 * transaction). Index partiel project_hive_created_idx (hive_id, created_at) where visibility = 'hive'.
 */
export const reservedToHive = (hiveId: string) =>
  and(eq(p.visibility, 'hive'), eq(p.hiveId, hiveId), isNull(p.removedAt))

/**
 * L'auteur du projet est membre de cette ruche. `in (select …)` : PostgreSQL lit les membres par la
 * clé primaire de hive_member (hive_id, user_id), puis leurs projets par project_author_created_idx.
 * Les noms de colonnes sont écrits en toutes lettres (sql.raw : du texte fixe) : la sous-requête
 * nomme sa propre table, quelle que soit la requête qui l'entoure.
 */
const authorIsMemberOf = (hiveId: string) =>
  sql`${p.authorId} in (select ${sql.raw('hive_member.user_id')} from ${hm} where ${sql.raw('hive_member.hive_id')} = ${hiveId})`

/**
 * Un projet « Membres » (public, pas retiré) que ce lecteur voit : sans blocage entre lui et son
 * auteur, dans un sens ou l'autre. Pas `listedProjectFor` : depuis la règle des ruches, il prend
 * aussi les projets réservés à TOUTES les ruches du lecteur, et une ruche montrerait alors ceux
 * d'une autre ruche (ou compterait deux fois les siens). Les projets réservés à CETTE ruche ont leur
 * propre branche (`reservedToHive`).
 */
const membersProjectFor = (viewerId: string) =>
  and(listedProject(), notBlockedWith(viewerId, p.authorId))

/**
 * Ce que la ruche montre à ce lecteur, l'un de ses membres (le scénario, « L'actualité ») : les
 * projets réservés à cette ruche, et les projets « Membres » de ses membres ; jamais un projet
 * réservé à une autre ruche, privé, retiré, ou d'un membre bloqué avec lui dans un sens ou l'autre.
 * La même condition sert à l'actualité, à l'épingle, aux testeurs et au choix de l'épingle (avec
 * l'animateur pour lecteur) : « que toute la ruche peut voir » se lit ainsi pour chacun.
 */
export const hiveProjectFor = (hiveId: string, viewerId: string) =>
  or(
    and(reservedToHive(hiveId), notBlockedWith(viewerId, p.authorId)),
    and(membersProjectFor(viewerId), authorIsMemberOf(hiveId)),
  )

/**
 * La date où un projet a été publié, celle de sa ligne « a publié » : `published_at`, écrite par
 * l'API avec l'horloge de JavaScript, comme `seen_at` à laquelle on la compare ; `created_at` (écrite
 * par `now()` de la base, à éviter pour un ordre : charte de l'API) seulement pour un projet qui n'en
 * a pas. `mapWith` la relit en Date, comme la colonne.
 */
const publishedAtOf = sql<Date>`coalesce(${p.publishedAt}, ${p.createdAt})`.mapWith(p.createdAt)

/**
 * Une date de JavaScript dans une expression SQL : en texte ISO lié, lu en UTC (`at time zone`), pour
 * qu'elle se compare à une colonne `timestamp` sans heure locale (charte de l'API). Seulement là où
 * l'autre côté n'est pas une colonne (sinon l'opérateur lié à la colonne s'en charge).
 */
const utc = (date: Date) => sql`(${date.toISOString()}::timestamptz at time zone 'UTC')`

// ─── Les visages ──────────────────────────────────────────────────────────────────────────────────

/** Le nom et la photo de ces membres, en une requête (clé primaire de "user", puis de profile). */
const facesOf = async (
  db: Reader,
  ids: string[],
  publicApiUrl: string,
): Promise<Map<string, MemberFace>> => {
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name, avatarKey: schema.profile.avatarKey })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(inArray(schema.user.id, [...new Set(ids)]))
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, name: row.name, avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey) },
    ]),
  )
}

const blockedEitherWay = (blocks: Blocks, memberId: string) =>
  blocks.byMe.has(memberId) || blocks.ofMe.has(memberId)

/** Le nom d'une ruche tel qu'on le montre : null quand la modération l'a retiré (« Ruche sans nom »). */
const shownName = (row: { name: string; nameRemovalId: string | null }) =>
  row.name === '' || row.nameRemovalId !== null ? null : row.name

// ─── La ligne d'une ruche ─────────────────────────────────────────────────────────────────────────

/**
 * Pour chaque ruche de ce membre : la date de sa dernière activité (pour l'ordre de la liste) et ses
 * nouveautés (`news`). Une nouveauté est une ligne de l'actualité (publié, mis à jour) d'un autre
 * membre, datée d'après la dernière visite de la page (`seen_at`), ou d'après l'entrée dans la ruche
 * s'il ne l'a jamais ouverte. Comme l'actualité, on ne regarde que les 30 derniers jours.
 *
 * Quatre requêtes groupées par ruche, quel que soit le nombre de ruches (20 au plus) : les projets
 * réservés publiés, les projets « Membres » des membres, puis les mises à jour de chacun. Deux
 * branches plutôt qu'un « ou » dans la jointure : chacune suit son index (project_hive_created_idx
 * pour les réservés ; hive_member puis project_author_created_idx pour les autres ;
 * project_update_project_created_idx pour les mises à jour). `count(*) filter (where …)` compte
 * seulement les lignes qui remplissent la condition, dans le même passage que `max`.
 */
const activityStatsOf = async (
  db: Reader,
  viewerId: string,
  hiveIds: string[],
  now: Date,
): Promise<Map<string, { last: Date | null; news: number }>> => {
  const since = new Date(now.getTime() - HIVE_ACTIVITY_DAYS * DAY)
  const mate = alias(schema.hiveMember, 'mate')
  const mine = and(eq(hm.userId, viewerId), inArray(hm.hiveId, hiveIds))
  const newsSince = (at: Column | SQL) =>
    sql<number>`count(*) filter (where ${at} > coalesce(${hm.seenAt}, ${hm.joinedAt}) and ${p.authorId} <> ${viewerId})`.mapWith(
      Number,
    )
  // `max` d'une expression : relu en Date, comme la colonne (null s'il n'y a rien).
  const lastOf = (at: SQL) => sql<Date | null>`max(${at})`.mapWith(p.createdAt)
  const reserved = and(eq(p.hiveId, hm.hiveId), eq(p.visibility, 'hive'), isNull(p.removedAt))
  const notBlocked = notBlockedWith(viewerId, p.authorId)
  const [published, membersPublished, updated, membersUpdated] = await Promise.all([
    db
      .select({ hiveId: hm.hiveId, last: lastOf(publishedAtOf), news: newsSince(publishedAtOf) })
      .from(hm)
      .innerJoin(p, reserved)
      .where(and(mine, sql`${publishedAtOf} >= ${utc(since)}`, notBlocked))
      .groupBy(hm.hiveId),
    db
      .select({ hiveId: hm.hiveId, last: lastOf(publishedAtOf), news: newsSince(publishedAtOf) })
      .from(hm)
      .innerJoin(mate, eq(mate.hiveId, hm.hiveId))
      .innerJoin(p, eq(p.authorId, mate.userId))
      .where(and(mine, membersProjectFor(viewerId), sql`${publishedAtOf} >= ${utc(since)}`))
      .groupBy(hm.hiveId),
    db
      .select({ hiveId: hm.hiveId, last: max(u.createdAt), news: newsSince(u.createdAt) })
      .from(hm)
      .innerJoin(p, reserved)
      .innerJoin(u, eq(u.projectId, p.id))
      .where(and(mine, gte(u.createdAt, since), notBlocked, updateOnCards(), hasReadableLines()))
      .groupBy(hm.hiveId),
    db
      .select({ hiveId: hm.hiveId, last: max(u.createdAt), news: newsSince(u.createdAt) })
      .from(hm)
      .innerJoin(mate, eq(mate.hiveId, hm.hiveId))
      .innerJoin(p, eq(p.authorId, mate.userId))
      .innerJoin(u, eq(u.projectId, p.id))
      .where(
        and(
          mine,
          membersProjectFor(viewerId),
          gte(u.createdAt, since),
          updateOnCards(),
          hasReadableLines(),
        ),
      )
      .groupBy(hm.hiveId),
  ])
  const stats = new Map<string, { last: Date | null; news: number }>()
  for (const row of [...published, ...membersPublished, ...updated, ...membersUpdated]) {
    const known = stats.get(row.hiveId) ?? { last: null, news: 0 }
    const last =
      known.last && row.last && known.last > row.last ? known.last : (row.last ?? known.last)
    stats.set(row.hiveId, { last, news: known.news + row.news })
  }
  return stats
}

/**
 * La ligne (`HiveSummary`) de chacune de ces ruches pour ce membre, de la plus récemment active à la
 * plus calme ; `hiveIds` null : toutes ses ruches. Un nombre fixe de requêtes, quel que soit le
 * nombre de ruches : ses ruches (index hive_member_user_idx), ses blocages, le nombre de membres,
 * les visages, et les quatre de `activityStatsOf`.
 */
export const hiveSummariesOf = async (
  db: Database,
  viewerId: string,
  hiveIds: string[] | null,
  publicApiUrl: string,
  now: Date,
): Promise<HiveSummary[]> => {
  const animator = alias(schema.user, 'animator')
  const rows = await db
    .select({
      id: h.id,
      name: h.name,
      nameRemovalId: h.nameRemovalId,
      icon: h.icon,
      animatorId: h.animatorId,
      animatorName: animator.name,
      createdAt: h.createdAt,
      joinedAt: hm.joinedAt,
    })
    .from(hm)
    .innerJoin(h, eq(h.id, hm.hiveId))
    .leftJoin(animator, eq(animator.id, h.animatorId))
    .where(and(eq(hm.userId, viewerId), hiveIds ? inArray(hm.hiveId, hiveIds) : undefined))
  const ids = rows.map((row) => row.id)

  // Les visages : les 4 premiers membres entrés, sans ceux qui sont bloqués avec le lecteur.
  // `row_number() over (partition by …)` numérote les membres de chaque ruche dans l'ordre
  // d'entrée ; la requête du dessus ne garde que les numéros 1 à 4 (clé primaire de hive_member).
  const ranked = db
    .select({
      hiveId: hm.hiveId,
      userId: hm.userId,
      rank: sql<number>`row_number() over (partition by ${hm.hiveId} order by ${hm.joinedAt}, ${hm.userId})`.as(
        'rank',
      ),
    })
    .from(hm)
    .where(and(inArray(hm.hiveId, ids), notBlockedWith(viewerId, hm.userId)))
    .as('ranked')
  const [blocks, counts, faceRows, stats] = await Promise.all([
    blocksOf(db, viewerId),
    db
      .select({ hiveId: hm.hiveId, n: count() })
      .from(hm)
      .where(inArray(hm.hiveId, ids))
      .groupBy(hm.hiveId),
    db
      .select({
        hiveId: ranked.hiveId,
        id: schema.user.id,
        name: schema.user.name,
        avatarKey: schema.profile.avatarKey,
      })
      .from(ranked)
      .innerJoin(schema.user, eq(schema.user.id, ranked.userId))
      .leftJoin(schema.profile, eq(schema.profile.userId, ranked.userId))
      .where(lte(ranked.rank, HIVE_FACES_MAX))
      .orderBy(asc(ranked.hiveId), asc(ranked.rank)),
    activityStatsOf(db, viewerId, ids, now),
  ])
  const countOf = new Map(counts.map((row) => [row.hiveId, row.n]))
  const facesByHive = new Map<string, MemberFace[]>()
  for (const row of faceRows) {
    const list = facesByHive.get(row.hiveId) ?? []
    list.push({ id: row.id, name: row.name, avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey) })
    facesByHive.set(row.hiveId, list)
  }
  // La dernière activité : la plus récente de la création de la ruche, de l'entrée du lecteur et de
  // la dernière ligne de l'actualité.
  const activeAt = (row: (typeof rows)[number]) =>
    Math.max(
      row.createdAt.getTime(),
      row.joinedAt.getTime(),
      stats.get(row.id)?.last?.getTime() ?? 0,
    )
  return rows
    .sort((a, b) => activeAt(b) - activeAt(a) || (a.id < b.id ? 1 : -1))
    .map((row) => ({
      id: row.id,
      name: shownName(row),
      icon: HiveIcon.parse(row.icon),
      memberCount: countOf.get(row.id) ?? 1,
      animator:
        row.animatorId && row.animatorName !== null && !blockedEitherWay(blocks, row.animatorId)
          ? { id: row.animatorId, name: row.animatorName }
          : null,
      faces: facesByHive.get(row.id) ?? [],
      news: stats.get(row.id)?.news ?? 0,
      role: row.animatorId === viewerId ? ('animator' as const) : ('member' as const),
    }))
}

// ─── Mes ruches ───────────────────────────────────────────────────────────────────────────────────

/**
 * Les invitations valables reçues par ce membre (moins de 30 jours, ni refusées, ni acceptées : une
 * invitation acceptée n'a plus de ligne), des plus récentes aux plus anciennes. Index
 * hive_invitation_invitee_idx (invitee_id, created_at). `animatorName` : null si l'animateur est
 * bloqué avec l'invité, dans un sens ou l'autre (bloquer efface déjà les invitations entre eux deux).
 * Trois requêtes : les invitations (avec la ruche, l'animateur et l'inviteur), le nombre de membres
 * de ces ruches, les blocages de l'invité.
 */
export const invitationsOf = async (
  db: Database,
  viewerId: string,
  publicApiUrl: string,
  now: Date,
): Promise<HiveInvitation[]> => {
  const animator = alias(schema.user, 'animator')
  const inviter = alias(schema.user, 'inviter')
  const inviterProfile = alias(schema.profile, 'inviter_profile')
  const rows = await db
    .select({
      id: hi.id,
      createdAt: hi.createdAt,
      hiveId: h.id,
      name: h.name,
      nameRemovalId: h.nameRemovalId,
      icon: h.icon,
      animatorId: h.animatorId,
      animatorName: animator.name,
      inviterId: inviter.id,
      inviterName: inviter.name,
      inviterAvatarKey: inviterProfile.avatarKey,
    })
    .from(hi)
    .innerJoin(h, eq(h.id, hi.hiveId))
    .leftJoin(animator, eq(animator.id, h.animatorId))
    .leftJoin(inviter, eq(inviter.id, hi.inviterId))
    .leftJoin(inviterProfile, eq(inviterProfile.userId, hi.inviterId))
    .where(
      and(
        eq(hi.inviteeId, viewerId),
        isNull(hi.refusedAt),
        gt(hi.createdAt, invitationValidSince(now)),
      ),
    )
    .orderBy(desc(hi.createdAt), desc(hi.id))
  const [blocks, counts] = await Promise.all([
    blocksOf(db, viewerId),
    db
      .select({ hiveId: hm.hiveId, n: count() })
      .from(hm)
      .where(
        inArray(
          hm.hiveId,
          rows.map((row) => row.hiveId),
        ),
      )
      .groupBy(hm.hiveId),
  ])
  const countOf = new Map(counts.map((row) => [row.hiveId, row.n]))
  return rows.map((row) => ({
    id: row.id,
    hive: {
      id: row.hiveId,
      name: shownName(row),
      icon: HiveIcon.parse(row.icon),
      memberCount: countOf.get(row.hiveId) ?? 1,
      animatorName:
        row.animatorId && row.animatorName !== null && !blockedEitherWay(blocks, row.animatorId)
          ? row.animatorName
          : null,
    },
    inviter:
      row.inviterId && row.inviterName !== null
        ? {
            id: row.inviterId,
            name: row.inviterName,
            avatarUrl: avatarUrlOf(publicApiUrl, row.inviterAvatarKey),
          }
        : null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** GET /v1/hives : ses ruches, ses invitations, et le nombre de ruches qu'il a créées. */
export const loadMyHives = async (
  db: Database,
  viewerId: string,
  publicApiUrl: string,
  now: Date,
): Promise<MyHives> => {
  const [hives, invitations, created] = await Promise.all([
    hiveSummariesOf(db, viewerId, null, publicApiUrl, now),
    invitationsOf(db, viewerId, publicApiUrl, now),
    createdCountOf(db, viewerId),
  ])
  return { hives, invitations, createdCount: created }
}

/**
 * Les ruches créées par ce membre et qui existent encore (la limite de 10). Index
 * hive_created_by_idx. Prend une transaction : la création le relit sous le verrou du membre.
 */
export const createdCountOf = async (db: Reader, userId: string) => {
  const [row] = await db.select({ n: count() }).from(h).where(eq(h.createdBy, userId))
  return row?.n ?? 0
}

/** Les ruches dont ce membre fait partie (la limite de 20). Index hive_member_user_idx. */
export const joinedCountOf = async (db: Reader, userId: string) => {
  const [row] = await db.select({ n: count() }).from(hm).where(eq(hm.userId, userId))
  return row?.n ?? 0
}

// ─── La page d'une ruche ──────────────────────────────────────────────────────────────────────────

/**
 * Peut-il inviter : « Seulement moi » réserve le geste à l'animateur ; sinon, la ruche est pleine à
 * 50 membres, invitations en attente comprises.
 */
export const inviteStateOf = (
  membership: Pick<Membership, 'role' | 'invitePolicy'>,
  members: number,
  pending: number,
): HiveInviteState => {
  if (membership.invitePolicy === 'animator' && membership.role !== 'animator') {
    return 'animatorOnly'
  }
  return members + pending >= HIVE_LIMITS.members ? 'full' : 'allowed'
}

/**
 * GET /v1/hives/{id} : la page, pour un membre (la route a vérifié `membership`). Un nombre fixe de
 * requêtes : la ligne de la ruche, les invitations en attente, l'épingle, les testeurs, le nombre de
 * projets réservés, le successeur, puis les cartes (rowsToSummaries) et la ligne de la ruche.
 */
export const loadHivePage = async (
  db: Database,
  viewerId: string,
  membership: Membership,
  publicApiUrl: string,
  now: Date,
): Promise<HivePage | null> => {
  const { hiveId } = membership
  const pinner = alias(schema.user, 'pinner')
  const visible = hiveProjectFor(hiveId, viewerId)
  const [[summary], pending, [hiveRow], testerRows, [projects], [successor], blocks] =
    await Promise.all([
      hiveSummariesOf(db, viewerId, [hiveId], publicApiUrl, now),
      pendingInvitationsOf(db, hiveId, now),
      db
        .select({
          pinnedProjectId: h.pinnedProjectId,
          pinnedBy: h.pinnedBy,
          pinnerName: pinner.name,
        })
        .from(h)
        .leftJoin(pinner, eq(pinner.id, h.pinnedBy))
        .where(eq(h.id, hiveId)),
      // « … cherche des testeurs » : les projets que toute la ruche voit, testables avec une démo,
      // les plus récents d'abord, six au plus.
      selectProjects(db)
        .where(and(visible, eq(p.status, 'testable'), isNotNull(p.demoUrl)))
        .orderBy(desc(p.createdAt), desc(p.id))
        .limit(HIVE_TESTERS_MAX),
      // « Projets · 5 » : les projets réservés à la ruche que le lecteur voit (ceux de l'onglet).
      db
        .select({ n: count() })
        .from(p)
        .where(and(reservedToHive(hiveId), notBlockedWith(viewerId, p.authorId))),
      // Qui animerait la ruche si l'animateur la quittait : le membre le plus ancien après lui.
      membership.role === 'animator'
        ? db
            .select({ name: schema.user.name })
            .from(hm)
            .innerJoin(schema.user, eq(schema.user.id, hm.userId))
            .where(and(eq(hm.hiveId, hiveId), ne(hm.userId, viewerId)))
            .orderBy(asc(hm.joinedAt), asc(hm.userId))
            .limit(1)
        : Promise.resolve([]),
      blocksOf(db, viewerId),
    ])
  if (!summary || !hiveRow) return null

  // L'épingle, seulement si toute la ruche peut encore voir ce projet (devenu privé, retiré, ou
  // d'un auteur parti : elle disparaît d'elle-même, sans effacer la colonne).
  const pinnedRows = hiveRow.pinnedProjectId
    ? await selectProjects(db).where(and(eq(p.id, hiveRow.pinnedProjectId), visible))
    : []
  const [pinnedCards, testers] = await Promise.all([
    rowsToSummaries(db, pinnedRows, viewerId, publicApiUrl),
    rowsToSummaries(db, testerRows, viewerId, publicApiUrl),
  ])
  const [pinnedCard] = pinnedCards
  // « Épinglé par » : ni un compte supprimé, ni un membre bloqué avec le lecteur (l'épingle reste,
  // elle est à la ruche, sans son nom).
  const pinnedBy =
    hiveRow.pinnedBy && hiveRow.pinnerName !== null && !blockedEitherWay(blocks, hiveRow.pinnedBy)
      ? { id: hiveRow.pinnedBy, name: hiveRow.pinnerName }
      : null
  return {
    summary,
    invite: inviteStateOf(membership, summary.memberCount, pending),
    invitePolicy: membership.invitePolicy,
    pendingInvitations: Math.min(pending, HIVE_LIMITS.members),
    pinned: pinnedCard ? { ...pinnedCard, pinnedBy } : null,
    seekingTesters: testers,
    projectCount: projects?.n ?? 0,
    successor: successor ? { name: successor.name } : null,
  }
}

// ─── Les pages de l'actualité et des projets ─────────────────────────────────────────────────────

/**
 * Le marque-page des listes d'une ruche : la date, le rang et l'identifiant de la dernière ligne
 * lue. Le rang départage deux lignes de même date (épinglé 2, mis à jour 1, publié 0) ; l'ordre est
 * « date, rang, identifiant », du plus grand au plus petit. Encodé en base64url (lettres, chiffres,
 * `-` et `_` : ce que permet `HiveCursor` du contrat), opaque pour l'appli.
 */
export type HivePageMark = { at: Date; rank: number; id: string }

export const writeHivePageMark = ({ at, rank, id }: HivePageMark) =>
  Buffer.from(`${at.toISOString()}~${rank}~${id}`).toString('base64url')

/** Lit un marque-page : null s'il n'y en a pas, 'invalid' s'il ne veut rien dire (400). */
export const readHivePageMark = (cursor: string | undefined): HivePageMark | null | 'invalid' => {
  if (cursor === undefined) return null
  const [at, rank, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split('~')
  const date = new Date(at ?? '')
  if (
    rest.length > 0 ||
    Number.isNaN(date.getTime()) ||
    !['0', '1', '2'].includes(rank ?? '') ||
    !HiveId.safeParse(id).success
  ) {
    return 'invalid'
  }
  return { at: date, rank: Number(rank), id: (id ?? '').toLowerCase() }
}

/**
 * « Après le marque-page », pour une branche dont toutes les lignes ont le rang `rank`. La date
 * entre par un opérateur lié à sa colonne (lt, eq), qui l'écrit en UTC ; pour une expression (la
 * date de publication), en texte ISO lu en UTC (`utc`). Un rang plus petit que celui du marque-page
 * passe après lui à date égale (lte) ; un rang plus grand, avant (lt) ; le même rang départage par
 * l'identifiant.
 */
const after = (cursor: HivePageMark | null, at: Column | SQL, id: Column, rank: number) => {
  if (!cursor) return undefined
  // `is(at, Column)` : une vraie colonne (Drizzle sait alors écrire la date), sinon une expression.
  const before = is(at, Column) ? lt(at, cursor.at) : sql`${at} < ${utc(cursor.at)}`
  const same = is(at, Column) ? eq(at, cursor.at) : sql`${at} = ${utc(cursor.at)}`
  if (rank < cursor.rank) return or(before, same)
  if (rank > cursor.rank) return before
  return or(before, and(same, lt(id, cursor.id)))
}

/** L'ordre des lignes : date, rang, identifiant, du plus grand au plus petit (comme en SQL). */
const newestFirst = (a: HivePageMark, b: HivePageMark) =>
  b.at.getTime() - a.at.getTime() || b.rank - a.rank || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)

type Event = HivePageMark & {
  kind: HiveActivityItem['kind']
  projectId: string
  actorId: string
  version: string | null
}

/**
 * GET /v1/hives/{id}/activity : 30 jours, du plus récent au plus ancien, 20 par page. Trois
 * branches lues chacune jusqu'à 21 lignes après le marque-page (les projets publiés, les mises à
 * jour, l'épingle), puis fusionnées : les 21 premières de l'ensemble sont forcément parmi elles. La
 * 21e dit seulement qu'il y a une page de plus. Ensuite, les cartes et les visages de ces lignes, en
 * une fois. Un nombre fixe de requêtes, quelle que soit la page.
 */
export const loadHiveActivity = async (
  db: Database,
  viewerId: string,
  hiveId: string,
  cursor: HivePageMark | null,
  publicApiUrl: string,
  now: Date,
) => {
  const since = new Date(now.getTime() - HIVE_ACTIVITY_DAYS * DAY)
  const visible = hiveProjectFor(hiveId, viewerId)
  const take = HIVE_PAGE_SIZE + 1
  const [published, updated, pinned] = await Promise.all([
    // Index partiel project_hive_created_idx pour les réservés ; project_author_created_idx pour
    // les projets « Membres » des membres (peu de lignes par ruche : 50 membres au plus). Rangés
    // par leur date de publication.
    db
      .select({ at: publishedAtOf, id: p.id, projectId: p.id, actorId: p.authorId })
      .from(p)
      .where(
        and(visible, sql`${publishedAtOf} >= ${utc(since)}`, after(cursor, publishedAtOf, p.id, 0)),
      )
      .orderBy(desc(publishedAtOf), desc(p.id))
      .limit(take),
    // Les mises à jour de ces projets, ni retirées ni vides (les règles des cartes) ; index
    // project_update_project_created_idx (project_id, created_at, id).
    db
      .select({
        at: u.createdAt,
        id: u.id,
        projectId: p.id,
        actorId: p.authorId,
        version: u.version,
      })
      .from(u)
      .innerJoin(p, eq(p.id, u.projectId))
      .where(
        and(
          visible,
          updateOnCards(),
          hasReadableLines(),
          gte(u.createdAt, since),
          after(cursor, u.createdAt, u.id, 1),
        ),
      )
      .orderBy(desc(u.createdAt), desc(u.id))
      .limit(take),
    // L'épingle : une ligne au plus, celle de l'animateur qui l'a posée (pas s'il est bloqué avec
    // le lecteur, ni si son compte est supprimé). Clé primaire de hive.
    db
      .select({ at: h.pinnedAt, id: p.id, projectId: p.id, actorId: h.pinnedBy })
      .from(h)
      .innerJoin(p, eq(p.id, h.pinnedProjectId))
      .where(
        and(
          eq(h.id, hiveId),
          isNotNull(h.pinnedBy),
          notBlockedWith(viewerId, h.pinnedBy),
          visible,
          gte(h.pinnedAt, since),
          after(cursor, h.pinnedAt, p.id, 2),
        ),
      ),
  ])
  const events: Event[] = [
    ...published.map((row) => ({ ...row, rank: 0, kind: 'published' as const, version: null })),
    ...updated.map((row) => ({ ...row, rank: 1, kind: 'updated' as const })),
    ...pinned.flatMap((row) =>
      row.at && row.actorId
        ? [
            {
              ...row,
              at: row.at,
              actorId: row.actorId,
              rank: 2,
              kind: 'pinned' as const,
              version: null,
            },
          ]
        : [],
    ),
  ]
    .sort(newestFirst)
    .slice(0, take)
  const page = events.slice(0, HIVE_PAGE_SIZE)
  const projectIds = [...new Set(page.map((event) => event.projectId))]
  const [rows, faces] = await Promise.all([
    selectProjects(db).where(inArray(p.id, projectIds)),
    facesOf(
      db,
      page.map((event) => event.actorId),
      publicApiUrl,
    ),
  ])
  const cards = new Map(
    (await rowsToSummaries(db, rows, viewerId, publicApiUrl)).map((card) => [card.id, card]),
  )
  const items: HiveActivityItem[] = page.flatMap((event) => {
    const project = cards.get(event.projectId)
    const actor = faces.get(event.actorId)
    if (!project || !actor) return []
    return [
      {
        kind: event.kind,
        actor,
        project,
        version: event.version,
        at: event.at.toISOString(),
        reserved: project.visibility === 'hive',
      },
    ]
  })
  const last = page.at(-1)
  return {
    items,
    nextCursor: events.length > HIVE_PAGE_SIZE && last ? writeHivePageMark(last) : null,
  }
}

/**
 * GET /v1/hives/{id}/projects : les projets réservés à la ruche que le lecteur voit, du plus récent
 * au plus ancien, 20 par page (index partiel project_hive_created_idx, lu depuis le marque-page).
 */
export const loadHiveProjects = async (
  db: Database,
  viewerId: string,
  hiveId: string,
  cursor: HivePageMark | null,
  publicApiUrl: string,
): Promise<{ items: ProjectSummary[]; nextCursor: string | null }> => {
  const rows = await selectProjects(db)
    .where(
      and(
        reservedToHive(hiveId),
        notBlockedWith(viewerId, p.authorId),
        after(cursor, p.createdAt, p.id, 0),
      ),
    )
    .orderBy(desc(p.createdAt), desc(p.id))
    .limit(HIVE_PAGE_SIZE + 1)
  const page = rows.slice(0, HIVE_PAGE_SIZE)
  const last = page.at(-1)
  return {
    items: await rowsToSummaries(db, page, viewerId, publicApiUrl),
    nextCursor:
      rows.length > HIVE_PAGE_SIZE && last
        ? writeHivePageMark({ at: last.project.createdAt, rank: 0, id: last.project.id })
        : null,
  }
}

// ─── Les membres ──────────────────────────────────────────────────────────────────────────────────

/**
 * GET /v1/hives/{id}/members : l'animateur d'abord, puis les membres par date d'entrée. Un membre
 * bloqué avec le lecteur, dans un sens ou l'autre, n'est pas listé ; sauf pour l'animateur, qui le
 * voit réduit à son nom (ni photo, ni pseudo), pour pouvoir le retirer (choix de Louis du
 * 14/11/2026, Q3, dans les deux sens). Deux requêtes : les membres avec leur profil et leur pseudo
 * actuel (clé primaire de hive_member, index partiel member_handle_current_idx), et les blocages.
 */
export const loadHiveMembers = async (
  db: Database,
  viewerId: string,
  membership: Membership,
  publicApiUrl: string,
): Promise<HiveMember[]> => {
  const [rows, blocks, [hiveRow]] = await Promise.all([
    db
      .select({
        id: hm.userId,
        name: schema.user.name,
        avatarKey: schema.profile.avatarKey,
        handle: schema.memberHandle.handle,
      })
      .from(hm)
      .innerJoin(schema.user, eq(schema.user.id, hm.userId))
      .leftJoin(schema.profile, eq(schema.profile.userId, hm.userId))
      .leftJoin(schema.memberHandle, currentHandleOf(hm.userId))
      .where(eq(hm.hiveId, membership.hiveId))
      .orderBy(asc(hm.joinedAt), asc(hm.userId)),
    blocksOf(db, viewerId),
    db.select({ animatorId: h.animatorId }).from(h).where(eq(h.id, membership.hiveId)),
  ])
  const animatorId = hiveRow?.animatorId ?? null
  const members = rows.flatMap((row): HiveMember[] => {
    const role = row.id === animatorId ? ('animator' as const) : ('member' as const)
    if (blockedEitherWay(blocks, row.id)) {
      if (membership.role !== 'animator') return []
      return [
        {
          face: { id: row.id, name: row.name, avatarUrl: null },
          handle: null,
          role,
          isMe: false,
          reduced: true,
        },
      ]
    }
    return [
      {
        face: { id: row.id, name: row.name, avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey) },
        handle: row.handle,
        role,
        isMe: row.id === viewerId,
        reduced: false,
      },
    ]
  })
  // L'animateur d'abord ; `sort` garde l'ordre d'entrée des autres (tri stable).
  return members.sort((a, b) => Number(b.role === 'animator') - Number(a.role === 'animator'))
}
