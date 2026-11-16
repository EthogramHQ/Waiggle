// Ce qu'un visiteur sans compte lit (tranche R12, « Les projets publics ») : un projet public, ses
// mises à jour, la page publique d'un membre, la vitrine de l'accueil. Chaque réponse est
// construite ici champ par champ, en **liste blanche** : on ne recopie jamais un objet des membres
// (`Project`, `Member`), on nomme chaque champ que le contrat permet (`PublicProject`…), et la route
// le passe encore par le schéma (`.parse`). Un champ des membres (commentaires, abonnés, ruche,
// testeurs, pseudo) ne peut donc pas sortir vers un visiteur par mégarde.
//
// Qui voit quoi n'est pas décidé ici : un projet, par `visitorVisibleProject` (projects/visibility.ts),
// une page de membre, par `publicPageOf` (profile/public-page.ts). Toutes les lectures de ce fichier
// commencent par elles ; « pas public », « inconnu », « retiré », « auteur parti » donnent tous null,
// et la route répond le même 404.
//
// Les fonctions de lecture des membres (mises à jour, photos, outils) sont reprises telles quelles,
// avec `NOBODY` pour lecteur : un visiteur n'est l'auteur de rien, il ne garde donc aucune des
// exceptions de l'auteur (ses photos retirées, ses mises à jour retirées, ses parties retirées).
import {
  CategoryCode,
  PROJECT_LIST_MAX,
  ProjectDifficulty,
  ProjectId,
  ProjectStatus,
  type ProjectUpdate,
  type PublicCategory,
  type PublicLanguage,
  type PublicMember,
  type PublicProject,
  type PublicProjectCard,
  type PublicUpdate,
  SHOWCASE_MAX,
  type ShowcaseItem,
  UpdateId,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'
import { memberFollowState } from '../follows/load'
import { avatarUrlOf } from '../profile/me'
import { authorCardForVisitor, publicPageOf } from '../profile/public-page'
import { favoriteToolsOf } from '../profile/tools'
import { selectMedia, toolsOfProjects } from '../projects/load'
import { mediaShownTo } from '../projects/media-visibility'
import { visibleToVisitor, visitorVisibleProject } from '../projects/visibility'
import { type MediaRow, toVisual } from '../projects/visual'
import { reactionTotalsOf } from '../reactions/load'
import { latestUpdatesOf, updateCountsOf, updateSummariesOf, updatesPageOf } from '../updates/load'

/**
 * Le « lecteur » d'un visiteur pour les fonctions des membres : un identifiant qu'aucun membre n'a
 * (Better Auth en donne de 32 caractères). Chaque règle « …ou l'auteur, c'est lui » y est donc
 * fausse : une mise à jour ou une photo retirée n'est jamais montrée, ni aucune partie retirée.
 */
const NOBODY = ''

/**
 * Les photos d'un projet telles qu'un visiteur les voit : celles de la galerie, dans l'ordre, et la
 * couverture verticale, jamais une photo retirée seule par la modération (« à tous » : `null`, la
 * règle de projects/media-visibility.ts, sans l'exception de l'auteur).
 */
const visitorMedia = (media: MediaRow[], projectId: string) =>
  media.filter((m) => m.projectId === projectId && mediaShownTo(m, null))

/** Une mise à jour des membres, réduite aux champs qu'un visiteur lit (`PublicUpdate`). */
const toPublicUpdate = (update: ProjectUpdate): PublicUpdate => ({
  id: update.id,
  title: update.title,
  version: update.version,
  lines: update.lines,
  photos: update.photos,
  beforeAfter: update.beforeAfter,
  createdAt: update.createdAt,
})

/**
 * Les noms de ces catégories dans la langue demandée, dans l'ordre reçu (la principale, puis la
 * seconde). Une requête, par la clé primaire de `category` (`code`). Un code qui n'est plus dans la
 * table (impossible : la clé étrangère l'empêche) serait simplement omis.
 */
const categoriesNamed = async (
  db: Database,
  codes: string[],
  language: PublicLanguage,
): Promise<PublicCategory[]> => {
  const rows = await db
    .select({
      code: schema.category.code,
      nameFr: schema.category.nameFr,
      nameEn: schema.category.nameEn,
    })
    .from(schema.category)
    .where(inArray(schema.category.code, codes))
  return codes.flatMap((code) => {
    const row = rows.find((r) => r.code === code)
    if (!row) return []
    return [
      { code: CategoryCode.parse(row.code), name: language === 'en' ? row.nameEn : row.nameFr },
    ]
  })
}

/** Le domaine d'une adresse de démo (« meteo.example.org »), ou null si elle ne se lit pas. */
const demoOf = (url: string | null): PublicProject['demo'] => {
  if (url === null) return null
  try {
    const { hostname } = new URL(url)
    return hostname === '' ? null : { url, domain: hostname }
  } catch {
    return null
  }
}

/**
 * Un projet public tel qu'un visiteur le lit (GET /v1/public/projects/{id}), ou null s'il n'est
 * pas visible d'un visiteur (la même réponse pour un identifiant mal formé, inconnu, privé…).
 *
 * D'abord une lecture par la clé primaire de project, avec la condition commune
 * (`visitorVisibleProject`) dans le même `where`. Puis huit lectures lancées ensemble
 * (Promise.all), chacune par un index : les photos (project_media_project_idx), les outils (clé
 * primaire de project_tool), le total des réactions (project_reaction, par projet), la dernière
 * mise à jour et le nombre de mises à jour (project_update_project_created_idx), la version, les
 * catégories (clé primaire de category) et l'auteur (clés primaires de "user" et de profile).
 */
export const loadPublicProject = async (
  db: Database,
  id: string,
  publicApiUrl: string,
  language: PublicLanguage,
): Promise<PublicProject | null> => {
  if (!ProjectId.safeParse(id).success) return null
  const [project] = await db
    .select()
    .from(schema.project)
    .where(and(eq(schema.project.id, id), visitorVisibleProject()))
    .limit(1)
  if (!project) return null
  const owner = [{ id, authorId: project.authorId }]
  // Les deux catégories, sans doublon ; un projet d'avant R6a n'en a aucune.
  const codes = [project.primaryCategory, project.secondaryCategory].filter(
    (code, index, all): code is string => code !== null && all.indexOf(code) === index,
  )
  const [media, tools, totals, latest, counts, summaries, categories, author] = await Promise.all([
    selectMedia(db, [id]),
    toolsOfProjects(db, [id]),
    reactionTotalsOf(db, [id]),
    latestUpdatesOf(db, [id], NOBODY, publicApiUrl),
    updateCountsOf(db, owner, NOBODY),
    updateSummariesOf(db, [id]),
    categoriesNamed(db, codes, language),
    authorCardForVisitor(db, project.authorId, publicApiUrl),
  ])
  if (!author) return null
  const shown = visitorMedia(media, id)
  const portrait = shown.find((m) => m.slot === 'portrait')
  const latestUpdate = latest.get(id)
  return {
    id: project.id,
    author,
    title: project.title,
    pitch: project.pitch,
    description: project.description,
    status: ProjectStatus.parse(project.status),
    categories,
    tools: tools.get(id) ?? [],
    difficulty: ProjectDifficulty.nullable().parse(project.difficulty),
    startedOn: project.startedOn,
    prompts: project.prompts,
    visuals: shown.filter((m) => m.slot === 'gallery').map((m) => toVisual(m, publicApiUrl)),
    portraitCover: portrait ? toVisual(portrait, publicApiUrl) : null,
    demo: demoOf(project.demoUrl),
    reactionCount: totals.get(id) ?? 0,
    latestUpdate: latestUpdate ? toPublicUpdate(latestUpdate) : null,
    updateCount: counts.get(id) ?? 0,
    latestUpdateAt: latestUpdate?.createdAt ?? null,
    version: summaries.get(id)?.version ?? null,
    // Un projet `web` a toujours sa date de publication (posée quand il devient `public` ou `web`) ;
    // sa date de création n'est qu'un filet, pour une ligne écrite à la main.
    publishedAt: (project.publishedAt ?? project.createdAt).toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

/**
 * Une page de la frise d'un projet public (`limit` lignes au plus), de la plus récente à la plus
 * ancienne, sans les mises à jour retirées ni leurs photos retirées ; null si le projet n'est pas
 * visible d'un visiteur. `after` : la condition du curseur (cursor.ts), écrite par la route. Deux
 * temps : la condition commune (`visibleToVisitor`, clé primaire de project), puis la lecture des
 * membres (`updatesPageOf`, index project_update_project_created_idx), avec `NOBODY` pour lecteur.
 */
export const loadPublicUpdates = async (
  db: Database,
  projectId: string,
  after: SQL | undefined,
  limit: number,
  publicApiUrl: string,
): Promise<PublicUpdate[] | null> => {
  if (!(await visibleToVisitor(db, projectId))) return null
  const rows = await updatesPageOf(db, projectId, NOBODY, after, limit, publicApiUrl)
  return rows.map(toPublicUpdate)
}

/**
 * Une mise à jour d'un projet public, par son identifiant ; null si le projet n'est pas visible
 * d'un visiteur, si la mise à jour n'existe pas, est retirée ou appartient à un autre projet (la
 * même réponse). La lecture de la frise, bornée à cette seule ligne (`id = $updateId` à la place du
 * curseur, clé primaire de project_update) : les mêmes règles, écrites une seule fois.
 */
export const loadPublicUpdate = async (
  db: Database,
  projectId: string,
  updateId: string,
  publicApiUrl: string,
): Promise<PublicUpdate | null> => {
  if (!UpdateId.safeParse(updateId).success) return null
  const rows = await loadPublicUpdates(
    db,
    projectId,
    eq(schema.projectUpdate.id, updateId),
    1,
    publicApiUrl,
  )
  return rows?.[0] ?? null
}

/**
 * Des projets en cartes pour un visiteur (`PublicProjectCard`), dans l'ordre reçu : la couverture
 * est la première photo de la galerie qui n'est pas retirée. Une requête pour les photos de toute
 * la liste (selectMedia), quelle que soit sa longueur.
 */
const toCards = async (
  db: Database,
  projects: { id: string; title: string; pitch: string; status: string }[],
  publicApiUrl: string,
): Promise<PublicProjectCard[]> => {
  const media = await selectMedia(
    db,
    projects.map((project) => project.id),
  )
  return projects.map((project) => {
    const cover = visitorMedia(media, project.id).find((m) => m.slot === 'gallery')
    return {
      id: project.id,
      title: project.title,
      pitch: project.pitch,
      status: ProjectStatus.parse(project.status),
      cover: cover ? toVisual(cover, publicApiUrl) : null,
    }
  })
}

/**
 * La page publique d'un membre (GET /v1/public/members/{id}), ou null si elle est fermée ou si le
 * membre est inconnu, jamais vérifié ou supprimé (`publicPageOf`). Son nom et sa photo, puis
 * seulement ce qu'il a coché : une case décochée laisse le champ **absent**, et sa lecture n'est
 * même pas faite.
 *
 * Une lecture des cases, puis une lecture du nom, de la bio et de la photo (clés primaires de "user"
 * et de profile), puis au plus trois lectures ensemble :
 * - ses outils favoris (clé primaire de profile_tool, user_id en tête) ;
 * - ses projets publics, du plus récent au plus ancien : l'index project_author_created_idx
 *   (author_id, created_at) les donne dans l'ordre, la condition commune (`visitorVisibleProject`)
 *   filtre, et la limite de 50 borne la lecture ; puis leurs photos, en une requête ;
 * - son nombre d'abonnés (member_follow_member_idx), jamais qui.
 */
export const loadPublicMember = async (
  db: Database,
  memberId: string,
  publicApiUrl: string,
): Promise<PublicMember | null> => {
  const settings = await publicPageOf(db, memberId)
  if (!settings) return null
  const [member] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      bio: schema.profile.bio,
      avatarKey: schema.profile.avatarKey,
    })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(eq(schema.user.id, memberId))
    .limit(1)
  if (!member) return null
  const [tools, projects, follow] = await Promise.all([
    settings.showFavoriteTools ? favoriteToolsOf(db, memberId) : undefined,
    settings.showProjects
      ? db
          .select({
            id: schema.project.id,
            title: schema.project.title,
            pitch: schema.project.pitch,
            status: schema.project.status,
          })
          .from(schema.project)
          .where(and(eq(schema.project.authorId, memberId), visitorVisibleProject()))
          .orderBy(desc(schema.project.createdAt), desc(schema.project.id))
          .limit(PROJECT_LIST_MAX)
          .then((rows) => toCards(db, rows, publicApiUrl))
      : undefined,
    // `NOBODY` : le visiteur n'est l'abonné de personne ; seul le nombre sert.
    settings.showFollowerCount ? memberFollowState(db, memberId, NOBODY) : undefined,
  ])
  return {
    id: member.id,
    name: member.name,
    // R9 : une photo retirée par la modération ne paraît pas (avatarUrlOf rend null).
    avatarUrl: avatarUrlOf(publicApiUrl, member.avatarKey),
    // `...(condition && { champ })` : le champ n'existe dans l'objet que si la case est cochée.
    ...(settings.showBio && { bio: member.bio ?? '' }),
    ...(tools !== undefined && { favoriteTools: tools }),
    ...(projects !== undefined && { projects }),
    ...(follow !== undefined && { followerCount: follow.followerCount }),
  }
}

/**
 * La vitrine de l'accueil, dans l'ordre choisi par la modération (contrat `ShowcaseItem`) : pour un
 * visiteur (GET /v1/public/showcase) et, avec `viewerId`, pour un membre (« À la une »), à qui un
 * projet d'un membre bloqué dans un sens ou dans l'autre n'est pas montré, comme dans Explorer.
 * Seuls y sont les projets encore visibles d'un visiteur (`visitorVisibleProject`) : un projet
 * redevenu « Membres », retiré ou d'un auteur parti disparaît à la lecture, même si sa ligne reste.
 *
 * Deux requêtes, quel que soit le nombre de projets (quatre au plus) : `showcase` (4 lignes, lues
 * en entier, rangées par showcase_position_idx) jointe au projet, à son auteur et à son profil par
 * leurs clés primaires ; puis les photos des projets trouvés (selectMedia).
 */
export const loadShowcase = async (
  db: Database,
  { viewerId, publicApiUrl }: { viewerId?: string; publicApiUrl: string },
): Promise<ShowcaseItem[]> => {
  const rows = await db
    .select({
      id: schema.project.id,
      title: schema.project.title,
      pitch: schema.project.pitch,
      status: schema.project.status,
      authorName: schema.user.name,
      avatarKey: schema.profile.avatarKey,
    })
    .from(schema.showcase)
    .innerJoin(schema.project, eq(schema.project.id, schema.showcase.projectId))
    .innerJoin(schema.user, eq(schema.user.id, schema.project.authorId))
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.project.authorId))
    .where(
      and(
        visitorVisibleProject(),
        viewerId === undefined ? undefined : notBlockedWith(viewerId, schema.project.authorId),
      ),
    )
    .orderBy(asc(schema.showcase.position))
    .limit(SHOWCASE_MAX)
  const cards = await toCards(db, rows, publicApiUrl)
  return rows.map((row, index) => {
    const card = cards[index]
    if (!card) throw new Error('showcase card missing')
    return {
      ...card,
      author: { name: row.authorName, avatarUrl: avatarUrlOf(publicApiUrl, row.avatarKey) },
    }
  })
}
