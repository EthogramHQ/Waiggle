// Écrire les outils d'un projet ou d'un profil (tranche R6b) : les lignes de `project_tool` et de
// `profile_tool`, les anciennes colonnes de texte gardées jusqu'en R7 (retour possible à R6a), et
// l'effacement d'un « Autre » dont plus rien ne dépend. Les noms sont d'abord reliés à leurs outils
// par `tools/resolve.ts`. Tout se fait dans la transaction de la route : un échec n'écrit rien.
import { type Database, schema } from '@ruche/db'
import { eq, inArray, sql } from 'drizzle-orm'
import type { ResolvedTool } from './resolve'

// Une transaction en cours, ou la base : ce qu'il faut pour lire, écrire et effacer.
type Writer = Pick<Database, 'select' | 'insert' | 'delete'>

// Les anciennes colonnes `project.tools`, `project.tool_slugs` et `profile.favorite_tools` ne sont
// plus écrites : la migration 0018 (R7a) les efface, les outils vivent dans les liens du catalogue.

/**
 * Efface les « Autre » de `ids` que plus aucun projet ni profil ne cite (tous les « Autre » si `ids`
 * est absent : le ménage de la purge de nuit et de la suppression d'un compte). Un outil du catalogue
 * ne s'efface jamais ici ; un « Autre » laissé hors du catalogue non plus : il garde le nom écarté
 * pendant un an, puis la purge de nuit l'efface (`dropDismissedOthers`, ci-dessous).
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

/** Combien de temps un « Autre » écarté se garde après sa décision (jur-J5) : un an, comme le journal. */
export const DISMISSED_TOOL_KEEP_DAYS = 365

/**
 * La purge de nuit (relecture juridique jur-J5, décision de Louis du 9/11/2026 au soir) : efface les
 * « Autre » laissés hors du catalogue depuis plus d'un an que plus aucun projet ni profil ne cite.
 * Un nom écarté est souvent injurieux, ou nomme quelqu'un : il ne se garde pas sans fin. Tant qu'il
 * est cité, il reste (règle de tout « Autre » : ses mentions sont le texte de leurs auteurs, qui
 * partent avec leur projet ou leur compte), et s'efface la nuit qui suit sa dernière mention.
 *
 * « Plus d'un an » se lit dans le journal : aucune ligne `tool_dismiss` de cet outil depuis
 * `cutoff`. Le journal s'efface lui-même après un an (nightly-purge.ts) : un écarté sans ligne a donc
 * été écarté il y a plus d'un an, et la règle tient encore après cet effacement. Les écartés sont
 * peu nombreux (`tool_status_created_idx` les trouve par leur statut) ; le `not exists` lit le
 * journal, quelques lignes par jour, sans index sur `tool_id` : une fois par nuit, cela coûte peu.
 * Même verrou que `dropOrphanOthers` : un écarté qu'un membre est en train de citer est sauté.
 */
export const dropDismissedOthers = async (tx: Writer, cutoff: Date): Promise<number> => {
  const expired = await tx
    .select({ id: schema.tool.id })
    .from(schema.tool)
    .where(
      sql`${schema.tool.status} = 'dismissed'
        and (select 1 from project_tool where project_tool.tool_id = tool.id limit 1) is null
        and (select 1 from profile_tool where profile_tool.tool_id = tool.id limit 1) is null
        and not exists (select 1 from catalogue_change c
          where c.tool_id = tool.id and c.action = 'tool_dismiss'
            and c.created_at >= ${cutoff.toISOString()}::timestamptz at time zone 'UTC')`,
    )
    .for('update', { skipLocked: true })
  if (expired.length === 0) return 0
  const gone = await tx
    .delete(schema.tool)
    .where(
      inArray(
        schema.tool.id,
        expired.map((row) => row.id),
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
