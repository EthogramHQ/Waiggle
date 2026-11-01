// La recherche par mots (tranche R3, GET /v1/search) : les projets, les membres et les outils dont
// le texte contient chaque mot tapé, sans tenir compte des accents ni des majuscules (fold.ts). Rien
// n'est écrit : ni le mot cherché, ni un historique. Chaque groupe ne montre que ce que le membre
// verrait ailleurs (projets privés des autres, retirés, comptes non vérifiés, blocages).
import {
  SEARCH_GROUP_MAX,
  SEARCH_OTHERS_FROM,
  type SearchMember,
  type SearchProject,
  type ToolCount,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { notBlockedWith } from '../blocks/visibility'
import { memberFollowerCounts } from '../follows/load'
import { mediaUrl } from '../profile/me'
import { loadSummaries } from '../projects/load'
import { projectVisibleTo, verifiedAuthor } from '../projects/visibility'
import { searchTools } from '../tools/load'
import { excerptOf } from './excerpt'
import { contains, foldSql } from './fold'

/** Ce qui sait lancer une requête : la base, ou la transaction de la recherche. */
type Executor = Pick<Database, 'execute' | 'select'>

/** Un groupe de résultats : 20 au plus, et `more` quand un 21e existait. */
type Group<T> = { items: T[]; more: boolean }

/** Une colonne de la table intermédiaire d'une requête (« folded_title »), par son nom. */
const col = (name: string): SQL => sql`${sql.identifier(name)}`

/** « Chaque mot est dans l'une de ces colonnes » : un `and` de `or` (tous les mots, n'importe où). */
const everyWordIn = (words: string[], columns: SQL[]): SQL | undefined =>
  and(...words.map((word) => or(...columns.map((column) => contains(column, word)))))

const p = schema.project
const u = schema.user
const h = schema.memberHandle

/**
 * Les projets que ce membre voit : les publics des autres et tous les siens (projectVisibleTo),
 * mais jamais un projet retiré, même le sien, ni celui d'un auteur non vérifié (sec-A3). Ce qu'un
 * projet retiré dit à son auteur se lit sur sa page, pas dans une recherche.
 */
const searchable = (viewerId: string) =>
  and(projectVisibleTo(viewerId), isNull(p.removedAt), verifiedAuthor())

/**
 * Les identifiants des projets trouvés, dans l'ordre de la recherche, 21 au plus (sec-A5), et pour
 * chacun : les mots sont-ils tous dans le titre ou le pitch (sinon, l'extrait vient de la
 * description). En SQL :
 *   with candidate as materialized (
 *     select id, coalesce(published_at, created_at) as at,
 *            <replié>(title) as folded_title, <replié>(pitch) as folded_pitch,
 *            <replié>(description) as folded_description
 *     from project where <visible, pas retiré, auteur vérifié>
 *   )
 *   select id, <chaque mot dans folded_title> as in_title,
 *          <chaque mot dans folded_title ou folded_pitch> as in_header
 *   from candidate where <chaque mot dans l'une des trois colonnes>
 *   order by in_title desc, at desc, id desc limit 21
 * `with … as materialized` (sec-B3) : la table intermédiaire est calculée une seule fois, après le
 * filtre de visibilité, et PostgreSQL ne peut pas recopier le repli dans chaque condition : chaque
 * colonne de chaque projet est repliée une fois, quel que soit le nombre de mots. Aucun index ne
 * sert à « contient » (il faudrait l'extension pg_trgm) : la base lit tous les projets visibles,
 * par l'index partiel project_public_published_idx pour les publics et project_author_created_idx
 * pour ceux du membre. C'est ce que mesure la relecture sec-B3, avec la limite de 2 secondes.
 */
const findProjectIds = async (db: Executor, viewerId: string, words: string[]) => {
  const [title, pitch, description] = [
    col('folded_title'),
    col('folded_pitch'),
    col('folded_description'),
  ]
  const result = await db.execute(sql`
    with candidate as materialized (
      select ${p.id} as id, coalesce(${p.publishedAt}, ${p.createdAt}) as at,
        ${foldSql(p.title)} as folded_title,
        ${foldSql(p.pitch)} as folded_pitch,
        ${foldSql(p.description)} as folded_description
      from ${p}
      where ${searchable(viewerId)}
    )
    select id, coalesce(${everyWordIn(words, [title])}, false) as in_title,
      coalesce(${everyWordIn(words, [title, pitch])}, false) as in_header
    from candidate
    where ${everyWordIn(words, [title, pitch, description])}
    order by in_title desc, at desc, id desc
    limit ${SEARCH_GROUP_MAX + 1}`)
  return z
    .object({ rows: z.array(z.object({ id: z.string(), in_header: z.boolean() })) })
    .parse(result).rows
}

/**
 * Les projets trouvés, avant leurs résumés : leurs identifiants dans l'ordre de la recherche (20
 * au plus), `more`, et l'extrait de chacun (null quand tous les mots sont dans le titre ou le
 * pitch). Les descriptions dont on tire un extrait se lisent en une requête de plus, par la clé
 * primaire, seulement si un projet en demande un.
 */
type FoundProjects = { ids: string[]; more: boolean; excerpts: Map<string, string | null> }

const findProjects = async (
  db: Executor,
  viewerId: string,
  words: string[],
): Promise<FoundProjects> => {
  const found = await findProjectIds(db, viewerId, words)
  const shown = found.slice(0, SEARCH_GROUP_MAX)
  const needExcerpt = shown.filter((row) => !row.in_header).map((row) => row.id)
  const descriptions =
    needExcerpt.length === 0
      ? []
      : await db
          .select({ id: p.id, description: p.description })
          .from(p)
          .where(inArray(p.id, needExcerpt))
  return {
    ids: shown.map((row) => row.id),
    more: found.length > SEARCH_GROUP_MAX,
    excerpts: new Map(descriptions.map((row) => [row.id, excerptOf(row.description, words)])),
  }
}

/**
 * Le groupe « Projets » : les résumés des projets trouvés, chargés par loadSummaries (couverture
 * comprise, deux requêtes), avec la même condition de visibilité (sec-A5) ; l'ordre de la
 * recherche est gardé. En tout, 2 à 4 requêtes, quel que soit le nombre de projets.
 */
const projectGroup = async (
  db: Database,
  found: FoundProjects,
  viewerId: string,
  publicApiUrl: string,
): Promise<Group<SearchProject>> => {
  if (found.ids.length === 0) return { items: [], more: false }
  const loaded = await loadSummaries(
    db,
    and(inArray(p.id, found.ids), searchable(viewerId)),
    viewerId,
    publicApiUrl,
  )
  const byId = new Map(loaded.map((summary) => [summary.id, summary]))
  const items = found.ids.flatMap((id): SearchProject[] => {
    const summary = byId.get(id)
    // Devenu invisible entre les deux lectures (rendu privé, retiré) : il ne sort pas.
    return summary ? [{ ...summary, excerpt: found.excerpts.get(id) ?? null }] : []
  })
  return { items, more: found.more }
}

const MemberRow = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string(),
  avatar_key: z.string().nullable(),
})

