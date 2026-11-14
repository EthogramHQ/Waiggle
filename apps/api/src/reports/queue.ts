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
  ReportPartField,
  ReportReason,
  type ReportSnapshot,
  ReportSnapshotEntry,
  type SnapshotImage,
  StoredReportTarget,
  Thumbhash,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { isoDate } from '../jobs/shared'
import { utc } from '../notifications/load'
import { mediaUrl } from '../profile/me'
import { mediaOnCoversSql } from '../projects/media-visibility'
import { activeSuspensionSql } from '../suspension/load'
import { readLines } from '../updates/load'
import { blockedByAdmin } from './decide'
import { photoRankSql } from './part-rank'
import { targetUuid, updateText } from './target'

const r = schema.contentReport
const d = schema.moderationDecision
const ISO = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
const DAY = 24 * 60 * 60 * 1000
/** La forme d'un uuid, pour une expression régulière de PostgreSQL (« ~ »). Écrite ici, jamais reçue. */
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

// ─── Classer « sans objet » ──────────────────────────────────────────────────────────────────────

/**
 * Les signalements ouverts dont la cible n'existe plus (projet, mise à jour ou commentaire supprimé
 * par son auteur, appel ou message du coin des testeurs effacé, compte supprimé, ancienne note du
 * Journal, ou photo supprimée quand le signalement ne visait qu'elle) passent à « void », datés de
 * `now` : la purge les efface 30 jours
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
        or(
          sql`case content_report.target_kind
            when 'project' then not exists (select 1 from project p where p.id = ${id})
            when 'update' then not exists (select 1 from project_update u where u.id = ${id})
            when 'note' then true
            when 'comment' then not exists (
              select 1 from project_comment c where c.id = ${id} and c.deleted_at is null)
            when 'call' then not exists (select 1 from tester_call tc where tc.id = ${id})
            when 'message' then not exists (select 1 from tester_message tm where tm.id = ${id})
            else not exists (select 1 from "user" u where u.id = content_report.target_id)
          end`,
          // R9 (relecture juridique, jur-B1) : une photo supprimée par son auteur (sa photo, sa
          // couverture ou sa description) ne laisse aucune ligne dans project_media ni dans
          // tester_media ; sans cette condition, le signalement de cette seule partie resterait
          // ouvert pour toujours (retirer et classer répondent 404), avec le motif, la précision et
          // la copie. Les deux tables se cherchent par leur clé primaire. Un retrait de la
          // modération, lui, garde la ligne (elle est seulement marquée) : il n'entre pas ici.
          sql`(content_report.part_media_id is not null
            and not exists (
              select 1 from project_media pm where pm.id = content_report.part_media_id)
            and not exists (
              select 1 from tester_media tmd where tmd.id = content_report.part_media_id))`,
        ),
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

/**
 * Un élément de la file : les signalements ouverts d'une cible, regroupés. R9 : d'une cible ET d'une
 * partie (le projet entier et sa 2e photo font deux éléments) ; `part_field` null pour le contenu
 * entier. `part_position` : le rang de la photo visée (part-rank.ts).
 */
const Group = z.object({
  target_kind: z.string(),
  target_id: z.string(),
  part_field: z.string().nullable(),
  part_media_id: z.string().nullable(),
  part_position: z.number().int().positive().nullable(),
  first_at: isoDate.pipe(z.date()),
  last_at: isoDate.pipe(z.date()),
  first_id: z.string(),
  count: z.coerce.number(),
})
type Group = z.infer<typeof Group>

/** La clé d'un élément : sa cible, puis sa partie (vide pour le contenu entier). */
const itemKey = (
  target: StoredReportTarget,
  partField: string | null,
  partMediaId: string | null,
) => `${keyOf(target)}|${partField ?? ''}|${partMediaId ?? ''}`

