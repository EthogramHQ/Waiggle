// Une décision de modération (tranche 7a) : retirer un contenu, classer ses signalements sans
// suite, ou rétablir un contenu retiré ; et depuis la tranche 7c, suspendre un compte ou lever sa
// suspension. Règles 11 et 12 de la relecture du plan de 7a :
// - un administrateur ne décide jamais de ce qui le concerne (son contenu, son profil, et depuis
//   7b le contenu ou le profil d'un membre qu'il a bloqué) ;
// - deux décisions en même temps sur la même cible : la seconde trouve la première déjà prise.
// Tranche 7c (moderation/guard.ts) : une décision à la fois par administrateur puis par cible,
// tout relu sous ces verrous, et le mot de passe redemandé au-delà de 10 retraits dans l'heure.
//
// Le retrait est noté sur le contenu lui-même (removed_at et removal_id) : ce sont les lectures
// (projects/visibility.ts et les fichiers qui s'en servent) qui l'excluent pour les autres.
import type { ModerationDecision, ModerationDecisionInput, ReportTarget } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import {
  isDecisionConflict,
  lockDecision,
  removalNeedsPassword,
  type Tx,
} from '../moderation/guard'
import { SuspensionChanged, type SuspensionError, suspendOrLift } from '../moderation/suspend'
import { loadDecidable } from './target'

/** Les refus d'une décision ; ceux de la suspension (SuspensionError) en plus, tranche 7c. */
export type DecideError =
  | 'not_found'
  | 'own_content'
  | 'profile'
  | 'already_decided'
  | 'password_required'
  | SuspensionError

export type DecideResult =
  | { ok: true; decision: ModerationDecision }
  | { ok: false; error: DecideError }

/** Levée dans la transaction pour l'annuler : la décision est déjà prise (règle 12). */
class AlreadyDecided extends Error {}

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
 * Ceux de ces membres que l'administrateur a bloqués (dans ce sens-là seulement : règle 17). La
 * file (queue.ts) s'en sert aussi, pour « Te concerne ». Servi par la clé primaire de member_block,
 * qui commence par blocker_id : « blocked_id in (…) » n'y lit que les lignes de cet administrateur.
 */
export const blockedByAdmin = async (
  db: Pick<Database, 'select'>,
  adminId: string,
  memberIds: string[],
): Promise<ReadonlySet<string>> => {
  if (memberIds.length === 0) return new Set()
  const b = schema.memberBlock
  const rows = await db
    .select({ id: b.blockedId })
    .from(b)
    .where(and(eq(b.blockerId, adminId), inArray(b.blockedId, memberIds)))
  return new Set(rows.map((row) => row.id))
}

/**
 * Prend la décision de l'administrateur `adminId`, à l'heure `now`. `passwordConfirmed` : il a
 * retapé son mot de passe, déjà vérifié par la route (moderation/guard.ts, confirmPassword).
 *
 * Tout se passe dans une transaction : un groupe d'écritures qui réussissent toutes ensemble ou pas
 * du tout. Elle prend d'abord les verrous de l'administrateur et de la cible (lockDecision), puis
 * relit tout par `tx`, sous ces verrous (S6) : la cible, le blocage, les signalements ouverts, les
 * retraits de l'heure. Ce qui a été lu ne peut donc plus changer avant l'écriture.
 */
