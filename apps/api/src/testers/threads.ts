// La lecture des fils du coin des testeurs (R7b) : la liste des fils de l'auteur (avec « non lu »,
// « À traiter » / « Réglés » et leurs nombres), un fil message par message, et les retours encore à
// traiter. Les routes (routes/tester-threads.ts) décident qui a le droit ; ici, on ne fait que lire,
// toujours en un nombre FIXE de requêtes, quelle que soit la longueur de la liste.
//
// Une règle revient partout (relecture de sécurité A9) : un message retiré par la modération n'existe
// plus que pour celui qui l'a écrit. Pour la liste de l'auteur, cela donne « un message est compté
// s'il n'est pas retiré, ou s'il est de l'auteur » ; ni l'extrait, ni la date, ni « non lu », ni
// « À traiter » ne voient un retour retiré du testeur.
import {
  MESSAGES_PAGE_SIZE,
  OPEN_FEEDBACK_MAX,
  type OpenFeedback,
  type Removal,
  TESTER_EXCERPT_MAX,
  type TesterMessage,
  type TesterMessagePage,
  type TesterThreadPage,
  type TesterThreadState,
  THREADS_PAGE_SIZE,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { mediaUrl } from '../profile/me'
import { removalsOf } from '../removals/load'
import { type TesterMediaRow, toTesterMedia } from './media'

type Reader = Pick<Database, 'select'>

export type MessageRow = typeof schema.testerMessage.$inferSelect

const m = schema.testerMessage

/**
 * Le début d'un message, pour la liste des fils et les notifications : les blancs (retours à la
 * ligne compris) ramenés à une espace, 80 caractères au plus, suivis de « … » s'il y a une suite.
 * `Array.from` compte des caractères entiers (un emoji vaut un), comme le contrat. Null pour un
 * retour sans texte.
 */
export const excerptOf = (text: string | null): string | null => {
  if (text === null) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  const points = Array.from(flat)
  return points.length > TESTER_EXCERPT_MAX
    ? `${points.slice(0, TESTER_EXCERPT_MAX).join('')}…`
    : flat
}

// ─── Les messages d'un fil ───────────────────────────────────────────────────────────────────────

/** La mise à jour qui a réglé un retour, telle qu'on la lit pour l'afficher. */
type SettledUpdateRow = {
  id: string
  version: string | null
  createdAt: Date
  removedAt: Date | null
}

/**
 * Une ligne de `tester_message` en `TesterMessage` (contrat), vue par `viewerId`.
 * - `sender` : qui a écrit (le testeur du fil, ou l'auteur) ; `mine` : le lecteur l'a écrit ;
 * - `settled.update` : la mise à jour qui a réglé le retour ; null si le retour a été réglé à la
 *   main, si la mise à jour a disparu, ou, pour un autre que l'auteur, si elle a été retirée
 *   (relecture de sécurité A10 : « Réglé » reste, la version non) ;
 * - `removal` : seulement pour l'expéditeur, qui est le seul à lire un message retiré.
 */
export const toTesterMessage = (
  row: MessageRow,
  context: {
    viewerId: string
    viewerIsAuthor: boolean
    capture: TesterMediaRow | undefined
    updates: ReadonlyMap<string, SettledUpdateRow>
    removals: ReadonlyMap<string, Removal>
    publicApiUrl: string
  },
): TesterMessage => {
  const update = row.settledUpdateId ? context.updates.get(row.settledUpdateId) : undefined
  const shownUpdate =
    update && (context.viewerIsAuthor || update.removedAt === null)
      ? { id: update.id, version: update.version, createdAt: update.createdAt.toISOString() }
      : null
  return {
    id: row.id,
    kind: row.kind === 'feedback' ? 'feedback' : 'reply',
    sender: row.senderId === row.testerId ? 'tester' : 'author',
    outcome:
      row.outcome === 'yes' || row.outcome === 'partly' || row.outcome === 'no'
        ? row.outcome
        : null,
    device:
      row.device === 'phone' || row.device === 'computer' || row.device === 'tablet'
        ? row.device
        : null,
    text: row.text,
    capture: context.capture ? toTesterMedia(context.capture, context.publicApiUrl) : null,
    createdAt: row.createdAt.toISOString(),
    settled: row.settledAt ? { at: row.settledAt.toISOString(), update: shownUpdate } : null,
    removal:
      row.removedAt !== null && row.senderId === context.viewerId
        ? (context.removals.get(row.removalId ?? '') ?? null)
        : null,
    mine: row.senderId === context.viewerId,
  }
}

/**
 * Les captures, les mises à jour de règlement et les retraits d'une liste de messages, en trois
 * requêtes quel que soit leur nombre (une seule par sorte, et aucune s'il n'y a rien à lire) :
 * - `tester_media where message_id in (…)` : l'index tester_media_message_idx (message_id) ;
 * - `project_update where id in (…)` : la clé primaire de project_update ;
 * - les décisions de retrait (removals/load.ts) : la clé primaire de moderation_decision.
 */
const loadMessageParts = async (db: Reader, rows: MessageRow[], viewerId: string) => {
  const updateIds = [
    ...new Set(rows.flatMap((row) => (row.settledUpdateId ? [row.settledUpdateId] : []))),
  ]
  const [captures, updates, removals] = await Promise.all([
    rows.length === 0
      ? []
      : db
          .select()
          .from(schema.testerMedia)
          .where(
            inArray(
              schema.testerMedia.messageId,
              rows.map((row) => row.id),
            ),
          ),
    updateIds.length === 0
      ? []
      : db
          .select({
            id: schema.projectUpdate.id,
            version: schema.projectUpdate.version,
            createdAt: schema.projectUpdate.createdAt,
            removedAt: schema.projectUpdate.removedAt,
          })
          .from(schema.projectUpdate)
          .where(inArray(schema.projectUpdate.id, updateIds)),
    // Seul l'expéditeur lit le retrait de son message : les autres lignes n'en demandent aucun.
    removalsOf(
      db,
      rows.map((row) =>
        row.removedAt !== null && row.senderId === viewerId ? row.removalId : null,
      ),
    ),
  ])
  return {
    captures: new Map(captures.flatMap((c) => (c.messageId ? [[c.messageId, c] as const] : []))),
    updates: new Map(updates.map((u) => [u.id, u])),
    removals,
  }
}

/**
 * Une page d'un fil, du plus récent au plus ancien, 30 messages.
 *
 * En SQL : select … from tester_message where project_id = $p and tester_id = $t
 *   and (removed_at is null or sender_id = $lecteur) [and (created_at, id) < ($date, $id)]
 *   order by created_at desc, id desc limit 31.
 * L'index tester_message_thread_created_idx (project_id, tester_id, created_at desc, id desc) range
 * déjà les messages dans l'ordre de la page : PostgreSQL part du curseur et s'arrête au 31e, sans
 * tri. Un message de plus que la page : s'il existe, il y a une suite. Le curseur est un
 * paramètre lié (cursor.ts).
 */
export const loadMessagePage = async (
  db: Reader,
  args: {
    projectId: string
    testerId: string
    viewerId: string
    viewerIsAuthor: boolean
    cursor: CursorContent | null
    publicApiUrl: string
  },
): Promise<TesterMessagePage> => {
  const rows = await db
    .select()
    .from(m)
    .where(
      and(
        eq(m.projectId, args.projectId),
        eq(m.testerId, args.testerId),
        or(isNull(m.removedAt), eq(m.senderId, args.viewerId)),
        args.cursor ? after(args.cursor, m.createdAt, m.id) : undefined,
      ),
    )
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(MESSAGES_PAGE_SIZE + 1)
  const page = rows.slice(0, MESSAGES_PAGE_SIZE)
  const parts = await loadMessageParts(db, page, args.viewerId)
  const last = page.at(-1)
  return {
    items: page.map((row) =>
      toTesterMessage(row, {
        viewerId: args.viewerId,
        viewerIsAuthor: args.viewerIsAuthor,
        capture: parts.captures.get(row.id),
        updates: parts.updates,
        removals: parts.removals,
        publicApiUrl: args.publicApiUrl,
      }),
    ),
    nextCursor:
      rows.length > MESSAGES_PAGE_SIZE && last
        ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
        : null,
  }
}

/** `date` est après `since` (une date nulle : jamais lu, donc après). */
const isAfter = (date: Date, since: Date | null) => since === null || date > since

// ─── Qui est testeur « actuel » ──────────────────────────────────────────────────────────────────

/**
 * Parmi ces membres, les testeurs actuels du projet (inscrits, sans blocage avec l'auteur) et leur
 * date d'inscription, et ceux que le blocage sépare de l'auteur. Deux requêtes :
 * - `project_tester where project_id = $p and member_id in (…)` : la clé primaire (member_id,
 *   project_id) ;
 * - `member_block` dans les deux sens : la clé primaire (blocker_id, blocked_id) pour « l'auteur a
 *   bloqué », `member_block_blocked_idx` pour « il a bloqué l'auteur ».
 */
export const currentTestersOf = async (
  db: Reader,
  projectId: string,
  authorId: string,
  testerIds: string[],
): Promise<{ since: Map<string, Date>; blocked: Set<string> }> => {
  const b = schema.memberBlock
  const [inscriptions, blocks] = await Promise.all([
    db
      .select({
        memberId: schema.projectTester.memberId,
        createdAt: schema.projectTester.createdAt,
      })
      .from(schema.projectTester)
      .where(
        and(
          eq(schema.projectTester.projectId, projectId),
          inArray(schema.projectTester.memberId, testerIds),
        ),
      ),
    db
      .select({ blockerId: b.blockerId, blockedId: b.blockedId })
      .from(b)
      .where(
        or(
          and(eq(b.blockerId, authorId), inArray(b.blockedId, testerIds)),
          and(eq(b.blockedId, authorId), inArray(b.blockerId, testerIds)),
        ),
      ),
  ])
  const blocked = new Set(
    blocks.map((row) => (row.blockerId === authorId ? row.blockedId : row.blockerId)),
  )
  return {
    since: new Map(
      inscriptions
        .filter((row) => !blocked.has(row.memberId))
        .map((row) => [row.memberId, row.createdAt]),
    ),
    blocked,
  }
}

// ─── La liste des fils de l'auteur ───────────────────────────────────────────────────────────────

/**
 * Le curseur de la liste des fils : la date du dernier message et l'identifiant du TESTEUR (un
 * texte de Better Auth, pas un uuid : le curseur commun de cursor.ts ne convient pas). Il ne sert
 * qu'à situer une position dans la liste que l'API recalcule : il est comparé en JavaScript, il
 * n'entre jamais dans une requête SQL.
 */
const ThreadsCursor = z.strictObject({
  at: z.iso.datetime().refine((at) => at >= '2000' && at < '2100', 'date hors bornes'),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
})
type ThreadsCursor = z.infer<typeof ThreadsCursor>

const encodeThreadsCursor = (content: ThreadsCursor) =>
  Buffer.from(JSON.stringify(content), 'utf8').toString('base64url')

/** Le curseur d'une adresse : null sans curseur, 'invalid' s'il ne veut rien dire (400). */
export const readThreadsCursor = (cursor: string | undefined): ThreadsCursor | null | 'invalid' => {
  if (cursor === undefined) return null
  let content: unknown
  try {
    content = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return 'invalid'
  }
  const parsed = ThreadsCursor.safeParse(content)
  return parsed.success ? parsed.data : 'invalid'
}

/**
 * La liste des fils d'un projet, vue par son auteur : un fil par testeur qui a écrit, le dernier
 * message en tête, filtrée « À traiter » ou « Réglés », avec les nombres des deux filtres.
 *
 * Six requêtes au plus, quelle que soit la longueur de la liste :
 * 1. UNE agrégation sur tous les messages visibles du projet, groupés par testeur : le dernier
 *    message (date et identifiant), un retour encore à traiter (`bool_or`), et la date du dernier
 *    message du testeur (pour « non lu »). `group by` : une ligne par testeur ; `bool_or` : vrai
 *    si une ligne au moins remplit la condition ; `filter (where …)` : n'agrège que ces lignes. En
 *    SQL : select tester_id, max(created_at), (array_agg(id order by created_at desc, id desc))[1],
 *    bool_or(kind = 'feedback' and settled_at is null and removed_at is null),
 *    bool_or(kind = 'feedback' and removed_at is null), max(created_at)
 *    filter (where sender_id = tester_id and removed_at is null) from tester_message where
 *    project_id = $p and (removed_at is null or sender_id <> tester_id) group by tester_id.
 *    L'index tester_message_thread_created_idx (project_id, tester_id, …) donne les messages du
 *    projet déjà rangés par testeur. Elle lit tous les messages du projet : les nombres des deux
 *    filtres l'exigent, et un projet en a au plus quelques milliers (30 par jour et par testeur,
 *    200 testeurs au plus) ;
 * 2. les dates de lecture de l'auteur (`tester_thread`, clé primaire (project_id, tester_id)) ;
 * puis, pour les 20 fils de la page seulement : 3. les noms, pseudos et photos (clés primaires),
 * 4 et 5. les inscriptions et les blocages (currentTestersOf), 6. le dernier message de chaque
 * fil (clé primaire de tester_message).
 *
 * La page se découpe en JavaScript, sur l'agrégation déjà là (le tri par date puis par identifiant
 * du testeur ; le curseur est un repère dans cette liste, jamais un paramètre SQL).
 */
export const loadThreadPage = async (
  db: Reader,
  args: {
    projectId: string
    authorId: string
    state: TesterThreadState
    cursor: ThreadsCursor | null
    publicApiUrl: string
  },
): Promise<TesterThreadPage> => {
  const [groups, threadRows] = await Promise.all([
    db
      .select({
        testerId: m.testerId,
        lastAt: sql<Date>`max(${m.createdAt})`.mapWith(m.createdAt),
        lastId: sql<string>`(array_agg(${m.id} order by ${m.createdAt} desc, ${m.id} desc))[1]`,
        open: sql<boolean>`coalesce(bool_or(${m.kind} = 'feedback' and ${m.settledAt} is null and ${m.removedAt} is null), false)`,
        // Au moins un retour, retiré ou non : un fil sans retour (des réponses seules) n'est jamais
        // « Réglé », il reste « À traiter » (le testeur attend une réponse).
        hasFeedback: sql<boolean>`coalesce(bool_or(${m.kind} = 'feedback' and ${m.removedAt} is null), false)`,
        lastTesterAt:
          sql<Date | null>`max(${m.createdAt}) filter (where ${m.senderId} = ${m.testerId} and ${m.removedAt} is null)`.mapWith(
            m.createdAt,
          ),
      })
      .from(m)
      .where(
        and(eq(m.projectId, args.projectId), or(isNull(m.removedAt), ne(m.senderId, m.testerId))),
      )
      .groupBy(m.testerId),
    db
      .select({
        testerId: schema.testerThread.testerId,
        authorReadAt: schema.testerThread.authorReadAt,
      })
      .from(schema.testerThread)
      .where(eq(schema.testerThread.projectId, args.projectId)),
  ])
  const readAt = new Map(threadRows.map((row) => [row.testerId, row.authorReadAt]))
  const all = groups.map((group) => ({
    ...group,
    // « Réglés » : des retours, et plus aucun à traiter. Tout le reste est « À traiter ».
    state: group.hasFeedback && !group.open ? ('settled' as const) : ('open' as const),
    // Non lu : un message du testeur plus récent que la dernière lecture de l'auteur (jamais lu :
    // tout message du testeur l'est).
    unread:
      group.lastTesterAt !== null &&
      isAfter(group.lastTesterAt, readAt.get(group.testerId) ?? null),
  }))
  const counts = {
    open: all.filter((group) => group.state === 'open').length,
    settled: all.filter((group) => group.state === 'settled').length,
  }

  // Le plus récent d'abord, puis l'identifiant du testeur (l'ordre des listes, cursor.ts).
  const ordered = all
    .filter((group) => group.state === args.state)
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime() || (a.testerId < b.testerId ? 1 : -1))
  const cursor = args.cursor
  const remaining = cursor
    ? ordered.filter((group) => {
        const at = group.lastAt.toISOString()
        return at < cursor.at || (at === cursor.at && group.testerId < cursor.id)
      })
    : ordered
  const page = remaining.slice(0, THREADS_PAGE_SIZE)
  const lastOfPage = page.at(-1)

  const testerIds = page.map((group) => group.testerId)
  const h = schema.memberHandle
  const [people, current, lastMessages] = await Promise.all([
    testerIds.length === 0
      ? []
      : db
          .select({
            id: schema.user.id,
            name: schema.user.name,
            handle: h.handle,
            avatarKey: schema.profile.avatarKey,
          })
          .from(schema.user)
          .leftJoin(h, and(eq(h.userId, schema.user.id), isNull(h.releasedAt)))
          .leftJoin(schema.profile, eq(schema.profile.userId, schema.user.id))
          .where(inArray(schema.user.id, testerIds)),
    testerIds.length === 0
      ? { since: new Map<string, Date>(), blocked: new Set<string>() }
      : currentTestersOf(db, args.projectId, args.authorId, testerIds),
    testerIds.length === 0
      ? []
      : db
          .select({ id: m.id, text: m.text, senderId: m.senderId })
          .from(m)
          .where(
            inArray(
              m.id,
              page.map((group) => group.lastId),
            ),
          ),
  ])
  const personOf = new Map(people.map((person) => [person.id, person]))
  const lastOf = new Map(lastMessages.map((message) => [message.id, message]))

  return {
    items: page.flatMap((group) => {
      const person = personOf.get(group.testerId)
      const last = lastOf.get(group.lastId)
      if (!person || !last) return []
      const since = current.since.get(group.testerId)
      // Un blocage garde le nom, mais ni le pseudo ni la photo (règle de 7b, sécurité A11).
      const hidden = current.blocked.has(group.testerId)
      return [
        {
          tester: {
            id: person.id,
            name: person.name,
            handle: hidden ? null : person.handle,
            avatarUrl:
              hidden || !person.avatarKey ? null : mediaUrl(args.publicApiUrl, person.avatarKey),
            current: since !== undefined,
            since: since ? since.toISOString() : null,
          },
          lastAt: group.lastAt.toISOString(),
          lastFrom: last.senderId === group.testerId ? ('tester' as const) : ('author' as const),
          unread: group.unread,
          state: group.state,
          excerpt: excerptOf(last.text),
        },
      ]
    }),
    nextCursor:
      remaining.length > THREADS_PAGE_SIZE && lastOfPage
        ? encodeThreadsCursor({ at: lastOfPage.lastAt.toISOString(), id: lastOfPage.testerId })
        : null,
    counts,
  }
}

