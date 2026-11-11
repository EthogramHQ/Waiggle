// Ce que la page d'un projet dit des testeurs (R7a) : « suis-je testeur ? » pour tout le monde, et
// « combien sont-ils ? » pour l'auteur seul (un autre membre n'apprend jamais ce nombre : sécurité
// A3). L'inscription et le départ sont dans routes/testers.ts ; ici, la lecture seule.
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, sql } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>

/**
 * Parmi ces projets, ceux dont l'auteur a retiré ce membre des testeurs (R7b), en une seule requête
 * quel que soit leur nombre : l'appli ne lui propose plus d'y revenir (`Project.testerJoinable`).
 *
 * En SQL : select project_id from project_tester_removal where member_id = $viewer and project_id
 * in (…). La clé primaire (project_id, member_id) donne chaque couple directement. Une liste vide
 * ne lit rien.
 */
export const testerRemovalsOf = async (
  db: Reader,
  projectIds: string[],
  viewerId: string,
): Promise<Set<string>> => {
  if (projectIds.length === 0) return new Set()
  const r = schema.projectTesterRemoval
  const rows = await db
    .select({ projectId: r.projectId })
    .from(r)
    .where(and(eq(r.memberId, viewerId), inArray(r.projectId, projectIds)))
  return new Set(rows.map((row) => row.projectId))
}

export type TesterState = { isTester: boolean; testerCount: number | null }

/**
 * L'état « testeur » de chaque projet de la liste, en une seule requête quel que soit leur nombre.
 *
 * En SQL : select project_id, count(*), bool_or(member_id = $viewer) from project_tester
 * where project_id in (…) group by project_id. L'index project_tester_project_idx (project_id) donne
 * les inscriptions de chaque projet (au plus 200 chacun). `bool_or` vaut vrai si au moins une des
 * lignes est celle du visiteur. Un projet sans testeur n'a pas de ligne : (faux, 0).
 */
export const testerStatesOf = async (
  db: Reader,
  projects: { id: string; authorId: string }[],
  viewerId: string,
): Promise<Map<string, TesterState>> => {
  const states = new Map<string, TesterState>()
  if (projects.length === 0) return states
  const t = schema.projectTester
  const rows = await db
    .select({
      projectId: t.projectId,
      count: sql<number>`count(*)::int`,
      mine: sql<boolean>`bool_or(${eq(t.memberId, viewerId)})`,
    })
    .from(t)
    .where(
      inArray(
        t.projectId,
        projects.map((project) => project.id),
      ),
    )
    .groupBy(t.projectId)
  const byProject = new Map(rows.map((row) => [row.projectId, row]))
  for (const { id, authorId } of projects) {
    const row = byProject.get(id)
    states.set(id, {
      isTester: row?.mine ?? false,
      // Le nombre n'est donné qu'à l'auteur du projet.
      testerCount: authorId === viewerId ? (row?.count ?? 0) : null,
    })
  }
  return states
}
