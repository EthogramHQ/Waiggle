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
  type Project,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, type Column, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { after, type CursorContent, encodeCursor } from '../cursor'
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
 * Qui regarde la page, et d'où : le membre, et s'il est l'auteur du projet (qui voit les
 * commentaires qu'il a masqués, pour pouvoir les démasquer).
 */
export type Viewer = { id: string; isProjectAuthor: boolean }

/**
 * Le membre qui regarde voit-il encore le texte de ce commentaire masqué ? Oui s'il l'a écrit, ou
 * s'il est l'auteur du projet ; les autres ne le voient plus.
 */
const seesHidden = (row: Pick<CommentRow, 'authorId'>, viewer: Viewer) =>
  viewer.isProjectAuthor || (row.authorId !== null && row.authorId === viewer.id)

/** Une réponse est-elle montrée à ce membre ? (Une réponse n'est jamais « supprimée » : elle est effacée.) */
const replyShown = (row: CommentRow, viewer: Viewer) =>
  row.hiddenAt === null || seesHidden(row, viewer)

/**
 * La même règle, écrite en SQL pour les colonnes d'une table de réponses (un « alias » de
 * project_comment, voir loadCommentPage).
 */
const replyShownSql = (
  table: { hiddenAt: Column; authorId: Column },
  viewer: Viewer,
): SQL | undefined =>
  viewer.isProjectAuthor
    ? undefined // l'auteur du projet voit toutes les réponses, masquées comprises
    : or(isNull(table.hiddenAt), eq(table.authorId, viewer.id))

/**
 * Un commentaire tel que ce membre le voit (contrat `CommentReply`), ou null s'il ne le voit pas du
 * tout. `hasShownReplies` : pour une racine, au moins une de ses réponses est montrée à ce membre ;
 * elle reste alors à sa place sous forme d'emplacement (« Commentaire supprimé », « Commentaire
 * masqué »), sans auteur ni texte, pour que les réponses gardent leur fil.
 */
export const presentComment = (
  row: CommentRow,
  viewer: Viewer,
  authors: Map<string, ProjectAuthor>,
  hasShownReplies: boolean,
): CommentReply | null => {
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  }
  const placeholder = (state: 'hidden' | 'deleted'): CommentReply | null =>
    hasShownReplies
      ? { ...base, author: null, body: '', editedAt: null, state, isMine: false }
      : null
  if (row.deletedAt !== null) return placeholder('deleted')
  const author = row.authorId === null ? undefined : authors.get(row.authorId)
  // Sans auteur (compte disparu sans passer par l'API), il n'y a plus rien à montrer de lui.
  if (!author) return placeholder('deleted')
  if (row.hiddenAt !== null && !seesHidden(row, viewer)) return placeholder('hidden')
  return {
    ...base,
    author,
    body: row.body,
    state: row.hiddenAt === null ? 'visible' : 'hidden',
    isMine: row.authorId === viewer.id,
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
 * à ce membre, de la plus ancienne à la plus récente (50 au plus). Toujours trois requêtes, quel
 * que soit le nombre de commentaires : les racines, leurs réponses, leurs auteurs.
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
  const rootShown = and(
    isNull(c.deletedAt),
    viewer.isProjectAuthor ? undefined : or(isNull(c.hiddenAt), eq(c.authorId, viewer.id)),
  )
  const firstShownReply = db
    .select({ one: sql`1` })
    .from(reply)
    .where(and(eq(reply.rootId, c.id), replyShownSql(reply, viewer)))
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
      .where(and(eq(reply.rootId, c.id), replyShownSql(reply, viewer)))
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

  const items = page.flatMap((root): Comment[] => {
    const replies = (repliesByRoot.get(root.id) ?? [])
      // Redit en JavaScript : la requête a déjà écarté les réponses qu'il ne voit pas.
      .filter((row) => replyShown(row, viewer))
      .flatMap((row) => presentComment(row, viewer, authors, false) ?? [])
    const shownRoot = presentComment(root, viewer, authors, replies.length > 0)
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
 * racines et les réponses, sans les masqués ni les supprimés. Le même nombre pour tous, les deux
 * auteurs compris.
 *
 * En SQL : select project_id, count(*)::int from project_comment where project_id in (…)
 * and hidden_at is null and deleted_at is null group by project_id. L'index
 * project_comment_project_idx donne les commentaires de chaque projet de la liste.
 */
export const commentCountsOf = async (
  db: Reader,
  projectIds: string[],
): Promise<Map<string, number>> => {
  if (projectIds.length === 0) return new Map()
  const rows = await db
    .select({ projectId: c.projectId, count: sql<number>`count(*)::int` })
    .from(c)
    .where(and(inArray(c.projectId, projectIds), isNull(c.hiddenAt), isNull(c.deletedAt)))
    .groupBy(c.projectId)
  return new Map(rows.map((row) => [row.projectId, row.count]))
}

/**
 * Tous les commentaires d'un membre, des plus anciens aux plus récents, pour l'export de ses
 * données : racines et réponses, masqués compris (c'est son texte), sur tous les projets, même
 * devenus privés (le projet n'est donné que par son identifiant). Un commentaire qu'il a supprimé
 * n'y est plus : son texte est effacé et il n'a plus d'auteur. L'index project_comment_author_idx
 * trouve ses commentaires ; le tri se fait ensuite en mémoire (l'export est rare).
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
    })
    .from(c)
    .where(and(eq(c.authorId, authorId), isNull(c.deletedAt)))
    .orderBy(asc(c.createdAt), asc(c.id))
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  }))
}
