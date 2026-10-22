// Lecture des commentaires d'un projet (tranche 5) : la page de commentaires, le nombre que tout
// le monde voit, et les commentaires d'un membre pour l'export de ses données. C'est ici, et
// seulement ici, que se décide ce qu'un membre voit d'un commentaire masqué ou supprimé. Qui a le
// droit de voir le projet lui-même est décidé ailleurs (projects/load.ts) : on ne lit ici que les
// commentaires d'un projet déjà autorisé.
import {
  COMMENT_PAGE_SIZE,
  COMMENT_REPLIES_SHOWN,
  type Comment,
  type CommentPage,
  type CommentReply,
  type Mention,
  type Project,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import {
  and,
  asc,
  type Column,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { mentionsOf } from '../mentions/load'
import { mediaUrl } from '../profile/me'

type Reader = Pick<Database, 'select'>
// L'auteur d'un commentaire, sous la même forme que l'auteur d'un projet (contrat `ProjectAuthor`).
type ProjectAuthor = Project['author']

const c = schema.projectComment

/** Ce qu'on lit d'un commentaire pour le montrer. */
export type CommentRow = Pick<
  typeof c.$inferSelect,
  'id' | 'authorId' | 'body' | 'createdAt' | 'editedAt' | 'hiddenAt' | 'deletedAt'
>

// Les colonnes de CommentRow, pour les « select » ci-dessous.
const rowColumns = {
  id: c.id,
  authorId: c.authorId,
  body: c.body,
  createdAt: c.createdAt,
  editedAt: c.editedAt,
  hiddenAt: c.hiddenAt,
  deletedAt: c.deletedAt,
}

/**
 * Qui regarde la page, et d'où : le membre, s'il est l'auteur du projet (qui voit les commentaires
 * qu'il a masqués, pour pouvoir les démasquer), et si le projet est privé (alors seul son auteur le
 * voit, et il n'y lit que ses propres commentaires).
 */
export type Viewer = { id: string; isProjectAuthor: boolean; projectIsPrivate: boolean }

/** Le Viewer d'un membre devant un projet qu'il a le droit de voir. */
export const viewerOf = (
  memberId: string,
  project: { authorId: string; visibility: string },
): Viewer => ({
  id: memberId,
  isProjectAuthor: project.authorId === memberId,
  projectIsPrivate: project.visibility !== 'public',
})

/**
 * La règle de visibilité d'un commentaire non supprimé, en un seul endroit (décisions de Louis du
 * 19/10/2026, docs/scenarios/phase-1.md, tranche 5) : ce membre lit-il ce commentaire ?
 * - sans auteur (compte disparu sans passer par l'API) : personne ;
 * - sur un projet privé : seulement s'il l'a écrit. Ce que les autres ont laissé quand le projet
 *   était public est gardé, mais personne ne le lit, l'auteur du projet compris : rien de ce
 *   qu'ils ont écrit n'est lu sans eux. Tout revient si le projet redevient public ;
 * - sur un projet public : tout le monde, sauf s'il est masqué ; un commentaire masqué reste lu
 *   par son auteur et par l'auteur du projet.
 */
export const sees = (row: Pick<CommentRow, 'authorId' | 'hiddenAt'>, viewer: Viewer) => {
  if (row.authorId === null) return false
  if (viewer.projectIsPrivate) return row.authorId === viewer.id
  return row.hiddenAt === null || viewer.isProjectAuthor || row.authorId === viewer.id
}

/**
 * La même règle, écrite en SQL pour les colonnes de project_comment ou d'un de ses « alias » (la
 * même table sous un autre nom, voir loadCommentPage). Elle doit dire exactement ce que dit `sees`.
 */
export const seesSql = (
  table: { hiddenAt: Column; authorId: Column },
  viewer: Viewer,
): SQL | undefined => {
  // « author_id = $membre » écarte aussi les lignes sans auteur (null n'est égal à rien).
  if (viewer.projectIsPrivate) return eq(table.authorId, viewer.id)
  if (viewer.isProjectAuthor) return isNotNull(table.authorId) // masqués compris
  return and(isNotNull(table.authorId), or(isNull(table.hiddenAt), eq(table.authorId, viewer.id)))
}

/**
 * Un commentaire tel que ce membre le voit (contrat `CommentReply`), ou null s'il ne le voit pas du
 * tout. `hasShownReplies` : pour une racine, au moins une de ses réponses est montrée à ce membre ;
 * elle reste alors à sa place sous forme d'emplacement (« Commentaire supprimé », « Commentaire
 * masqué »), sans auteur ni texte, pour que les réponses gardent leur fil.
 * `mentions` : les membres que mentionne son texte (mentions/load.ts) ; un emplacement n'en a
 * jamais, puisqu'il ne montre pas le texte.
 */
export const presentComment = (
  row: CommentRow,
  viewer: Viewer,
  authors: Map<string, ProjectAuthor>,
  hasShownReplies: boolean,
  mentions: Mention[] = [],
): CommentReply | null => {
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  }
  const placeholder = (state: 'hidden' | 'deleted'): CommentReply | null =>
    hasShownReplies
      ? {
          ...base,
          author: null,
          body: '',
          editedAt: null,
          state,
          isMine: false,
          mentions: [],
          // Tranche 6d : le retrait par la modération reste à brancher (backend-dev).
          removal: null,
        }
      : null
  if (row.deletedAt !== null) return placeholder('deleted')
  const author = row.authorId === null ? undefined : authors.get(row.authorId)
  // Sans auteur (compte disparu sans passer par l'API), il n'y a plus rien à montrer de lui.
  if (!author) return placeholder('deleted')
  // Masqué pour ce membre, ou laissé par un autre sur un projet devenu privé : sa place seulement.
  if (!sees(row, viewer)) return placeholder('hidden')
  return {
    ...base,
    author,
    body: row.body,
    state: row.hiddenAt === null ? 'visible' : 'hidden',
    isMine: row.authorId === viewer.id,
    mentions,
    removal: null,
  }
}

/**
 * Les auteurs de ces commentaires, en une requête quelle que soit leur nombre : leur nom, et
 * l'adresse de leur photo (contrat `ProjectAuthor`). Jamais leur e-mail ni leur langue : seules
 * ces trois colonnes sont demandées.
 *
 * En SQL : select user.id, user.name, profile.avatar_key from user left join profile
 * on profile.user_id = user.id where user.id in (…). La clé primaire de user trouve chacun.
 */
export const authorsOf = async (
  db: Reader,
  authorIds: string[],
  publicApiUrl: string,
): Promise<Map<string, ProjectAuthor>> => {
  const ids = [...new Set(authorIds)]
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name, avatarKey: schema.profile.avatarKey })
    .from(schema.user)
    .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
    .where(inArray(schema.user.id, ids))
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
      },
    ]),
  )
}

