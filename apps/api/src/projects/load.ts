// Lecture des projets dans la base, toujours « du point de vue » d'un membre : c'est ici, et
// seulement ici, que se décide ce qu'il a le droit de voir. Un projet privé n'est visible que de
// son auteur ; pour tous les autres, il n'existe pas.
import {
  type FollowState,
  NO_REACTIONS,
  PROJECT_LIST_MAX,
  type Project,
  ProjectId,
  ProjectStatus,
  type ProjectSummary,
  ProjectVisibility,
  type ProjectVisual,
  Thumbhash,
  TimeSpent,
  toolSlug,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { commentCountsOf } from '../comments/load'
import { projectFollowStates } from '../follows/load'
import { recentNotesOf } from '../notes/load'
import { mediaUrl } from '../profile/me'
import { reactionStatesOf } from '../reactions/load'
import { removalsOf } from '../removals/load'
import { projectVisibleTo } from './visibility'

type MediaRow = typeof schema.projectMedia.$inferSelect

// Reader : la base, ou une transaction en cours (les deux savent faire « select »).
type Reader = Pick<Database, 'select'>

/** Les médias (photos de la galerie et couverture verticale) d'une liste de projets. */
export const selectMedia = async (db: Reader, projectIds: string[]): Promise<MediaRow[]> =>
  projectIds.length === 0
    ? []
    : db
        .select()
        .from(schema.projectMedia)
        .where(inArray(schema.projectMedia.projectId, projectIds))
        .orderBy(asc(schema.projectMedia.position), asc(schema.projectMedia.createdAt))

/** Un média tel que l'API le renvoie (contrat `ProjectVisual`). */
const toVisual = (media: MediaRow, publicApiUrl: string): ProjectVisual => ({
  id: media.id,
  kind: 'image',
  url: mediaUrl(publicApiUrl, media.storageKey),
  width: media.width,
  height: media.height,
  // Calculé par notre serveur ; vérifié quand même, comme tout ce qui sort de la base.
  thumbhash: Thumbhash.parse(media.thumbhash),
})

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
 * Un projet sans son état d'abonnement, son journal, ses réactions ni ses commentaires : tout ce
 * qu'on sait d'une ligne de la base et de ses médias. Les listes (cartes) s'en contentent ; la page
 * d'un projet y ajoute le reste. Omit<A, B> : le type A, sans les champs nommés dans B.
 */
type ProjectBase = Omit<
  Project,
  keyof FollowState | 'notes' | 'reactions' | 'commentCount' | 'removal'
>

/**
 * La condition « visible par ce membre » : public et pas retiré, ou écrit par lui. Le nom que
 * gardent les routes ; la règle elle-même est écrite une seule fois, dans visibility.ts (tranche
 * 7a).
 */
export const visibleTo = projectVisibleTo

/** Transforme une ligne de la base en projet, sans son état d'abonnement. */
const toProjectBase = (
  { project, authorName, authorAvatarKey }: ProjectRow,
  media: MediaRow[],
  viewerId: string,
  publicApiUrl: string,
): ProjectBase => ({
  id: project.id,
  author: {
    id: project.authorId,
    name: authorName,
    avatarUrl: authorAvatarKey ? mediaUrl(publicApiUrl, authorAvatarKey) : null,
  },
  title: project.title,
  pitch: project.pitch,
  description: project.description,
  // .parse vérifie que la valeur lue est bien l'une de celles permises (sinon, erreur 500 :
  // mieux vaut le signaler que renvoyer une donnée incohérente).
  status: ProjectStatus.parse(project.status),
  visibility: ProjectVisibility.parse(project.visibility),
  demoUrl: project.demoUrl,
  tools: project.tools.map((label, i) => ({
    label,
    slug: project.toolSlugs[i] ?? toolSlug(label),
  })),
  timeSpent: project.timeSpent === null ? null : TimeSpent.parse(project.timeSpent),
  prompts: project.prompts,
  // Les médias arrivent déjà triés par position : la galerie garde l'ordre choisi par l'auteur.
  visuals: media
    .filter((m) => m.projectId === project.id && m.slot === 'gallery')
    .map((m) => toVisual(m, publicApiUrl)),
  portraitCover: (() => {
    const portrait = media.find((m) => m.projectId === project.id && m.slot === 'portrait')
    return portrait ? toVisual(portrait, publicApiUrl) : null
  })(),
  isMine: project.authorId === viewerId,
  createdAt: project.createdAt.toISOString(),
  updatedAt: project.updatedAt.toISOString(),
})

/**
 * Des lignes de la base, transformées en projets tels que l'API les renvoie (contrat `Project`),
 * avec leur état d'abonnement, leur journal, leurs réactions et leur nombre de commentaires :
 * quatre requêtes de plus pour tous (abonnés, notes, réactions, commentaires), quel que soit leur
 * nombre. Promise.all les lance en même temps. Une cinquième, seulement si l'un d'eux est un projet
 * retiré du membre qui regarde : l'explication du retrait (removals/load.ts). Un projet retiré
 * n'arrive ici que pour son auteur (visibleTo) ; la condition est redite, pour que `removal` ne
 * soit jamais rempli pour un autre.
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
  const [follows, journals, reactions, commentCounts, removals] = await Promise.all([
    projectFollowStates(
      db,
      rows.map(({ project }) => ({ id: project.id, authorId: project.authorId })),
      viewerId,
    ),
    recentNotesOf(db, ids, viewerId),
    reactionStatesOf(db, ids, viewerId),
    commentCountsOf(db, ids),
    removalsOf(db, rows.map(removalIdOf)),
  ])
  return rows.map((row) => {
    const removalId = removalIdOf(row)
    return {
      ...toProjectBase(row, media, viewerId, publicApiUrl),
      ...(follows.get(row.project.id) ?? { isFollowed: false, followerCount: 0 }),
      notes: journals.get(row.project.id) ?? [],
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

/** Un projet en version courte, pour les listes : sa première photo en couverture, sans la galerie. */
const toSummary = ({ visuals, ...project }: ProjectBase): ProjectSummary => ({
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
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
})

/**
 * Une ligne de la base en carte de liste (contrat `ProjectSummary`), avec la couverture prise dans
 * `media` : les médias de toute la liste, lus en une fois par selectMedia.
 */
export const rowToSummary = (
  row: ProjectRow,
  media: MediaRow[],
  viewerId: string,
  publicApiUrl: string,
): ProjectSummary => toSummary(toProjectBase(row, media, viewerId, publicApiUrl))

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
  const media = await selectMedia(
    db,
    rows.map((row) => row.project.id),
  )
  return rows.map((row) => rowToSummary(row, media, viewerId, publicApiUrl))
}

