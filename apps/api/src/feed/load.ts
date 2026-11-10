// Lecture des deux fils de l'accueil (tranche 4) : « Abonnements » et « Découvrir ». Ils montrent
// les nouveaux projets publics, du plus récent au plus ancien, par pages de 20, et se lisent avec
// un curseur (cursor.ts : pourquoi un curseur plutôt qu'un numéro de page). Depuis R7a,
// « Abonnements » fait remonter un projet suivi, ou d'un membre suivi, à sa dernière mise à jour :
// chaque projet n'y paraît qu'une fois, à son événement le plus récent (sa publication ou sa
// dernière mise à jour). Les notes du Journal (tranche 4b) n'y sont plus.
import {
  type DiscoverFeedPage,
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedPage,
  type FollowingFeedPage,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNotNull, ne, or, type SQL, sql } from 'drizzle-orm'
import { unionAll } from 'drizzle-orm/pg-core'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { followedAmong, followsAnyone } from '../follows/load'
import { rowsToSummaries, selectProjects } from '../projects/load'
import { listedProjectFor, listedVerifiedProjectFor } from '../projects/visibility'
import { hasReadableLines, updateOnCards } from '../updates/load'

const t = schema.project
const u = schema.projectUpdate

/**
 * Une page du fil « Découvrir » : les projets publics qui remplissent `where`, après le curseur
 * s'il y en a un. Toujours trois requêtes, quel que soit le nombre de cartes : les projets (avec
 * leur auteur), puis, en même temps, les médias de tous ces projets (pour les couvertures) et le
 * total de leurs réactions (rowsToSummaries).
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
        // is null » écarte au passage les quelques projets retirés qu'il contient. Tranche 7b :
        // ni celui d'un membre bloqué avec le visiteur (listedProjectFor), écarté par deux
        // « exists » sur member_block, chacun servi par un index (blocks/visibility.ts).
        // R4 (W4) : ni celui d'un auteur qui n'a jamais vérifié son adresse, absent pour tous
        // comme dans la recherche (verifiedAuthor : une lecture de la clé primaire de "user" par
        // projet lu, au plus 21 ici).
        listedVerifiedProjectFor(viewerId),
        isNotNull(t.publishedAt),
        where,
        cursor ? after(cursor, t.publishedAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(t.publishedAt), desc(t.id))
    // Un de plus que la page : s'il existe, il reste une suite (et il ouvrira la page suivante).
    .limit(FEED_PAGE_SIZE + 1)

  const page = rows.slice(0, FEED_PAGE_SIZE)
  const summaries = await rowsToSummaries(db, page, viewerId, publicApiUrl)
  // flatMap : publishedAt n'est jamais null ici (la requête l'exige), mais TypeScript ne le sait
  // pas ; une ligne sans date est simplement laissée de côté. Les résumés sont dans l'ordre des
  // lignes : summaries[i] est celui de page[i].
  const items: FeedItem[] = page.flatMap((row, i) => {
    const project = summaries[i]
    return row.project.publishedAt && project
      ? [{ kind: 'project' as const, at: row.project.publishedAt.toISOString(), project }]
      : []
  })
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
 * sa date (celle du curseur), le projet concerné (l'identifiant du curseur : un projet n'est jamais
 * deux fois dans le fil), et la mise à jour qui le fait remonter (null pour une publication).
 */
type Entry = {
  kind: FeedItem['kind']
  at: Date
  projectId: string
  updateId: string | null
}

/**
 * « Le projet en cours a une mise à jour qui compte sur une carte, plus récente que sa
 * publication » : alors son événement le plus récent n'est plus sa publication. Les mêmes règles
 * que la carte (updateOnCards : pas retirée ; hasReadableLines : au moins une ligne lisible).
 *
 * En SQL : (select 1 from project_update where project_update.project_id = project.id
 *   and removed_at is null and <lignes lisibles> and created_at > project.published_at limit 1)
 *   is not null
 * Une recherche dans l'index project_update_project_created_idx (project_id, created_at desc) par
 * projet lu. La forme « (select 1 … limit 1) is not null » plutôt que « exists » : dans un « or »,
 * PostgreSQL pourrait faire d'un exists une lecture de toute la table (pièges de code-api.md). Les
 * noms de colonnes sont écrits en toutes lettres (sql.raw, du texte fixe) : dans un « select » sur
 * la seule table project, Drizzle écrirait « id » sans sa table, qui serait alors celui de
 * project_update.
 */
