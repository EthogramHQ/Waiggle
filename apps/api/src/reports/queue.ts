// Ce que lit l'administrateur (tranche 7a) : la file des signalements en attente, regroupés par
// cible, et la liste des contenus retirés, pour pouvoir les rétablir. Et le classement « sans
// objet » des signalements dont la cible a disparu (précision 6 du plan), fait à la lecture de la
// file et par la purge de nuit plutôt que dans chaque route de suppression.
//
// Jamais qui a signalé (règle 14) : reporter_id n'est même pas lu ici.
import {
  IMAGE_INPUT_FIELDS,
  type MemberInputField,
  MODERATION_DETAILS_SHOWN,
  MODERATION_PAGE_SIZE,
  type ModerationQueueItem,
  type ModerationQueuePage,
  REPORT_RETENTION_DAYS,
  RemovalGround,
  type RemovedItem,
  type RemovedPage,
  ReportReason,
  type ReportSnapshot,
  ReportSnapshotEntry,
  ReportTarget,
  type SnapshotImage,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { isoDate } from '../jobs/shared'
import { utc } from '../notifications/load'
import { activeSuspensionSql } from '../suspension/load'
import { blockedByAdmin } from './decide'
import { targetUuid } from './target'

const r = schema.contentReport
const d = schema.moderationDecision
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
const DAY = 24 * 60 * 60 * 1000
/** La forme d'un uuid, pour une expression régulière de PostgreSQL (« ~ »). Écrite ici, jamais reçue. */
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

// ─── Classer « sans objet » ──────────────────────────────────────────────────────────────────────

/**
 * Les signalements ouverts dont la cible n'existe plus (projet, note ou commentaire supprimé par
 * son auteur, compte supprimé) passent à « void », datés de `now` : la purge les efface 30 jours
 * plus tard. La personne qui a signalé n'est pas prévenue (règle 29).
 *
 * « not exists (select 1 …) » est vrai quand la sous-requête ne trouve rien. Chaque sous-requête
 * cherche la cible par la clé primaire de sa table (targetUuid : l'id converti en uuid) ; les
 * signalements ouverts viennent de l'index partiel content_report_open_idx. On écrit
 * content_report.<colonne> en toutes lettres : la colonne visée est bien celle du signalement, pas
 * une colonne homonyme de la sous-requête.
 */
export const voidReportsOfGoneTargets = async (db: Database, now: Date) => {
  // L'identifiant en uuid, seulement s'il en a la forme (tranche 7c) : une ligne posée à la main
  // avec un identifiant mal formé ferait sinon échouer la conversion, et toute la file avec elle.
  // Elle ne trouve alors aucune cible, et passe « sans objet » comme une cible disparue.
  const id = sql.raw(
    `(case when content_report.target_kind <> 'member' and content_report.target_id ~ '${UUID_PATTERN}' then content_report.target_id::uuid end)`,
  )
  const rows = await db
    .update(r)
    .set({ status: 'void', decidedAt: now })
    .where(
      and(
        eq(r.status, 'open'),
        sql`case content_report.target_kind
          when 'project' then not exists (select 1 from project p where p.id = ${id})
          when 'note' then not exists (select 1 from project_note n where n.id = ${id})
          when 'comment' then not exists (
            select 1 from project_comment c where c.id = ${id} and c.deleted_at is null)
          else not exists (select 1 from "user" u where u.id = content_report.target_id)
        end`,
      ),
    )
    .returning({ id: r.id })
  return rows.length
}

/**
 * À la suppression d'un compte (auth/auth.ts, afterDelete) et chaque nuit (rattrapage) : les
 * signalements ouverts ou classés qui visaient ses contenus, dont l'auteur est donc parti
 * (target_author_id remis à null par la base), passent à « void ». Ceux suivis d'un retrait
 * gardent leur état et leur texte jusqu'au terme d'un an (règle 16). L'index
 * content_report_target_author_idx sert aussi « is null ».
 */
export const voidReportsOfDepartedAuthors = async (db: Database, now: Date) => {
  const rows = await db
    .update(r)
    .set({ status: 'void', decidedAt: now })
    .where(and(isNull(r.targetAuthorId), inArray(r.status, ['open', 'dismissed'])))
    .returning({ id: r.id })
  return rows.length
}

// ─── La file ─────────────────────────────────────────────────────────────────────────────────────

/** Une cible de la file : ses signalements ouverts, regroupés. */
const Group = z.object({
  target_kind: z.string(),
  target_id: z.string(),
  first_at: isoDate.pipe(z.date()),
  last_at: isoDate.pipe(z.date()),
  first_id: z.string(),
  count: z.coerce.number(),
})

/**
 * Une page de la file, du signalement le plus ancien au plus récent : les cibles rangées par leur
 * premier signalement ouvert, puis par l'identifiant de ce signalement (qui départage deux cibles
 * signalées au même instant : un signalement n'appartient qu'à une cible).
 *
 * Un nombre fixe de requêtes, quelle que soit la longueur de la page :
 * 1. les cibles de la page (« group by » sur les signalements ouverts, lus dans l'index partiel
 *    content_report_open_idx, puis triés : la file en attente reste petite) ;
 * 2. tous les signalements ouverts de ces cibles (index content_report_target_idx), avec la copie
 *    du plus récent seulement (tranche 7b, règle 13) ;
 * 3. l'état actuel de chaque cible, une requête par sorte présente sur la page (clés primaires) ;
 * 4. les images des copies encore là, au plus deux requêtes (projets, profils) ;
 * 5. les auteurs visés que l'administrateur a bloqués (règle 17, clé primaire de member_block).
 *
 * La modération ignore les blocages (précision 7) : un auteur qui a bloqué l'administrateur reste
 * dans la file, avec sa copie, et l'administrateur décide quand même.
 */
export const loadQueuePage = async (
  db: Database,
  adminId: string,
  cursor: CursorContent | null,
): Promise<ModerationQueuePage> => {
  // `(a, b) > (c, d)` : une comparaison de couples (voir cursor.ts), dans l'ordre croissant. Le
  // curseur vient du client : il n'entre que par des paramètres liés.
  const afterCursor = cursor
    ? sql`where (g.first_at, g.first_id) > (${utc(cursor.at)}, ${cursor.id}::uuid)`
    : sql``
  // « array_agg(id order by created_at, id) » met les identifiants des signalements dans l'ordre ;
  // [1] prend le premier, celui du plus ancien.
  const result = await db.execute(sql`
    select g.target_kind, g.target_id, to_char(g.first_at, ${ISO}) as first_at,
      to_char(g.last_at, ${ISO}) as last_at, g.first_id::text as first_id, g.count
    from (
      select target_kind, target_id, min(created_at) as first_at, max(created_at) as last_at,
        (array_agg(id order by created_at, id))[1] as first_id, count(*) as count
      from content_report
      where status = 'open'
      group by target_kind, target_id
    ) g
    ${afterCursor}
    order by g.first_at, g.first_id
    limit ${MODERATION_PAGE_SIZE + 1}
  `)
  const groups = z.object({ rows: z.array(Group) }).parse(result).rows
  const page = groups.slice(0, MODERATION_PAGE_SIZE)
  const last = page.at(-1)
  const nextCursor =
    groups.length > MODERATION_PAGE_SIZE && last
      ? encodeCursor({ at: last.first_at.toISOString(), id: last.first_id })
      : null
  if (page.length === 0) return { items: [], nextCursor }

  // La copie n'est ramenée que pour le signalement le plus récent de chaque cible (règle 13, S11) :
  // `row_number() over (partition by … order by …)` numérote les signalements de chaque cible,
  // du plus récent au plus ancien, et `case when … = 1` ne rend la copie que pour le premier. Les
  // autres ne donnent que son empreinte (md5 de son texte : jsonb s'écrit toujours de la même
  // façon, clés rangées, espaces fixes), qui suffit pour dire si les copies diffèrent.
  const newest = sql`row_number() over (partition by ${r.targetKind}, ${r.targetId} order by ${r.createdAt} desc, ${r.id} desc) = 1`
  const reports = await db
    .select({
      targetKind: r.targetKind,
      targetId: r.targetId,
      projectId: r.projectId,
      targetAuthorId: r.targetAuthorId,
      reason: r.reason,
      details: r.details,
      // mapWith : la valeur se lit comme la colonne (du JSON rendu en objet).
      snapshot: sql<unknown>`case when ${newest} then ${r.snapshot} end`.mapWith(r.snapshot),
      // Une copie d'avant 7b d'une note ou d'un commentaire ([{field:'text'}], tout leur texte)
      // compte comme la copie 7b du même texte ([{field:'body'}]) : on la réécrit ainsi avant
      // l'empreinte (tranche 7c, S3). Pour un projet ou un profil, 7a n'en gardait qu'une partie :
      // la copie reste telle quelle, et diffère. `->` sur une copie mal formée rend null, sans
      // erreur ; jsonb_build_object écrit ses clés comme la copie rangée en base.
      snapshotHash: sql<string>`md5((case
        when ${r.targetKind} in ('note', 'comment') and ${r.snapshot}->0->>'field' = 'text'
          and ${r.snapshot}->1 is null
        then jsonb_build_array(jsonb_build_object('field', 'body', 'value', ${r.snapshot}->0->'value'))
        else ${r.snapshot} end)::text)`,
      createdAt: r.createdAt,
    })
    .from(r)
    .where(
      and(
        eq(r.status, 'open'),
        inArray(r.targetKind, [...new Set(page.map((g) => g.target_kind))]),
        inArray(
          r.targetId,
          page.map((g) => g.target_id),
        ),
      ),
    )
    .orderBy(r.createdAt, r.id)

  // Chaque groupe avec sa cible validée, appariés par la clé `kind:id` (tranche 7c) : une ligne
  // invalide en base (identifiant mal formé, sorte inconnue) est écartée avec un avertissement
  // sans donnée personnelle, et ne décale ni les nombres ni les dates des cartes voisines.
  const groupsByKey = new Map<string, z.infer<typeof Group>>()
  const targets = page.flatMap((g) => {
    const parsed = ReportTarget.safeParse({ kind: g.target_kind, id: g.target_id })
    if (!parsed.success) {
      console.warn(`Moderation queue: report ${g.first_id} has an invalid target, left out`)
      return []
    }
    groupsByKey.set(keyOf(parsed.data), g)
    return [parsed.data]
  })
  const states = await statesOf(db, targets)

  // La copie la plus récente de chaque cible, validée entrée par entrée.
  const copies = new Map<string, ReportSnapshot>()
  for (const report of reports) {
    if (report.snapshot === null || report.snapshot === undefined) continue
    copies.set(`${report.targetKind}:${report.targetId}`, readCopy(report.snapshot))
  }
  const present = await imagesStillThere(db, copies)
  // Règle 17 : les auteurs visés que cet administrateur a bloqués (une requête pour la page).
  const authorIds = [
    ...new Set(reports.flatMap((x) => (x.targetAuthorId ? [x.targetAuthorId] : []))),
  ]
  const blocked = await blockedByAdmin(db, adminId, authorIds)
  // Tranche 7c : le rappel des décisions passées pour chaque membre visé (trois requêtes pour la
  // page).
  const records = await authorRecords(db, authorIds, new Date())

  const items = targets.map((target): ModerationQueueItem => {
    const group = groupsByKey.get(keyOf(target))
    const mine = reports.filter((x) => x.targetKind === target.kind && x.targetId === target.id)
    const first = mine[0]
    const copy = copies.get(keyOf(target)) ?? []
    // Le membre visé : l'auteur du contenu, ou le membre lui-même pour un profil ; null si son
    // compte est parti (la base a remis target_author_id à null).
    const memberId = mine.find((x) => x.targetAuthorId !== null)?.targetAuthorId ?? null
    // Les motifs comptés, du plus fréquent au moins fréquent ; à égalité, dans l'ordre où l'appli
    // les propose (ReportReason). Un motif inconnu en base (ligne posée à la main) est laissé de
    // côté plutôt que de faire tomber la file.
    const counts = new Map<ReportReason, number>()
    for (const report of mine) {
      const reason = ReportReason.safeParse(report.reason)
      if (!reason.success) continue
      counts.set(reason.data, (counts.get(reason.data) ?? 0) + 1)
    }
    const order = ReportReason.options
    const reasons = [...counts.entries()]
      .sort(([a, x], [b, y]) => y - x || order.indexOf(a) - order.indexOf(b))
      .map(([reason, count]) => ({ reason, count }))
    return {
      target,
      projectId: first?.projectId ?? null,
      // Les textes de la copie ; ses images à part, sans leur clé : encore là, ou parties depuis.
      authorRecord: memberId === null ? null : recordOf(records, memberId, adminId, blocked),
      snapshot: copy.filter((entry) => !isImageField(entry.field)),
      images: copy.flatMap((entry): SnapshotImage[] =>
        isImageField(entry.field)
          ? [
              {
                field: entry.field,
                state: present.has(`${keyOf(target)}|${entry.value}`) ? 'present' : 'gone',
              },
            ]
          : [],
      ),
      snapshotsDiffer: new Set(mine.map((x) => x.snapshotHash)).size > 1,
      state: states.get(keyOf(target)) ?? 'gone',
      // Son contenu ou son profil, ou celui d'un membre qu'il a bloqué (règle 17) : il n'en décide
      // pas. Que l'auteur ait bloqué l'administrateur ne compte pas (précision 7).
      concernsMe: mine.some(
        (x) =>
          x.targetAuthorId !== null &&
          (x.targetAuthorId === adminId || blocked.has(x.targetAuthorId)),
      ),
      reasons,
      // Les précisions non vides, des plus récentes aux plus anciennes, 20 au plus.
      details: mine
        .flatMap((x) => (x.details ? [x.details] : []))
        .reverse()
        .slice(0, MODERATION_DETAILS_SHOWN),
      count: group?.count ?? mine.length,
      firstReportedAt: (group?.first_at ?? new Date(0)).toISOString(),
      lastReportedAt: (group?.last_at ?? new Date(0)).toISOString(),
    }
  })
  return { items, nextCursor }
}

const keyOf = (target: ReportTarget) => `${target.kind}:${target.id}`

// ─── Le rappel des décisions passées (tranche 7c) ────────────────────────────────────────────────

/** Ce que la modération sait déjà des membres visés par une page de la file. */
type Records = {
  removals: Map<string, number>
  suspensions: Map<string, number>
  suspendedNow: ReadonlySet<string>
  admins: ReadonlySet<string>
}

const MemberCount = z.object({ member_id: z.string(), n: z.coerce.number() })
const MemberSuspensions = z.object({
  member_id: z.string(),
  n: z.coerce.number(),
  active: z.boolean(),
})

/** `in (…)` pour une liste d'identifiants, chacun en paramètre lié. */
const inList = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )

