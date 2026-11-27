// La revérification des sujets du temps réel (R21, relecture de sécurité du plan, B4) : après une
// écriture qui change une visibilité (projet passé en privé, retiré, changé de ruche ; blocage ;
// départ ou exclusion d'une ruche ; ruche supprimée ; testeur retiré ou parti ; auteur suspendu),
// les connexions qui écoutaient un sujet qu'elles n'ont plus le droit de lire le perdent, et
// reçoivent `{ topic, kind: 'gone' }` : l'appli relit, reçoit le 404 et retire la ressource de
// l'écran. Ensuite, plus rien n'arrive sur ce sujet pour elles.
//
// Le filtre de l'émission (live/emit.ts, B1) empêche déjà toute fuite : un signal ne part jamais à
// qui ne pourrait pas relire. La revérification sert l'écran (le `gone`) et vide le bus des sujets
// morts.
//
// Deux portes d'entrée, selon ce que l'écriture connaît :
// - `recheckTopics(live, topics)` : tous les écouteurs de ces sujets (un projet devenu privé : tous
//   ceux qui regardent sa page ou son coin) ;
// - `recheckMembers(live, memberIds)` : tous les sujets déclarés par ces membres (un blocage : les
//   deux membres ; un départ de ruche : celui qui part).
// Toutes deux font la même chose : elles forment des paires (membre, sujet), jugent chaque paire
// en lot, puis retirent du bus les paires refusées (`hub.withdraw`).
//
// **Le coût** : quatre requêtes au plus pour tout le lot, quel que soit le nombre d'écouteurs, en
// deux tours (les deux du second tour ont besoin des auteurs et des ruches lus au premier) :
// 1. les projets (« id in (…) », clé primaire de project) et les membres qui ont une page
//    (« id in (…) and email_verified », clé primaire de "user") ;
// 2. les blocages des auteurs et des membres des pages (`blockPartnersOf` : la clé primaire de
//    member_block et member_block_blocked_idx) et les membres des ruches (clé primaire de
//    hive_member, hive_id en tête).
// Seul le coin des testeurs demande plus : `cornerAccess` (testers/access.ts, quatre petites
// lectures par clé primaire au plus) pour chaque paire qui reste douteuse après le lot, c'est-à-dire
// un testeur d'un projet encore listé pour lui, sans blocage avec l'auteur. Un projet devenu privé,
// retiré ou séparé par un blocage se juge sans elle. Aucune lecture sans écouteur.
//
// **Les règles**, chacune reprise de celle de la lecture, sans en écrire une nouvelle :
// - `project:<id>` : `projectVisibleTo` (projects/visibility.ts), en JavaScript : l'auteur, ou
//   `sharedWith` (sa règle jumelle, écrite à côté de la règle SQL) et aucun blocage avec l'auteur ;
// - `hive:<id>` : être membre de la ruche aujourd'hui (une ruche supprimée n'a plus de membres) ;
// - `member:<id>` : un compte qui a une page (`memberWithPage`), sans blocage dans un sens ni dans
//   l'autre, comme `allowedTopics` (live/access.ts) ;
// - `corner:<id>` : `cornerAccess`, auteur ou testeur inscrit ; un ancien testeur n'écoute plus le
//   coin (relecture du plan, B4 ; décision du 27/11/2026).
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray } from 'drizzle-orm'
import { blockPartnersOf } from '../blocks/visibility'
import { memberWithPage } from '../blocks/write'
import { sharedWith } from '../projects/visibility'
import { cornerAccess } from '../testers/access'
import { hiveMembersOf, type Live, type ProjectScope, safely } from './emit'

type Reader = Pick<Database, 'select'>

/** Les sortes de sujets qui se déclarent, donc qui se revérifient (`me`, `feed` restent toujours). */
const RECHECKED = ['project', 'hive', 'member', 'corner'] as const
type Kind = (typeof RECHECKED)[number]

