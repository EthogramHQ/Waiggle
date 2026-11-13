// Lecture des mises à jour d'un projet (R7a) : la dernière et le nombre sur la page du projet, la
// version sous le titre, la version courte des cartes, la frise paginée, et toutes les mises à jour
// d'un membre pour l'export de ses données. Elles remplacent les notes du Journal (tranche 4b).
// Qui a le droit de voir quel projet est décidé ailleurs (projects/load.ts) : ici, on ne lit que
// les mises à jour de projets déjà autorisés. Une mise à jour retirée par la modération ne se lit
// plus que par l'auteur du projet, avec l'explication du retrait ; sur une carte, elle ne compte
// pour personne (relecture de sécurité B4).
import {
  type ProjectUpdate,
  type UpdateLineOut,
  UpdateLineOut as UpdateLineSchema,
  type UpdateSummary,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm'
import { type MediaRow, toVisual } from '../projects/visual'
import { removalsOf } from '../removals/load'

type Reader = Pick<Database, 'select'>

const u = schema.projectUpdate

/**
 * Les lignes d'une mise à jour, relues avec méfiance (relecture de sécurité A7) : elles sont gardées
 * en JSON, et une ligne abîmée (écrite avant une règle plus stricte, ou à la main) ne doit pas
 * casser le fil de tout le monde. On garde chaque ligne bien formée et on écarte les autres ; si
 * le JSON n'est même pas un tableau, il n'en reste aucune.
 */
export const readLines = (lines: unknown): UpdateLineOut[] => {
  if (!Array.isArray(lines)) return []
  return lines.flatMap((line) => {
    const parsed = UpdateLineSchema.safeParse(line)
    return parsed.success ? [parsed.data] : []
  })
}

/**
 * La condition « ce membre lit cette mise à jour » : elle n'est pas retirée, ou il est l'auteur du
 * projet (`projectAuthorId`, la colonne author_id du projet de la mise à jour dans la requête). Une
 * seule règle, sur `project_update.removed_at` seul, pour la frise, la page du projet, le fil, les
 * notifications et le récap (relecture de sécurité B4). Pour une carte, le fil, les notifications
 * et le récap, une mise à jour retirée ne compte pour personne, pas même l'auteur : voir
 * `updateOnCards`.
 */
export const updateShownTo = (projectAuthorId: typeof schema.project.authorId, viewerId: string) =>
  or(isNull(u.removedAt), eq(projectAuthorId, viewerId))

/** « Pas retirée » : ce qui compte sur une carte, pour tout le monde, auteur compris (B4). */
export const updateOnCards = () => isNull(u.removedAt)

/**
 * « Au moins une ligne lisible », écrit en SQL pour que les nombres, la dernière mise à jour et
 * les pages comptent comme la lecture en JavaScript (`readLines`) : une mise à jour dont toutes
 * les lignes sont abîmées n'existe pour personne.
 *
 * En SQL : case when jsonb_typeof(lines) = 'array' then exists (select 1 from
 * jsonb_array_elements(lines) as line where line->>'family' in (…) and jsonb_typeof(line->'text')
 * = 'string') else false end
 * `jsonb_array_elements` déplie un tableau JSON en une ligne par élément (elle échoue sur autre
 * chose qu'un tableau : le `case` garantit qu'on ne l'appelle que sur un tableau). Le nom de la
 * table est écrit en toutes lettres (sql.raw, du texte fixe) : Drizzle écrit parfois une colonne
 * sans lui.
 */
export const hasReadableLines = (): SQL<boolean> =>
  sql<boolean>`(case when jsonb_typeof(${sql.raw('project_update.lines')}) = 'array'
    then exists (select 1 from jsonb_array_elements(${sql.raw('project_update.lines')}) as line
      where line->>'family' in ('new', 'fixed', 'polish') and jsonb_typeof(line->'text') = 'string')
    else false end)`

type UpdateRow = Pick<
  typeof schema.projectUpdate.$inferSelect,
  'id' | 'title' | 'version' | 'lines' | 'beforeAfter' | 'createdAt'
>

/**
 * Une mise à jour de la base, telle que l'API la renvoie (contrat `ProjectUpdate`). `photos` : ses
 * photos rattachées, dans l'ordre. `removal` : le retrait, seulement pour l'auteur du projet.
 */
export const toUpdate = (
  row: UpdateRow,
  photos: MediaRow[],
  publicApiUrl: string,
  removal: ProjectUpdate['removal'] = null,
): ProjectUpdate => ({
  id: row.id,
  title: row.title,
  version: row.version,
  lines: readLines(row.lines),
  photos: photos.map((photo) => toVisual(photo, publicApiUrl)),
  beforeAfter: row.beforeAfter,
  createdAt: row.createdAt.toISOString(),
  removal,
  // Provisoire (R9) : la tranche « retrait d’une partie » remplira ce champ, avec ses tests.
  removedParts: [],
})

/**
 * Les photos rattachées à ces mises à jour, par mise à jour, dans leur ordre : une seule requête
 * pour toute la liste. L'index project_media_update_idx (update_id) donne les lignes de chacune.
 */
export const photosOfUpdates = async (db: Reader, updateIds: string[]) => {
  const byUpdate = new Map<string, MediaRow[]>()
  if (updateIds.length === 0) return byUpdate
  const rows = await db
    .select()
    .from(schema.projectMedia)
    .where(inArray(schema.projectMedia.updateId, updateIds))
    .orderBy(asc(schema.projectMedia.position), asc(schema.projectMedia.createdAt))
  for (const row of rows) {
    if (row.updateId === null) continue
    const list = byUpdate.get(row.updateId) ?? []
    list.push(row)
    byUpdate.set(row.updateId, list)
  }
  return byUpdate
}

/** Des lignes de mises à jour en `ProjectUpdate`, avec leurs photos et leurs retraits (2 requêtes). */
const withPhotosAndRemovals = async (
  db: Reader,
  rows: (UpdateRow & { removedAt: Date | null; removalId: string | null })[],
  publicApiUrl: string,
): Promise<ProjectUpdate[]> => {
  const [photos, removals] = await Promise.all([
    photosOfUpdates(
      db,
      rows.map((row) => row.id),
    ),
    // Une mise à jour retirée n'arrive ici que pour l'auteur du projet (updateShownTo).
    removalsOf(
      db,
      rows.map((row) => (row.removedAt === null ? null : row.removalId)),
    ),
  ])
  return rows.map((row) =>
    toUpdate(
      row,
      photos.get(row.id) ?? [],
      publicApiUrl,
      row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null),
    ),
  )
}

