// Lire les catégories (tranche R6b, GET /v1/categories) : toutes, dans l'ordre de la feuille de
// publication, nommées dans la langue du visiteur, chacune avec le nombre de projets que CE membre
// peut voir (projet public, pas retiré, d'un auteur vérifié, ni d'un membre bloqué avec lui).
import type { Category, CategoryIcon } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { listedVerifiedProjectFor } from '../projects/visibility'

const Row = z.object({
  code: z.string(),
  name_fr: z.string(),
  name_en: z.string(),
  icon: z.string(),
  project_count: z.number().int(),
})

/**
 * Une seule requête, quel que soit le nombre de catégories. Le sous-select déplie les deux
 * catégories de chaque projet visible (`unnest(array[principale, seconde])` : une ligne par
 * catégorie ; `nullif` : jamais deux fois la même pour un projet) et les compte par code
 * (`group by`). `left join` : une catégorie sans projet reste dans la liste, avec 0. L'ordre est
 * celui de `category_position_idx`. Les projets publics se lisent par l'index partiel
 * `project_public_published_idx`.
 */
export const loadCategories = async (
  db: Pick<Database, 'execute'>,
  viewerId: string,
  language: 'fr' | 'en',
): Promise<Category[]> => {
  const result = await db.execute(sql`
    select category.code, category.name_fr, category.name_en, category.icon,
           coalesce(used.n, 0)::int as project_count
    from ${schema.category} as category
    left join (
      select cat.code, count(*)::int as n
      from ${schema.project}
      cross join lateral unnest(array[${schema.project.primaryCategory}, nullif(${schema.project.secondaryCategory}, ${schema.project.primaryCategory})]) as cat(code)
      where ${listedVerifiedProjectFor(viewerId)}
      group by cat.code
    ) as used on used.code = category.code
    order by category.position`)
  return z
    .object({ rows: z.array(Row) })
    .parse(result)
    .rows.map((row) => ({
      code: row.code,
      name: language === 'en' ? row.name_en : row.name_fr,
      // Le contrat vérifie la valeur (CategoryList.parse dans la route) : une icône hors liste
      // ferait échouer la réponse plutôt que d'en sortir.
      icon: row.icon as CategoryIcon,
      projectCount: row.project_count,
    }))
}
