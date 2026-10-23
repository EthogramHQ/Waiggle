// Lecture des notes d'un projet (tranche 4b) : le journal affiché sur la page d'un projet, et
// toutes les notes d'un membre pour l'export de ses données. Qui a le droit de voir quel projet
// est décidé ailleurs (projects/load.ts) : ici, on ne lit que les notes de projets déjà autorisés.
// Une note retirée par la modération (tranche 7a) ne se lit plus que par l'auteur du projet, avec
// l'explication du retrait.
import { PROJECT_NOTES_SHOWN, type ProjectNote, type Removal } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { removalsOf } from '../removals/load'

type Reader = Pick<Database, 'select'>
type NoteRow = Pick<typeof schema.projectNote.$inferSelect, 'id' | 'body' | 'createdAt'>

const n = schema.projectNote

/**
 * Une note de la base, telle que l'API la renvoie (contrat `ProjectNote`). `removal` : le retrait,
 * seulement pour l'auteur du projet ; null pour une note visible et pour tous les autres.
 */
export const toNote = (
  { id, body, createdAt }: NoteRow,
  removal: Removal | null = null,
): ProjectNote => ({
  id,
  body,
  createdAt: createdAt.toISOString(),
  removal,
})

/**
 * La condition « ce membre lit cette note » : elle n'est pas retirée, ou il est l'auteur du projet
 * (`projectAuthorId`, la colonne author_id du projet de la note dans la requête). À écrire dans
 * toute lecture de notes destinée à un membre (journal, fil « Abonnements »).
 */
export const noteShownTo = (projectAuthorId: typeof schema.project.authorId, viewerId: string) =>
  or(isNull(n.removedAt), eq(projectAuthorId, viewerId))

/**
 * Le journal de plusieurs projets, tel que le voit `viewerId` : pour chacun, ses 20 notes les plus
 * récentes, de la plus récente à la plus ancienne. Une seule requête, quel que soit le nombre de
 * projets (et pas une par projet), et une de plus seulement si l'auteur regarde l'une de ses notes
 * retirées (l'explication du retrait, removals/load.ts).
 *
 * En SQL :
 *   select project.id, recent.* from project
 *   cross join lateral (
 *     select id, body, created_at, removed_at, removal_id from project_note
 *     where project_note.project_id = project.id
 *       and (project_note.removed_at is null or project.author_id = $viewer)
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
 * Les notes retirées sont écartées dans la sous-requête, avant « limit 20 » : pour les autres
 * membres, le journal garde ainsi ses 20 notes visibles, sans trou.
 */
export const recentNotesOf = async (
  db: Reader,
  projectIds: string[],
  viewerId: string,
): Promise<Map<string, ProjectNote[]>> => {
  const journals = new Map<string, ProjectNote[]>()
  if (projectIds.length === 0) return journals
  // .as('recent') donne un nom à la sous-requête, pour la lire comme une table.
  const recent = db
    .select({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      removedAt: n.removedAt,
      removalId: n.removalId,
    })
    .from(n)
    .where(and(eq(n.projectId, schema.project.id), noteShownTo(schema.project.authorId, viewerId)))
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(PROJECT_NOTES_SHOWN)
    .as('recent')
  const rows = await db
    .select({
      projectId: schema.project.id,
      id: recent.id,
      body: recent.body,
      createdAt: recent.createdAt,
      removedAt: recent.removedAt,
      removalId: recent.removalId,
    })
    .from(schema.project)
    .crossJoinLateral(recent)
    .where(inArray(schema.project.id, projectIds))
    // L'ordre des lignes n'est garanti que par un « order by » final : on le redonne ici, projet
    // par projet, pour que chaque journal soit rangé du plus récent au plus ancien.
    .orderBy(asc(schema.project.id), desc(recent.createdAt), desc(recent.id))
  // Une note retirée n'arrive ici que pour l'auteur du projet (la condition de la sous-requête).
  const removals = await removalsOf(
    db,
    rows.map((row) => (row.removedAt === null ? null : row.removalId)),
  )
  for (const row of rows) {
    const journal = journals.get(row.projectId) ?? []
    const removal = row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null)
    journal.push(toNote(row, removal))
    journals.set(row.projectId, journal)
  }
  return journals
}

/**
 * Toutes les notes des projets d'un auteur (privés compris), des plus anciennes aux plus récentes :
 * pour l'export de ses données, au-delà des 20 du journal, avec le retrait de celles que la
 * modération a retirées (règle 18 de la relecture du plan : un retrait subi est une donnée qui le
 * concerne).
 *
 * En SQL : select … from project_note inner join project on project.id = project_note.project_id
 * where project.author_id = $auteur order by created_at, id. L'index project_author_created_idx
 * donne les projets de l'auteur, puis project_note_project_created_idx les notes de chacun ; le tri
 * final se fait en mémoire (l'export est rare, et ne concerne que les notes d'un seul membre).
 */
export const notesOfAuthor = async (db: Reader, authorId: string) => {
  const rows = await db
    .select({
      projectId: n.projectId,
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      removedAt: n.removedAt,
      removalId: n.removalId,
    })
    .from(n)
    .innerJoin(schema.project, eq(schema.project.id, n.projectId))
    .where(eq(schema.project.authorId, authorId))
    .orderBy(asc(n.createdAt), asc(n.id))
  const removals = await removalsOf(
    db,
    rows.map((row) => (row.removedAt === null ? null : row.removalId)),
  )
  return rows.map(({ projectId, id, body, createdAt, removedAt, removalId }) => ({
    projectId,
    id,
    body,
    createdAt: createdAt.toISOString(),
    removal: removedAt === null ? null : (removals.get(removalId ?? '') ?? null),
  }))
}
