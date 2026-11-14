// Lecture des projets dans la base, toujours « du point de vue » d'un membre : c'est ici, et
// seulement ici, que se décide ce qu'il a le droit de voir. Un projet privé n'est visible que de
// son auteur ; pour tous les autres, il n'existe pas.
import {
  type FollowState,
  NO_REACTIONS,
  PROJECT_LIST_MAX,
  type Project,
  ProjectCategory,
  ProjectDifficulty,
  ProjectId,
  ProjectStatus,
  type ProjectSummary,
  type ProjectTool,
  ProjectVisibility,
  toolSlug,
  type UpdateSummary,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm'
import { commentCountsOf } from '../comments/load'
import { projectFollowStates } from '../follows/load'
import { avatarUrlOf } from '../profile/me'
import { reactionStatesOf, reactionTotalsOf } from '../reactions/load'
import { removalsOf } from '../removals/load'
import { partOwnerKey, removedPartsOf } from '../removals/parts'
import { latestUpdatesOf, updateCountsOf, updateSummariesOf } from '../updates/load'
import { mediaShownTo, visibleMedia } from './media-visibility'
import { testerRemovalsOf, testerStatesOf } from './testers'
import { projectVisibleTo } from './visibility'
import { type MediaRow, toVisual } from './visual'

// Reader : la base, ou une transaction en cours (les deux savent faire « select »).
type Reader = Pick<Database, 'select'>

/**
 * Les médias (photos de la galerie et couverture verticale) d'une liste de projets. Les photos des
 * mises à jour (slot 'update', R7a) n'en font pas partie : elles peuvent être des centaines, ne sont
 * jamais une couverture, et se lisent avec leur mise à jour (updates/load.ts). `ne` : « différent de ».
 */
export const selectMedia = async (db: Reader, projectIds: string[]): Promise<MediaRow[]> =>
  projectIds.length === 0
    ? []
    : db
        .select()
        .from(schema.projectMedia)
        .where(
          and(
            inArray(schema.projectMedia.projectId, projectIds),
            ne(schema.projectMedia.slot, 'update'),
          ),
        )
        .orderBy(asc(schema.projectMedia.position), asc(schema.projectMedia.createdAt))

/**
 * Les outils de ces projets, par projet, dans l'ordre choisi par l'auteur (R6b) : une seule requête
 * pour toute la liste. Elle lit `project_tool` par le début de sa clé primaire (project_id) et joint
 * `tool` par sa clé primaire. Un outil du catalogue s'affiche sous son nom ; un « Autre », sous le nom
 * que l'auteur de CE projet a tapé (sec-B8), sans page (`inCatalogue` faux).
 */
export const toolsOfProjects = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, ProjectTool[]>> => {
  const byProject = new Map<string, ProjectTool[]>()
  if (projectIds.length === 0) return byProject
  const rows = await db
    .select({
      projectId: schema.projectTool.projectId,
      label: schema.projectTool.label,
      name: schema.tool.name,
      slug: schema.tool.slug,
      status: schema.tool.status,
    })
    .from(schema.projectTool)
    .innerJoin(schema.tool, eq(schema.tool.id, schema.projectTool.toolId))
    .where(inArray(schema.projectTool.projectId, projectIds))
    .orderBy(asc(schema.projectTool.projectId), asc(schema.projectTool.position))
  for (const row of rows) {
    const inCatalogue = row.status === 'catalogue'
    const list = byProject.get(row.projectId) ?? []
    const label = inCatalogue ? row.name : (row.label ?? row.name)
    list.push({
      label,
      // Un « Autre » n'a pas de page : son adresse se tire du nom tapé ici, jamais de l'adresse
      // partagée, dont le suffixe « -2 » dirait qu'un autre membre a tapé un nom voisin (sec-B2).
      slug: inCatalogue ? row.slug : toolSlug(label),
      inCatalogue,
    })
    byProject.set(row.projectId, list)
  }
  return byProject
}

// Une requête de base : le projet, avec le nom et l'avatar de son auteur.
// innerJoin : « avec son auteur » (il existe toujours) ; leftJoin : « avec son profil s'il en a un ».
export const selectProjects = (db: Database) =>
  db
    .select({
      project: schema.project,
      authorName: schema.user.name,
      authorAvatarKey: schema.profile.avatarKey,
    })
    .from(schema.project)
    .innerJoin(schema.user, eq(schema.user.id, schema.project.authorId))
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.project.authorId))