export const decide = async (
  db: Database,
  adminId: string,
  input: ModerationDecisionInput,
  now: Date,
  { passwordConfirmed }: { passwordConfirmed: boolean },
): Promise<DecideResult> => {
  // Suspendre un compte ou lever sa suspension (tranche 7c) : moderation/suspend.ts, avec les mêmes
  // verrous (l'administrateur, puis le membre) et le même mot de passe. Les mêmes conflits aussi :
  // une suspension changée entre-temps, l'index unique partiel (23505) ou un interblocage (40P01)
  // deviennent « déjà décidé ».
  if (input.action === 'suspend' || input.action === 'lift') {
    try {
      return await suspendOrLift(db, adminId, input, now, { passwordConfirmed })
    } catch (error) {
      if (error instanceof SuspensionChanged || isDecisionConflict(error)) {
        return { ok: false, error: 'already_decided' }
      }
      throw error
    }
  }
  const { target } = input
  // Un profil n'accepte que « classer » (il n'y a rien à retirer : une photo ou un pseudo illicite
  // se traite par script, docs/ops/moderation.md).
  if (target.kind === 'member' && input.action !== 'dismiss') return { ok: false, error: 'profile' }

  const r = schema.contentReport
  const openOfTarget = and(
    eq(r.targetKind, target.kind),
    eq(r.targetId, target.id),
    eq(r.status, 'open'),
  )
  try {
    return await db.transaction(async (tx): Promise<DecideResult> => {
      await lockDecision(tx, adminId, target)

      // La cible, visible ou non : elle doit exister, et ne pas concerner l'administrateur (règle
      // 11).
      const found = await loadDecidable(tx, target)
      if (!found) return { ok: false, error: 'not_found' }
      if (found.authorId === adminId) return { ok: false, error: 'own_content' }
      // Règle 17 de 7b (S9, J13) : un administrateur qui a lui-même bloqué l'auteur visé est
      // concerné, comme pour son propre contenu ; un autre administrateur décidera. L'inverse
      // (l'auteur a bloqué l'administrateur) ne compte pas : sinon bloquer l'administrateur ferait
      // échapper à la modération (précision 7).
      const author = found.authorId
      if (author !== null && (await blockedByAdmin(tx, adminId, [author])).has(author)) {
        return { ok: false, error: 'own_content' }
      }

      // Une décision à la fois (plan 7c) : retirer et classer répondent à des signalements
      // ouverts ; sans eux, une autre décision vient de les clore. Jamais un contenu retiré avec
      // des signalements classés. Rétablir exige un contenu retiré. Index content_report_target_idx.
      if (input.action === 'restore') {
        if (!found.removed) return { ok: false, error: 'already_decided' }
      } else {
        const [open] = await tx.select({ id: r.id }).from(r).where(openOfTarget).limit(1)
        if (!open) return { ok: false, error: 'already_decided' }
      }

      // Au-delà de 10 retraits dans l'heure, le mot de passe (compté sous le verrou de
      // l'administrateur : S1). Classer et rétablir ne le demandent jamais.
      if (
        input.action === 'remove' &&
        !passwordConfirmed &&
        (await removalNeedsPassword(tx, adminId, now))
      ) {
        return { ok: false, error: 'password_required' }
      }

      const decision = { id: crypto.randomUUID(), action: input.action, createdAt: now }
      // La décision d'abord : le contenu retiré la cite (removal_id, clé étrangère). Le membre visé
      // (l'auteur, ou le membre d'un profil) est noté pour l'historique et le rappel de la file.
      await tx.insert(schema.moderationDecision).values({
        ...decision,
        targetKind: target.kind,
        targetId: target.id,
        ground: input.action === 'remove' ? input.ground : null,
        explanation: input.action === 'remove' ? input.explanation : null,
        adminId,
        targetMemberId: found.authorId,
      })
      if (input.action === 'remove' || input.action === 'restore') {
        const removal = input.action === 'remove' ? { at: now, id: decision.id } : null
        if ((await mark(tx, target, removal)) === 0) throw new AlreadyDecided()
      }
      if (input.action !== 'restore') {
        // Retirer ou classer clôt tous les signalements ouverts de la cible (index
        // content_report_target_idx).
        await tx
          .update(r)
          .set({
            status: input.action === 'remove' ? 'removed' : 'dismissed',
            decidedAt: now,
            decisionId: decision.id,
          })
          .where(openOfTarget)
      }
      return {
        ok: true,
        decision: { id: decision.id, action: decision.action, createdAt: now.toISOString() },
      }
    })
  } catch (error) {
    if (error instanceof AlreadyDecided || isDecisionConflict(error)) {
      return { ok: false, error: 'already_decided' }
    }
    throw error
  }
}
