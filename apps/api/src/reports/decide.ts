// Une décision de modération (tranche 7a) : retirer un contenu, classer ses signalements sans
// suite, ou rétablir un contenu retiré. Règles 11 et 12 de la relecture du plan :
// - un administrateur ne décide jamais de ce qui le concerne (son contenu, son profil) ;
// - deux décisions en même temps sur la même cible : la seconde trouve la première déjà prise.
//
// Le retrait est noté sur le contenu lui-même (removed_at et removal_id) : ce sont les lectures
// (projects/visibility.ts et les fichiers qui s'en servent) qui l'excluent pour les autres.
import type { ModerationDecision, ModerationDecisionInput, ReportTarget } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { loadDecidable } from './target'

export type DecideResult =
  | { ok: true; decision: ModerationDecision }
  | { ok: false; error: 'not_found' | 'own_content' | 'profile' | 'already_decided' }

/** Levée dans la transaction pour l'annuler : la décision est déjà prise (règle 12). */
class AlreadyDecided extends Error {}

/** Le transaction en cours (Drizzle) : elle sait tout ce que sait la base. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Pose ou retire la marque de retrait sur le contenu visé, seulement s'il est dans l'état attendu
 * (pas encore retiré pour un retrait, retiré pour un rétablissement). « returning » rend les lignes
 * modifiées : aucune, et une autre décision est passée avant (ou entre-temps). Chaque mise à jour
 * passe par la clé primaire de sa table.
 */
const mark = async (tx: Tx, target: ReportTarget, removal: { at: Date; id: string } | null) => {
  const set = removal
    ? { removedAt: removal.at, removalId: removal.id }
    : { removedAt: null, removalId: null }
  switch (target.kind) {
    case 'project': {
      const t = schema.project
      const state = removal ? isNull(t.removedAt) : isNotNull(t.removedAt)
      return (
        await tx
          .update(t)
          .set(set)
          .where(and(eq(t.id, target.id), state))
          .returning({ id: t.id })
      ).length
    }
    case 'note': {
      const t = schema.projectNote
      const state = removal ? isNull(t.removedAt) : isNotNull(t.removedAt)
      return (
        await tx
          .update(t)
          .set(set)
          .where(and(eq(t.id, target.id), state))
          .returning({ id: t.id })
      ).length
    }
    case 'comment': {
      const t = schema.projectComment
      const state = removal ? isNull(t.removedAt) : isNotNull(t.removedAt)
      return (
        await tx
          .update(t)
          .set(set)
          .where(and(eq(t.id, target.id), state))
          .returning({ id: t.id })
      ).length
    }
    case 'member':
      // Un profil ne se retire pas (vérifié plus haut) : rien à marquer.
      return 0
  }
}

/**
 * Prend la décision de l'administrateur `adminId`, à l'heure `now`. Tout se passe dans une
 * transaction : un groupe d'écritures qui réussissent toutes ensemble ou pas du tout. Si l'une
 * échoue (la décision était déjà prise), la décision enregistrée au début est annulée avec elle.
 */
export const decide = async (
  db: Database,
  adminId: string,
  input: ModerationDecisionInput,
  now: Date,
): Promise<DecideResult> => {
  const { target } = input
  // Un profil n'accepte que « classer » (il n'y a rien à retirer : une photo ou un pseudo illicite
  // se traite par script, docs/ops/moderation.md).
  if (target.kind === 'member' && input.action !== 'dismiss') return { ok: false, error: 'profile' }

  // La cible, visible ou non : elle doit exister, et ne pas concerner l'administrateur (règle 11).
  const found = await loadDecidable(db, target)
  if (!found) return { ok: false, error: 'not_found' }
  if (found.authorId === adminId) return { ok: false, error: 'own_content' }

  const decision = { id: crypto.randomUUID(), action: input.action, createdAt: now }
  const r = schema.contentReport
  const openOfTarget = and(
    eq(r.targetKind, target.kind),
    eq(r.targetId, target.id),
    eq(r.status, 'open'),
  )
  try {
    await db.transaction(async (tx) => {
      // La décision d'abord : le contenu retiré la cite (removal_id, clé étrangère).
      await tx.insert(schema.moderationDecision).values({
        ...decision,
        targetKind: target.kind,
        targetId: target.id,
        ground: input.action === 'remove' ? input.ground : null,
        explanation: input.action === 'remove' ? input.explanation : null,
        adminId,
      })
      if (input.action === 'remove' || input.action === 'restore') {
        const removal = input.action === 'remove' ? { at: now, id: decision.id } : null
        if ((await mark(tx, target, removal)) === 0) throw new AlreadyDecided()
      }
      if (input.action === 'restore') return
      // Retirer ou classer clôt tous les signalements ouverts de la cible (index
      // content_report_target_idx). Classer sans signalement ouvert : déjà décidé.
      const closed = await tx
        .update(r)
        .set({
          status: input.action === 'remove' ? 'removed' : 'dismissed',
          decidedAt: now,
          decisionId: decision.id,
        })
        .where(openOfTarget)
        .returning({ id: r.id })
      if (input.action === 'dismiss' && closed.length === 0) throw new AlreadyDecided()
    })
  } catch (error) {
    if (error instanceof AlreadyDecided) return { ok: false, error: 'already_decided' }
    throw error
  }
  return {
    ok: true,
    decision: { id: decision.id, action: decision.action, createdAt: now.toISOString() },
  }
}