type ProjectRow = Awaited<ReturnType<ReturnType<typeof selectProjects>['execute']>>[number]

/**
 * Un projet sans son état d'abonnement, ses mises à jour, ses testeurs, ses réactions ni ses
 * commentaires : tout ce qu'on sait d'une ligne de la base et de ses médias. Les listes (cartes)
 * s'en contentent ; la page d'un projet y ajoute le reste. Omit<A, B> : le type A, sans les champs
 * nommés dans B.
 */
type ProjectBase = Omit<
  Project,
  | keyof FollowState
  | 'latestUpdate'
  | 'updateCount'
  | 'version'
  | 'isTester'
  | 'testerCount'
  | 'testerJoinable'
  | 'reactions'
  | 'commentCount'
  | 'removal'
  | 'removedParts'
>

/**
 * La condition « visible par ce membre » : public et pas retiré, ou écrit par lui. Le nom que
 * gardent les routes ; la règle elle-même est écrite une seule fois, dans visibility.ts (tranche
 * 7a).
 */
export const visibleTo = projectVisibleTo

/**
 * Transforme une ligne de la base en projet, sans son état d'abonnement. `photosFor` : à qui
 * montrer les photos (projects/media-visibility.ts) ; le lecteur sur la page du projet, où l'auteur
 * garde ses photos retirées à leur place, ou null (« à tous ») pour une carte, dont la couverture
 * n'est jamais une photo retirée.
 */