/**
 * Une page de commentaires d'un projet, telle que la voit `viewer` : 20 racines au plus, de la plus
 * récente à la plus ancienne, après le curseur s'il y en a un ; sous chacune, ses réponses montrées
 * à ce membre, de la plus ancienne à la plus récente (50 au plus). Toujours quatre requêtes au
 * plus, quel que soit le nombre de commentaires : les racines, leurs réponses, leurs auteurs, et
 * les membres qu'ils mentionnent.
 */
export const loadCommentPage = async (
  db: Reader,
  projectId: string,
  viewer: Viewer,
  cursor: CursorContent | null,
  publicApiUrl: string,
): Promise<CommentPage> => {
  // 1. Les racines. En SQL :
  //   select … from project_comment
  //   where project_id = $projet and root_id is null and (created_at, id) < ($date, $id)
  //     and (<la racine se montre> or (select 1 from project_comment reply
  //            where reply.root_id = project_comment.id and <la réponse se montre>
  //            limit 1) is not null)
  //   order by created_at desc, id desc limit 21
  // L'index partiel project_comment_project_roots_idx ne range que les racines, déjà dans cet
  // ordre : PostgreSQL part du curseur et s'arrête à la 21e racine retenue. Filtrer ici, et pas
  // après coup, garde des pages pleines : une racine qu'il ne voit pas ne prend pas la place d'une
  // autre.
  //
  // La sous-requête « une réponse se montre-t-elle ? » n'est posée que pour une racine supprimée
  // ou masquée pour lui (« or » s'arrête au premier cas vrai), et l'index
  // project_comment_root_created_idx y répond aussitôt (« limit 1 » : la première suffit).
  // Pourquoi pas « exists (…) » : à l'intérieur d'un « or », PostgreSQL peut choisir de calculer
  // un « exists » en une fois pour toute la table (toutes les réponses de tous les projets, puis
  // une table de hachage), ce qui est rapide sur une petite base et de plus en plus lent ensuite ;
  // EXPLAIN l'a montré. Une sous-requête qui rend une valeur (« (select 1 … limit 1) ») est
  // toujours posée ligne par ligne.
  const reply = alias(c, 'reply')
  const rootShown = and(isNull(c.deletedAt), seesSql(c, viewer))
  const firstShownReply = db
    .select({ one: sql`1` })
    .from(reply)
    .where(and(eq(reply.rootId, c.id), seesSql(reply, viewer)))
    .limit(1)
  const roots = await db
    .select(rowColumns)
    .from(c)
    .where(
      and(
        eq(c.projectId, projectId),
        isNull(c.rootId),
        cursor ? after(cursor, c.createdAt, c.id) : undefined,
        or(rootShown, sql`${firstShownReply} is not null`),
      ),
    )
    .orderBy(desc(c.createdAt), desc(c.id))
    // Une de plus que la page : si elle existe, il reste une suite (et elle ouvrira la page suivante).
    .limit(COMMENT_PAGE_SIZE + 1)
  const page = roots.slice(0, COMMENT_PAGE_SIZE)

  // 2. Les réponses de ces racines, 50 au plus chacune, les plus anciennes d'abord. En SQL :
  //   select project_comment.id as root, shown.* from project_comment
  //   cross join lateral (
  //     select … from project_comment reply where reply.root_id = project_comment.id
  //       and <la réponse se montre> order by created_at, id limit 50
  //   ) shown
  //   where project_comment.id in (…)
  // « lateral » (voir notes/load.ts) : pour chaque racine, l'index project_comment_root_created_idx
  // donne ses 50 premières réponses dans l'ordre, et PostgreSQL s'arrête là. Une racine sans
  // réponse ne donne aucune ligne.
  const repliesByRoot = new Map<string, CommentRow[]>()
  if (page.length > 0) {
    const shown = db
      .select({
        id: reply.id,
        authorId: reply.authorId,
        body: reply.body,
        createdAt: reply.createdAt,
        editedAt: reply.editedAt,
        hiddenAt: reply.hiddenAt,
        deletedAt: reply.deletedAt,
      })
      .from(reply)
      .where(and(eq(reply.rootId, c.id), seesSql(reply, viewer)))
      .orderBy(asc(reply.createdAt), asc(reply.id))
      .limit(COMMENT_REPLIES_SHOWN)
      .as('shown')
    const rows = await db
      .select({
        rootId: c.id,
        id: shown.id,
        authorId: shown.authorId,
        body: shown.body,
        createdAt: shown.createdAt,
        editedAt: shown.editedAt,
        hiddenAt: shown.hiddenAt,
        deletedAt: shown.deletedAt,
      })
      .from(c)
      .crossJoinLateral(shown)
      .where(
        inArray(
          c.id,
          page.map((root) => root.id),
        ),
      )
      // L'ordre des lignes n'est garanti que par un « order by » final : fil par fil, du plus
      // ancien au plus récent.
      .orderBy(asc(c.id), asc(shown.createdAt), asc(shown.id))
    for (const { rootId, ...row } of rows) {
      const thread = repliesByRoot.get(rootId) ?? []
      thread.push(row)
      repliesByRoot.set(rootId, thread)
    }
  }

  // 3. Les auteurs de tout ce qui est sur la page, en une requête.
  const authors = await authorsOf(
    db,
    [...page, ...[...repliesByRoot.values()].flat()].flatMap((row) =>
      row.authorId === null ? [] : [row.authorId],
    ),
    publicApiUrl,
  )

  // 4. Les mentions des commentaires dont ce membre lit le texte (ni supprimés, ni sans auteur, ni
  // masqués pour lui), en une requête : une place vide ne montre pas de mention.
  const read = [...page, ...[...repliesByRoot.values()].flat()].filter(
    (row) =>
      row.deletedAt === null &&
      row.authorId !== null &&
      authors.has(row.authorId) &&
      sees(row, viewer),
  )
  const mentions = await mentionsOf(db, read)
  const mentionsFor = (row: CommentRow) => mentions.get(row.id) ?? []

  const items = page.flatMap((root): Comment[] => {
    const replies = (repliesByRoot.get(root.id) ?? [])
      // Redit en JavaScript : la requête a déjà écarté les réponses qu'il ne voit pas.
      .filter((row) => sees(row, viewer))
      .flatMap((row) => presentComment(row, viewer, authors, false, mentionsFor(row)) ?? [])
    const shownRoot = presentComment(root, viewer, authors, replies.length > 0, mentionsFor(root))
    return shownRoot ? [{ ...shownRoot, replies }] : []
  })

  // Le marque-page vient de la dernière racine lue de la page, même si elle a été laissée de côté
  // juste au-dessus : la page suivante repart ainsi exactement d'où celle-ci s'arrête.
  const last = page.at(-1)
  return {
    items,
    nextCursor:
      roots.length > COMMENT_PAGE_SIZE && last
        ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
        : null,
  }
}