const updateColumns = {
  id: u.id,
  title: u.title,
  version: u.version,
  lines: u.lines,
  beforeAfter: u.beforeAfter,
  createdAt: u.createdAt,
  removedAt: u.removedAt,
  removalId: u.removalId,
}

/**
 * La dernière mise à jour de chaque projet, telle que la voit `viewerId` : en entier, avec ses
 * photos (la section « Les mises à jour » de la page d'un projet). Une retirée n'est là que pour
 * l'auteur, avec `removal`. Trois requêtes au plus, quel que soit le nombre de projets.
 *
 * En SQL :
 *   select project.id, latest.* from project
 *   cross join lateral (
 *     select … from project_update
 *     where project_update.project_id = project.id and (removed_at is null or project.author_id = $viewer)
 *       and <lignes lisibles>
 *     order by created_at desc, id desc limit 1
 *   ) latest where project.id in (…)
 *
 * « lateral » : une sous-requête qui a le droit de lire la ligne en cours de la table d'à côté (ici
 * project.id) ; PostgreSQL la relance pour chaque projet, et l'index project_update_project_created_idx
 * lui donne directement la plus récente, sans trier. Un projet sans mise à jour ne donne aucune
 * ligne.
 */
export const latestUpdatesOf = async (
  db: Reader,
  projectIds: string[],
  viewerId: string,
  publicApiUrl: string,
): Promise<Map<string, ProjectUpdate>> => {
  const latestByProject = new Map<string, ProjectUpdate>()
  if (projectIds.length === 0) return latestByProject
  const latest = db
    .select(updateColumns)
    .from(u)
    .where(
      and(
        eq(u.projectId, schema.project.id),
        updateShownTo(schema.project.authorId, viewerId),
        hasReadableLines(),
      ),
    )
    .orderBy(desc(u.createdAt), desc(u.id))
    .limit(1)
    .as('latest')
  const rows = await db
    .select({
      projectId: schema.project.id,
      id: latest.id,
      title: latest.title,
      version: latest.version,
      lines: latest.lines,
      beforeAfter: latest.beforeAfter,
      createdAt: latest.createdAt,
      removedAt: latest.removedAt,
      removalId: latest.removalId,
    })
    .from(schema.project)
    .crossJoinLateral(latest)
    .where(inArray(schema.project.id, projectIds))
  const updates = await withPhotosAndRemovals(db, rows, publicApiUrl)
  rows.forEach((row, index) => {
    const update = updates[index]
    if (update) latestByProject.set(row.projectId, update)
  })
  return latestByProject
}

