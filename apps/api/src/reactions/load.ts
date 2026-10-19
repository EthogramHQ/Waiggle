// Lecture des réactions (tranche 5) : les nombres par type de quelques projets, vus par le membre
// qui regarde, et toutes les réactions d'un membre pour l'export de ses données. Jamais la liste de
// qui a réagi : seuls les nombres, et les réactions du membre lui-même, sortent d'ici. Qui a le
// droit de voir quel projet est décidé ailleurs (projects/load.ts).
import { NO_REACTIONS, ReactionKind, type ReactionState } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>

const r = schema.projectReaction

/**
 * Les réactions de plusieurs projets, telles que les voit `viewerId`, en une seule requête quel que
 * soit leur nombre (et pas une par projet). Sur un projet privé, aucune : on ne réagit pas à son
 * propre projet, ce sont donc toutes des réactions d'autres membres, cachées à tous, l'auteur du
 * projet compris (décision du 19/10/2026). Elles sont gardées et reviennent si le projet redevient
 * public.
 *
 * En SQL :
 *   select project_id, kind, count(*)::int, bool_or(member_id = $viewer)
 *   from project_reaction inner join project on project.id = project_reaction.project_id
 *   where project_id in (…) and project.visibility = 'public'
 *   group by project_id, kind
 *
 * La jointure (« inner join ») met à côté de chaque réaction la ligne de son projet, trouvée par
 * la clé primaire de project, pour lire sa visibilité.
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
    .innerJoin(schema.project, eq(schema.project.id, r.projectId))
    .where(and(inArray(r.projectId, projectIds), eq(schema.project.visibility, 'public')))
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