const toProjectBase = (
  { project, authorName, authorAvatarKey }: ProjectRow,
  allMedia: MediaRow[],
  tools: ProjectTool[],
  viewerId: string,
  publicApiUrl: string,
  photosFor: string | null,
): ProjectBase => {
  const media = allMedia.filter(
    (m) =>
      m.projectId === project.id &&
      mediaShownTo(
        m,
        photosFor === null ? null : { ownerId: project.authorId, viewerId: photosFor },
      ),
  )
  return {
    id: project.id,
    author: {
      id: project.authorId,
      name: authorName,
      avatarUrl: avatarUrlOf(publicApiUrl, authorAvatarKey),
    },
    title: project.title,
    pitch: project.pitch,
    description: project.description,
    // .parse vérifie que la valeur lue est bien l'une de celles permises (sinon, erreur 500 :
    // mieux vaut le signaler que renvoyer une donnée incohérente).
    status: ProjectStatus.parse(project.status),
    visibility: ProjectVisibility.parse(project.visibility),
    demoUrl: project.demoUrl,
    // R6b : lus par `project_tool` (toolsOfProjects) ; les anciennes colonnes ne sont plus lues.
    tools,
    prompts: project.prompts,
    // R6a : catégories, difficulté et mois de départ. Les listes fermées sont revérifiées à la
    // lecture (comme `status`) ; null pour un projet d'avant R6a. Le temps passé n'est plus lu
    // (sa colonne s'efface en R6b). Le mois sort tel quel : le contrat de sortie est souple (sec-M1).
    primaryCategory: ProjectCategory.nullable().parse(project.primaryCategory),
    secondaryCategory: ProjectCategory.nullable().parse(project.secondaryCategory),
    difficulty: ProjectDifficulty.nullable().parse(project.difficulty),
    startedOn: project.startedOn,
    // Les médias arrivent déjà triés par position : la galerie garde l'ordre choisi par l'auteur.
    // Une carte prend la première photo restante en couverture (toSummary) : la 1re photo visible.
    visuals: media.filter((m) => m.slot === 'gallery').map((m) => toVisual(m, publicApiUrl)),
    portraitCover: (() => {
      const portrait = media.find((m) => m.slot === 'portrait')
      return portrait ? toVisual(portrait, publicApiUrl) : null
    })(),
    isMine: project.authorId === viewerId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

/**
 * Des lignes de la base, transformées en projets tels que l'API les renvoie (contrat `Project`),
 * avec leur état d'abonnement, leurs mises à jour (la dernière avec ses photos, le nombre, la version),
 * leurs testeurs, leurs réactions et leur nombre de commentaires : un nombre fixe de requêtes de plus
 * pour tous (abonnés, dernière mise à jour et ses photos, nombre, version, testeurs, réactions,
 * commentaires), quel que soit leur nombre. Promise.all les lance en même temps. Une de plus,
 * seulement si l'un d'eux est un projet retiré du membre qui regarde : l'explication du retrait
 * (removals/load.ts). Un projet retiré n'arrive ici que pour son auteur (visibleTo) ; la condition
 * est redite, pour que `removal` ne soit jamais rempli pour un autre. Une de plus encore, seulement
 * si le lecteur est l'auteur de l'un d'eux : ses parties retirées seules (R9, removals/parts.ts).
 */
const toProjects = async (
  db: Database,
  rows: ProjectRow[],
  media: MediaRow[],
  viewerId: string,
  publicApiUrl: string,
): Promise<Project[]> => {
  const ids = rows.map(({ project }) => project.id)
  // Le retrait d'un projet ne se lit que par son auteur.
  const removalIdOf = ({ project }: ProjectRow) =>
    project.removedAt !== null && project.authorId === viewerId ? project.removalId : null
  const authors = rows.map(({ project }) => ({ id: project.id, authorId: project.authorId }))
  const [follows, latestUpdates, updateCounts, versions, testers, reactions, commentCounts] =
    await Promise.all([
      projectFollowStates(db, authors, viewerId),
      latestUpdatesOf(db, ids, viewerId, publicApiUrl),
      updateCountsOf(db, authors, viewerId),
      // La version sous le titre : celle de la dernière mise à jour NON retirée (B4), pour tous.
      updateSummariesOf(db, ids),
      testerStatesOf(db, authors, viewerId),
      reactionStatesOf(db, ids, viewerId),
      commentCountsOf(db, ids),
    ])
  const [removals, tools, removedFrom, removedParts] = await Promise.all([
    removalsOf(db, rows.map(removalIdOf)),
    toolsOfProjects(db, ids),
    // Les projets dont l'auteur a retiré ce membre des testeurs (une requête pour toute la liste).
    testerRemovalsOf(db, ids, viewerId),
    // R9 : les parties retirées seules, pour l'auteur (une requête si le lecteur en a écrit un,
    // aucune sinon : removals/parts.ts).
    removedPartsOf(
      db,
      rows.map(({ project }) => ({ kind: 'project', id: project.id, authorId: project.authorId })),
      viewerId,
      publicApiUrl,
    ),
  ])
  return rows.map((row) => {
    const removalId = removalIdOf(row)
    const projectTools = tools.get(row.project.id) ?? []
    return {
      // Sur la page d'un projet, ses photos telles que ce lecteur les voit : l'auteur garde les
      // siennes retirées à leur place (désignées dans `removedParts`), les autres ne les voient pas.
      ...toProjectBase(row, media, projectTools, viewerId, publicApiUrl, viewerId),
      removedParts: removedParts.get(partOwnerKey('project', row.project.id)) ?? [],
      ...(follows.get(row.project.id) ?? { isFollowed: false, followerCount: 0 }),
      latestUpdate: latestUpdates.get(row.project.id) ?? null,
      updateCount: updateCounts.get(row.project.id) ?? 0,
      version: versions.get(row.project.id)?.version ?? null,
      ...(testers.get(row.project.id) ?? { isTester: false, testerCount: null }),
      // R7b : on ne propose plus de rejoindre les testeurs à l'auteur, ni à un membre qu'il a retiré.
      testerJoinable: row.project.authorId !== viewerId && !removedFrom.has(row.project.id),
      reactions: reactions.get(row.project.id) ?? NO_REACTIONS,
      commentCount: commentCounts.get(row.project.id) ?? 0,
      removal: (removalId && removals.get(removalId)) || null,
    }
  })
}

/**
 * Ce que ce membre peut faire du projet `id`, en une petite requête servie par la clé primaire
 * (on ne lit que l'auteur et la date de retrait, pas tout le projet) :
 * - 'not_found' : identifiant mal formé, projet inconnu, privé ou retiré d'un autre (la même
 *   réponse, pour ne rien révéler) ;
 * - 'forbidden' : un projet qu'il voit, mais d'un autre ;
 * - 'removed' : le sien, retiré par la modération : il le lit et peut le supprimer, mais ni le
 *   modifier ni y ajouter quoi que ce soit (409, règles 4 et 30 de la relecture du plan) ;
 * - 'mine' : le sien.
 */
export const projectAccess = async (db: Reader, id: string, viewerId: string) => {
  if (!ProjectId.safeParse(id).success) return 'not_found' as const
  const [project] = await db
    .select({ authorId: schema.project.authorId, removedAt: schema.project.removedAt })
    .from(schema.project)
    .where(and(eq(schema.project.id, id), visibleTo(viewerId)))
  if (!project) return 'not_found' as const
  if (project.authorId !== viewerId) return 'forbidden' as const
  return project.removedAt === null ? ('mine' as const) : ('removed' as const)
}

/**
 * Le projet `id` s'il est visible par `viewerId`, sinon null : qu'il n'existe pas ou qu'il soit
 * privé, la réponse est la même, pour ne rien révéler.
 */
export const loadVisibleProject = async (
  db: Database,
  id: string,
  viewerId: string,
  publicApiUrl: string,
): Promise<Project | null> => {
  // Une adresse mal formée ne peut désigner aucun projet (et ferait échouer la requête SQL).
  if (!ProjectId.safeParse(id).success) return null
  const [row] = await selectProjects(db).where(and(eq(schema.project.id, id), visibleTo(viewerId)))
  if (!row) return null
  const [project] = await toProjects(db, [row], await selectMedia(db, [id]), viewerId, publicApiUrl)
  return project ?? null
}

/** Tous les projets d'un auteur que `viewerId` a le droit de voir, du plus récent au plus ancien. */
export const loadProjectsOf = async (
  db: Database,
  authorId: string,
  viewerId: string,
  publicApiUrl: string,
): Promise<Project[]> => {
  const rows = await selectProjects(db)
    .where(and(eq(schema.project.authorId, authorId), visibleTo(viewerId)))
    .orderBy(desc(schema.project.createdAt))
  // Une seule requête pour les médias de tous ces projets, plutôt qu'une par projet.
  const media = await selectMedia(
    db,
    rows.map((row) => row.project.id),
  )
  return toProjects(db, rows, media, viewerId, publicApiUrl)
}

/**
 * Un projet en version courte, pour les listes : sa première photo en couverture, sans la galerie,
 * et le total de ses réactions (`reactionTotal`, lu pour toute la liste par reactionTotalsOf).
 */
const toSummary = (
  { visuals, ...project }: ProjectBase,
  reactionTotal: number,
  update: { latest: UpdateSummary | null; version: string | null },
): ProjectSummary => ({
  id: project.id,
  author: project.author,
  title: project.title,
  pitch: project.pitch,
  status: project.status,
  visibility: project.visibility,
  tools: project.tools,
  cover: visuals[0] ?? null,
  // R3 : le lien de la démo sur la carte (« Tester » sans ouvrir la page du projet).
  demoUrl: project.demoUrl,
  portraitCover: project.portraitCover,
  // R6a : les catégories, pour l'étiquette de la carte.
  primaryCategory: project.primaryCategory,
  secondaryCategory: project.secondaryCategory,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  reactionTotal,
  // R7a : la dernière mise à jour non retirée et la version sous le titre (B4).
  latestUpdate: update.latest,
  version: update.version,
})

/**
 * Des lignes de la base en cartes de liste (contrat `ProjectSummary`), dans le même ordre. Toujours
 * quatre requêtes de plus (deux pour les mises à jour), quel que soit le nombre de cartes, lancées en
 * même temps (Promise.all) : les médias de toute la liste (pour les couvertures), le total des
 * réactions (R4), les outils, et la dernière mise à jour et la version (R7a, updateSummariesOf).
 * Toute liste de cartes passe par ici : le fil, Découvrir, la recherche, une étiquette, la page d'un
 * membre ; aucune ne peut donc oublier le total ni la mise à jour.
 */
export const rowsToSummaries = async (
  db: Database,
  rows: ProjectRow[],
  viewerId: string,
  publicApiUrl: string,
): Promise<ProjectSummary[]> => {
  const ids = rows.map((row) => row.project.id)
  const [media, totals, tools, updates] = await Promise.all([
    selectMedia(db, ids),
    reactionTotalsOf(db, ids),
    toolsOfProjects(db, ids),
    updateSummariesOf(db, ids),
  ])
  return rows.map((row) =>
    toSummary(
      // « À tous » (null) : la couverture d'une carte n'est jamais une photo retirée, pas même
      // pour son auteur.
      toProjectBase(row, media, tools.get(row.project.id) ?? [], viewerId, publicApiUrl, null),
      totals.get(row.project.id) ?? 0,
      updates.get(row.project.id) ?? { latest: null, version: null },
    ),
  )
}

/**
 * Une liste de projets (page d'un membre, d'une étiquette) : ceux qui remplissent `where`, du plus
 * récent au plus ancien, 50 au plus. C'est à l'appelant de dire qui a le droit de voir quoi.
 */
export const loadSummaries = async (
  db: Database,
  where: SQL | undefined,
  viewerId: string,
  publicApiUrl: string,
): Promise<ProjectSummary[]> => {
  const rows = await selectProjects(db)
    .where(where)
    .orderBy(desc(schema.project.createdAt))
    .limit(PROJECT_LIST_MAX)
  return rowsToSummaries(db, rows, viewerId, publicApiUrl)
}

/**
 * Les clés des fichiers de ces projets, à lire AVANT de les supprimer : les lignes disparaissent
 * avec eux (cascade), et on ne saurait plus quels fichiers effacer.
 */
export const mediaKeysOf = async (db: Reader, projectIds: string[]): Promise<string[]> => {
  if (projectIds.length === 0) return []
  // Toutes les photos, celles des mises à jour (slot 'update', en attente ou publiées) comprises :
  // elles partent aussi en cascade avec le projet. D'où une requête à part de `selectMedia`.
  const rows = await db
    .select({ storageKey: schema.projectMedia.storageKey })
    .from(schema.projectMedia)
    .where(inArray(schema.projectMedia.projectId, projectIds))
  // R7b : les images du coin des testeurs (photos d'appel et captures, rattachées ou en attente)
  // partent aussi avec le projet. L'index tester_media_project_owner_idx (project_id en tête) les
  // trouve ; une seule requête de plus, quel que soit le nombre de projets.
  const testerRows = await db
    .select({ storageKey: schema.testerMedia.storageKey })
    .from(schema.testerMedia)
    .where(inArray(schema.testerMedia.projectId, projectIds))
  return [...rows, ...testerRows].map((row) => row.storageKey)
}

/**
 * Un fichier de visuel, si `viewerId` a le droit de le voir ; sinon false (qu'il n'existe pas, que
 * le projet soit privé ou que la photo soit réservée : même réponse, pour ne rien révéler). Il faut
 * voir le projet, ET (relecture de sécurité A4) :
 * - une photo de la galerie ou la couverture verticale : rien de plus ;
 * - une photo d'une mise à jour publiée et pas retirée : rien de plus ;
 * - une photo en attente (pas encore publiée) ou d'une mise à jour retirée : l'auteur seul, sans
 *   exception, administrateur compris ;
 * - R9 : une photo retirée seule par la modération (`removal_id`), quelle qu'elle soit : l'auteur
 *   seul (projects/media-visibility.ts). Les autres reçoivent le 404 d'un fichier inconnu.
 *
 * En SQL : select … from project_media inner join project on … left join project_update on
 * project_update.id = project_media.update_id where storage_key = $1 and <projet visible> and
 * (slot <> 'update' or (update_id is not null and removed_at is null) or author_id = $viewer)
 * and (project_media.removal_id is null or author_id = $viewer).
 * La clé unique de storage_key trouve la photo ; le projet et la mise à jour, par leur clé primaire.
 * « left join » : une photo de la galerie n'a pas de mise à jour, et doit rester dans le résultat.
 */
export const isVisualVisibleTo = async (db: Database, storageKey: string, viewerId: string) => {
  const m = schema.projectMedia
  const [row] = await db
    .select({ id: m.id })
    .from(m)
    .innerJoin(schema.project, eq(schema.project.id, m.projectId))
    .leftJoin(schema.projectUpdate, eq(schema.projectUpdate.id, m.updateId))
    .where(
      and(
        eq(m.storageKey, storageKey),
        visibleTo(viewerId),
        or(
          ne(m.slot, 'update'),
          and(isNotNull(m.updateId), isNull(schema.projectUpdate.removedAt)),
          eq(schema.project.authorId, viewerId),
        ),
        // R9 : une photo retirée seule par la modération, à son auteur seul (media-visibility.ts).
        visibleMedia(m.removalId, { ownerId: schema.project.authorId, viewerId }),
      ),
    )
  return row !== undefined
}
