// Écrire les outils d'un projet ou d'un profil (tranche R6b) : les lignes de `project_tool` et de
// `profile_tool`, les anciennes colonnes de texte gardées jusqu'en R7 (retour possible à R6a), et
// l'effacement d'un « Autre » dont plus rien ne dépend. Les noms sont d'abord reliés à leurs outils
// par `tools/resolve.ts`. Tout se fait dans la transaction de la route : un échec n'écrit rien.
import { type Database, schema } from '@ruche/db'
import { eq, inArray, sql } from 'drizzle-orm'
import type { ResolvedTool } from './resolve'

// Une transaction en cours, ou la base : ce qu'il faut pour lire, écrire et effacer.
type Writer = Pick<Database, 'select' | 'insert' | 'delete'>

/**
 * Les anciennes colonnes `project.tools` et `project.tool_slugs` (et `profile.favorite_tools`), que
 * l'API écrit encore sans les lire : un retour à R6a retrouve ainsi les outils. Pour un « Autre », le
 * nom tapé par ce membre (son propre texte, jamais celui d'un autre) ; sinon le nom du catalogue.
 */
export const legacyToolColumns = (resolved: readonly ResolvedTool[]) => ({
  tools: resolved.map(({ tool, label }) => label ?? tool.name),
  toolSlugs: resolved.map(({ tool }) => tool.slug),
})

/**
 * Efface les « Autre » de `ids` que plus aucun projet ni profil ne cite (tous les « Autre » si `ids`
 * est absent : le ménage de la purge de nuit et de la suppression d'un compte). Un outil du catalogue
 * ou « laissé hors du catalogue » ne s'efface jamais ici.
 *
 * Deux protections contre une écriture simultanée :
 * - `(select 1 … limit 1) is null` lit chaque index `tool_id` pour UNE ligne, au lieu de joindre ;
 * - `for update skip locked` saute un « Autre » qu'une autre transaction est en train de citer (son
 *   `insert` a posé un verrou sur la ligne) : mieux vaut le laisser à la purge de nuit que de heurter
 *   la clé étrangère `restrict`.
 */
export const dropOrphanOthers = async (tx: Writer, ids?: readonly string[]): Promise<number> => {
  if (ids?.length === 0) return 0
  const orphans = await tx
    .select({ id: schema.tool.id })
    .from(schema.tool)
    .where(
      sql`${schema.tool.status} = 'other'
        ${ids ? sql`and ${inArray(schema.tool.id, [...ids])}` : sql``}
        and (select 1 from project_tool where project_tool.tool_id = tool.id limit 1) is null
        and (select 1 from profile_tool where profile_tool.tool_id = tool.id limit 1) is null`,
    )
    .for('update', { skipLocked: true })
  if (orphans.length === 0) return 0
  const gone = await tx
    .delete(schema.tool)
    .where(
      inArray(
        schema.tool.id,
        orphans.map((row) => row.id),
      ),
    )
    .returning({ id: schema.tool.id })
  return gone.length
}

/**
 * Remplace les outils d'un projet par ceux-ci (dans l'ordre : `position` 0, 1, 2…), puis efface les
 * « Autre » que ce projet était le dernier à citer. L'index de la clé primaire (project_id, tool_id)
 * sert à lire et à effacer les lignes du projet.
 */
export const replaceProjectTools = async (
  tx: Writer,
  projectId: string,
  resolved: readonly ResolvedTool[],
) => {
  const before = await tx
    .select({ toolId: schema.projectTool.toolId })
    .from(schema.projectTool)
    .where(eq(schema.projectTool.projectId, projectId))
  await tx.delete(schema.projectTool).where(eq(schema.projectTool.projectId, projectId))
  if (resolved.length > 0) {
    await tx.insert(schema.projectTool).values(
      resolved.map(({ tool, label }, position) => ({
        projectId,
        toolId: tool.id,
        position,
        label,
      })),
    )
  }
  await dropOrphanOthers(
    tx,
    before.map((row) => row.toolId),
  )
}

/** Les outils favoris d'un profil : même forme que `replaceProjectTools`, par membre. */
export const replaceProfileTools = async (
  tx: Writer,
  userId: string,
  resolved: readonly ResolvedTool[],
) => {
  const before = await tx
    .select({ toolId: schema.profileTool.toolId })
    .from(schema.profileTool)
    .where(eq(schema.profileTool.userId, userId))
  await tx.delete(schema.profileTool).where(eq(schema.profileTool.userId, userId))
  if (resolved.length > 0) {
    await tx.insert(schema.profileTool).values(
      resolved.map(({ tool, label }, position) => ({
        userId,
        toolId: tool.id,
        position,
        label,
      })),
    )
  }
  await dropOrphanOthers(
    tx,
    before.map((row) => row.toolId),
  )
}