// ─── Les retours à traiter ───────────────────────────────────────────────────────────────────────

/**
 * Les retours encore à traiter d'un projet (la partie « Retours réglés » de la feuille de mise à
 * jour) : 50 au plus, le plus récent en tête. Trois requêtes :
 * 1. select … from tester_message join "user" where project_id = $p and kind = 'feedback' and
 *    settled_at is null and removed_at is null order by created_at desc, id desc limit 50 : l'index
 *    partiel tester_message_open_feedback_idx (project_id, seulement les retours ouverts) donne
 *    ces lignes sans lire les réponses ni les retours réglés ; le tri se fait sur elles seules ;
 * 2 et 3. les testeurs actuels et les blocages (currentTestersOf).
 */
export const loadOpenFeedback = async (
  db: Reader,
  projectId: string,
  authorId: string,
): Promise<OpenFeedback[]> => {
  const rows = await db
    .select({
      id: m.id,
      testerId: m.testerId,
      outcome: m.outcome,
      text: m.text,
      createdAt: m.createdAt,
      name: schema.user.name,
    })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.testerId))
    .where(
      and(
        eq(m.projectId, projectId),
        eq(m.kind, 'feedback'),
        isNull(m.settledAt),
        isNull(m.removedAt),
      ),
    )
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(OPEN_FEEDBACK_MAX)
  const current = await currentTestersOf(db, projectId, authorId, [
    ...new Set(rows.map((row) => row.testerId)),
  ])
  return rows.flatMap((row) =>
    row.outcome === 'yes' || row.outcome === 'partly' || row.outcome === 'no'
      ? [
          {
            id: row.id,
            tester: { name: row.name, current: current.since.has(row.testerId) },
            outcome: row.outcome,
            excerpt: excerptOf(row.text),
            createdAt: row.createdAt.toISOString(),
          },
        ]
      : [],
  )
}
