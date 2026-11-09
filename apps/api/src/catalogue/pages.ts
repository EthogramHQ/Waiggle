// Les lectures de l'administration du catalogue (tranche R6b, plan B3) : « À vérifier » (les
// « Autre »), le catalogue à modifier, « À ranger » (les projets classés « Autre ») et « Changements
// récents ». Chaque liste se lit en un nombre fixe de requêtes, 20 lignes par page, la suivante par
// son curseur `(date, id)`. Les projets montrés sont ceux que les membres voient, sans filtre de
// blocage (`listedVerifiedProject`, décision 1) : jamais un projet privé ou retiré, ni son titre.
import {
  type AdminCatalogueTool,
  CATALOGUE_PAGE_SIZE,
  type CatalogueChange,
  type CatalogueChangeAction,
  foldTool,
  OTHER_CATEGORY,
  PENDING_TOOL_PROJECTS_SHOWN,
  type PendingTool,
  type ToolFamily,
  type UncategorizedProject,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import type { Language } from '@ruche/i18n'
import { and, asc, desc, eq, inArray, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { memberWithPage } from '../blocks/write'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { listedVerifiedProject } from '../projects/visibility'

const t = schema.tool
const p = schema.project
const pt = schema.projectTool

/** Une page et le curseur de la suivante : on lit une ligne de plus pour savoir s'il y en a une. */
const pageOf = <T>(rows: T[], key: (row: T) => { at: Date; id: string }) => {
  const items = rows.slice(0, CATALOGUE_PAGE_SIZE)
  const last = items.at(-1)
  const nextCursor =
    rows.length > CATALOGUE_PAGE_SIZE && last
      ? encodeCursor({ at: key(last).at.toISOString(), id: key(last).id })
      : null
  return { items, nextCursor }
}

/** Le pseudo actuel de l'auteur d'un projet (`released_at is null`, index member_handle_current_idx). */
const authorHandle = alias(schema.memberHandle, 'author_handle')
const authorHandleJoin = and(eq(authorHandle.userId, p.authorId), isNull(authorHandle.releasedAt))

// ─── « À vérifier » ──────────────────────────────────────────────────────────────────────────────

/** Le pseudo actuel d'un membre qui cite un « Autre » dans ses outils favoris. */
const memberHandle = alias(schema.memberHandle, 'member_handle_now')

/**
 * Les « Autre » en attente cités par au moins un projet visible, ou par les outils favoris d'un
 * membre qui a une page (compte vérifié et non supprimé : `memberWithPage`, la règle de la page
 * d'un membre sans le blocage ; décision de Louis du 9/11/2026 au soir), du plus récent au plus
 * ancien. Trois requêtes, quelle que soit la page :
 * 1. les outils de la page : `tool_status_created_idx` (status, created_at) lu à l'envers donne
 *    l'ordre sans tri ; pour chaque « Autre » lu, deux sous-requêtes « une ligne suffit »
 *    (`(select 1 … limit 1) is not null`, charte de l'API 7b : jamais un `exists` dans un `or`, qui
 *    peut lire toute la table) : un projet visible par `project_tool_tool_idx` puis la clé primaire
 *    du projet, un profil par `profile_tool_tool_idx` puis la clé primaire de "user". La lecture
 *    s'arrête aux 21 premiers trouvés ;
 * 2. les 5 projets montrés de chacun et leur nombre : `row_number() over (partition by …)` numérote
 *    les projets de chaque outil, du plus récent au plus ancien, et l'on garde les 5 premiers (une
 *    « fonction de fenêtre » : un calcul sur un groupe de lignes, sans les fusionner comme
 *    `group by`) ; `count(*) over (partition by …)`, dans la même lecture, donne leur nombre ;
 * 3. les 5 membres montrés de chacun et leur nombre, de même, par `profile_tool_tool_idx` ; rangés
 *    par nom (un favori n'a pas de date).
 * Un « Autre » écarté n'y est jamais (status `dismissed`, décision 8).
 */
export const loadPendingTools = async (
  db: Database,
  cursor: CursorContent | null,
): Promise<{ items: PendingTool[]; nextCursor: string | null }> => {
  // `"tool"."id"` en toutes lettres : dans ces sous-requêtes, Drizzle pourrait écrire `id` seul
  // (charte de l'API, 6b). Les tables de la sous-requête sont nommées sans alias : la règle
  // `listedVerifiedProject` écrit `"project"."author_id"`.
  const toolId = sql.raw('"tool"."id"')
  const cited = or(
    sql`(select 1 from ${pt} join ${p} on ${p.id} = ${pt.projectId}
      where ${pt.toolId} = ${toolId} and ${listedVerifiedProject()} limit 1) is not null`,
    sql`(select 1 from ${schema.profileTool} join ${schema.user} on ${schema.user.id} = ${schema.profileTool.userId}
      where ${schema.profileTool.toolId} = ${toolId} and ${memberWithPage()} limit 1) is not null`,
  )
  const rows = await db
    .select({ id: t.id, slug: t.slug, name: t.name, createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.status, 'other'), cited, cursor ? after(cursor, t.createdAt, t.id) : undefined))
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(CATALOGUE_PAGE_SIZE + 1)
  const page = pageOf(rows, (row) => ({ at: row.createdAt, id: row.id }))
  const ids = page.items.map((row) => row.id)

  const rankedProfiles = db
    .select({
      toolId: schema.profileTool.toolId,
      name: schema.user.name,
      handle: sql<string | null>`${memberHandle.handle}`.as('member_handle'),
      rank: sql<number>`row_number() over (partition by ${schema.profileTool.toolId} order by ${schema.user.name}, ${schema.user.id})`.as(
        'profile_rank',
      ),
      total: sql<number>`count(*) over (partition by ${schema.profileTool.toolId})`.as(
        'profile_total',
      ),
    })
    .from(schema.profileTool)
    .innerJoin(schema.user, eq(schema.user.id, schema.profileTool.userId))
    .leftJoin(
      memberHandle,
      and(eq(memberHandle.userId, schema.user.id), isNull(memberHandle.releasedAt)),
    )
    .where(and(inArray(schema.profileTool.toolId, ids), memberWithPage()))
    .as('ranked_profiles')
  const profiles = await db
    .select()
    .from(rankedProfiles)
    .where(lte(rankedProfiles.rank, PENDING_TOOL_PROJECTS_SHOWN))
    .orderBy(asc(rankedProfiles.rank))

  const ranked = db
    .select({
      toolId: pt.toolId,
      projectId: sql<string>`${p.id}`.as('project_id'),
      title: p.title,
      authorName: sql<string>`${schema.user.name}`.as('author_name'),
      authorHandle: sql<string | null>`${authorHandle.handle}`.as('author_handle'),
      rank: sql<number>`row_number() over (partition by ${pt.toolId} order by ${p.publishedAt} desc, ${p.id} desc)`.as(
        'rank',
      ),
      total: sql<number>`count(*) over (partition by ${pt.toolId})`.as('total'),
    })
    .from(pt)
    .innerJoin(p, eq(p.id, pt.projectId))
    .innerJoin(schema.user, eq(schema.user.id, p.authorId))
    .leftJoin(authorHandle, authorHandleJoin)
    .where(
      and(
        inArray(
          pt.toolId,
          page.items.map((row) => row.id),
        ),
        listedVerifiedProject(),
      ),
    )
    .as('ranked')
  const shown = await db
    .select()
    .from(ranked)
    .where(lte(ranked.rank, PENDING_TOOL_PROJECTS_SHOWN))
    .orderBy(asc(ranked.rank))

  return {
    nextCursor: page.nextCursor,
    items: page.items.map((row) => {
      const itsProjects = shown.filter((project) => project.toolId === row.id)
      const itsProfiles = profiles.filter((profile) => profile.toolId === row.id)
      return {
        slug: row.slug,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        // Le nombre de la fenêtre, le même sur chaque ligne d'un outil (`count(*)` rend un
        // `bigint`, que le pilote donne en texte) ; aucune ligne : zéro.
        projectCount: Number(itsProjects[0]?.total ?? 0),
        projects: itsProjects.map((project) => ({
          id: project.projectId,
          title: project.title,
          author: { name: project.authorName, handle: project.authorHandle },
        })),
        profileCount: Number(itsProfiles[0]?.total ?? 0),
        profiles: itsProfiles.map((profile) => ({ name: profile.name, handle: profile.handle })),
      }
    }),
  }
}

// ─── Le catalogue ────────────────────────────────────────────────────────────────────────────────

/**
 * Les outils du catalogue donnés, avec leurs alias et leur nombre de projets visibles, dans l'ordre
 * des lignes reçues. Deux requêtes « in (…) » quel que soit le nombre d'outils : les alias par
 * `tool_alias_tool_idx`, les nombres par `project_tool_tool_idx`. Les alias sont rendus repliés
 * (« claudeai ») : la base ne garde qu'eux.
 */
const withDetails = async (
  db: Database,
  tools: (typeof t.$inferSelect)[],
): Promise<AdminCatalogueTool[]> => {
  const ids = tools.map((tool) => tool.id)
  const aliases = await db
    .select({ toolId: schema.toolAlias.toolId, folded: schema.toolAlias.folded })
    .from(schema.toolAlias)
    .where(inArray(schema.toolAlias.toolId, ids))
    .orderBy(asc(schema.toolAlias.folded))
  const counts = await db
    .select({ toolId: pt.toolId, n: sql<number>`count(*)::int` })
    .from(pt)
    .innerJoin(p, eq(p.id, pt.projectId))
    .where(and(inArray(pt.toolId, ids), listedVerifiedProject()))
    .groupBy(pt.toolId)
  return tools.map((tool) => ({
    slug: tool.slug,
    name: tool.name,
    // Toujours une famille pour un outil du catalogue (écrite à son entrée) ; l'« assistant » de
    // repli ne sert qu'au typage.
    family: (tool.family ?? 'assistant') as ToolFamily,
    descriptionFr: tool.descriptionFr,
    descriptionEn: tool.descriptionEn,
    siteUrl: tool.siteUrl,
    aliases: aliases.filter((row) => row.toolId === tool.id).map((row) => row.folded),
    projectCount: Number(counts.find((row) => row.toolId === tool.id)?.n ?? 0),
  }))
}

/** Un outil du catalogue par son identifiant (la réponse d'une écriture). */
export const loadAdminTool = async (db: Database, id: string) => {
  const rows = await db.select().from(t).where(eq(t.id, id))
  const [tool] = await withDetails(db, rows)
  return tool
}

/**
 * Le catalogue, du dernier entré au premier, filtré par `q` s'il est donné : le nom replié de
 * l'outil, ou l'un de ses alias, contient le repli de `q` (« claude a » trouve « Claude » par son
 * alias « Claude AI »). `strpos` cherche un texte dans un autre ; `q` n'y entre que comme
 * paramètre lié. La liste se lit par `tool_status_created_idx` ; le catalogue fait quelques
 * centaines d'outils, la recherche les parcourt.
 */
export const loadAdminTools = async (
  db: Database,
  q: string | undefined,
  cursor: CursorContent | null,
) => {
  const needle = q === undefined ? null : foldTool(q)
  // `"tool"."id"` en toutes lettres : dans une sous-requête vers `tool_alias`, Drizzle écrirait
  // `id` seul, qui pourrait désigner une autre table (charte de l'API, 6b).
  const matches: SQL | undefined =
    needle === null
      ? undefined
      : or(
          sql`strpos(${t.folded}, ${needle}) > 0`,
          sql`exists (select 1 from tool_alias a where a.tool_id = ${sql.raw('"tool"."id"')} and strpos(a.folded, ${needle}) > 0)`,
        )
  const rows = await db
    .select()
    .from(t)
    .where(
      and(
        eq(t.status, 'catalogue'),
        matches,
        cursor ? after(cursor, t.createdAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(t.createdAt), desc(t.id))
    .limit(CATALOGUE_PAGE_SIZE + 1)
  const page = pageOf(rows, (row) => ({ at: row.createdAt, id: row.id }))
  return { items: await withDetails(db, page.items), nextCursor: page.nextCursor }
}

// ─── « À ranger » ────────────────────────────────────────────────────────────────────────────────

/**
 * Les projets visibles classés « Autre » (en principale ou en seconde), du plus ancien au plus
 * récent, sauf ceux qu'un administrateur a déjà rangés (une ligne `project_recategorize` existe) :
 * si leur auteur les a remis en « Autre », son choix l'emporte (jur-T4, décision 7). Une requête :
 * les index `project_primary_category_idx` et `project_secondary_category_idx` servent les deux
 * conditions de catégorie ; le « not exists » lit le journal (quelques lignes par jour, gardées un
 * an). Le curseur va dans l'autre sens que les autres listes : « après celui-là » veut dire « plus
 * récent ».
 */
export const loadUncategorized = async (
  db: Database,
  cursor: CursorContent | null,
): Promise<{ items: UncategorizedProject[]; nextCursor: string | null }> => {
  const rows = await db
    .select({
      id: p.id,
      title: p.title,
      pitch: p.pitch,
      primaryCategory: p.primaryCategory,
      secondaryCategory: p.secondaryCategory,
      publishedAt: p.publishedAt,
      authorName: schema.user.name,
      authorHandle: authorHandle.handle,
    })
    .from(p)
    .innerJoin(schema.user, eq(schema.user.id, p.authorId))
    .leftJoin(authorHandle, authorHandleJoin)
    .where(
      and(
        listedVerifiedProject(),
        or(eq(p.primaryCategory, OTHER_CATEGORY), eq(p.secondaryCategory, OTHER_CATEGORY)),
        sql`not exists (select 1 from catalogue_change c
          where c.project_id = ${sql.raw('"project"."id"')} and c.action = 'project_recategorize')`,
        cursor
          ? sql`(${p.publishedAt}, ${p.id}) > (${sql.param(new Date(cursor.at), p.publishedAt)}::timestamp, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(p.publishedAt), asc(p.id))
    .limit(CATALOGUE_PAGE_SIZE + 1)
  // Un projet public a toujours une date de publication ; la date de repli ne sert qu'au typage.
  const page = pageOf(rows, (row) => ({ at: row.publishedAt ?? new Date(0), id: row.id }))
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((row) => ({
      id: row.id,
      title: row.title,
      pitch: row.pitch,
      author: { name: row.authorName, handle: row.authorHandle },
      primaryCategory: row.primaryCategory,
      secondaryCategory: row.secondaryCategory,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
  }
}

// ─── « Changements récents » ─────────────────────────────────────────────────────────────────────

/**
 * Le journal du catalogue, du plus récent au plus ancien : une requête, l'index
 * `catalogue_change_created_idx` (created_at desc) donnant l'ordre ; chaque jointure lit une clé
 * primaire. Le projet ne se joint que s'il est encore visible des membres (sec-A1) : sinon `project`
 * vaut null, et ni son titre ni son identifiant ne sortent. L'administrateur dont le compte est
 * supprimé : null (la clé étrangère est remise à null).
 */
export const loadCatalogueChanges = async (
  db: Database,
  cursor: CursorContent | null,
  language: Language,
): Promise<{ items: CatalogueChange[]; nextCursor: string | null }> => {
  const c = schema.catalogueChange
  const admin = alias(schema.user, 'admin_user')
  const adminHandle = alias(schema.memberHandle, 'admin_handle')
  const rows = await db
    .select({
      id: c.id,
      action: c.action,
      at: c.createdAt,
      adminId: admin.id,
      adminName: admin.name,
      adminHandle: adminHandle.handle,
      toolSlug: t.slug,
      toolName: t.name,
      mergedName: c.mergedName,
      categoryCode: schema.category.code,
      categoryFr: schema.category.nameFr,
      categoryEn: schema.category.nameEn,
      projectId: p.id,
      projectTitle: p.title,
      fromCategory: c.fromCategory,
    })
    .from(c)
    .leftJoin(admin, eq(admin.id, c.adminId))
    .leftJoin(adminHandle, and(eq(adminHandle.userId, c.adminId), isNull(adminHandle.releasedAt)))
    .leftJoin(t, eq(t.id, c.toolId))
    .leftJoin(schema.category, eq(schema.category.code, c.categoryCode))
    .leftJoin(p, and(eq(p.id, c.projectId), listedVerifiedProject()))
    .where(cursor ? after(cursor, c.createdAt, c.id) : undefined)
    .orderBy(desc(c.createdAt), desc(c.id))
    .limit(CATALOGUE_PAGE_SIZE + 1)
  const page = pageOf(rows, (row) => ({ at: row.at, id: row.id }))
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((row) => ({
      id: row.id,
      action: row.action as CatalogueChangeAction,
      at: row.at.toISOString(),
      admin:
        row.adminId === null || row.adminName === null
          ? null
          : { name: row.adminName, handle: row.adminHandle },
      tool:
        row.toolSlug === null || row.toolName === null
          ? null
          : { slug: row.toolSlug, name: row.toolName },
      mergedName: row.mergedName,
      category:
        row.categoryCode === null
          ? null
          : {
              code: row.categoryCode,
              name: (language === 'en' ? row.categoryEn : row.categoryFr) ?? row.categoryCode,
            },
      project:
        row.projectId === null || row.projectTitle === null
          ? null
          : { id: row.projectId, title: row.projectTitle },
      fromCategory: row.fromCategory,
    })),
  }
}