/** La partie d'un élément, validée par le contrat ; null pour le contenu entier. */
const partOut = (field: string | null, mediaId: string | null, position: number | null) => {
  const parsed = ReportPartField.safeParse(field)
  if (!parsed.success) return null
  return { field: parsed.data, mediaId, position: mediaId === null ? null : position }
}

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
 * 4. les images des copies encore là, au plus cinq requêtes (projets, mises à jour, profils, appels
 *    et messages du coin des testeurs) ;
 * 5. les auteurs visés que l'administrateur a bloqués (règle 17, clé primaire de member_block).
 *
 * La modération ignore les blocages (précision 7) : un auteur qui a bloqué l'administrateur reste
 * dans la file, avec sa copie, et l'administrateur décide quand même.
 */
export const loadQueuePage = async (
  db: Database,
  adminId: string,
  cursor: CursorContent | null,
  publicApiUrl: string,
): Promise<ModerationQueuePage> => {
  // `(a, b) > (c, d)` : une comparaison de couples (voir cursor.ts), dans l'ordre croissant. Le
  // curseur vient du client : il n'entre que par des paramètres liés.
  const afterCursor = cursor
    ? sql`where (g.first_at, g.first_id) > (${utc(cursor.at)}, ${cursor.id}::uuid)`
    : sql``
  // « array_agg(id order by created_at, id) » met les identifiants des signalements dans l'ordre ;
  // [1] prend le premier, celui du plus ancien. R9 : un groupe par cible et par partie ; le rang de
  // la photo visée n'est calculé que pour les lignes de la page (après « limit »).
  const result = await db.execute(sql`
    select g.target_kind, g.target_id, g.part_field, g.part_media_id::text as part_media_id,
      case when g.part_media_id is not null then ${photoRankSql(sql.raw('g.part_media_id'))} end
        as part_position,
      to_char(g.first_at, ${ISO}) as first_at,
      to_char(g.last_at, ${ISO}) as last_at, g.first_id::text as first_id, g.count
    from (
      select target_kind, target_id, part_field, part_media_id, min(created_at) as first_at,
        max(created_at) as last_at,
        (array_agg(id order by created_at, id))[1] as first_id, count(*) as count
      from content_report
      where status = 'open'
      group by target_kind, target_id, part_field, part_media_id
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
  // R9 : la copie la plus récente de chaque élément, donc de chaque partie.
  const newest = sql`row_number() over (partition by ${r.targetKind}, ${r.targetId}, ${r.partField}, ${r.partMediaId} order by ${r.createdAt} desc, ${r.id} desc) = 1`
  const reports = await db
    .select({
      targetKind: r.targetKind,
      targetId: r.targetId,
      partField: r.partField,
      partMediaId: r.partMediaId,
      projectId: r.projectId,
      targetAuthorId: r.targetAuthorId,
      reason: r.reason,
      details: r.details,
      // mapWith : la valeur se lit comme la colonne (du JSON rendu en objet).
      snapshot: sql<unknown>`case when ${newest} then ${r.snapshot} end`.mapWith(r.snapshot),
      // Une copie d'avant 7b d'un commentaire ([{field:'text'}], tout leur texte)
      // compte comme la copie 7b du même texte ([{field:'body'}]) : on la réécrit ainsi avant
      // l'empreinte (tranche 7c, S3). Pour un projet ou un profil, 7a n'en gardait qu'une partie :
      // la copie reste telle quelle, et diffère. `->` sur une copie mal formée rend null, sans
      // erreur ; jsonb_build_object écrit ses clés comme la copie rangée en base.
      snapshotHash: sql<string>`md5((case
        when ${r.targetKind} = 'comment' and ${r.snapshot}->0->>'field' = 'text'
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
  const items = page.flatMap((g) => {
    // StoredReportTarget : une cible `note` d'avant R7a se lit encore, comme une cible disparue.
    const parsed = StoredReportTarget.safeParse({ kind: g.target_kind, id: g.target_id })
    if (!parsed.success) {
      console.warn(`Moderation queue: report ${g.first_id} has an invalid target, left out`)
      return []
    }
    return [{ target: parsed.data, group: g }]
  })
  // Une cible a pu être signalée entière et par parties : son état ne se lit qu'une fois.
  const targets = [...new Map(items.map(({ target }) => [keyOf(target), target])).values()]
  const states = await statesOf(db, targets)

  // La copie la plus récente de chaque élément, validée entrée par entrée ; et, pour les images
  // encore là, toutes les copies d'une même cible ensemble (imagesStillThere cherche par cible).
  const copies = new Map<string, ReportSnapshot>()
  const copiesOfTargets = new Map<string, ReportSnapshot>()
  for (const report of reports) {
    if (report.snapshot === null || report.snapshot === undefined) continue
    const copy = readCopy(report.snapshot)
    const target = `${report.targetKind}:${report.targetId}`
    copies.set(`${target}|${report.partField ?? ''}|${report.partMediaId ?? ''}`, copy)
    copiesOfTargets.set(target, [...(copiesOfTargets.get(target) ?? []), ...copy])
  }
  const present = await imagesStillThere(db, copiesOfTargets)
  // Règle 17 : les auteurs visés que cet administrateur a bloqués (une requête pour la page).
  const authorIds = [
    ...new Set(reports.flatMap((x) => (x.targetAuthorId ? [x.targetAuthorId] : []))),
  ]
  const blocked = await blockedByAdmin(db, adminId, authorIds)
  // Tranche 7c : le rappel des décisions passées pour chaque membre visé (quatre requêtes pour la
  // page).
  const records = await authorRecords(db, authorIds, new Date())
  // R9 (ui-P1) : le projet qui porte chaque cible (une requête pour la page).
  const contexts = await projectContexts(
    db,
    [...new Set(reports.flatMap((x) => (x.projectId ? [x.projectId] : [])))],
    publicApiUrl,
  )

  const contextOf = (projectId: string | null, kind: StoredReportTarget['kind']) => {
    const context = projectId === null ? undefined : contexts.get(projectId)
    if (!context) return null
    return kind === 'project' ? { ...context, image: null } : context
  }

  const toItem = (target: StoredReportTarget, group: Group): ModerationQueueItem => {
    const mine = reports.filter(
      (x) =>
        x.targetKind === target.kind &&
        x.targetId === target.id &&
        x.partField === group.part_field &&
        x.partMediaId === group.part_media_id,
    )
    const first = mine[0]
    const copy = copies.get(itemKey(target, group.part_field, group.part_media_id)) ?? []
    const state = states.get(keyOf(target))
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
    const projectId = first?.projectId ?? null
    return {
      target,
      // R9 : la partie signalée, et le rang de sa photo ; null : le contenu entier.
      part: partOut(group.part_field, group.part_media_id, group.part_position),
      // R9 (ui-P1) : le projet porteur (le projet lui-même pour un projet) ; null pour un profil, ou
      // un projet supprimé depuis.
      // Pour un projet signalé lui-même, sans miniature : sa couverture est une image de la copie,
      // que la file montre sans sa clé (tranche 7b, « without its key ») ; la miniature sert à
      // situer un commentaire, une mise à jour, un appel ou un message.
      context: contextOf(projectId, target.kind),
      // R9 : la date de publication de la cible ; null si elle a disparu.
      contentCreatedAt: state?.createdAt.toISOString() ?? null,
      projectId,
      // Les textes de la copie ; ses images à part, sans leur clé : encore là, ou parties depuis.
      authorRecord: memberId === null ? null : recordOf(records, memberId, adminId, blocked),
      snapshot: copy.filter((entry) => !isImageField(entry.field)),
      images: copy.flatMap((entry): SnapshotImage[] => {
        if (!isImageField(entry.field)) return []
        const here = present.has(`${keyOf(target)}|${entry.value}`)
        // R7b (décision 4 de Louis) : l'adresse de la capture ou de la photo d'appel visée, tant que
        // son signalement est ouvert (la file ne liste que ceux-là) et qu'elle est encore là. Jamais
        // celle d'une autre image du fil : la copie ne nomme que l'image de l'objet signalé.
        const coin = target.kind === 'call' || target.kind === 'message'
        return [
          {
            field: entry.field,
            state: here ? 'present' : 'gone',
            ...(coin && here ? { url: mediaUrl(publicApiUrl, entry.value) } : {}),
          },
        ]
      }),
      snapshotsDiffer: new Set(mine.map((x) => x.snapshotHash)).size > 1,
      // L'état de la cible, pour le contenu entier comme pour une de ses parties : une partie déjà
      // retirée n'a plus de signalement ouvert (le retrait les clôt, le signalement la refuse).
      state: state?.state ?? 'gone',
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
      count: group.count,
      firstReportedAt: group.first_at.toISOString(),
      lastReportedAt: group.last_at.toISOString(),
    }
  }
  return { items: items.map(({ target, group }) => toItem(target, group)), nextCursor }
}

/**
 * Le projet porteur de chaque cible de la page (R9, ui-P1) : son titre et sa miniature, la première
 * photo de sa galerie dans l'ordre de l'auteur, sinon sa couverture verticale (la règle des
 * notifications, R8). Une requête : les projets par leur clé primaire, et pour chacun, par une
 * sous-requête « lateral » limitée à une ligne, ses photos par project_media_project_idx (project_id,
 * slot, position). Un projet supprimé depuis n'y est pas : son contexte est null.
 */
const projectContexts = async (db: Database, projectIds: string[], publicApiUrl: string) => {
  const contexts = new Map<string, NonNullable<ModerationQueueItem['context']>>()
  if (projectIds.length === 0) return contexts
  const result = await db.execute(sql`
    select p.id::text as id, p.title, cover.storage_key, cover.thumbhash
    from project p
    left join lateral (
      select m.storage_key, m.thumbhash from project_media m
      where m.project_id = p.id and m.slot in ('gallery', 'portrait')
        -- R9 : jamais une photo retirée seule par la modération (projects/media-visibility.ts) :
        -- la miniature est la 1re photo visible.
        and ${mediaOnCoversSql('m')}
      order by m.slot = 'portrait', m.position, m.created_at
      limit 1
    ) cover on true
    where p.id in (${inList(projectIds)})
  `)
  const rows = z
    .object({
      rows: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          storage_key: z.string().nullable(),
          thumbhash: z.string().nullable(),
        }),
      ),
    })
    .parse(result).rows
  for (const row of rows) {
    const thumbhash = Thumbhash.safeParse(row.thumbhash)
    contexts.set(row.id, {
      projectId: row.id,
      title: row.title,
      image:
        row.storage_key !== null && thumbhash.success
          ? { url: mediaUrl(publicApiUrl, row.storage_key), thumbhash: thumbhash.data }
          : null,
    })
  }
  return contexts
}

