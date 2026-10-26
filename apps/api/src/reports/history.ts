// L'historique des décisions de modération (tranche 7c), lu par les seuls administrateurs
// (GET /v1/moderation/decisions, onglet « Historique ») : qui a décidé quoi, quand, sur quelle
// cible, pour quel membre et pourquoi. Jamais qui a signalé : content_report n'est même pas lu ici.
import {
  type DecisionHistoryItem,
  type DecisionHistoryPage,
  LiftCause,
  MODERATION_PAGE_SIZE,
  ModerationAction,
  RemovalGround,
  ReportTarget,
  SuspensionDuration,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { after, type CursorContent, encodeCursor } from '../cursor'
import { targetUuid } from './target'

const d = schema.moderationDecision

/**
 * Une page de l'historique, de la décision la plus récente à la plus ancienne, 20 par 20 ;
 * `memberId` ne garde que les décisions qui visent ce membre (ses contenus, son profil, son
 * compte). Une seule requête, quelle que soit la page :
 * - les décisions, lues dans l'ordre de l'index moderation_decision_created_idx (created_at desc,
 *   id desc), ou de moderation_decision_member_idx (target_member_id, created_at desc, id desc)
 *   avec le filtre : PostgreSQL part du curseur et s'arrête à la 21e ligne ;
 * - l'administrateur et le membre visé, avec leur pseudo actuel : la table "user" et la table des
 *   pseudos, chacune deux fois sous deux noms (« alias »), par leurs clés ; un compte parti ne
 *   trouve rien (null) ;
 * - le projet de la cible, pour le lien, par la clé primaire de sa table (targetUuid) : une cible
 *   supprimée depuis ne trouve rien, et sa ligne reste, sans lien.
 */
export const loadDecisionHistory = async (
  db: Database,
  cursor: CursorContent | null,
  memberId: string | null,
): Promise<DecisionHistoryPage> => {
  const admin = alias(schema.user, 'admin_user')
  const adminHandle = alias(schema.memberHandle, 'admin_handle')
  const member = alias(schema.user, 'member_user')
  const memberHandle = alias(schema.memberHandle, 'member_handle')
  const p = schema.project
  const n = schema.projectNote
  const c = schema.projectComment
  const id = targetUuid('moderation_decision')

  const conditions: (SQL | undefined)[] = []
  // Le membre et le curseur viennent de l'adresse : ils n'entrent que par des paramètres liés.
  if (memberId !== null) conditions.push(eq(d.targetMemberId, memberId))
  if (cursor) conditions.push(after(cursor, d.createdAt, d.id))

  const rows = await db
    .select({
      id: d.id,
      action: d.action,
      at: d.createdAt,
      targetKind: d.targetKind,
      targetId: d.targetId,
      ground: d.ground,
      explanation: d.explanation,
      duration: d.duration,
      liftCause: d.liftCause,
      afterReport: d.afterReport,
      adminId: admin.id,
      adminName: admin.name,
      adminHandle: adminHandle.handle,
      memberId: member.id,
      memberName: member.name,
      memberHandle: memberHandle.handle,
      projectId: p.id,
      noteProjectId: n.projectId,
      commentProjectId: c.projectId,
    })
    .from(d)
    .leftJoin(admin, eq(admin.id, d.adminId))
    // Le pseudo actuel (released_at null) : la condition de l'index member_handle_current_idx.
    .leftJoin(adminHandle, and(eq(adminHandle.userId, d.adminId), isNull(adminHandle.releasedAt)))
    .leftJoin(member, eq(member.id, d.targetMemberId))
    .leftJoin(
      memberHandle,
      and(eq(memberHandle.userId, d.targetMemberId), isNull(memberHandle.releasedAt)),
    )
    .leftJoin(p, and(eq(d.targetKind, 'project'), sql`${p.id} = ${id}`))
    .leftJoin(n, and(eq(d.targetKind, 'note'), sql`${n.id} = ${id}`))
    // Un commentaire supprimé alors qu'il avait des réponses (deleted_at) n'a plus de texte : pas
    // de lien vers lui.
    .leftJoin(c, and(eq(d.targetKind, 'comment'), sql`${c.id} = ${id}`, isNull(c.deletedAt)))
    .where(and(...conditions))
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(MODERATION_PAGE_SIZE + 1)

  const page = rows.slice(0, MODERATION_PAGE_SIZE)
  const last = page.at(-1)
  const nextCursor =
    rows.length > MODERATION_PAGE_SIZE && last
      ? encodeCursor({ at: last.at.toISOString(), id: last.id })
      : null

  // Chaque ligne est vérifiée par les schémas du contrat (`safeParse`, qui ne lève pas d'erreur) :
  // une ligne mal formée en base (posée à la main) est laissée de côté, avec un avertissement
  // sans donnée personnelle, au lieu de faire tomber tout l'historique.
  const items = page.flatMap((row): DecisionHistoryItem[] => {
    const action = ModerationAction.safeParse(row.action)
    const target = ReportTarget.safeParse({ kind: row.targetKind, id: row.targetId })
    const ground = RemovalGround.nullable().safeParse(row.ground)
    const duration = SuspensionDuration.nullable().safeParse(row.duration)
    const liftCause = LiftCause.nullable().safeParse(row.liftCause)
    if (
      !action.success ||
      !target.success ||
      !ground.success ||
      !duration.success ||
      !liftCause.success
    ) {
      console.warn(`Moderation history: invalid decision row ${row.id} left out`)
      return []
    }
    return [
      {
        id: row.id,
        action: action.data,
        at: row.at.toISOString(),
        admin:
          row.adminId !== null && row.adminName !== null
            ? { id: row.adminId, name: row.adminName, handle: row.adminHandle }
            : null,
        target: target.data,
        projectId: row.projectId ?? row.noteProjectId ?? row.commentProjectId ?? null,
        member:
          row.memberId !== null && row.memberName !== null
            ? { id: row.memberId, name: row.memberName, handle: row.memberHandle }
            : null,
        ground: ground.data,
        explanation: row.explanation,
        duration: duration.data,
        liftCause: liftCause.data,
        afterReport: row.afterReport,
      },
    ]
  })
  return { items, nextCursor }
}