/** Un sujet découpé : sa sorte et l'identifiant qui suit les deux-points (null : pas revérifié). */
const parse = (topic: string): { kind: Kind; id: string } | null => {
  const colon = topic.indexOf(':')
  if (colon < 0) return null
  const kind = topic.slice(0, colon)
  const id = topic.slice(colon + 1)
  return (RECHECKED as readonly string[]).includes(kind) ? { kind: kind as Kind, id } : null
}

/** Une paire à juger : ce membre a-t-il encore le droit d'écouter ce sujet ? */
type Pair = { userId: string; topic: string; kind: Kind; id: string }

/**
 * Les paires de ce lot que la règle refuse aujourd'hui. Les identifiants viennent du bus, donc de
 * déclarations déjà validées par le contrat (uuid ou `MemberId`) ; ils entrent dans les requêtes
 * comme valeurs liées.
 */
const refusedPairs = async (db: Reader, pairs: readonly Pair[]): Promise<Pair[]> => {
  const idsOf = (...kinds: Kind[]) => [
    ...new Set(pairs.filter((pair) => kinds.includes(pair.kind)).map((pair) => pair.id)),
  ]
  // Le projet d'un coin se lit avec ceux des pages : un coin d'un projet privé se juge sans
  // `cornerAccess`.
  const projectIds = idsOf('project', 'corner')
  const memberIds = idsOf('member')

  // Premier tour : les projets et les pages des membres.
  const [projectRows, pageRows] = await Promise.all([
    projectIds.length === 0
      ? []
      : db
          .select({
            id: schema.project.id,
            authorId: schema.project.authorId,
            visibility: schema.project.visibility,
            hiveId: schema.project.hiveId,
            removedAt: schema.project.removedAt,
          })
          .from(schema.project)
          .where(inArray(schema.project.id, projectIds)),
    memberIds.length === 0
      ? []
      : db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(and(inArray(schema.user.id, memberIds), memberWithPage())),
  ])
  const projects = new Map<string, ProjectScope>(projectRows.map((row) => [row.id, row]))
  const pages = new Set(pageRows.map((row) => row.id))

  // Second tour : les blocages des auteurs et des membres des pages, et les membres des ruches
  // (celles des sujets `hive:` et celles des projets réservés).
  const hiveIds = new Set(idsOf('hive'))
  for (const project of projects.values()) if (project.hiveId !== null) hiveIds.add(project.hiveId)
  const blockSides = new Set(pages)
  for (const project of projects.values()) blockSides.add(project.authorId)
  const [partners, hives] = await Promise.all([
    blockPartnersOf(db, [...blockSides]),
    hiveMembersOf(db, [...hiveIds]),
  ])
  const blocked = (a: string, b: string) => partners.get(a)?.has(b) ?? false
  const inHive = (hiveId: string | null, userId: string) =>
    hiveId !== null && (hives.get(hiveId)?.has(userId) ?? false)

  /** `projectVisibleTo`, pour un projet déjà lu : son auteur, ou listé pour lui sans blocage. */
  const seesProject = (project: ProjectScope, userId: string) =>
    project.authorId === userId ||
    (sharedWith({ ...project, inViewerHive: inHive(project.hiveId, userId) }) &&
      !blocked(project.authorId, userId))

  const refused: Pair[] = []
  const doubtfulCorners: Pair[] = []
  for (const pair of pairs) {
    const { userId, kind, id } = pair
    if (kind === 'hive') {
      if (!inHive(id, userId)) refused.push(pair)
      continue
    }
    if (kind === 'member') {
      if (!pages.has(id) || blocked(id, userId)) refused.push(pair)
      continue
    }
    const project = projects.get(id)
    if (!project || !seesProject(project, userId)) {
      refused.push(pair)
      continue
    }
    // Un coin : son auteur l'écoute toujours (ouvert ou fermé, il le relit) ; un autre membre doit
    // en être testeur, ce que seule `cornerAccess` sait (inscription, suspension de l'auteur).
    if (kind === 'corner' && project.authorId !== userId) doubtfulCorners.push(pair)
  }
  // Les coins douteux, un par un : la règle du coin n'est écrite qu'une fois (testers/access.ts).
  // Un à la fois, pour ne pas prendre d'un coup les connexions de la base (un coin n'a que peu
  // d'écouteurs, son auteur et ses testeurs qui le regardent).
  for (const pair of doubtfulCorners) {
    if ((await cornerAccess(db, pair.id, pair.userId)) !== 'tester') refused.push(pair)
  }
  return refused
}

