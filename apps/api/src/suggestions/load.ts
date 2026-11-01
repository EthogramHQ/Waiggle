// « Proches à suivre » (tranche R4) : qui proposer à un membre, et ce qu'il a écarté. Des membres
// qui ont publié récemment, chacun avec son dernier projet public ; jamais lui-même, ni quelqu'un
// qu'il suit, qu'il a écarté (« × »), qu'il a bloqué ou qui l'a bloqué. L'ordre ne dépend que de la
// date du dernier projet, jamais de la popularité (relecture juridique jur-J5). Les routes sont
// dans routes/suggestions.ts.
import {
  type DismissedSuggestionExport,
  SUGGESTION_MAX,
  type SuggestedMember,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'
import { currentHandleOf } from '../handles/load'
import { describeError } from '../log'
import { rowsToSummaries, selectProjects } from '../projects/load'
import { listedVerifiedProjectFor } from '../projects/visibility'

const t = schema.project
const d = schema.suggestionDismissal

/**
 * La fenêtre de lecture (relecture de sécurité sec-A1) : seuls les 200 derniers projets listés
 * sont lus pour trouver les auteurs à proposer. Le coût de la liste reste ainsi le même, quel que
 * soit le nombre de projets du site ; un auteur dont le dernier projet est plus ancien que ces 200
 * n'est simplement plus proposé.
 */
export const SUGGESTION_WINDOW = 200

/** Le code d'erreur de PostgreSQL quand `statement_timeout` arrête une requête. */
const STATEMENT_TIMEOUT = '57014'

/**
 * Vrai si l'erreur vient de `statement_timeout`. Le code PostgreSQL est sur l'erreur elle-même ou
 * sur sa cause (Drizzle enveloppe l'erreur du pilote dans la sienne). Même lecture que
 * routes/search.ts.
 */
const isStatementTimeout = (error: unknown): boolean => {
  for (let current = error, depth = 0; current && depth < 3; depth++) {
    if (typeof current !== 'object') return false
    if (Reflect.get(current, 'code') === STATEMENT_TIMEOUT) return true
    current = Reflect.get(current, 'cause')
  }
  return false
}

/**
 * Les identifiants des projets à montrer, un par auteur proposé, dans l'ordre de la liste. Une
 * seule requête, en trois étages, chacun une sous-requête de celui d'après :
 *
 * 1. `recent` : les 200 derniers projets listés pour ce membre (publics, pas retirés, d'un auteur
 *    vérifié, sans blocage avec lui : `listedVerifiedProjectFor`), publiés, du plus récent au plus
 *    ancien. L'index partiel project_public_published_idx (published_at desc, id desc, seulement
 *    les projets publics) les donne déjà dans cet ordre : PostgreSQL le parcourt et s'arrête au
 *    200e, sans tri ; chaque ligne lue passe par les deux `exists` du blocage (clé primaire et
 *    index de member_block) et la clé primaire de "user" (auteur vérifié).
 * 2. `latest` : « distinct on (author_id) » garde une seule ligne par auteur, la première dans
 *    l'ordre donné, donc son projet le plus récent. Un tri en mémoire de 200 lignes au plus.
 * 3. La liste : sans le membre lui-même, sans ceux qu'il suit (clé primaire de member_follow,
 *    qui commence par follower_id) ni ceux qu'il a écartés (clé primaire de
 *    member_suggestion_dismissal, qui commence par member_id), triée par la date de ce dernier
 *    projet, coupée à 5.
 *
 * Ces trois exclusions viennent après la fenêtre, pas dedans : la fenêtre reste ainsi 200 lignes
 * d'index, même pour un membre qui suit beaucoup d'auteurs prolifiques (sinon PostgreSQL pourrait
 * lire tout l'index pour trouver 200 projets d'auteurs qu'il ne suit pas). Un membre qui suit tous
 * les auteurs récents n'a donc personne à qui l'on le propose : la liste est vide, sans erreur.
 *
 * Un brouillon (projet privé) ou un projet devenu privé n'entre pas dans la fenêtre : il ne remonte
 * pas son auteur, qui est classé par son dernier projet encore public.
 */
const suggestedProjectIds = async (db: Database, viewerId: string): Promise<string[]> => {
  const recent = db
    .select({ id: t.id, authorId: t.authorId, publishedAt: t.publishedAt })
    .from(t)
    .where(and(listedVerifiedProjectFor(viewerId), isNotNull(t.publishedAt)))
    .orderBy(desc(t.publishedAt), desc(t.id))
    .limit(SUGGESTION_WINDOW)
    .as('recent')
  // selectDistinctOn : « select distinct on (…) », propre à PostgreSQL ; l'ordre doit commencer
  // par les colonnes du « distinct on ».
  const latest = db
    .selectDistinctOn([recent.authorId], {
      id: recent.id,
      authorId: recent.authorId,
      publishedAt: recent.publishedAt,
    })
    .from(recent)
    .orderBy(recent.authorId, desc(recent.publishedAt), desc(recent.id))
    .as('latest')
  const f = schema.memberFollow
  // `statement_timeout` (sec-A1, comme la recherche) : la requête est arrêtée au bout de deux
  // secondes. « set local » ne vaut que dans la transaction, et ne change rien aux autres requêtes
  // de l'API. Les deux identifiants entrent dans les `not exists` comme paramètres liés.
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '2s'`)
    return tx
      .select({ id: latest.id })
      .from(latest)
      .where(
        and(
          ne(latest.authorId, viewerId),
          sql`not exists (select 1 from ${f} where ${f.followerId} = ${viewerId} and ${f.memberId} = ${latest.authorId})`,
          sql`not exists (select 1 from ${d} where ${d.memberId} = ${viewerId} and ${d.dismissedId} = ${latest.authorId})`,
        ),
      )
      .orderBy(desc(latest.publishedAt), desc(latest.id))
      .limit(SUGGESTION_MAX)
  })
  return rows.map((row) => row.id)
}

/**
 * La liste « Proches à suivre » de ce membre, 5 au plus. Toujours le même nombre de requêtes,
 * qu'il y ait un auteur ou cinq : la requête des auteurs (dans sa transaction), les projets à
 * montrer (par leur clé primaire, avec leur auteur), puis, en même temps, leurs médias et le total
 * de leurs réactions (rowsToSummaries). Le résumé est donc exactement celui d'une carte d'Explorer.
 *
 * Les projets sont relus avec la même condition `listedVerifiedProjectFor` : un projet devenu privé
 * ou un blocage posé entre les deux requêtes fait seulement disparaître une ligne. La lecture des
 * projets vient après la transaction : sous PGlite (une seule connexion), une lecture hors de la
 * transaction attendrait sa fin sans jamais la voir venir.
 *
 * Si la requête des auteurs dépasse son délai, la liste est vide (et l'incident est noté dans le
 * journal) : les suggestions sont un plus, pas une raison d'afficher une erreur.
 */
export const loadSuggestions = async (
  db: Database,
  viewerId: string,
  publicApiUrl: string,
): Promise<SuggestedMember[]> => {
  let ids: string[]
  try {
    ids = await suggestedProjectIds(db, viewerId)
  } catch (error) {
    if (!isStatementTimeout(error)) throw error
    console.error(
      'Suggestions stopped',
      describeError(error, { method: 'GET', path: '/v1/suggestions/members' }),
    )
    return []
  }
  if (ids.length === 0) return []

  const rows = await selectProjects(db).where(
    and(inArray(t.id, ids), listedVerifiedProjectFor(viewerId)),
  )
  // Les lignes reviennent dans un ordre quelconque : on les remet dans celui de la liste.
  const byId = new Map(rows.map((row) => [row.project.id, row]))
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
  const summaries = await rowsToSummaries(db, ordered, viewerId, publicApiUrl)
  // Le membre proposé est l'auteur de la carte : son nom et sa photo viennent du même résumé.
  return summaries.map((project) => ({
    id: project.author.id,
    name: project.author.name,
    avatarUrl: project.author.avatarUrl,
    latestProject: project,
  }))
}

/**
 * Les suggestions écartées par ce membre, pour l'export de ses données (jur-J4) : l'écarté par son
 * identifiant et son pseudo actuel (null s'il n'en a pas), et la date du « × ». Jamais le nom
 * affiché, et jamais les écarts qui visent ce membre : la condition porte sur member_id seul, que
 * la clé primaire de member_suggestion_dismissal sert. Même forme que les blocages (blocks/list.ts).
 */
export const dismissedSuggestionsOf = async (
  db: Database,
  memberId: string,
): Promise<DismissedSuggestionExport[]> => {
  const rows = await db
    .select({ memberId: d.dismissedId, handle: schema.memberHandle.handle, at: d.at })
    .from(d)
    .leftJoin(schema.memberHandle, currentHandleOf(d.dismissedId))
    .where(eq(d.memberId, memberId))
    .orderBy(asc(d.at), asc(d.dismissedId))
  return rows.map((row) => ({ ...row, at: row.at.toISOString() }))
}