const raisedByAnUpdate = () =>
  sql`(select 1 from ${u}
    where ${sql.raw('project_update.project_id')} = ${sql.raw('project.id')}
      and ${updateOnCards()} and ${hasReadableLines()}
      and ${sql.raw('project_update.created_at')} > ${sql.raw('project.published_at')}
    limit 1) is not null`

/**
 * Les lignes d'une page du fil « Abonnements », après le curseur : chaque projet une seule fois, à
 * son événement le plus récent, dans un seul ordre (date desc, identifiant du projet desc). Une
 * seule requête, en trois morceaux, qui ne se recouvrent jamais :
 *
 * 1. Les publications : les projets publics des membres suivis et ceux du lecteur, à leur
 *    published_at, comme en 4a et R6a ; author_id in (select member_id from member_follow where
 *    follower_id = $viewer union all select $viewer). La clé primaire de member_follow donne les
 *    membres suivis, l'index (author_id, published_at) de project les projets de chacun. Au plus
 *    21, les plus récents après le curseur. Sauf le projet d'un membre suivi qu'une mise à jour plus
 *    récente fait remonter (raisedByAnUpdate) : il est dans le morceau 2. Ses propres projets
 *    restent toujours à leur publication : ses mises à jour ne les font pas remonter (plan R7a).
 *
 * 2. Les mises à jour : les projets publics que le lecteur suit (la clé primaire de project_follow,
 *    qui commence par follower_id), ou dont il suit l'auteur (member_follow, puis l'index d'auteur
 *    de project), sauf les siens. « union » (sans « all ») retire les doublons : un projet suivi
 *    dont on suit aussi l'auteur ne vient qu'une fois. Pour chacun, une sous-requête « lateral »
 *    prend sa dernière mise à jour qui compte sur une carte (voir latestUpdatesOf, updates/load.ts),
 *    dans l'index project_update_project_created_idx, sans trier. Le projet n'est gardé que si
 *    cette mise à jour est son événement le plus récent : plus récente que sa publication, ou un
 *    projet suivi dont on ne suit pas l'auteur (sa publication n'est pas dans le fil). Puis le
 *    curseur, et les 21 plus récents.
 *
 * 3. « union all » met les deux listes bout à bout (« all » : sans chercher les doublons, il n'y en
 *    a pas, les deux conditions sont contraires). Les deux morceaux donnent les mêmes colonnes, dans
 *    le même ordre : `kind` ('project' ou 'update', écrit en dur) et `update_id` (null pour une
 *    publication). Le tout est trié une dernière fois et coupé à 21 : les 21 premiers de l'ensemble
 *    sont forcément parmi les 21 premiers de chaque morceau.
 *
 * Le curseur est `(at, project_id)` du dernier élément de la page. Un projet n'ayant qu'une ligne,
 * à une seule date, « après le curseur » ne peut ni le répéter ni le perdre d'une page à l'autre, et
 * des ex aequo au même instant sont départagés par l'identifiant du projet. La condition du curseur
 * s'applique APRÈS le choix de l'événement le plus récent : sinon un projet déjà montré en haut, à
 * sa mise à jour, reviendrait plus bas à sa publication.
 *
 * Le prix : le morceau 2 lit la dernière mise à jour de chaque projet suivi et de chaque projet des
 * membres suivis (une recherche d'index chacun), avant de garder les 21 plus récents. C'est
 * proportionnel à ce que le lecteur suit, pas à la taille de la base (noté dans « À surveiller »).
 */
