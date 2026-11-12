// Le coin des testeurs dans l'export des données d'un membre (R7b) : ses appels, ses messages, les
// membres qu'il a retirés de ses testeurs et jusqu'où il a lu chacun de ses fils. Chaque lecture
// part de ce que le membre a lui-même écrit ou fait : jamais un message de l'autre personne du fil,
// jamais la date de lecture de l'autre (pas d'accusé de lecture). Toutes les listes vont des plus
// anciens aux plus récents, et leur nombre de requêtes est fixe, quelle que soit leur longueur.
import type {
  TesterCallExport,
  TesterMessageExport,
  TesterRemovalExport,
  TesterThreadReadExport,
} from '@ruche/contracts'
import { FeedbackDevice, FeedbackOutcome, TesterMessageKind } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { blockedWith } from '../blocks/visibility'
import { currentHandleOf } from '../handles/load'
import { mediaUrl } from '../profile/me'
import { listedProjectFor } from '../projects/visibility'
import { removalsOf } from '../removals/load'

type Reader = Pick<Database, 'select'>

/**
 * Tout le coin d'un membre, en un nombre fixe de requêtes (une par liste, plus les images et les
 * retraits des appels et des messages, regroupés).
 */
export const testerCornerExport = async (
  db: Reader,
  memberId: string,
  publicApiUrl: string,
): Promise<{
  testerCalls: TesterCallExport[]
  testerMessages: TesterMessageExport[]
  testerRemovals: TesterRemovalExport[]
  testerThreadReads: TesterThreadReadExport[]
}> => {
  const call = schema.testerCall
  const msg = schema.testerMessage
  const thread = schema.testerThread

  // Ses appels : ceux de ses projets (seul l'auteur en lance). La condition `project.author_id`
  // suit l'index project_author_created_idx, puis l'index tester_call_project_created_idx donne les
  // appels de chaque projet ; le tri final se fait sur ce petit lot. Son titre reste rempli même si
  // le projet est devenu privé : c'est le sien.
  const callRows = await db
    .select({
      projectId: call.projectId,
      title: schema.project.title,
      id: call.id,
      text: call.text,
      createdAt: call.createdAt,
      removedAt: call.removedAt,
      removalId: call.removalId,
    })
    .from(call)
    .innerJoin(schema.project, eq(schema.project.id, call.projectId))
    .where(eq(schema.project.authorId, memberId))
    .orderBy(asc(call.createdAt), asc(call.id))

  // Ses messages, en deux lectures pour que chacune ait son index (la clé de `tester_message` est
  // (project_id, tester_id, …), sans index sur `sender_id`) :
  // - comme testeur : ses fils (tester_thread_tester_idx), puis leurs messages qu'il a écrits ;
  // - comme auteur : les fils de ses projets (project_author_created_idx, puis la clé de
  //   tester_thread), puis les réponses qu'il y a écrites.
  // `visible` dit si le projet lui est encore visible : sinon le titre est null, comme `testerOf`
  // (le titre actuel appartient à l'autre). Pour l'auteur, le titre est toujours le sien.
  const messageColumns = {
    projectId: msg.projectId,
    title: schema.project.title,
    authorId: schema.project.authorId,
    visible: sql<boolean>`(${listedProjectFor(memberId)}) is true`,
    id: msg.id,
    kind: msg.kind,
    outcome: msg.outcome,
    device: msg.device,
    text: msg.text,
    createdAt: msg.createdAt,
    settledAt: msg.settledAt,
    removedAt: msg.removedAt,
    removalId: msg.removalId,
  }
  const asTester = await db
    .select(messageColumns)
    .from(thread)
    .innerJoin(schema.project, eq(schema.project.id, thread.projectId))
    .innerJoin(msg, and(eq(msg.projectId, thread.projectId), eq(msg.testerId, thread.testerId)))
    .where(and(eq(thread.testerId, memberId), eq(msg.senderId, memberId)))
  const asAuthor = await db
    .select(messageColumns)
    .from(schema.project)
    .innerJoin(thread, eq(thread.projectId, schema.project.id))
    .innerJoin(msg, and(eq(msg.projectId, thread.projectId), eq(msg.testerId, thread.testerId)))
    .where(and(eq(schema.project.authorId, memberId), eq(msg.senderId, memberId)))
  const messageRows = [...asTester, ...asAuthor].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )

  // Les images (adresses, pas fichiers) et les retraits de tous ces appels et messages : une
  // requête chacun. `or` de deux `in` : tester_media_call_idx et tester_media_message_idx.
  const callIds = callRows.map((row) => row.id)
  const messageIds = messageRows.map((row) => row.id)
  const images =
    callIds.length + messageIds.length === 0
      ? []
      : await db
          .select({
            callId: schema.testerMedia.callId,
            messageId: schema.testerMedia.messageId,
            storageKey: schema.testerMedia.storageKey,
            description: schema.testerMedia.description,
          })
          .from(schema.testerMedia)
          .where(
            or(
              inArray(schema.testerMedia.callId, callIds),
              inArray(schema.testerMedia.messageId, messageIds),
            ),
          )
  const imageOf = new Map<string, { url: string; description: string | null }>()
  for (const image of images) {
    const owner = image.callId ?? image.messageId
    if (owner !== null)
      imageOf.set(owner, {
        url: mediaUrl(publicApiUrl, image.storageKey),
        description: image.description,
      })
  }
  const removals = await removalsOf(db, [
    ...callRows.map((row) => (row.removedAt === null ? null : row.removalId)),
    ...messageRows.map((row) => (row.removedAt === null ? null : row.removalId)),
  ])

  const testerCalls = callRows.map((row) => ({
    projectId: row.projectId,
    title: row.title,
    id: row.id,
    text: row.text,
    photoUrl: imageOf.get(row.id)?.url ?? null,
    photoDescription: imageOf.get(row.id)?.description ?? null,
    createdAt: row.createdAt.toISOString(),
    removal: row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null),
  }))
  const testerMessages = messageRows.map((row) => {
    const mine = row.authorId === memberId
    return {
      projectId: row.projectId,
      title: mine || row.visible ? row.title : null,
      id: row.id,
      role: mine ? ('author' as const) : ('tester' as const),
      kind: TesterMessageKind.parse(row.kind),
      outcome: row.outcome === null ? null : FeedbackOutcome.parse(row.outcome),
      device: row.device === null ? null : FeedbackDevice.parse(row.device),
      text: row.text,
      captureUrl: imageOf.get(row.id)?.url ?? null,
      createdAt: row.createdAt.toISOString(),
      settledAt: row.settledAt?.toISOString() ?? null,
      removal: row.removedAt === null ? null : (removals.get(row.removalId ?? '') ?? null),
    }
  })

  // Les membres qu'il a retirés : l'identifiant (le retrait est son geste), le pseudo actuel et la
  // date. Sous blocage, le pseudo ne sort plus (relecture de sécurité R7b, B2) : si le retiré a
  // bloqué l'auteur depuis son retrait, ou l'inverse, sa page répond 404 ; l'export ne donne pas par
  // la fenêtre ce que la porte refuse. L'identifiant et la date restent, sans quoi la ligne
  // deviendrait anonyme. `blockedWith` : deux `exists`, par la clé primaire de member_block et par
  // member_block_blocked_idx, une fois par ligne. La clé de project_tester_removal est
  // (project_id, member_id) : les retraits de ses projets viennent de project_author_created_idx
  // puis de cette clé.
  const removalRows = await db
    .select({
      projectId: schema.projectTesterRemoval.projectId,
      title: schema.project.title,
      memberId: schema.projectTesterRemoval.memberId,
      handle: schema.memberHandle.handle,
      blocked: sql<boolean>`${blockedWith(memberId, schema.projectTesterRemoval.memberId)}`,
      at: schema.projectTesterRemoval.createdAt,
    })
    .from(schema.projectTesterRemoval)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectTesterRemoval.projectId))
    .leftJoin(schema.memberHandle, currentHandleOf(schema.projectTesterRemoval.memberId))
    .where(eq(schema.project.authorId, memberId))
    .orderBy(asc(schema.projectTesterRemoval.createdAt), asc(schema.projectTesterRemoval.memberId))
  const testerRemovals = removalRows.map((row) => ({
    projectId: row.projectId,
    title: row.title,
    memberId: row.memberId,
    handle: row.blocked ? null : row.handle,
    at: row.at.toISOString(),
  }))

  // Jusqu'où il a lu chacun de ses fils : sa propre date seulement (`author_read_at` pour les fils
  // de ses projets, `tester_read_at` pour ses fils de testeur), jamais celle de l'autre. Un fil
  // jamais lu (date nulle) n'a rien à exporter.
  const authorReads = await db
    .select({ projectId: thread.projectId, testerId: thread.testerId, readAt: thread.authorReadAt })
    .from(schema.project)
    .innerJoin(thread, eq(thread.projectId, schema.project.id))
    .where(and(eq(schema.project.authorId, memberId), isNotNull(thread.authorReadAt)))
  const testerReads = await db
    .select({ projectId: thread.projectId, testerId: thread.testerId, readAt: thread.testerReadAt })
    .from(thread)
    .where(and(eq(thread.testerId, memberId), isNotNull(thread.testerReadAt)))
  const testerThreadReads = [
    ...authorReads.map((row) => ({ ...row, role: 'author' as const })),
    ...testerReads.map((row) => ({ ...row, role: 'tester' as const })),
  ]
    .flatMap((row) => (row.readAt === null ? [] : [{ ...row, readAt: row.readAt }]))
    .sort(
      (a, b) =>
        a.readAt.getTime() - b.readAt.getTime() ||
        a.projectId.localeCompare(b.projectId) ||
        a.testerId.localeCompare(b.testerId),
    )
    .map((row) => ({
      projectId: row.projectId,
      testerId: row.testerId,
      role: row.role,
      readAt: row.readAt.toISOString(),
    }))

  return { testerCalls, testerMessages, testerRemovals, testerThreadReads }
}
