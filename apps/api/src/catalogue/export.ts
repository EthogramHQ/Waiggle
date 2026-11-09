// Ce que l'export du compte dit du catalogue (tranche R6b, relecture juridique jur-T4) : les
// changements de catégorie qu'un administrateur a faits sur les projets du membre (« ranger un
// projet »). Une ligne par changement : le projet, la catégorie d'avant, celle d'après, la date.
// Jamais l'administrateur qui l'a fait (`admin_id` n'est même pas lu).
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, isNotNull } from 'drizzle-orm'

/**
 * Les rangements faits sur les projets de ce membre, du plus ancien au plus récent. Une requête :
 * le journal (`catalogue_change`, quelques lignes par jour au plus) joint à `project` par sa clé
 * primaire, pour ne garder que les projets dont il est l'auteur. Un projet supprimé n'y est plus
 * (la clé étrangère du journal est remise à null : la ligne n'a plus de projet à nommer).
 */
export const categoryChangesOf = async (
  db: Pick<Database, 'select'>,
  userId: string,
): Promise<{ projectId: string; from: string; to: string; at: string }[]> => {
  const rows = await db
    .select({
      projectId: schema.catalogueChange.projectId,
      from: schema.catalogueChange.fromCategory,
      to: schema.catalogueChange.categoryCode,
      at: schema.catalogueChange.createdAt,
    })
    .from(schema.catalogueChange)
    .innerJoin(schema.project, eq(schema.project.id, schema.catalogueChange.projectId))
    .where(
      and(
        eq(schema.catalogueChange.action, 'project_recategorize'),
        eq(schema.project.authorId, userId),
        isNotNull(schema.catalogueChange.categoryCode),
        isNotNull(schema.catalogueChange.fromCategory),
      ),
    )
    .orderBy(asc(schema.catalogueChange.createdAt), asc(schema.catalogueChange.id))
  return rows.flatMap((row) =>
    row.projectId !== null && row.from !== null && row.to !== null
      ? [{ projectId: row.projectId, from: row.from, to: row.to, at: row.at.toISOString() }]
      : [],
  )
}