/**
 * Les clés des fichiers de ces projets, à lire AVANT de les supprimer : les lignes disparaissent
 * avec eux (cascade), et on ne saurait plus quels fichiers effacer.
 */
export const mediaKeysOf = async (db: Reader, projectIds: string[]): Promise<string[]> =>
  (await selectMedia(db, projectIds)).map((media) => media.storageKey)

/**
 * Un fichier de visuel, si `viewerId` voit le projet auquel il appartient ; sinon null (qu'il
 * n'existe pas ou que le projet soit privé : même réponse, pour ne rien révéler).
 */
export const isVisualVisibleTo = async (db: Database, storageKey: string, viewerId: string) => {
  const [row] = await db
    .select({ id: schema.projectMedia.id })
    .from(schema.projectMedia)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectMedia.projectId))
    .where(and(eq(schema.projectMedia.storageKey, storageKey), visibleTo(viewerId)))
  return row !== undefined
}

/**
 * Les outils et leurs étiquettes, sans doublon d'étiquette (« Claude Code » et « claude-code »
 * sont le même outil : on garde le premier nom tapé).
 */
export const withSlugs = (labels: string[]) => {
  const tools: string[] = []
  const toolSlugs: string[] = []
  for (const label of labels) {
    const slug = toolSlug(label)
    if (toolSlugs.includes(slug)) continue
    tools.push(label)
    toolSlugs.push(slug)
  }
  return { tools, toolSlugs }
}
