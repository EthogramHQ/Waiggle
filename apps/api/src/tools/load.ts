// Les outils des projets publics, comptés (tranche R3) : la liste de GET /v1/tools (« Outils
// populaires » et « Tous les outils » d'Explorer), et le groupe « Outils » de la recherche. Un
// outil n'existe ici que par les projets que le membre peut voir : publics, pas retirés, d'un
// auteur vérifié, ni d'un membre bloqué avec lui (listedVerifiedProjectFor).
import { SEARCH_GROUP_MAX, TOOL_LIST_MAX, type ToolCount } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { listedVerifiedProjectFor } from '../projects/visibility'
import { contains, foldSql } from '../search/fold'

/** Ce qui sait lancer une requête brute : la base, ou une transaction en cours. */
type Executor = Pick<Database, 'execute'>

const p = schema.project

/**
 * Un outil par ligne, avec son nombre de projets et son libellé, en SQL :
 *   select slug, (array_agg(label order by created_at desc, project_id desc))[1] as label,
 *          count(*)::int as project_count
 *   from (select tool.label, tool.slug, project.created_at, project.id as project_id
 *         from project, unnest(project.tools, project.tool_slugs) as tool(label, slug)
 *         where <projet listé pour le visiteur, auteur vérifié>) as used
 *   group by slug
 * `unnest(a, b)` déplie les deux listes côte à côte : une ligne par outil de chaque projet, avec
 * son libellé tapé et son étiquette. `group by slug` les regroupe par outil ; `count(*)` compte
 * ses projets (un projet ne cite jamais deux fois la même étiquette : withSlugs, projects/load.ts) ;
 * `array_agg(… order by …)[1]` prend le libellé du projet le plus récent, comme la page d'une
 * étiquette (routes/tags.ts). Les projets publics se lisent par l'index partiel
 * project_public_published_idx ; la liste dépliée reste en mémoire, le temps du regroupement.
 */
const counted = (viewerId: string): SQL => sql`
  select used.slug, (array_agg(used.label order by used.created_at desc, used.project_id desc))[1] as label,
    count(*)::int as project_count
  from (
    select tool.label, tool.slug, ${p.createdAt} as created_at, ${p.id} as project_id
    from ${p}, unnest(${p.tools}, ${p.toolSlugs}) as tool(label, slug)
    where ${listedVerifiedProjectFor(viewerId)}
  ) as used
  group by used.slug`

// Les lignes d'une requête brute ne sont pas typées : Zod les vérifie avant tout usage.
const Row = z.object({ slug: z.string(), label: z.string(), project_count: z.number().int() })
const rowsOf = (result: unknown) =>
  z
    .object({ rows: z.array(Row) })
    .parse(result)
    .rows.map(
      (row): ToolCount => ({
        slug: row.slug,
        label: row.label,
        projectCount: row.project_count,
      }),
    )

/**
 * GET /v1/tools : tous les outils, du plus utilisé au moins utilisé, puis par libellé (et par
 * étiquette, pour un ordre sans ex aequo), 500 au plus. `limit` est dans le SQL (sec-A9) : la
 * base ne rend jamais plus.
 */
export const loadToolList = async (db: Executor, viewerId: string): Promise<ToolCount[]> =>
  rowsOf(
    await db.execute(sql`
      select slug, label, project_count from (${counted(viewerId)}) as tool_count
      order by project_count desc, label, slug
      limit ${TOOL_LIST_MAX}`),
  )

/**
 * Le groupe « Outils » de la recherche : les outils dont le libellé (replié) ou l'étiquette
 * contient chaque mot ; 21 lus, pour savoir s'il y en a plus de 20. `with … as materialized` : la
 * table intermédiaire est calculée une fois, et chaque libellé n'est replié qu'une fois, quel que
 * soit le nombre de mots (sec-B3). L'étiquette n'est pas repliée : elle est déjà en minuscules,
 * sans accent (toolSlug).
 */
export const searchTools = async (
  db: Executor,
  viewerId: string,
  words: string[],
): Promise<{ items: ToolCount[]; more: boolean }> => {
  const folded = sql.identifier('folded_label')
  const slug = sql.identifier('slug')
  const rows = rowsOf(
    await db.execute(sql`
      with tool_count as materialized (
        select slug, label, project_count, ${foldSql(sql`${sql.identifier('label')}`)} as folded_label
        from (${counted(viewerId)}) as counted
      )
      select slug, label, project_count from tool_count
      where ${and(...words.map((word) => sql`(${contains(sql`${folded}`, word)} or ${contains(sql`${slug}`, word)})`))}
      order by project_count desc, label, slug
      limit ${SEARCH_GROUP_MAX + 1}`),
  )
  return { items: rows.slice(0, SEARCH_GROUP_MAX), more: rows.length > SEARCH_GROUP_MAX }
}