/** Juge les paires, puis retire au bus celles qui sont refusées, avec `gone`. */
const recheckPairs = async (live: Live, pairs: readonly Pair[]) => {
  if (pairs.length === 0) return
  const refused = await refusedPairs(live.db, pairs)
  const lostBy = new Map<string, Set<string>>()
  for (const { topic, userId } of refused) {
    const lost = lostBy.get(topic) ?? new Set<string>()
    lost.add(userId)
    lostBy.set(topic, lost)
  }
  for (const [topic, lost] of lostBy) live.hub.withdraw(topic, (userId) => !lost.has(userId))
}

/**
 * Revérifie tous les écouteurs de ces sujets (un projet devenu privé, retiré, changé de ruche ou
 * supprimé ; une ruche supprimée ; les coins d'un auteur suspendu). Sans écouteur, rien n'est lu.
 * À appeler après la fin de la transaction, comme les émissions ; une panne est notée dans les
 * logs et ne fait pas échouer la route.
 */
export const recheckTopics = (live: Live, topics: Iterable<string>) =>
  safely('recheck', async () => {
    const pairs: Pair[] = []
    for (const topic of new Set(topics)) {
      const parsed = parse(topic)
      if (!parsed) continue
      for (const userId of live.hub.listeners(topic)) pairs.push({ userId, topic, ...parsed })
    }
    await recheckPairs(live, pairs)
  })

/**
 * Revérifie tous les sujets déclarés par ces membres (un blocage : les deux ; un départ ou une
 * exclusion d'une ruche, un testeur retiré ou parti : ce membre). Un membre sans flux ouvert n'a
 * rien à revérifier.
 */
export const recheckMembers = (live: Live, memberIds: Iterable<string>) =>
  safely('recheck', async () => {
    const pairs: Pair[] = []
    for (const userId of new Set(memberIds)) {
      for (const topic of live.hub.declaredBy(userId)) {
        const parsed = parse(topic)
        if (parsed) pairs.push({ userId, topic, ...parsed })
      }
    }
    await recheckPairs(live, pairs)
  })

/** Les sujets d'un projet qui suivent sa visibilité : sa page et le coin de ses testeurs. */
export const projectTopics = (projectIds: Iterable<string>) =>
  [...new Set(projectIds)].flatMap((id) => [`project:${id}`, `corner:${id}`])

/**
 * Un auteur vient d'être suspendu : le coin de chacun de ses projets se ferme pour ses testeurs
 * (`cornerAccess` rend alors `not_found` à tous les autres). Ses projets restent lus (décision du
 * 16/11/2026) : seuls leurs coins sont revérifiés. Une requête, par l'index
 * project_author_created_idx (author_id en tête), et seulement si un flux est ouvert ; puis la
 * revérification des seuls coins écoutés.
 */
export const recheckAuthorCorners = (live: Live, authorId: string) =>
  safely('recheck', async () => {
    if (live.hub.isIdle()) return
    const rows = await live.db
      .select({ id: schema.project.id })
      .from(schema.project)
      .where(eq(schema.project.authorId, authorId))
    const corners = rows
      .map((row) => `corner:${row.id}`)
      .filter((topic) => live.hub.listeners(topic).size > 0)
    if (corners.length > 0) await recheckTopics(live, corners)
  })