/**
 * Le rappel de chaque membre visé, sur l'année gardée (REPORT_RETENTION_DAYS), en trois requêtes
 * pour toute la page (J10) :
 * 1. ses retraits de l'année, sauf ceux qu'une décision « restore » a suivis sur la même cible.
 *    Index moderation_decision_member_idx (target_member_id, created_at) ; « not exists » cherche
 *    le rétablissement par moderation_decision_target_idx (target_kind, target_id, created_at). Les
 *    colonnes sont écrites avec leur table (d., rs.) : la sous-requête lit la même table ;
 * 2. ses suspensions finies depuis moins d'un an, ou en cours, sauf celles levées pour erreur
 *    (lift_cause de la décision de levée) ; et s'il est suspendu en ce moment : non levée, et
 *    sans fin ou finissant plus tard que `now` (l'heure de JavaScript, `utc`, jamais now() de SQL ;
 *    S10). Index account_suspension_user_idx ;
 * 3. lesquels sont administrateurs en fonction (clé primaire de admin_member).
 */
const authorRecords = async (db: Database, memberIds: string[], now: Date): Promise<Records> => {
  const records: Records = {
    removals: new Map(),
    suspensions: new Map(),
    suspendedNow: new Set(),
    admins: new Set(),
  }
  if (memberIds.length === 0) return records
  const yearAgo = new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY)

  const removals = await db.execute(sql`
    select d.target_member_id as member_id, count(*) as n
    from moderation_decision d
    where d.target_member_id in (${inList(memberIds)})
      and d.action = 'remove'
      and d.created_at > ${utc(yearAgo)}
      and not exists (
        select 1 from moderation_decision rs
        where rs.target_kind = d.target_kind and rs.target_id = d.target_id
          and rs.action = 'restore' and rs.created_at > d.created_at)
    group by d.target_member_id
  `)
  for (const row of z.object({ rows: z.array(MemberCount) }).parse(removals).rows) {
    records.removals.set(row.member_id, row.n)
  }

  const suspensions = await db.execute(sql`
    select s.user_id as member_id,
      count(*) filter (
        where l.lift_cause is distinct from 'error'
          and (coalesce(s.lifted_at, s.ends_at) is null
            or coalesce(s.lifted_at, s.ends_at) > ${utc(yearAgo)})) as n,
      coalesce(bool_or(${activeSuspensionSql('s', now)}), false)
        as active
    from account_suspension s
    left join moderation_decision l on l.id = s.lift_decision_id
    where s.user_id in (${inList(memberIds)})
    group by s.user_id
  `)
  const active = new Set<string>()
  for (const row of z.object({ rows: z.array(MemberSuspensions) }).parse(suspensions).rows) {
    records.suspensions.set(row.member_id, row.n)
    if (row.active) active.add(row.member_id)
  }
  records.suspendedNow = active

  const a = schema.adminMember
  const admins = await db
    .select({ id: a.userId })
    .from(a)
    .where(and(inArray(a.userId, memberIds), isNull(a.revokedAt)))
  records.admins = new Set(admins.map((row) => row.id))
  return records
}

