// Lire le catalogue des outils (tranche R6b) : la liste de GET /v1/tools (tout le catalogue et les
// « Autre » en attente) et la page d'un outil de GET /v1/tags/{slug}. Un nombre de projets n'est
// jamais celui de la base : c'est celui que CE membre peut voir (projet public, pas retiré, d'un
// auteur vérifié, ni d'un membre bloqué avec lui : `listedVerifiedProjectFor`), pour qu'un outil
// ne trahisse jamais un projet privé ou un membre bloqué (relecture de sécurité sec-A1, jur-T2).
import {
  type CatalogueTool,
  OTHER_TOOLS_SHOWN,
  type OtherTool,
  TOOL_LIST_MAX,
  TOOL_PAGE_SIZE,
  type ToolFamily,
  ToolFamily as ToolFamilySchema,
  type ToolPage,
  type ToolPageQuery,
  ToolSlug,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, isNotNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { rowsToSummaries, selectProjects } from '../projects/load'
import { listedVerifiedProjectFor } from '../projects/visibility'

/** Ce qui sait lancer une requête brute : la base, ou une transaction en cours. */
type Executor = Pick<Database, 'execute'>

const p = schema.project
const t = schema.tool

// Les lignes d'une requête brute ne sont pas typées : Zod les vérifie avant tout usage.
const rowsOf = <S extends z.ZodType>(schemaOfRow: S, result: unknown): z.infer<S>[] =>
  z.object({ rows: z.array(schemaOfRow) }).parse(result).rows

/**
 * Les projets que ce membre voit, avec un outil : sous-requête « les projets de cet outil ».
 * `project_tool_tool_idx` (tool_id) donne ses projets, la clé primaire de `project` les relit.
 */
const projectsOfTool = (toolId: string): SQL =>
  sql`${p.id} in (select pt.project_id from ${schema.projectTool} pt where pt.tool_id = ${toolId})`

// --- GET /v1/tools -----------------------------------------------------------------------------

const ToolRow = z.object({
  slug: ToolSlug,
  name: z.string(),
  family: ToolFamilySchema,
  project_count: z.number().int(),
})
const AliasRow = z.object({ slug: z.string(), folded: z.string() })
const OtherRow = z.object({ name: z.string() })

/**
 * Tout le catalogue (500 au plus), du plus utilisé au moins utilisé, puis par nom, chaque outil
 * avec ses alias. Trois requêtes, quelle que soit la taille du catalogue :
 *  1. les outils et leur nombre de projets visibles. `left join` : un outil sans projet reste dans
 *     la liste, avec 0 (`coalesce`). Le sous-select compte d'un coup, par `group by tool_id`, les
 *     projets visibles de tous les outils (index `project_tool_tool_idx`, puis la clé primaire de
 *     `project` ; les projets publics se lisent par l'index partiel `project_public_published_idx`) ;
 *  2. les alias de ces outils, une ligne chacun (`tool_alias_tool_idx`) ;
 *  3. les « Autre » (voir `loadOtherTools`).
 * `limit` est dans le SQL : la base ne rend jamais plus de 500 outils.
 */
export const loadToolList = async (
  db: Executor,
  viewerId: string,
): Promise<{ tools: CatalogueTool[]; others: OtherTool[] }> => {
  const [toolRows, aliasRows, others] = await Promise.all([
    db.execute(sql`
      select tool.slug, tool.name, tool.family, coalesce(used.n, 0)::int as project_count
      from ${t} as tool
      left join (
        select pt.tool_id, count(*)::int as n
        from ${schema.projectTool} pt
        inner join ${p} on ${p.id} = pt.project_id
        where ${listedVerifiedProjectFor(viewerId)}
        group by pt.tool_id
      ) as used on used.tool_id = tool.id
      where tool.status = 'catalogue'
      order by project_count desc, tool.name, tool.slug
      limit ${TOOL_LIST_MAX}`),
    db.execute(sql`
      select tool.slug, alias.folded
      from ${schema.toolAlias} alias
      inner join ${t} as tool on tool.id = alias.tool_id
      where tool.status = 'catalogue'
      order by alias.folded`),
    loadOtherTools(db, viewerId),
  ])
  // Les alias de chaque outil, par adresse : un alias est gardé replié (la base ne garde que cela).
  const aliases = new Map<string, string[]>()
  for (const row of rowsOf(AliasRow, aliasRows)) {
    aliases.set(row.slug, [...(aliases.get(row.slug) ?? []), row.folded])
  }
  return {
    tools: rowsOf(ToolRow, toolRows).map((row) => ({
      slug: row.slug,
      name: row.name,
      family: row.family as ToolFamily,
      aliases: aliases.get(row.slug) ?? [],
      projectCount: row.project_count,
    })),
    others,
  }
}

/**
 * « Pas encore dans le catalogue » : les « Autre » cités par au moins un projet que ce membre
 * voit, par nom, 50 au plus. Un « Autre » écarté (`dismissed`) n'y est jamais. La limite vient
 * APRÈS la visibilité, dans la même requête : un « Autre » que le membre ne voit pas ne prend
 * jamais une des 50 places (sec-B5). `exists` : « il existe un projet visible qui le cite », lu par
 * `project_tool_tool_idx` ; l'index `tool_status_created_idx` donne les « Autre ».
 */
const loadOtherTools = async (db: Executor, viewerId: string): Promise<OtherTool[]> =>
  rowsOf(
    OtherRow,
    await db.execute(sql`
      select tool.name
      from ${t} as tool
      where tool.status = 'other'
        and exists (
          select 1 from ${schema.projectTool} pt
          inner join ${p} on ${p.id} = pt.project_id
          where pt.tool_id = tool.id and ${listedVerifiedProjectFor(viewerId)}
        )
      order by tool.name, tool.slug
      limit ${OTHER_TOOLS_SHOWN}`),
  )

// --- GET /v1/tags/{slug} -----------------------------------------------------------------------

/** L'outil du catalogue qui répond à cette adresse : la sienne, sinon une ancienne adresse. */
const findCatalogueTool = async (db: Database, slug: string) => {
  const columns = {
    id: t.id,
    slug: t.slug,
    name: t.name,
    family: t.family,
    descriptionFr: t.descriptionFr,
    descriptionEn: t.descriptionEn,
    siteUrl: t.siteUrl,
  }
  // D'abord `tool.slug` (clé unique) : une ancienne adresse ne cache jamais un outil (sec-A2).
  const [own] = await db
    .select(columns)
    .from(t)
    .where(and(eq(t.slug, slug), eq(t.status, 'catalogue')))
  if (own) return own
  // Puis `tool_slug_redirect` (clé primaire sur l'adresse), vers un outil du catalogue seulement :
  // un « Autre » ou un outil écarté répondent comme une adresse inconnue.
  const [redirected] = await db
    .select(columns)
    .from(schema.toolSlugRedirect)
    .innerJoin(t, eq(t.id, schema.toolSlugRedirect.toolId))
    .where(and(eq(schema.toolSlugRedirect.slug, slug), eq(t.status, 'catalogue')))
  return redirected ?? null
}

const CategoryCountRow = z.object({ code: z.string(), n: z.number().int() })

/**
 * La page d'un outil du catalogue, ou null (adresse inconnue, « Autre », outil écarté : un même 404).
 * Après la recherche de l'outil (une ou deux lectures par clé), trois lectures lancées ensemble,
 * quel que soit le nombre de projets : son nombre de projets visibles, les catégories de ses projets
 * avec leur nombre, et la page de projets (plus deux de `rowsToSummaries`).
 * - le nombre : tous ses projets visibles, sans filtre (`project_tool_tool_idx`) ;
 * - les catégories : `unnest(array[principale, seconde])` fait une ligne par catégorie de chaque
 *   projet (`nullif` : jamais deux fois la même pour un projet), `group by` les compte ; le filtre de
 *   statut s'applique, celui de catégorie non (pour pouvoir en changer) ;
 * - les projets : du plus récent au plus ancien (`published_at`, `id`), après le curseur, 51 lus
 *   pour savoir s'il reste une suite, comme le fil (feed/load.ts).
 */
export const loadToolPage = async (
  db: Database,
  viewerId: string,
  slug: string,
  query: Pick<ToolPageQuery, 'status' | 'category'>,
  cursor: CursorContent | null,
  language: 'fr' | 'en',
  publicApiUrl: string,
): Promise<ToolPage | null> => {
  const found = await findCatalogueTool(db, slug)
  if (!found?.family) return null

  const visible = and(listedVerifiedProjectFor(viewerId), projectsOfTool(found.id))
  const statusFilter = query.status
    ? eq(p.status, query.status === 'testable' ? 'testable' : 'done')
    : undefined

  const [counted, categoryRows, rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(p).where(visible),
    db.execute(sql`
      select cat.code, count(*)::int as n
      from ${p}
      cross join lateral unnest(array[${p.primaryCategory}, nullif(${p.secondaryCategory}, ${p.primaryCategory})]) as cat(code)
      inner join ${schema.category} as category on category.code = cat.code
      where ${and(visible, statusFilter)}
      group by cat.code, category.position
      order by category.position`),
    selectProjects(db)
      .where(
        and(
          visible,
          isNotNull(p.publishedAt),
          statusFilter,
          query.category
            ? or(eq(p.primaryCategory, query.category), eq(p.secondaryCategory, query.category))
            : undefined,
          cursor ? after(cursor, p.publishedAt, p.id) : undefined,
        ),
      )
      .orderBy(desc(p.publishedAt), desc(p.id))
      .limit(TOOL_PAGE_SIZE + 1),
  ])

  const pageRows = rows.slice(0, TOOL_PAGE_SIZE)
  const projects = await rowsToSummaries(db, pageRows, viewerId, publicApiUrl)
  const last = pageRows.at(-1)?.project
  const description = language === 'en' ? found.descriptionEn : found.descriptionFr
  return {
    tool: {
      slug: found.slug,
      name: found.name,
      family: found.family as ToolFamily,
      // Une langue sans description : le français, la langue de référence (décision 12).
      description: description ?? found.descriptionFr ?? null,
      siteUrl: found.siteUrl,
      projectCount: counted[0]?.n ?? 0,
    },
    // Dans l'ordre de la feuille de publication (`category.position`, décision 2 du plan) ;
    // `inner join` : un code sans catégorie en base (impossible : clé étrangère) n'apparaîtrait pas.
    categories: rowsOf(CategoryCountRow, categoryRows).map((row) => ({
      code: row.code,
      projectCount: row.n,
    })),
    projects,
    nextCursor:
      rows.length > TOOL_PAGE_SIZE && last?.publishedAt
        ? encodeCursor({ at: last.publishedAt.toISOString(), id: last.id })
        : null,
  }
}
