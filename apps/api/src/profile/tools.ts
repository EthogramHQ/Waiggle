// Les outils favoris d'un membre (tranche R6b), lus par `profile_tool` joint à `tool` : le profil
// public, « Mon profil », l'export et la copie d'un signalement partent tous d'ici. L'ancienne colonne
// `profile.favorite_tools` n'est plus lue (elle reste écrite jusqu'en R7).
import { type ProjectTool, toolSlug } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, eq } from 'drizzle-orm'

/**
 * Les outils favoris de ce membre, dans l'ordre qu'il a choisi. Une requête : `profile_tool` par le
 * début de sa clé primaire (user_id), `tool` par la sienne. Un outil du catalogue s'affiche sous son
 * nom ; un « Autre », sous le nom que CE membre a tapé (sec-B8), sans page (`inCatalogue` faux).
 */
export const favoriteToolsOf = async (
  db: Pick<Database, 'select'>,
  userId: string,
): Promise<ProjectTool[]> => {
  const rows = await db
    .select({
      label: schema.profileTool.label,
      name: schema.tool.name,
      slug: schema.tool.slug,
      status: schema.tool.status,
    })
    .from(schema.profileTool)
    .innerJoin(schema.tool, eq(schema.tool.id, schema.profileTool.toolId))
    .where(eq(schema.profileTool.userId, userId))
    .orderBy(asc(schema.profileTool.position))
  return rows.map((row) => {
    const inCatalogue = row.status === 'catalogue'
    const label = inCatalogue ? row.name : (row.label ?? row.name)
    // Un « Autre » : l'adresse du nom tapé par ce membre, jamais l'adresse partagée et son suffixe
    // (sec-B2, comme `projects/load.ts`).
    return { label, slug: inCatalogue ? row.slug : toolSlug(label), inCatalogue }
  })
}
