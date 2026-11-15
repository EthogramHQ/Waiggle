// « Mes retours envoyés » (R11) : la lecture de la page des messages qu'un membre a écrits comme
// TESTEUR, dans le coin de n'importe quel projet, coin fermé compris. Les routes
// (routes/me-tester-messages.ts) vérifient la session ; ici, on ne fait que lire, en un nombre fixe
// de requêtes (cinq au plus), quelle que soit la page.
//
// Deux règles font la sécurité de cette liste :
// - elle ne lit que les messages DONT LE MEMBRE EST L'EXPÉDITEUR ET LE TESTEUR du fil : jamais une
//   réponse de l'auteur du projet, jamais un message qu'il a écrit chez lui comme auteur ;
// - le projet n'en sort que s'il le voit encore (`projectVisibleTo` : privé, retiré, réservé à une
//   ruche quittée ou blocage = `project: null`) ; sinon ni titre, ni couverture, ni nom d'auteur.
import {
  MY_DATA_PAGE_SIZE,
  type MyTesterMessage,
  type MyTesterMessagesPage,
  type TesterMedia,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { coversOf } from '../comments/load'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { visibleMedia } from '../projects/media-visibility'
import { projectVisibleTo } from '../projects/visibility'
import { activeAt } from '../suspension/load'
import { toTesterMedia } from './media'

type Reader = Pick<Database, 'select'>

const m = schema.testerMessage

/**
 * La page des messages de testeur de ce membre, du plus récent au plus ancien, `MY_DATA_PAGE_SIZE`
 * par page. Cinq requêtes au plus :
 * 1. ses messages. En SQL :
 *   select m.* from tester_thread t join tester_message m on m.project_id = t.project_id
 *     and m.tester_id = t.tester_id where t.tester_id = $membre and m.sender_id = $membre
 *     [and (m.created_at, m.id) < ($date, $id)] order by m.created_at desc, m.id desc limit 31
 *   `tester_message` n'a pas d'index par expéditeur : on passe donc par ses fils. L'index
 *   tester_thread_tester_idx (tester_id) donne les fils où il est testeur (un par projet testé),
 *   puis tester_message_thread_created_idx (project_id, tester_id, …) donne les messages de chaque
 *   fil ; PostgreSQL trie ensuite ce petit ensemble (30 messages par jour au plus). `sender_id = $membre`
 *   écarte les réponses de l'auteur. La 31e ligne dit seulement qu'il y a une suite ;
 * 2. les projets de la page qu'il voit, avec le nom de leur auteur (clé primaire du projet, puis
 *   de "user") ;
 * 3. ses inscriptions comme testeur à ces projets (clé primaire (member_id, project_id) de
 *   project_tester) et 4. les suspensions en cours de leurs auteurs (index partiel
 *   account_suspension_open_idx) : de quoi dire si le coin est fermé ;
 * 5. leurs couvertures (`coversOf`) et les captures des messages (index tester_media_message_idx).
 *
 * `closed` : le coin ne lui est plus ouvert, comme dit `cornerAccess` (testers/access.ts) : projet
 * qu'il ne voit plus (donc aussi blocage ou projet retiré), inscription disparue (départ, retrait
 * par l'auteur), ou auteur suspendu.
 */
export const myTesterMessagesPage = async (
  db: Reader,
  viewerId: string,
  cursor: CursorContent | null,
  publicApiUrl: string,
  now: Date = new Date(),
): Promise<MyTesterMessagesPage> => {
  const t = schema.testerThread
  const rows = await db
    .select({ message: m })
    .from(t)
    .innerJoin(m, and(eq(m.projectId, t.projectId), eq(m.testerId, t.testerId)))
    .where(
      and(
        eq(t.testerId, viewerId),
        eq(m.senderId, viewerId),
        cursor ? after(cursor, m.createdAt, m.id) : undefined,
      ),
    )
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(MY_DATA_PAGE_SIZE + 1)
  const page = rows.slice(0, MY_DATA_PAGE_SIZE).map((row) => row.message)

  // 2. Les projets de la page que ce membre voit.
  const projectIds = [...new Set(page.map((row) => row.projectId))]
  const projects = new Map(
    projectIds.length === 0
      ? []
      : (
          await db
            .select({
              id: schema.project.id,
              title: schema.project.title,
              authorId: schema.project.authorId,
              authorName: schema.user.name,
            })
            .from(schema.project)
            .innerJoin(schema.user, eq(schema.user.id, schema.project.authorId))
            .where(and(inArray(schema.project.id, projectIds), projectVisibleTo(viewerId)))
        ).map((project) => [project.id, project]),
  )

  // 3 et 4. Son inscription, et la suspension des auteurs : seulement pour les projets visibles.
  const visibleIds = [...projects.keys()]
  const authorIds = [...new Set([...projects.values()].map((project) => project.authorId))]
  const [inscriptions, suspensions] = await Promise.all([
    visibleIds.length === 0
      ? []
      : db
          .select({ projectId: schema.projectTester.projectId })
          .from(schema.projectTester)
          .where(
            and(
              eq(schema.projectTester.memberId, viewerId),
              inArray(schema.projectTester.projectId, visibleIds),
            ),
          ),
    authorIds.length === 0
      ? []
      : db
          .select({ userId: schema.accountSuspension.userId })
          .from(schema.accountSuspension)
          .where(and(inArray(schema.accountSuspension.userId, authorIds), activeAt(now))),
  ])
  const enrolled = new Set(inscriptions.map((row) => row.projectId))
  const suspended = new Set(suspensions.map((row) => row.userId))

  // 5. Les couvertures, et les captures (sans celles que la modération a retirées seules : « à
  // tous », pas même pour leur expéditeur ; la ligne reste dans son export).
  const [covers, captureRows] = await Promise.all([
    coversOf(db, visibleIds, publicApiUrl),
    page.length === 0
      ? []
      : db
          .select()
          .from(schema.testerMedia)
          .where(
            and(
              inArray(
                schema.testerMedia.messageId,
                page.map((row) => row.id),
              ),
              visibleMedia(schema.testerMedia.removalId, null),
            ),
          ),
  ])
  const captures = new Map<string, TesterMedia>()
  for (const row of captureRows) {
    if (row.messageId) captures.set(row.messageId, toTesterMedia(row, publicApiUrl))
  }

  const items = page.map((row): MyTesterMessage => {
    const project = projects.get(row.projectId)
    return {
      id: row.id,
      projectId: row.projectId,
      project: project
        ? {
            id: project.id,
            title: project.title,
            cover: covers.get(project.id) ?? null,
            author: { name: project.authorName },
          }
        : null,
      closed: !project || !enrolled.has(project.id) || suspended.has(project.authorId),
      kind: row.kind === 'feedback' ? 'feedback' : 'reply',
      text: row.text,
      outcome:
        row.outcome === 'yes' || row.outcome === 'partly' || row.outcome === 'no'
          ? row.outcome
          : null,
      device:
        row.device === 'phone' || row.device === 'computer' || row.device === 'tablet'
          ? row.device
          : null,
      createdAt: row.createdAt.toISOString(),
      media: captures.get(row.id) ?? null,
      removed: row.removedAt !== null,
    }
  })
  const last = page.at(-1)
  return {
    items,
    nextCursor:
      rows.length > MY_DATA_PAGE_SIZE && last
        ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id })
        : null,
  }
}
