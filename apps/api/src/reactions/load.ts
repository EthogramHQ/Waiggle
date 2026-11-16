// Lecture des réactions (tranche 5) : les nombres par type de quelques projets, vus par le membre
// qui regarde, et toutes les réactions d'un membre pour l'export de ses données. Jamais la liste de
// qui a réagi : seuls les nombres, et les réactions du membre lui-même, sortent d'ici. Qui a le
// droit de voir quel projet est décidé ailleurs (projects/load.ts).
import { NO_REACTIONS, ReactionKind, type ReactionState } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { hiveMemberOf, listedProject, reservedProject } from '../projects/visibility'

type Reader = Pick<Database, 'select'>

const r = schema.projectReaction

/**
 * La ligne de `hive_member` de celui qui a réagi, dans la ruche du projet (R10), posée à côté de
 * chaque réaction par une jointure « left join » : sans ligne, `hive_member.user_id` vaut nul. Elle
 * sert à ne compter, sur un projet réservé, que les réactions de ceux qui le voient aujourd'hui : un
 * ancien membre n'a plus de ligne, sa réaction reste en base (elle revient s'il rejoint de nouveau)
 * mais ne compte plus. L'index est la clé primaire de hive_member (hive_id, user_id), lue une fois
 * par réaction ; sur un projet public la jointure ne trouve rien et ne coûte rien de plus.
 */
const reactorMembership = and(
  eq(schema.hiveMember.hiveId, schema.project.hiveId),
  eq(schema.hiveMember.userId, r.memberId),
)

/** La ligne de `hive_member` existe : celui qui a réagi est encore membre de la ruche du projet. */
const reactorStillMember = isNotNull(schema.hiveMember.userId)

/**
 * Les réactions de plusieurs projets, telles que les voit `viewerId`, en une seule requête quel que
 * soit leur nombre (et pas une par projet). Sur un projet privé, aucune : on ne réagit pas à son
 * propre projet, ce sont donc toutes des réactions d'autres membres, cachées à tous, l'auteur du
 * projet compris (décision du 19/10/2026). Elles sont gardées et reviennent si le projet redevient
 * public. De même sur un projet retiré par la modération (tranche 7a), jusqu'à son rétablissement.
 *
 * En SQL :
 *   select project_id, kind, count(*)::int, bool_or(member_id = $viewer)
 *   from project_reaction inner join project on project.id = project_reaction.project_id
 *   left join hive_member on hive_member.hive_id = project.hive_id
 *     and hive_member.user_id = project_reaction.member_id
 *   where project_id in (…) and project.removed_at is null
 *     and (project.visibility in ('public', 'web')
 *       or (project.visibility = 'hive' and project.hive_id in (ruches de $viewer)
 *           and hive_member.user_id is not null))
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
    .leftJoin(schema.hiveMember, reactorMembership)
    .where(
      and(
        inArray(r.projectId, projectIds),
        // Public, ou réservé à une ruche du lecteur et réaction d'un membre actuel de cette ruche.
        or(listedProject(), and(reservedProject(), hiveMemberOf(viewerId), reactorStillMember)),
      ),
    )
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
 * Le total des réactions de plusieurs projets (R4 : « ✦ 49 » sur chaque carte), la somme des cinq
 * compteurs, en une seule requête quel que soit leur nombre. Mêmes règles que `reactionStatesOf`,
 * donc le même nombre que la page du projet (relecture juridique jur-J10) : les réactions d'un
 * membre bloqué comptent (un nombre est le même pour tous, sec-A4), et un projet privé ou retiré
 * n'en a aucune, même pour son auteur. Un projet absent de la réponse vaut 0.
 *
 * En SQL :
 *   select project_id, count(*)::int
 *   from project_reaction inner join project on project.id = project_reaction.project_id
 *   left join hive_member on hive_member.hive_id = project.hive_id
 *     and hive_member.user_id = project_reaction.member_id
 *   where project_id in (…) and project.removed_at is null
 *     and (project.visibility in ('public', 'web')
 *       or (project.visibility = 'hive' and hive_member.user_id is not null))
 *   group by project_id
 *
 * Index : la clé primaire de project_reaction (project_id, member_id, kind) commence par
 * project_id ; PostgreSQL y lit les réactions de chaque projet de la liste, sans parcourir les
 * autres. Le total ne sort jamais le nom de qui a réagi : seulement un nombre.
 *
 * Toujours une requête, même pour une liste vide (« in () » devient « false », lu sans toucher la
 * table) : ainsi une liste coûte le même nombre de requêtes qu'elle ait 0 ou 20 cartes, ce que
 * vérifie le test « reads the totals of a whole page in a constant number of queries ».
 */
export const reactionTotalsOf = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, number>> => {
  const rows = await db
    .select({ projectId: r.projectId, total: sql<number>`count(*)::int` })
    .from(r)
    .innerJoin(schema.project, eq(schema.project.id, r.projectId))
    .leftJoin(schema.hiveMember, reactorMembership)
    .where(
      and(
        inArray(r.projectId, projectIds),
        // Sans lecteur : un projet réservé compte les réactions de ses
        // membres actuels ; les routes ne demandent le total que de cartes que le lecteur voit déjà.
        or(listedProject(), and(reservedProject(), reactorStillMember)),
      ),
    )
    .groupBy(r.projectId)
  return new Map(rows.map((row) => [row.projectId, row.total]))
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