/**
 * Le rappel d'un membre sur une carte. `canSuspend` : faux pour l'administrateur qui regarde
 * lui-même, pour un administrateur en fonction, pour un membre déjà suspendu, et pour un membre que
 * cet administrateur a bloqué (il est concerné : S4, J13 ; la suspension lui serait refusée).
 */
const recordOf = (
  records: Records,
  memberId: string,
  adminId: string,
  blocked: ReadonlySet<string>,
): NonNullable<ModerationQueueItem['authorRecord']> => {
  const suspendedNow = records.suspendedNow.has(memberId)
  return {
    memberId,
    removals: records.removals.get(memberId) ?? 0,
    suspensions: records.suspensions.get(memberId) ?? 0,
    suspendedNow,
    canSuspend:
      memberId !== adminId &&
      !records.admins.has(memberId) &&
      !suspendedNow &&
      !blocked.has(memberId),
  }
}

type ImageField = (typeof IMAGE_INPUT_FIELDS)[number]
const isImageField = (field: MemberInputField): field is ImageField =>
  (IMAGE_INPUT_FIELDS as readonly MemberInputField[]).includes(field)

/**
 * Une copie lue en base, entrée par entrée : `safeParse` vérifie chacune sans lever d'erreur, et
 * une entrée mal formée (écrite à la main, ou par une version future) est laissée de côté au lieu
 * de faire tomber toute la file.
 */