/**
 * Le nombre de commentaires que tout le monde voit, pour plusieurs projets, en une requête : les
 * racines et les réponses, sans les masqués, les supprimés, ni ceux d'un compte disparu (sans
 * auteur). Le même nombre pour tous, les deux auteurs compris. Sur un projet privé, que seul son
 * auteur voit, il ne compte que ses propres commentaires : ceux des autres sont cachés à tous
 * (voir `sees`).
 *
 * En SQL :
 *   select project_comment.project_id, count(*)::int from project_comment
 *   inner join project on project.id = project_comment.project_id
 *   where project_comment.project_id in (…) and hidden_at is null and deleted_at is null
 *     and project_comment.author_id is not null
 *     and (project.visibility = 'public' or project_comment.author_id = project.author_id)
 *   group by project_comment.project_id
 * La jointure (« inner join ») met à côté de chaque commentaire la ligne de son projet, trouvée
 * par la clé primaire de project, pour lire sa visibilité et son auteur. L'index
 * project_comment_project_idx donne les commentaires de chaque projet de la liste.
 */
export const commentCountsOf = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, number>> => {
  if (projectIds.length === 0) return new Map()
  const p = schema.project
  const rows = await db
    .select({ projectId: c.projectId, count: sql<number>`count(*)::int` })
    .from(c)
    .innerJoin(p, eq(p.id, c.projectId))
    .where(
      and(
        inArray(c.projectId, projectIds),
        isNull(c.hiddenAt),
        isNull(c.deletedAt),
        isNotNull(c.authorId),
        or(eq(p.visibility, 'public'), eq(c.authorId, p.authorId)),
      ),
    )
    .groupBy(c.projectId)
  return new Map(rows.map((row) => [row.projectId, row.count]))
}

/**
 * Tous les commentaires d'un membre, des plus anciens aux plus récents, pour l'export de ses
 * données : racines et réponses, masqués compris (c'est son texte), sur tous les projets, même
 * devenus privés (le projet n'est donné que par son identifiant). Un commentaire qu'il a supprimé
 * n'y est plus : son texte est effacé et il n'a plus d'auteur. La date de masquage y est : il a le
 * droit de savoir que l'auteur du projet a masqué son texte, et quand. L'index
 * project_comment_author_idx trouve ses commentaires ; le tri se fait ensuite en mémoire (l'export
 * est rare).
 */
export const commentsOfAuthor = async (db: Reader, authorId: string) => {
  const rows = await db
    .select({
      projectId: c.projectId,
      id: c.id,
      replyTo: c.rootId,
      body: c.body,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      hiddenAt: c.hiddenAt,
    })
    .from(c)
    .where(and(eq(c.authorId, authorId), isNull(c.deletedAt)))
    .orderBy(asc(c.createdAt), asc(c.id))
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
  }))
}