/**
 * Le nombre de mises à jour que `viewerId` voit, par projet (« Voir les 3 mises à jour ») : une
 * seule requête, `group by project_id`. L'auteur compte aussi ses mises à jour retirées, les autres
 * non (updateShownTo). Un projet sans mise à jour n'est pas dans la carte : c'est 0.
 */
export const updateCountsOf = async (
  db: Reader,
  projects: { id: string; authorId: string }[],
  viewerId: string,
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>()
  if (projects.length === 0) return counts
  const rows = await db
    .select({ projectId: u.projectId, count: sql<number>`count(*)::int` })
    .from(u)
    .innerJoin(schema.project, eq(schema.project.id, u.projectId))
    .where(
      and(
        inArray(
          u.projectId,
          projects.map((project) => project.id),
        ),
        updateShownTo(schema.project.authorId, viewerId),
        hasReadableLines(),
      ),
    )
    .groupBy(u.projectId)
  for (const row of rows) counts.set(row.projectId, row.count)
  return counts
}

/**
 * Ce que montre une carte, et le titre d'un projet, par projet : la dernière mise à jour non
 * retirée en version courte (`latest`), et `version`, celle de la dernière mise à jour non retirée
 * qui en a une (pas forcément la même ligne : la dernière peut ne pas avoir de version). Jamais une
 * retirée, pas même pour l'auteur (B4). Deux requêtes « lateral » (voir latestUpdatesOf), lancées
 * ensemble, quel que soit le nombre de projets ; l'index project_update_project_created_idx les sert.
 */
export const updateSummariesOf = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, { latest: UpdateSummary | null; version: string | null }>> => {
  const summaries = new Map<string, { latest: UpdateSummary | null; version: string | null }>()
  if (projectIds.length === 0) return summaries
  const latestOf = db
    .select({ id: u.id, version: u.version, lines: u.lines, createdAt: u.createdAt })
    .from(u)
    .where(and(eq(u.projectId, schema.project.id), updateOnCards(), hasReadableLines()))
    .orderBy(desc(u.createdAt), desc(u.id))
    .limit(1)
    .as('latest')
  const versionOf = db
    .select({ version: u.version })
    .from(u)
    .where(
      and(
        eq(u.projectId, schema.project.id),
        updateOnCards(),
        isNotNull(u.version),
        hasReadableLines(),
      ),
    )
    .orderBy(desc(u.createdAt), desc(u.id))
    .limit(1)
    .as('with_version')
  const [latestRows, versionRows] = await Promise.all([
    db
      .select({
        projectId: schema.project.id,
        id: latestOf.id,
        version: latestOf.version,
        lines: latestOf.lines,
        createdAt: latestOf.createdAt,
      })
      .from(schema.project)
      .crossJoinLateral(latestOf)
      .where(inArray(schema.project.id, projectIds)),
    db
      .select({ projectId: schema.project.id, version: versionOf.version })
      .from(schema.project)
      .crossJoinLateral(versionOf)
      .where(inArray(schema.project.id, projectIds)),
  ])
  for (const id of projectIds) summaries.set(id, { latest: null, version: null })
  for (const row of latestRows) {
    const [firstLine, ...others] = readLines(row.lines)
    if (!firstLine) continue
    summaries.set(row.projectId, {
      latest: {
        id: row.id,
        at: row.createdAt.toISOString(),
        version: row.version,
        firstLine,
        lineCount: others.length + 1,
      },
      version: null,
    })
  }
  for (const row of versionRows) {
    const entry = summaries.get(row.projectId)
    if (entry) entry.version = row.version
  }
  return summaries
}