const readCopy = (value: unknown): ReportSnapshot => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const parsed = ReportSnapshotEntry.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * Les images des copies encore là : la même clé toujours affichée sur le projet (une photo ou la
 * couverture) ou comme photo de profil. Une clé est tirée au hasard à chaque envoi : une image
 * remplacée a une autre clé, et compte comme partie. Au plus deux requêtes pour la page, chacune
 * par l'index du propriétaire (project_media_project_idx, clé primaire de profile). Le résultat :
 * « sorte:id|clé ».
 */
const imagesStillThere = async (db: Database, copies: Map<string, ReportSnapshot>) => {
  const present = new Set<string>()
  const withImages = (kind: ReportTarget['kind']) =>
    [...copies.entries()]
      .filter(
        ([key, copy]) => key.startsWith(`${kind}:`) && copy.some((e) => isImageField(e.field)),
      )
      .map(([key]) => key.slice(kind.length + 1))
  const projects = withImages('project')
  if (projects.length > 0) {
    const m = schema.projectMedia
    const rows = await db
      .select({ projectId: m.projectId, key: m.storageKey })
      .from(m)
      .where(inArray(m.projectId, projects))
    for (const row of rows) present.add(`project:${row.projectId}|${row.key}`)
  }
  const members = withImages('member')
  if (members.length > 0) {
    const pr = schema.profile
    const rows = await db
      .select({ userId: pr.userId, key: pr.avatarKey })
      .from(pr)
      .where(inArray(pr.userId, members))
    for (const row of rows) if (row.key) present.add(`member:${row.userId}|${row.key}`)
  }
  return present
}