const selectFollowingEntries = (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
): Promise<Entry[]> => {
  // Les auteurs dont le fil montre les nouveaux projets : les membres suivis ET le membre lui-même
  // (R6a : il retrouve son projet tout juste publié). « union all » ajoute une ligne, le visiteur,
  // à la liste des suivis ; plus sûr qu'un « or » avec un « in (sous-requête) », que PostgreSQL
  // lirait sans l'index : ici le « in » reste une jointure sur l'index (author_id, published_at).
  const followedMembers = sql`(select member_id from member_follow where follower_id = ${viewerId} union all select ${viewerId}::text)`
  const newProjects = db
    .select({
      // sql<…>`…` : une valeur écrite en SQL, dont on donne le type à TypeScript. .as() la nomme.
      kind: sql<FeedItem['kind']>`'project'`.as('kind'),
      // published_at n'est jamais null ici (la condition l'exige) : on le dit à TypeScript, pour
      // que la colonne ait le même type que la date d'une mise à jour. mapWith la lit comme la
      // colonne.
      at: sql<Date>`${t.publishedAt}`.mapWith(t.publishedAt).as('at'),
      projectId: sql<string>`${t.id}`.as('project_id'),
      updateId: sql<string | null>`null::uuid`.as('update_id'),
    })
    .from(t)
    .where(
      and(
        // Un projet privé ou retiré n'apparaît dans aucun fil, même pour son auteur ; ni celui
        // d'un membre bloqué avec le visiteur (tranche 7b).
        listedProjectFor(viewerId),
        isNotNull(t.publishedAt),
        inArray(t.authorId, followedMembers),
        // Sa publication est son dernier événement : un des siens, ou aucune mise à jour plus
        // récente (sinon il est dans le morceau des mises à jour).
        or(eq(t.authorId, viewerId), sql`not ${raisedByAnUpdate()}`),
        cursor ? after(cursor, t.publishedAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(t.publishedAt), desc(t.id))
    // Un de plus que la page : s'il existe, il reste une suite (et il ouvrira la page suivante).
    .limit(FEED_PAGE_SIZE + 1)

  // La dernière mise à jour du projet en cours qui compte sur une carte. eq(u.projectId, t.id) :
  // « lateral » permet à la sous-requête de lire la ligne en cours de project.
  const latest = db
    .select({ id: u.id, createdAt: u.createdAt })
    .from(u)
    .where(and(eq(u.projectId, t.id), updateOnCards(), hasReadableLines()))
    .orderBy(desc(u.createdAt), desc(u.id))
    .limit(1)
    .as('latest')
  // Les projets que le lecteur suit, et ceux des membres qu'il suit. Le nom « authored » distingue
  // la table project de la sous-requête de celle de la requête principale.
  const followedProjects = sql`(select project_id from project_follow where follower_id = ${viewerId}
    union select authored.id from project authored
      where authored.author_id in (select member_id from member_follow where follower_id = ${viewerId}))`
  // « Le lecteur suit l'auteur du projet en cours » : une recherche dans la clé primaire de
  // member_follow (follower_id, member_id).
  const authorFollowed = sql`(select 1 from member_follow
    where follower_id = ${viewerId} and member_id = ${sql.raw('project.author_id')}) is not null`
  const updates = db
    .select({
      kind: sql<FeedItem['kind']>`'update'`.as('kind'),
      at: sql<Date>`${latest.createdAt}`.mapWith(u.createdAt).as('at'),
      projectId: sql<string>`${t.id}`.as('project_id'),
      updateId: sql<string | null>`${latest.id}`.as('update_id'),
    })
    .from(t)
    .crossJoinLateral(latest)
    .where(
      and(
        inArray(t.id, followedProjects),
        // Ses propres projets ne remontent pas par leurs mises à jour ; un projet privé, retiré ou
        // d'un membre bloqué avec lui ne remonte jamais (listedProjectFor).
        ne(t.authorId, viewerId),
        listedProjectFor(viewerId),
        // La mise à jour est son dernier événement : un projet suivi dont il ne suit pas l'auteur
        // (sa publication n'est pas dans le fil), ou une mise à jour plus récente que la
        // publication. Le contraire exact de la condition du morceau 1.
        sql`(not ${authorFollowed} or ${sql.raw('project.published_at')} is null or ${latest.createdAt} > ${sql.raw('project.published_at')})`,
        cursor ? after(cursor, latest.createdAt, t.id) : undefined,
      ),
    )
    .orderBy(desc(latest.createdAt), desc(t.id))
    .limit(FEED_PAGE_SIZE + 1)

  // L'ordre final porte sur les colonnes du résultat de l'union, nommées « at » et « project_id ».
  return unionAll(newProjects, updates)
    .orderBy(desc(sql.identifier('at')), desc(sql.identifier('project_id')))
    .limit(FEED_PAGE_SIZE + 1)
}

/**
 * Le fil « Abonnements » : les projets publics des membres que `viewerId` suit et les siens, à leur
 * publication, et les projets publics qu'il suit, ou dont il suit l'auteur, à leur dernière mise à
 * jour quand elle est plus récente. Suivre un membre fait venir ses nouveaux projets et leurs mises
 * à jour ; suivre un projet fait venir ses mises à jour.
 *
 * Toujours le même nombre de requêtes, quelle que soit la page : les lignes (une requête), les
 * projets de ces lignes avec leur auteur (une), leurs médias, réactions, outils et dernières mises
 * à jour (rowsToSummaries), et deux petites requêtes pour followsAnyone.
 *
 * Sans `lastReadAt` (R4) : la date de la dernière lecture est une trace d'activité, que seul
 * feed/state.ts lit (relecture juridique jur-J3) ; la route du fil l'ajoute à la page.
 */
export const loadFollowingFeed = async (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
  publicApiUrl: string,
): Promise<Omit<FollowingFeedPage, 'lastReadAt'>> => {
  const [entries, anyone] = await Promise.all([
    selectFollowingEntries(db, viewerId, cursor),
    followsAnyone(db, viewerId),
  ])
  const page = entries.slice(0, FEED_PAGE_SIZE)

  // Les projets de la page, lus en une requête. La condition « public » est redite : si un projet
  // est devenu privé entre les deux requêtes, son élément est laissé de côté.
  const projectIds = page.map((entry) => entry.projectId)
  const rows =
    projectIds.length === 0
      ? []
      : await selectProjects(db).where(and(inArray(t.id, projectIds), listedProjectFor(viewerId)))
  const summaries = new Map(
    (await rowsToSummaries(db, rows, viewerId, publicApiUrl)).map((summary) => [
      summary.id,
      summary,
    ]),
  )

  const items = page.flatMap((entry): FeedItem[] => {
    const project = summaries.get(entry.projectId)
    if (!project) return []
    const at = entry.at.toISOString()
    if (entry.kind === 'project') return [{ kind: 'project', at, project }]
    // La version courte de la mise à jour est celle de la carte (la même règle, B4) : la carte et
    // l'élément disent toujours la même chose. Si elle a changé entre les deux requêtes (supprimée,
    // retirée), l'élément est laissé de côté plutôt que de montrer une date qui ne serait plus vraie.
    const update = project.latestUpdate
    if (update === null || update.id !== entry.updateId) return []
    return [{ kind: 'update', at, update, project }]
  })

  // Le marque-page vient de la dernière ligne de la page, même si son élément a été laissé de côté
  // juste au-dessus : la page suivante repart ainsi exactement d'où celle-ci s'arrête.
  const last = page.at(-1)
  return {
    items,
    nextCursor:
      entries.length > FEED_PAGE_SIZE && last
        ? encodeCursor({ at: last.at.toISOString(), id: last.projectId })
        : null,
    followsAnyone: anyone,
  }
}

/**
 * Le fil « Découvrir » : tous les projets publics, ceux du visiteur compris, dans l'ordre de leur
 * publication (R7a : une mise à jour ne les fait pas remonter ; leur carte la porte seulement).
 * `testers` : seulement ceux qui cherchent des testeurs (au statut « testable », avec un lien de
 * démo). L'index partiel project_public_published_idx est déjà rangé dans l'ordre du fil.
 *
 * R6b, `category` : seulement les projets de cette catégorie, en place principale OU seconde. Un
 * projet sans catégorie (d'avant R6a) n'en a aucune : il disparaît dès qu'on filtre. Le code
 * arrive validé (CategoryCode) et entre dans la requête comme un paramètre lié, jamais collé. Les
 * deux colonnes ont chacune leur index (project_primary_category_idx, project_secondary_category_idx) :
 * PostgreSQL peut les combiner (« BitmapOr ») ou, pour une catégorie très courante, lire l'index
 * partiel du fil dans l'ordre et filtrer au passage ; le filtre ne change donc ni la forme du
 * curseur ni le nombre de requêtes (toujours quatre, comme sans filtre).
 */
export const loadDiscoverFeed = async (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
  testers: boolean,
  category: string | undefined,
  publicApiUrl: string,
): Promise<DiscoverFeedPage> => {
  const page = await loadPage(
    db,
    and(
      testers ? and(eq(t.status, 'testable'), isNotNull(t.demoUrl)) : undefined,
      category ? or(eq(t.primaryCategory, category), eq(t.secondaryCategory, category)) : undefined,
    ),
    cursor,
    viewerId,
    publicApiUrl,
  )
  // R3 : les auteurs de la page que le visiteur suit déjà, en une requête de plus (followedAmong),
  // quel que soit le nombre de cartes. Lui-même n'y est jamais (on ne se suit pas) ; un membre
  // bloqué non plus : ses projets ne sont pas dans la page. `new Set` retire les doublons (un
  // auteur de plusieurs cartes).
  const authorIds = [
    ...new Set(page.items.map((item) => item.project.author.id).filter((id) => id !== viewerId)),
  ]
  return { ...page, followedAuthorIds: await followedAmong(db, viewerId, authorIds) }
}
