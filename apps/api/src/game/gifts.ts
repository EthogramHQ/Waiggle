// Le miel offert par un membre à des projets (R19, « Le miel ») : la page d'un projet dit à son
// lecteur s'il en a déjà offert (`Project.honeyGiven`, « Miel offert »). C'est son geste à lui :
// l'auteur et les autres membres n'y lisent rien (l'auteur l'apprend par l'avis de l'Activité).
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray } from 'drizzle-orm'

const he = schema.honeyEntry

/**
 * La clé du débit d'une offre dans `honey_entry` : une par membre et par projet (l'index unique
 * `honey_entry_once_idx` refuse la seconde, d'où `409 honey_already`). Écrite par l'offre
 * (POST /v1/projects/{id}/honey), lue ici.
 */
export const giftKey = (projectId: string) => `gift:${projectId}`

/**
 * Les projets de la liste auxquels `viewerId` a offert du miel, en une requête quel que soit leur
 * nombre : `where member_id = $moi and source_key in ('gift:…', …)`, servie par l'index unique
 * `honey_entry_once_idx` (member_id, source_key), qui commence par les deux colonnes cherchées.
 * Seul le lecteur est cherché : jamais l'offre d'un autre membre.
 */
export const honeyGivenTo = async (
  db: Database,
  projectIds: string[],
  viewerId: string,
): Promise<Set<string>> => {
  if (projectIds.length === 0) return new Set()
  const keys = new Map(projectIds.map((id) => [giftKey(id), id]))
  const rows = await db
    .select({ sourceKey: he.sourceKey })
    .from(he)
    .where(and(eq(he.memberId, viewerId), inArray(he.sourceKey, [...keys.keys()])))
  const given = new Set<string>()
  for (const row of rows) {
    const id = keys.get(row.sourceKey)
    if (id) given.add(id)
  }
  return given
}