/**
 * L'état actuel de chaque cible : présente, retirée, ou disparue (absente de la Map). Une requête
 * par sorte, servie par la clé primaire de sa table (inArray : « id in (…) »).
 */
const statesOf = async (db: Database, targets: ReportTarget[]) => {
  const states = new Map<string, 'present' | 'removed'>()
  const idsOf = (kind: ReportTarget['kind']) =>
    targets.filter((t) => t.kind === kind).map((t) => t.id)
  const note = (kind: ReportTarget['kind'], rows: { id: string; removedAt: Date | null }[]) => {
    for (const row of rows) {
      states.set(`${kind}:${row.id}`, row.removedAt === null ? 'present' : 'removed')
    }
  }
  const projects = idsOf('project')
  if (projects.length > 0) {
    const p = schema.project
    note(
      'project',
      await db.select({ id: p.id, removedAt: p.removedAt }).from(p).where(inArray(p.id, projects)),
    )
  }
  const notes = idsOf('note')
  if (notes.length > 0) {
    const n = schema.projectNote
    note(
      'note',
      await db.select({ id: n.id, removedAt: n.removedAt }).from(n).where(inArray(n.id, notes)),
    )
  }
  const comments = idsOf('comment')
  if (comments.length > 0) {
    const c = schema.projectComment
    note(
      'comment',
      await db
        .select({ id: c.id, removedAt: c.removedAt })
        .from(c)
        .where(and(inArray(c.id, comments), isNull(c.deletedAt))),
    )
  }
  const members = idsOf('member')
  if (members.length > 0) {
    const rows = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(inArray(schema.user.id, members))
    note(
      'member',
      rows.map((row) => ({ id: row.id, removedAt: null })),
    )
  }
  return states
}

