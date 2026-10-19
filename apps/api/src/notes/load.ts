// Lecture des notes d'un projet (tranche 4b) : le journal affiché sur la page d'un projet, et
// toutes les notes d'un membre pour l'export de ses données. Qui a le droit de voir quel projet
// est décidé ailleurs (projects/load.ts) : ici, on ne lit que les notes de projets déjà autorisés.
import { PROJECT_NOTES_SHOWN, type ProjectNote } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, desc, eq, inArray } from 'drizzle-orm'

type Reader = Pick<Database, 'select'>
type NoteRow = Pick<typeof schema.projectNote.$inferSelect, 'id' | 'body' | 'createdAt'>

const n = schema.projectNote

/** Une note de la base, telle que l'API la renvoie (contrat `ProjectNote`). */
export const toNote = ({ id, body, createdAt }: NoteRow): ProjectNote => ({
  id,
  body,
  createdAt: createdAt.toISOString(),
})

/**
 * Le journal de plusieurs projets : pour chacun, ses 20 notes les plus récentes, de la plus récente
 * à la plus ancienne. Une seule requête, quel que soit le nombre de projets (et pas une par
 * projet).
 *
 * En SQL :
 *   select project.id, recent.* from project
 *   cross join lateral (
 *     select id, body, created_at from project_note
 *     where project_note.project_id = project.id
 *     order by created_at desc, id desc limit 20
 *   ) recent
 *   where project.id in (…)
 *
 * « lateral » : une sous-requête qui a le droit de lire la ligne en cours de la table d'à côté
 * (ici, project.id). PostgreSQL la relance pour chaque projet de la liste, comme une boucle : à
 * chaque tour, l'index project_note_project_created_idx lui donne directement les 20 dernières
 * notes de ce projet, et il s'arrête là. Sans « lateral », il faudrait lire toutes les notes de
 * tous ces projets pour n'en garder que 20 chacun. « cross join » : chaque projet est associé à
 * chacune de ses notes ; un projet sans note ne donne aucune ligne (son journal est vide).
 */
export const recentNotesOf = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, ProjectNote[]>> => {
  const journals = new Map<string, ProjectNote[]>()
  if (projectIds.length === 0) return journals
  // .as('recent') donne un nom à la sous-requête, pour la lire comme une table.
  const recent = db
    .select({ id: n.id, body: n.body, createdAt: n.createdAt })
    .from(n)
    .where(eq(n.projectId, schema.project.id))
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(PROJECT_NOTES_SHOWN)
    .as('recent')
  const rows = await db
    .select({
      projectId: schema.project.id,
      id: recent.id,
      body: recent.body,
      createdAt: recent.createdAt,
    })
    .from(schema.project)
    .crossJoinLateral(recent)
    .where(inArray(schema.project.id, projectIds))
    // L'ordre des lignes n'est garanti que par un « order by » final : on le redonne ici, projet
    // par projet, pour que chaque journal soit rangé du plus récent au plus ancien.
    .orderBy(asc(schema.project.id), desc(recent.createdAt), desc(recent.id))
  for (const row of rows) {
    const journal = journals.get(row.projectId) ?? []
    journal.push(toNote(row))
    journals.set(row.projectId, journal)
  }
  return journals
}

/**
 * Toutes les notes des projets d'un auteur (privés compris), des plus anciennes aux plus récentes :
 * pour l'export de ses données, au-delà des 20 du journal.
 *
 * En SQL : select … from project_note inner join project on project.id = project_note.project_id
 * where project.author_id = $auteur order by created_at, id. L'index project_author_created_idx
 * donne les projets de l'auteur, puis project_note_project_created_idx les notes de chacun ; le tri
 * final se fait en mémoire (l'export est rare, et ne concerne que les notes d'un seul membre).
 */
export const notesOfAuthor = (db: Reader, authorId: string) =>
  db
    .select({ projectId: n.projectId, id: n.id, body: n.body, createdAt: n.createdAt })
    .from(n)
    .innerJoin(schema.project, eq(schema.project.id, n.projectId))
    .where(eq(schema.project.authorId, authorId))
    .orderBy(asc(n.createdAt), asc(n.id))
