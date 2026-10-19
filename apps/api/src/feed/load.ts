// Lecture des deux fils de l'accueil (tranche 4a) : « Abonnements » et « Découvrir ». Ils montrent
// les nouveaux projets publics, du plus récent au plus ancien, par pages de 20, et se lisent avec
// un curseur.
//
// Pourquoi un curseur plutôt qu'un numéro de page (« offset 20 », « offset 40 ») : avec offset,
// PostgreSQL doit relire puis jeter toutes les lignes des pages précédentes, de plus en plus
// lentement ; et si un projet est publié pendant qu'on lit, tout glisse d'un cran : le dernier
// projet de la page 1 revient en haut de la page 2. Le curseur dit au contraire « la suite, après
// ce projet-là » : la base saute directement au bon endroit de son index, et ce qui arrive entre
// deux pages ne décale rien.
import {
  FEED_PAGE_SIZE,
  type FeedItem,
  type FeedPage,
  type FollowingFeedPage,
  ProjectId,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNotNull, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { followsAnyone } from '../follows/load'
import { rowToSummary, selectMedia, selectProjects } from '../projects/load'

/**
 * Ce que contient un curseur, une fois décodé : la date et l'identifiant du dernier projet de la
 * page. strictObject refuse tout champ de plus. La date est bornée : PostgreSQL refuse l'an 0, et
 * un curseur fabriqué avec cette date ferait échouer la requête (erreur 500) au lieu d'être refusé
 * comme invalide (400). Aucun projet n'a été publié avant l'an 2000 (et la date ISO a toujours une
 * année de quatre chiffres : comparer les textes suffit).
 */
const CursorContent = z.strictObject({
  at: z.iso.datetime().refine((at) => at >= '2000', 'date trop ancienne'),
  id: ProjectId,
})
type CursorContent = z.infer<typeof CursorContent>

/**
 * Fabrique le curseur de la page suivante : `{ at, id }` écrit en JSON, puis en base64url (le
 * base64 des adresses : des lettres, des chiffres, « - » et « _ », sans « = » final). L'appli le
 * renvoie tel quel, sans jamais le lire.
 */
const encodeCursor = (content: CursorContent): string =>
  Buffer.from(JSON.stringify(content), 'utf8').toString('base64url')

/**
 * Lit un curseur reçu de l'appli. Le contrat a déjà vérifié sa forme (base64url, 200 caractères au
 * plus) ; ici, on vérifie son contenu. null : un curseur qui ne veut rien dire (pas du JSON, une
 * date ou un identifiant mal formés…), que la route refuse comme toute donnée invalide.
 */
export const decodeCursor = (cursor: string): CursorContent | null => {
  let content: unknown
  try {
    content = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return null // pas du JSON
  }
  const parsed = CursorContent.safeParse(content)
  return parsed.success ? parsed.data : null
}

const t = schema.project

/**
 * « Après le curseur », dans l'ordre du fil. Une comparaison de couples : (a, b) < (c, d) veut dire
 * « a < c, ou bien a = c et b < d », comme on range des mots par leur première lettre, puis par la
 * deuxième en cas d'égalité. Ici : publié avant le dernier projet de la page, ou au même instant
 * avec un identifiant plus petit. L'identifiant départage les ex aequo : sans lui, des projets
 * publiés au même instant seraient perdus (ou répétés) d'une page à l'autre.
 *
 * PostgreSQL sait lire cette condition directement dans l'index (published_at, id) : il part du
 * curseur et descend. La date et l'identifiant viennent du client : ils n'entrent dans la requête
 * que comme paramètres liés ($1, $2), envoyés à part du texte SQL, donc jamais exécutés. La date
 * passe par la colonne (sql.param(…, t.publishedAt)), qui l'écrit comme elle écrit ses valeurs.
 */
const after = (cursor: CursorContent): SQL =>
  sql`(${t.publishedAt}, ${t.id}) < (${sql.param(new Date(cursor.at), t.publishedAt)}::timestamp, ${cursor.id}::uuid)`

/**
 * Une page de fil : les projets publics qui remplissent `where`, après le curseur s'il y en a un.
 * Toujours deux requêtes, quel que soit le nombre de cartes : les projets (avec leur auteur), puis
 * les médias de tous ces projets à la fois (pour les couvertures).
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
        // Un projet privé n'apparaît dans aucun fil, même pour son auteur.
        eq(t.visibility, 'public'),
        isNotNull(t.publishedAt),
        where,
        cursor ? after(cursor) : undefined,
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
 * Le fil « Abonnements » : les nouveaux projets publics des membres que `viewerId` suit. Suivre un
 * projet n'y ajoute rien pour l'instant (ses notes viendront en tranche 4b), mais compte dans
 * `followsAnyone`.
 *
 * La condition « l'auteur est suivi » est une sous-requête : author_id in (select member_id from
 * member_follow where follower_id = $viewer). La clé primaire de member_follow, qui commence par
 * follower_id, donne la liste des membres suivis ; l'index (author_id, published_at) de project
 * donne ensuite les projets de chacun.
 */
export const loadFollowingFeed = async (
  db: Database,
  viewerId: string,
  cursor: CursorContent | null,
  publicApiUrl: string,
): Promise<FollowingFeedPage> => {
  const followed = db
    .select({ id: schema.memberFollow.memberId })
    .from(schema.memberFollow)
    .where(eq(schema.memberFollow.followerId, viewerId))
  const [page, anyone] = await Promise.all([
    loadPage(db, inArray(t.authorId, followed), cursor, viewerId, publicApiUrl),
    followsAnyone(db, viewerId),
  ])
  return { ...page, followsAnyone: anyone }
}

/**
 * Le fil « Découvrir » : tous les projets publics, ceux du visiteur compris. `testers` : seulement
 * ceux qui cherchent des testeurs (au statut « testable », avec un lien de démo). L'index partiel
 * project_public_published_idx est déjà rangé dans l'ordre du fil.
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