const keyOf = (target: StoredReportTarget) => `${target.kind}:${target.id}`

// ─── Le rappel des décisions passées (tranche 7c) ────────────────────────────────────────────────

/** Ce que la modération sait déjà des membres visés par une page de la file. */
type Records = {
  removals: Map<string, number>
  suspensions: Map<string, number>
  suspendedNow: ReadonlySet<string>
  admins: ReadonlySet<string>
  // Le nom, le pseudo actuel et la date d'inscription de chaque membre (la carte du membre visé).
  // R9 : et ses nombres de projets et de commentaires.
  cards: Map<
    string,
    { name: string; handle: string; joinedAt: string; projectCount: number; commentCount: number }
  >
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
/**
 * R9 (relecture juridique P4) : un rétablissement `rs` défait le retrait `d` s'il vise la même
 * partie : le contenu entier pour un retrait entier, le même champ pour une partie, la même image
 * pour une photo (qu'elle ait été retirée comme couverture ou comme photo, moderation/parts.ts).
 * Rétablir une partie ne défait donc jamais le retrait du contenu entier, ni l'inverse.
 * « is not distinct from » : l'égalité qui tient aussi entre deux null (le contenu entier).
 */
const samePartSql = sql.raw(`(case when d.part_field in ('cover', 'photo')
  then rs.part_field in ('cover', 'photo') and rs.part_media_id = d.part_media_id
  else rs.part_field is not distinct from d.part_field
    and rs.part_media_id is not distinct from d.part_media_id end)`)

const authorRecords = async (db: Database, memberIds: string[], now: Date): Promise<Records> => {
  const records: Records = {
    removals: new Map(),
    suspensions: new Map(),
    suspendedNow: new Set(),
    admins: new Set(),
    cards: new Map(),
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
          and rs.action = 'restore' and rs.created_at > d.created_at
          and ${samePartSql})
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

  // 4. sa carte : son nom et sa date d'inscription (table user), son pseudo actuel (la ligne de
  // member_handle sans date de fin). left join : un membre sans pseudo n'est pas écarté. R9 : ses
  // nombres de projets (tous : privés et retirés compris ; un projet supprimé n'a plus de ligne) et
  // de commentaires non supprimés, chacun par une sous-requête « count » servie par l'index de
  // l'auteur (project_author_created_idx, project_comment_author_idx). La colonne est écrite avec
  // sa table (sql.raw) : la sous-requête lit d'autres tables.
  const u = schema.user
  const h = schema.memberHandle
  const memberId = sql.raw('"user"."id"')
  const cards = await db
    .select({
      id: u.id,
      name: u.name,
      joinedAt: u.createdAt,
      handle: h.handle,
      projectCount: sql<number>`(select count(*)::int from project p where p.author_id = ${memberId})`,
      commentCount: sql<number>`(select count(*)::int from project_comment c
        where c.author_id = ${memberId} and c.deleted_at is null)`,
    })
    .from(u)
    .leftJoin(h, and(eq(h.userId, u.id), isNull(h.releasedAt)))
    .where(inArray(u.id, memberIds))
  for (const card of cards) {
    records.cards.set(card.id, {
      name: card.name,
      handle: card.handle ?? '',
      joinedAt: card.joinedAt.toISOString(),
      projectCount: card.projectCount,
      commentCount: card.commentCount,
    })
  }
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
  const card = records.cards.get(memberId)
  return {
    memberId,
    name: card?.name ?? '',
    handle: card?.handle ?? '',
    joinedAt: card?.joinedAt ?? new Date(0).toISOString(),
    projectCount: card?.projectCount ?? 0,
    commentCount: card?.commentCount ?? 0,
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
 * remplacée a une autre clé, et compte comme partie. Au plus trois requêtes pour la page, chacune
 * par l'index du propriétaire (project_media_project_idx, project_media_update_idx, clé primaire de
 * profile). Les photos d'un projet sont celles de sa galerie et de sa couverture, jamais celles de
 * ses mises à jour (relecture de sécurité A8). Le résultat :
 * « sorte:id|clé ».
 */
const imagesStillThere = async (db: Database, copies: Map<string, ReportSnapshot>) => {
  const present = new Set<string>()
  const withImages = (kind: StoredReportTarget['kind']) =>
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
      .where(and(inArray(m.projectId, projects), inArray(m.slot, ['gallery', 'portrait'])))
    for (const row of rows) present.add(`project:${row.projectId}|${row.key}`)
  }
  const updates = withImages('update')
  if (updates.length > 0) {
    const m = schema.projectMedia
    const rows = await db
      .select({ updateId: m.updateId, key: m.storageKey })
      .from(m)
      .where(inArray(m.updateId, updates))
    for (const row of rows) present.add(`update:${row.updateId}|${row.key}`)
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
  // R7b : la photo d'un appel et la capture d'un message du coin des testeurs. Une ligne de
  // tester_media est rattachée à un appel (call_id) ou à un message (message_id) : chaque requête
  // passe par l'index de sa colonne (tester_media_call_idx, tester_media_message_idx). Une photo
  // remplacée ou effacée n'est plus rattachée : sa clé est « partie ».
  const calls = withImages('call')
  if (calls.length > 0) {
    const tm = schema.testerMedia
    const rows = await db
      .select({ callId: tm.callId, key: tm.storageKey })
      .from(tm)
      .where(inArray(tm.callId, calls))
    for (const row of rows) present.add(`call:${row.callId}|${row.key}`)
  }
  const messages = withImages('message')
  if (messages.length > 0) {
    const tm = schema.testerMedia
    const rows = await db
      .select({ messageId: tm.messageId, key: tm.storageKey })
      .from(tm)
      .where(inArray(tm.messageId, messages))
    for (const row of rows) present.add(`message:${row.messageId}|${row.key}`)
  }
  return present
}

/**
 * L'état actuel de chaque cible : présente, retirée, ou disparue (absente de la Map), et sa date de
 * publication (R9 : `contentCreatedAt` ; l'inscription pour un profil). Une requête par sorte,
 * servie par la clé primaire de sa table (inArray : « id in (…) »).
 */
const statesOf = async (db: Database, targets: StoredReportTarget[]) => {
  const states = new Map<string, { state: 'present' | 'removed'; createdAt: Date }>()
  const idsOf = (kind: StoredReportTarget['kind']) =>
    targets.filter((t) => t.kind === kind).map((t) => t.id)
  const note = (
    kind: StoredReportTarget['kind'],
    rows: { id: string; removedAt: Date | null; createdAt: Date }[],
  ) => {
    for (const row of rows) {
      states.set(`${kind}:${row.id}`, {
        state: row.removedAt === null ? 'present' : 'removed',
        createdAt: row.createdAt,
      })
    }
  }
  const projects = idsOf('project')
  if (projects.length > 0) {
    const p = schema.project
    note(
      'project',
      await db
        .select({ id: p.id, removedAt: p.removedAt, createdAt: p.createdAt })
        .from(p)
        .where(inArray(p.id, projects)),
    )
  }
  // Une cible `note` n'a plus d'état : elle reste absente de la Map, donc « disparue ».
  const updates = idsOf('update')
  if (updates.length > 0) {
    const u = schema.projectUpdate
    note(
      'update',
      await db
        .select({ id: u.id, removedAt: u.removedAt, createdAt: u.createdAt })
        .from(u)
        .where(inArray(u.id, updates)),
    )
  }
  const comments = idsOf('comment')
  if (comments.length > 0) {
    const c = schema.projectComment
    note(
      'comment',
      await db
        .select({ id: c.id, removedAt: c.removedAt, createdAt: c.createdAt })
        .from(c)
        .where(and(inArray(c.id, comments), isNull(c.deletedAt))),
    )
  }
  // R7b : un appel ou un message du coin des testeurs, par la clé primaire de sa table.
  const calls = idsOf('call')
  if (calls.length > 0) {
    const tc = schema.testerCall
    note(
      'call',
      await db
        .select({ id: tc.id, removedAt: tc.removedAt, createdAt: tc.createdAt })
        .from(tc)
        .where(inArray(tc.id, calls)),
    )
  }
  const messages = idsOf('message')
  if (messages.length > 0) {
    const tm = schema.testerMessage
    note(
      'message',
      await db
        .select({ id: tm.id, removedAt: tm.removedAt, createdAt: tm.createdAt })
        .from(tm)
        .where(inArray(tm.id, messages)),
    )
  }
  const members = idsOf('member')
  if (members.length > 0) {
    const rows = await db
      .select({ id: schema.user.id, createdAt: schema.user.createdAt })
      .from(schema.user)
      .where(inArray(schema.user.id, members))
    note(
      'member',
      rows.map((row) => ({ ...row, removedAt: null })),
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
  const u = schema.projectUpdate
  const c = schema.projectComment
  const tc = schema.testerCall
  const tm = schema.testerMessage
  const id = targetUuid('moderation_decision')
  // L'auteur d'une mise à jour est celui de son projet : la table project, une seconde fois, sous un
  // autre nom (« alias » up), pour ne pas la confondre avec celle du projet retiré.
  const up = alias(schema.project, 'up')
  // De même pour l'auteur d'un appel : celui de son projet (sous le nom « cp »).
  const cp = alias(schema.project, 'cp')
  // R9 : une partie retirée seule. Sa ligne de retrait en cours (content_part_removal_removal_idx),
  // ou, pour un nom ou un pseudo (sans ligne), aucun rétablissement de ce champ depuis (« not
  // exists », par moderation_decision_target_idx). Le membre d'un profil, par la clé primaire de user.
  const cpr = schema.contentPartRemoval
  const mu = alias(schema.user, 'mu')
  const mh = alias(schema.memberHandle, 'mh')
  const partStillRemoved = sql`(${cpr.id} is not null or (${d.targetKind} = 'member'
    and ${d.partField} in ('name', 'handle') and not exists (
      select 1 from moderation_decision rs
      where rs.target_kind = 'member' and rs.target_id = ${d.targetId}
        and rs.part_field = ${d.partField} and rs.action = 'restore'
        and rs.created_at > ${d.createdAt})))`
  // Le contenu d'une décision : retiré par elle (contenu entier), ou qui porte encore la partie
  // qu'elle a retirée (le contenu lui-même reste affiché).
  const wholeOrCurrentPart = (removalId: SQLWrapper) =>
    sql`((${d.partField} is null and ${removalId} = ${d.id}) or (${d.partField} is not null and ${partStillRemoved}))`
  const conditions: (SQL | undefined)[] = [
    eq(d.action, 'remove'),
    or(
      isNotNull(p.id),
      isNotNull(u.id),
      isNotNull(c.id),
      isNotNull(tc.id),
      isNotNull(tm.id),
      isNotNull(mu.id),
    ),
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
      updateTitle: u.title,
      updateLines: u.lines,
      updateProjectId: u.projectId,
      updateAuthorId: up.authorId,
      updateRemovedAt: u.removedAt,
      commentBody: c.body,
      commentProjectId: c.projectId,
      commentAuthorId: c.authorId,
      commentRemovedAt: c.removedAt,
      callText: tc.text,
      callProjectId: tc.projectId,
      callAuthorId: cp.authorId,
      callRemovedAt: tc.removedAt,
      messageText: tm.text,
      messageProjectId: tm.projectId,
      messageSenderId: tm.senderId,
      messageRemovedAt: tm.removedAt,
      // R9 : la partie, sa photo et son rang ; le membre d'un profil.
      partField: d.partField,
      partMediaId: d.partMediaId,
      partPosition: photoRankSql(sql.raw('"moderation_decision"."part_media_id"')),
      memberId: mu.id,
      memberName: mu.name,
      memberHandle: mh.handle,
    })
    .from(d)
    // R9 : la ligne du retrait en cours d'une partie (index content_part_removal_removal_idx).
    .leftJoin(cpr, eq(cpr.removalId, d.id))
    .leftJoin(
      p,
      and(eq(d.targetKind, 'project'), sql`${p.id} = ${id}`, wholeOrCurrentPart(p.removalId)),
    )
    .leftJoin(
      u,
      and(eq(d.targetKind, 'update'), sql`${u.id} = ${id}`, wholeOrCurrentPart(u.removalId)),
    )
    .leftJoin(up, eq(up.id, u.projectId))
    // R7b : un appel ou un message retiré, retrouvé par la clé primaire de sa table, tant que sa
    // décision de retrait est encore la sienne.
    .leftJoin(
      tc,
      and(eq(d.targetKind, 'call'), sql`${tc.id} = ${id}`, wholeOrCurrentPart(tc.removalId)),
    )
    .leftJoin(cp, eq(cp.id, tc.projectId))
    .leftJoin(
      tm,
      and(eq(d.targetKind, 'message'), sql`${tm.id} = ${id}`, wholeOrCurrentPart(tm.removalId)),
    )
    .leftJoin(
      c,
      and(eq(d.targetKind, 'comment'), sql`${c.id} = ${id}`, sql`${c.removalId} = ${d.id}`),
    )
    // R9 : un profil n'est retiré que par parties ; son membre, et son pseudo actuel.
    .leftJoin(
      mu,
      and(
        eq(d.targetKind, 'member'),
        eq(mu.id, d.targetId),
        isNotNull(d.partField),
        partStillRemoved,
      ),
    )
    .leftJoin(mh, and(eq(mh.userId, mu.id), isNull(mh.releasedAt)))
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
    [
      row.projectAuthorId,
      row.updateAuthorId,
      row.commentAuthorId,
      row.callAuthorId,
      row.messageSenderId,
      row.memberId,
    ].filter((id): id is string => id !== null),
  )
  const blocked = await blockedByAdmin(db, adminId, [...new Set(authors)])
  const concerns = (authorId: string | null) =>
    authorId !== null && (authorId === adminId || blocked.has(authorId))

  const items = page.flatMap((row): RemovedItem[] => {
    const target = StoredReportTarget.safeParse({ kind: row.targetKind, id: row.targetId })
    // safeParse plutôt que parse (tranche 7c) : un fondement inconnu en base écarte la ligne, pas
    // toute la page.
    const ground = RemovalGround.safeParse(row.ground)
    if (!target.success || !ground.success || row.explanation === null) return []
    // R9 : une partie retirée seule (la requête n'a gardé que celles dont le retrait dure) ; son
    // contenu, lui, n'est pas retiré : la date est celle de la décision.
    const part = partOut(row.partField, row.partMediaId, row.partPosition)
    const base = { target: target.data, part, ground: ground.data, explanation: row.explanation }
    const removedAt = (contentRemovedAt: Date | null) =>
      part !== null ? row.decidedAt : contentRemovedAt
    // Le profil d'un membre (R9) : seulement par parties ; son texte est son nom et son pseudo
    // actuels, comme sur la page « Signaler ».
    if (part !== null && row.memberId !== null && row.memberName !== null) {
      return [
        {
          ...base,
          projectId: null,
          text:
            row.memberHandle === null ? row.memberName : `${row.memberName} (@${row.memberHandle})`,
          removedAt: row.decidedAt.toISOString(),
          concernsMe: concerns(row.memberId),
        },
      ]
    }
    const projectRemovedAt = removedAt(row.projectRemovedAt)
    if (row.projectTitle !== null && projectRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.targetId,
          text: `${row.projectTitle}\n\n${row.projectPitch ?? ''}`,
          removedAt: projectRemovedAt.toISOString(),
          concernsMe: concerns(row.projectAuthorId),
        },
      ]
    }
    const updateRemovedAt = removedAt(row.updateRemovedAt)
    if (row.updateLines !== null && updateRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.updateProjectId,
          text: updateText(row.updateTitle, readLines(row.updateLines)),
          removedAt: updateRemovedAt.toISOString(),
          concernsMe: concerns(row.updateAuthorId),
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
    const callRemovedAt = removedAt(row.callRemovedAt)
    if (row.callText !== null && callRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.callProjectId,
          text: row.callText,
          removedAt: callRemovedAt.toISOString(),
          concernsMe: concerns(row.callAuthorId),
        },
      ]
    }
    // Le texte d'un retour peut manquer (une capture seule) : on se fie à la date de retrait.
    const messageRemovedAt = removedAt(row.messageRemovedAt)
    if (row.messageProjectId !== null && messageRemovedAt !== null) {
      return [
        {
          ...base,
          projectId: row.messageProjectId,
          text: row.messageText ?? '',
          removedAt: messageRemovedAt.toISOString(),
          concernsMe: concerns(row.messageSenderId),
        },
      ]
    }
    return []
  })
  return { items, nextCursor }
}
