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
import { blockedByAdmin } from './decide'
import { targetUuid } from './target'

const r = schema.contentReport
const d = schema.moderationDecision
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'

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
  const id = targetUuid('content_report')
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
      snapshotHash: sql<string>`md5(${r.snapshot}::text)`,
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

  const targets = page.flatMap((g) => {
    const parsed = ReportTarget.safeParse({ kind: g.target_kind, id: g.target_id })
    return parsed.success ? [parsed.data] : []
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

  const items = targets.map((target, index): ModerationQueueItem => {
    const group = page[index]
    const mine = reports.filter((x) => x.targetKind === target.kind && x.targetId === target.id)
    const first = mine[0]
    const copy = copies.get(keyOf(target)) ?? []
    // Les motifs comptés, du plus fréquent au moins fréquent ; à égalité, dans l'ordre où l'appli
    // les propose (ReportReason).
    const counts = new Map<ReportReason, number>()
    for (const report of mine) {
      const reason = ReportReason.parse(report.reason)
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
    const order = ReportReason.options
    const reasons = [...counts.entries()]
      .sort(([a, x], [b, y]) => y - x || order.indexOf(a) - order.indexOf(b))
      .map(([reason, count]) => ({ reason, count }))
    return {
      target,
      projectId: first?.projectId ?? null,
      // Les textes de la copie ; ses images à part, sans leur clé : encore là, ou parties depuis.
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
    if (!target.success || row.ground === null || row.explanation === null) return []
    const ground = RemovalGround.parse(row.ground)
    const base = { target: target.data, ground, explanation: row.explanation }
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