/**
 * Le groupe « Membres » : le nom (replié) ou le pseudo actuel contient chaque mot. En SQL :
 *   with candidate as materialized (
 *     select "user".id, "user".name, member_handle.handle, profile.avatar_key,
 *            <replié>("user".name) as folded_name
 *     from "user"
 *     inner join member_handle on member_handle.user_id = "user".id and released_at is null
 *     left join profile on profile.user_id = "user".id
 *     where email_verified and <aucun blocage, dans un sens ou l'autre>
 *       [and <je le suis>]          -- quand aucun mot n'a 3 caractères (sec-B1)
 *   )
 *   select … from candidate where <chaque mot dans folded_name ou handle>
 *   order by starts_with(folded_name, $premierMot) desc, folded_name collate "C", id limit 21
 * Le pseudo actuel seulement (released_at is null, l'index partiel member_handle_current_idx) :
 * un pseudo abandonné ne mène plus à son ancien titulaire (jur-J2). Un compte supprimé n'a plus de
 * ligne dans "user". Le membre qui cherche peut se trouver lui-même. Tri par nom, jamais par nombre
 * d'abonnés (jur-J4) ; `collate "C"` : le même ordre en production et sous PGlite. Le pseudo n'est
 * pas replié : il est déjà en minuscules, sans accent (contrat Handle).
 *
 * Trop court pour l'annuaire (sec-B1, jur-J1) : quand aucun mot n'atteint 3 caractères, seuls les
 * membres qu'il suit sortent (la clé primaire (follower_id, member_id) de member_follow). Compter
 * le mot le plus long, et non le texte entier : « ab cd » ne doit pas ouvrir l'annuaire à deux
 * lettres.
 */