// ─── Les contenus retirés ────────────────────────────────────────────────────────────────────────

/**
 * Une page des contenus retirés, du plus récent au plus ancien. On part des décisions de retrait
 * (une table petite : purgée au bout d'un an), et chaque contenu est retrouvé par la clé primaire
 * de sa table (targetUuid) ; il n'est gardé que si sa décision de retrait est encore la sienne
 * (removal_id = d.id) : un contenu rétabli, ou supprimé, n'y est plus. Le retrait et sa décision
 * portent la même date (decide.ts) : la page est rangée par (date de la décision, id), et le
 * curseur la reprend là.
 */
export const loadRemovedPage = async (
  db: Database,
  adminId: string,
  cursor: CursorContent | null,
): Promise<RemovedPage> => {
  const p = schema.project
  const n = schema.projectNote
  const c = schema.projectComment
  const id = targetUuid('moderation_decision')
  // L'auteur d'une note est celui de son projet : la table project, une seconde fois, sous un
  // autre nom (« alias » np), pour ne pas la confondre avec celle du projet retiré.
  const np = alias(schema.project, 'np')
  const conditions: (SQL | undefined)[] = [
    eq(d.action, 'remove'),
    or(isNotNull(p.id), isNotNull(n.id), isNotNull(c.id)),
  ]
  // « Après le curseur », dans l'ordre décroissant de la page (cursor.ts).
  if (cursor) conditions.push(after(cursor, d.createdAt, d.id))
  const rows = await db
    .select({
      decisionId: d.id,
      decidedAt: d.createdAt,
      targetKind: d.targetKind,
      targetId: d.targetId,
      ground: d.ground,
      explanation: d.explanation,
      projectTitle: p.title,
      projectPitch: p.pitch,
      projectAuthorId: p.authorId,
      projectRemovedAt: p.removedAt,
      noteBody: n.body,
      noteProjectId: n.projectId,
      noteAuthorId: np.authorId,
      noteRemovedAt: n.removedAt,
      commentBody: c.body,
      commentProjectId: c.projectId,
      commentAuthorId: c.authorId,
      commentRemovedAt: c.removedAt,
    })
    .from(d)
    .leftJoin(
      p,
      and(eq(d.targetKind, 'project'), sql`${p.id} = ${id}`, sql`${p.removalId} = ${d.id}`),
    )
    .leftJoin(n, and(eq(d.targetKind, 'note'), sql`${n.id} = ${id}`, sql`${n.removalId} = ${d.id}`))
    .leftJoin(np, eq(np.id, n.projectId))
    .leftJoin(
      c,
      and(eq(d.targetKind, 'comment'), sql`${c.id} = ${id}`, sql`${c.removalId} = ${d.id}`),
    )
    .where(and(...conditions))
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(MODERATION_PAGE_SIZE + 1)

  const page = rows.slice(0, MODERATION_PAGE_SIZE)
  const last = page.at(-1)
  const nextCursor =
    rows.length > MODERATION_PAGE_SIZE && last
      ? encodeCursor({ at: last.decidedAt.toISOString(), id: last.decisionId })
      : null

  // « Te concerne » (règle 17 de 7b, comme dans la file) : son contenu, ou celui d'un membre qu'il
  // a bloqué ; rétablir lui est alors refusé (decide.ts). Une requête pour toute la page.
  const authors = page.flatMap((row) =>
    [row.projectAuthorId, row.noteAuthorId, row.commentAuthorId].filter(
      (id): id is string => id !== null,
    ),
  )
  const blocked = await blockedByAdmin(db, adminId, [...new Set(authors)])
  const concerns = (authorId: string | null) =>
    authorId !== null && (authorId === adminId || blocked.has(authorId))

  const items = page.flatMap((row): RemovedItem[] => {
    const target = ReportTarget.safeParse({ kind: row.targetKind, id: row.targetId })
    // safeParse plutôt que parse (tranche 7c) : un fondement inconnu en base écarte la ligne, pas
    // toute la page.
    const ground = RemovalGround.safeParse(row.ground)
    if (!target.success || !ground.success || row.explanation === null) return []
    const base = { target: target.data, ground: ground.data, explanation: row.explanation }
    if (row.projectTitle !== null && row.projectRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.targetId,
          text: `${row.projectTitle}\n\n${row.projectPitch ?? ''}`,
          removedAt: row.projectRemovedAt.toISOString(),
          concernsMe: concerns(row.projectAuthorId),
        },
      ]
    }
    if (row.noteBody !== null && row.noteRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.noteProjectId,
          text: row.noteBody,
          removedAt: row.noteRemovedAt.toISOString(),
          concernsMe: concerns(row.noteAuthorId),
        },
      ]
    }
    if (row.commentBody !== null && row.commentRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.commentProjectId,
          text: row.commentBody,
          removedAt: row.commentRemovedAt.toISOString(),
          concernsMe: concerns(row.commentAuthorId),
        },
      ]
    }
    return []
  })
  return { items, nextCursor }
}
