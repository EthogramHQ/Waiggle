// Lecture des deux fils de l'accueil (tranche 4) : « Abonnements » et « Découvrir ». Ils montrent
// les nouveaux projets publics, du plus récent au plus ancien, par pages de 20, et se lisent avec
// un curseur (cursor.ts : pourquoi un curseur plutôt qu'un numéro de page). « Abonnements » y mêle
// les notes des projets suivis (tranche 4b).
import {
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedPage,
  type FollowingFeedPage,
  PROJECT_NOTES_SHOWN,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { followsAnyone } from '../follows/load'
import { toNote } from '../notes/load'
import { rowToSummary, selectMedia, selectProjects } from '../projects/load'
import { listedProject } from '../projects/visibility'

const t = schema.project
const n = schema.projectNote

/**
 * Une page du fil « Découvrir » : les projets publics qui remplissent `where`, après le curseur
 * s'il y en a un. Toujours deux requêtes, quel que soit le nombre de cartes : les projets (avec
 * leur auteur), puis les médias de tous ces projets à la fois (pour les couvertures).
 */
const loadPage = async (
  db: Database,
  where: SQL | undefined,
  cursor: CursorContent | null,
  viewerId: string,
  publicApiUrl: string,
): Promise<FeedPage> => {
  const rows = await selectProjects(db)
    .where(
      and(
        // Un projet privé ou retiré n'apparaît dans aucun fil, même pour son auteur. L'index
        // partiel project_public_published_idx (visibility = 'public') sert toujours : « removed_at
        // is null » écarte au passage les quelques projets retirés qu'il contient.
        listedProject(),
        isNotNull(t.publishedAt),
        where,
        cursor ? after(cursor, t.publishedAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(t.publishedAt), desc(t.id))
    // Un de plus que la page : s'il existe, il reste une suite (et il ouvrira la page suivante).
    .limit(FEED_PAGE_SIZE + 1)

  const page = rows.slice(0, FEED_PAGE_SIZE)
  const media = await selectMedia(
    db,
    page.map((row) => row.project.id),
  )
  // flatMap : publishedAt n'est jamais null ici (la requête l'exige), mais TypeScript ne le sait
  // pas ; une ligne sans date est simplement laissée de côté.
  const items: FeedItem[] = page.flatMap((row) =>
    row.project.publishedAt
      ? [
          {
            kind: 'project' as const,
            at: row.project.publishedAt.toISOString(),
            project: rowToSummary(row, media, viewerId, publicApiUrl),
          },
        ]
      : [],
  )
  const last = items.at(-1)
  return {
    items,
    nextCursor:
      rows.length > FEED_PAGE_SIZE && last
        ? encodeCursor({ at: last.at, id: last.project.id })
        : null,
  }
}

/**
 * Une ligne du fil « Abonnements », avant d'être complétée : de quelle sorte d'élément il s'agit,
 * sa date et son identifiant (ceux du curseur), le projet concerné, et le texte d'une note (null
 * pour un nouveau projet).
 */
type Entry = {
  kind: FeedItem['kind']
  at: Date
  id: string
  projectId: string
  body: string | null
}

/**
 * Les lignes d'une page du fil « Abonnements », après le curseur : les nouveaux projets des membres
 * suivis ET les notes des projets suivis, mêlés dans un seul ordre (date desc, identifiant desc).
 * Une seule requête, en trois morceaux.
 *
 * 1. Les nouveaux projets publics des membres suivis, comme en 4a : author_id in (select member_id
 *    from member_follow where follower_id = $viewer). La clé primaire de member_follow donne les
 *    membres suivis, l'index (author_id, published_at) de project les projets de chacun. Au plus
 *    21, les plus récents après le curseur.
 *
 * 2. Les notes des projets publics suivis. Pour chaque projet suivi (la clé primaire de
 *    project_follow, qui commence par follower_id), encore public (la clé primaire de project), une
 *    sous-requête « lateral » (voir notes/load.ts) prend ses 21 notes les plus récentes après le
 *    curseur, dans l'index project_note_project_created_idx, et s'arrête là. Puis on garde les 21
 *    plus récentes de toutes. Sans « lateral », PostgreSQL lirait toutes les notes de chaque projet
 *    suivi après le curseur, même s'il y en a des milliers, pour n'en garder que 21.
 *
 * 3. « union all » met les deux listes bout à bout, en une seule (« all » : sans chercher les
 *    doublons, inutile ici puisqu'un projet et une note ne sont jamais la même ligne). Les deux
 *    morceaux doivent donner les mêmes colonnes, dans le même ordre : d'où `kind` ('project' ou
 *    'note', écrit en dur dans chaque morceau) et `body` (null pour un projet). Le tout est trié
 *    une dernière fois et coupé à 21 : les 21 premiers de l'ensemble sont forcément parmi les 21
 *    premiers de chaque morceau, d'où la limite de 21 dans chacun.
 *
 * Le curseur est commun aux deux sortes d'éléments : { at, id } du dernier élément de la page,
 * projet ou note. Un projet est daté par published_at, une note par created_at, et tous deux sont
 * rangés par (date desc, identifiant desc) : « après le curseur » a donc le même sens dans les deux
 * morceaux, et des ex aequo de deux sortes au même instant sont départagés par leur identifiant.
 */
const selectFollowingEntries = (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
): Promise<Entry[]> => {
  const followedMembers = db
    .select({ id: schema.memberFollow.memberId })
    .from(schema.memberFollow)
    .where(eq(schema.memberFollow.followerId, viewerId))
  const newProjects = db
    .select({
      // sql<…>`…` : une valeur écrite en SQL, dont on donne le type à TypeScript. .as() la nomme.
      kind: sql<FeedItem['kind']>`'project'`.as('kind'),
      // published_at n'est jamais null ici (la condition l'exige) : on le dit à TypeScript, pour
      // que la colonne ait le même type que la date d'une note. mapWith la lit comme la colonne.
      at: sql<Date>`${t.publishedAt}`.mapWith(t.publishedAt).as('at'),
      id: t.id,
      projectId: sql<string>`${t.id}`.as('project_id'),
      body: sql<string | null>`null::text`.as('body'),
    })
    .from(t)
    .where(
      and(
        // Un projet privé ou retiré n'apparaît dans aucun fil, même pour son auteur.
        listedProject(),
        isNotNull(t.publishedAt),
        inArray(t.authorId, followedMembers),
        cursor ? after(cursor, t.publishedAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(t.publishedAt), desc(t.id))
    .limit(FEED_PAGE_SIZE + 1)

  const f = schema.projectFollow
  // Les 21 notes d'un projet suivi qui suivent le curseur. f.projectId : le projet de la ligne en
  // cours de project_follow, que « lateral » permet de lire depuis la sous-requête.
  const recentNotes = db
    .select({ id: n.id, body: n.body, createdAt: n.createdAt })
    .from(n)
    .where(
      and(
        eq(n.projectId, f.projectId),
        cursor ? after(cursor, n.createdAt, n.id) : undefined,
        // Une note retirée par la modération n'arrive jamais dans le fil (tranche 7a) : un abonné
        // ne peut pas être l'auteur du projet, qui seul la lit encore (on ne suit pas ses projets).
        isNull(n.removedAt),
        // Seulement parmi les 20 notes les plus récentes du projet, celles de son journal : une note
        // lisible par les abonnés doit toujours être visible, et supprimable, par son auteur. On
        // compte les notes plus récentes que celle-ci (« newer ») : moins de 20, elle est au journal.
        // Les notes retirées ne comptent pas, comme dans le journal que lisent les autres
        // (notes/load.ts) : elles n'y prennent pas de place.
        sql`(select count(*) from ${n} as newer where newer.project_id = ${n.projectId} and newer.removed_at is null and (newer.created_at, newer.id) > (${n.createdAt}, ${n.id})) < ${PROJECT_NOTES_SHOWN}`,
      ),
    )
    .orderBy(desc(n.createdAt), desc(n.id))
    .limit(FEED_PAGE_SIZE + 1)
    .as('recent_notes')
  const notes = db
    .select({
      kind: sql<FeedItem['kind']>`'note'`.as('kind'),
      at: recentNotes.createdAt,
      id: recentNotes.id,
      projectId: f.projectId,
      body: recentNotes.body,
    })
    .from(f)
    // Seulement les projets encore publics et pas retirés : un projet suivi devenu privé ne montre
    // plus rien, pas même à son auteur (qui ne peut d'ailleurs pas suivre ses propres projets).
    .innerJoin(t, and(eq(t.id, f.projectId), listedProject()))
    .crossJoinLateral(recentNotes)
    .where(eq(f.followerId, viewerId))
    .orderBy(desc(recentNotes.createdAt), desc(recentNotes.id))
    .limit(FEED_PAGE_SIZE + 1)

  // L'ordre final porte sur les colonnes du résultat de l'union, nommées « at » et « id ».
  return unionAll(newProjects, notes)
    .orderBy(desc(sql.identifier('at')), desc(sql.identifier('id')))
    .limit(FEED_PAGE_SIZE + 1)
}

/**
 * Le fil « Abonnements » : les nouveaux projets publics des membres que `viewerId` suit, et les
 * notes des projets publics qu'il suit. Suivre un membre fait venir ses nouveaux projets, pas les
 * notes de ses projets ; suivre un projet fait venir ses notes.
 *
 * Toujours le même nombre de requêtes, quelle que soit la page : les lignes (une requête), les
 * projets de ces lignes avec leur auteur (une), leurs médias pour les couvertures (une), et deux
 * petites requêtes pour followsAnyone.
 */
export const loadFollowingFeed = async (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
  publicApiUrl: string,
): Promise<FollowingFeedPage> => {
  const [entries, anyone] = await Promise.all([
    selectFollowingEntries(db, viewerId, cursor),
    followsAnyone(db, viewerId),
  ])
  const page = entries.slice(0, FEED_PAGE_SIZE)

  // Les projets de la page, lus en une requête (plusieurs notes d'un même projet n'en demandent
  // qu'un : new Set retire les doublons). La condition « public » est redite : si un projet est
  // devenu privé entre les deux requêtes, ses éléments sont laissés de côté.
  const projectIds = [...new Set(page.map((entry) => entry.projectId))]
  const rows =
    projectIds.length === 0
      ? []
      : await selectProjects(db).where(and(inArray(t.id, projectIds), listedProject()))
  const media = await selectMedia(
    db,
    rows.map((row) => row.project.id),
  )
  const summaries = new Map(
    rows.map((row) => [row.project.id, rowToSummary(row, media, viewerId, publicApiUrl)]),
  )

  const items = page.flatMap((entry): FeedItem[] => {
    const project = summaries.get(entry.projectId)
    if (!project) return []
    const at = entry.at.toISOString()
    if (entry.kind === 'project') return [{ kind: 'project', at, project }]
    // Une note : body n'est jamais null pour elle (la colonne l'interdit), mais TypeScript ne le
    // sait pas ; une ligne sans texte est simplement laissée de côté.
    if (entry.body === null) return []
    const note = toNote({ id: entry.id, body: entry.body, createdAt: entry.at })
    return [{ kind: 'note', at, note, project }]
  })

  // Le marque-page vient de la dernière ligne de la page, même si son élément a été laissé de côté
  // juste au-dessus : la page suivante repart ainsi exactement d'où celle-ci s'arrête.
  const last = page.at(-1)
  return {
    items,
    nextCursor:
      entries.length > FEED_PAGE_SIZE && last
        ? encodeCursor({ at: last.at.toISOString(), id: last.id })
        : null,
    followsAnyone: anyone,
  }
}

/**
 * Le fil « Découvrir » : tous les projets publics, ceux du visiteur compris (jamais de note).
 * `testers` : seulement ceux qui cherchent des testeurs (au statut « testable », avec un lien de
 * démo). L'index partiel project_public_published_idx est déjà rangé dans l'ordre du fil.
 */
export const loadDiscoverFeed = (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
  testers: boolean,
  publicApiUrl: string,
): Promise<FeedPage> =>
  loadPage(
    db,
    testers ? and(eq(t.status, 'testable'), isNotNull(t.demoUrl)) : undefined,
    cursor,
    viewerId,
    publicApiUrl,
  )