/**
 * Une page de la frise d'un projet, de la plus récente à la plus ancienne : `limit + 1` lignes
 * (la dernière sert à savoir s'il y a une suite). Le filtre « retirée » et « lignes lisibles »
 * s'applique AVANT la limite : la page est pleine même quand des mises à jour retirées s'y glissent.
 * `after` : la condition du curseur (voir cursor.ts), déjà écrite par la route.
 *
 * En SQL : select … from project_update inner join project on project.id = project_update.project_id
 * where project_update.project_id = $1 and (removed_at is null or project.author_id = $viewer) and
 * <lignes lisibles> and (created_at, id) < ($date, $id) order by created_at desc, id desc limit 21.
 * L'index project_update_project_created_idx (project_id, created_at desc, id desc) rend les lignes
 * dans cet ordre : PostgreSQL s'arrête à la 21e, sans trier ; la jointure ne lit que la ligne du
 * projet (clé primaire).
 */
export const updatesPageOf = async (
  db: Reader,
  projectId: string,
  viewerId: string,
  after: SQL | undefined,
  limit: number,
  publicApiUrl: string,
): Promise<ProjectUpdate[]> => {
  const rows = await db
    .select(updateColumns)
    .from(u)
    .innerJoin(schema.project, eq(schema.project.id, u.projectId))
    .where(
      and(
        eq(u.projectId, projectId),
        updateShownTo(schema.project.authorId, viewerId),
        hasReadableLines(),
        after,
      ),
    )
    .orderBy(desc(u.createdAt), desc(u.id))
    .limit(limit)
  return withPhotosAndRemovals(db, rows, publicApiUrl)
}

/**
 * Toutes les mises à jour des projets d'un auteur (privés compris), des plus anciennes aux plus
 * récentes : pour l'export de ses données, au-delà de ce que montre la frise, avec le titre du
 * projet, les descriptions des photos et le retrait de celles que la modération a retirées (un
 * retrait subi est une donnée qui concerne le membre). Une seule ligne par mise à jour, quelle que
 * soit la longueur : trois requêtes (mises à jour, photos, retraits).
 *
 * En SQL : select … from project_update inner join project on project.id = project_update.project_id
 * where project.author_id = $auteur order by created_at, id. L'index project_author_created_idx
 * donne les projets de l'auteur, puis project_update_project_created_idx les mises à jour de
 * chacun ; le tri final se fait en mémoire (l'export est rare, et ne concerne qu'un membre).
 */
export const updatesOfAuthor = async (db: Reader, authorId: string) => {
  const rows = await db
    .select({
      projectId: u.projectId,
      projectTitle: schema.project.title,
      ...updateColumns,
    })
    .from(u)
    .innerJoin(schema.project, eq(schema.project.id, u.projectId))
    .where(eq(schema.project.authorId, authorId))
    .orderBy(asc(u.createdAt), asc(u.id))
  const [photos, removals] = await Promise.all([
    photosOfUpdates(
      db,
      rows.map((row) => row.id),
    ),
    removalsOf(
      db,
      rows.map((row) => (row.removedAt === null ? null : row.removalId)),
    ),
  ])
  return rows.map((row) => ({
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    id: row.id,
    title: row.title,
    version: row.version,
    lines: readLines(row.lines),
    beforeAfter: row.beforeAfter,
    photoDescriptions: (photos.get(row.id) ?? []).map((photo) => photo.description),
    createdAt: row.createdAt.toISOString(),
    removal: row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null),
  }))
}