const searchMembers = async (
  db: Executor,
  viewerId: string,
  words: string[],
  publicApiUrl: string,
): Promise<Group<SearchMember>> => {
  const short = words.every((word) => word.length < SEARCH_OTHERS_FROM)
  const followed = sql`exists (select 1 from ${schema.memberFollow} where ${schema.memberFollow.followerId} = ${viewerId} and ${schema.memberFollow.memberId} = ${u.id})`
  const name = col('folded_name')
  const result = await db.execute(sql`
    with candidate as materialized (
      select ${u.id} as id, ${u.name} as name, ${h.handle} as handle,
        ${schema.profile.avatarKey} as avatar_key, ${foldSql(u.name)} as folded_name
      from ${u}
      inner join ${h} on ${h.userId} = ${u.id} and ${h.releasedAt} is null
      left join ${schema.profile} on ${schema.profile.userId} = ${u.id}
      where ${u.emailVerified} = true and ${notBlockedWith(viewerId, u.id)}
        ${short ? sql`and ${followed}` : sql``}
    )
    select id, name, handle, avatar_key from candidate
    where ${everyWordIn(words, [name, col('handle')])}
    order by starts_with(${name}, ${words[0] ?? ''}) desc, ${name} collate "C", id
    limit ${SEARCH_GROUP_MAX + 1}`)
  const rows = z.object({ rows: z.array(MemberRow) }).parse(result).rows
  const shown = rows.slice(0, SEARCH_GROUP_MAX)
  // Le nombre d'abonnés de tous les membres trouvés, en une requête (follows/load.ts).
  const counts = await memberFollowerCounts(
    db,
    shown.map((row) => row.id),
  )
  return {
    items: shown.map((row) => ({
      id: row.id,
      name: row.name,
      handle: row.handle,
      avatarUrl: row.avatar_key ? mediaUrl(publicApiUrl, row.avatar_key) : null,
      followerCount: counts.get(row.id) ?? 0,
    })),
    more: rows.length > SEARCH_GROUP_MAX,
  }
}

/**
 * La recherche entière. `words` vient de `searchWords` (contrat) : repliés, sans doublon, 1 à 5.
 * Les trois groupes se lisent dans une transaction dont chaque requête est arrêtée après 2
 * secondes (sec-B3) : `set local statement_timeout` ne vaut que jusqu'à la fin de la transaction,
 * et ne change rien aux autres requêtes de l'API. Au-delà, PostgreSQL lève l'erreur 57014, que la
 * route change en 503 (routes/search.ts). Les requêtes d'une transaction passent l'une après
 * l'autre, sur sa connexion. Les résumés des projets, simples lectures par clé primaire, se lisent
 * après la transaction : loadSummaries lit la base elle-même, et une lecture hors transaction
 * attendrait sa fin (sous PGlite, une seule connexion : elle ne finirait jamais).
 */
export const search = async (
  db: Database,
  viewerId: string,
  words: string[],
  publicApiUrl: string,
): Promise<{
  projects: Group<SearchProject>
  members: Group<SearchMember>
  tools: Group<ToolCount>
}> => {
  const { found, members, tools } = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '2s'`)
    return {
      found: await findProjects(tx, viewerId, words),
      members: await searchMembers(tx, viewerId, words, publicApiUrl),
      tools: await searchTools(tx, viewerId, words),
    }
  })
  return { projects: await projectGroup(db, found, viewerId, publicApiUrl), members, tools }
}
