// Lecture des réactions (tranche 5) : les nombres par type de quelques projets, vus par le membre
// qui regarde, et toutes les réactions d'un membre pour l'export de ses données. Jamais la liste de
// qui a réagi : seuls les nombres, et les réactions du membre lui-même, sortent d'ici. Qui a le
// droit de voir quel projet est décidé ailleurs (projects/load.ts).
import { NO_REACTIONS, ReactionKind, type ReactionState } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, eq, inArray, sql } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>

const r = schema.projectReaction

/**
 * Les réactions de plusieurs projets, telles que les voit `viewerId`, en une seule requête quel que
 * soit leur nombre (et pas une par projet).
 *
 * En SQL :
 *   select project_id, kind, count(*)::int, bool_or(member_id = $viewer)
 *   from project_reaction where project_id in (…) group by project_id, kind
 *
 * « group by » range les lignes en un groupe par projet et par type : count(*) compte les
 * réactions de chaque groupe, et bool_or dit si l'une d'elles est celle du membre qui regarde (voir
 * follows/load.ts). La clé primaire (project_id, member_id, kind) commence par project_id : elle
 * donne directement les réactions de chaque projet de la liste.
 */
export const reactionStatesOf = async (
  db: Reader,
  projectIds: string[],
  viewerId: string,
): Promise<Map<string, ReactionState>> => {
  const states = new Map<string, ReactionState>()
  if (projectIds.length === 0) return states
  const rows = await db
    .select({
      projectId: r.projectId,
      kind: r.kind,
      count: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${r.memberId} = ${viewerId})`,
    })
    .from(r)
    .where(inArray(r.projectId, projectIds))
    .groupBy(r.projectId, r.kind)
  for (const row of rows) {
    // Chaque projet part de « aucune réaction » : les cinq types sont présents, même à zéro.
    const state = states.get(row.projectId) ?? {
      counts: { ...NO_REACTIONS.counts },
      mine: [],
    }
    // .parse vérifie que le type lu est l'un des cinq (la base le garantit déjà, par sa contrainte).
    const kind = ReactionKind.parse(row.kind)
    state.counts[kind] = row.count
    if (row.mine) state.mine.push(kind)
    states.set(row.projectId, state)
  }
  return states
}

/**
 * Toutes les réactions d'un membre, des plus anciennes aux plus récentes, pour l'export de ses
 * données : le projet (son identifiant seulement), le type et la date. Même sur un projet devenu
 * privé : c'est son geste, et l'identifiant ne dit rien du projet. L'index
 * project_reaction_member_idx trouve ses réactions ; le tri se fait ensuite en mémoire (l'export
 * est rare, et ne concerne qu'un membre).
 */
export const reactionsOfMember = async (db: Reader, memberId: string) => {
  const rows = await db
    .select({ projectId: r.projectId, kind: r.kind, createdAt: r.createdAt })
    .from(r)
    .where(eq(r.memberId, memberId))
    .orderBy(asc(r.createdAt), asc(r.projectId), asc(r.kind))
  return rows.map((row) => ({
    projectId: row.projectId,
    kind: ReactionKind.parse(row.kind),
    createdAt: row.createdAt.toISOString(),
  }))
}
