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
//
// R9 (7d) : retirer, classer et rétablir visent aussi UNE partie (`part`), avec les mêmes gardes
// (verrous, 50 par jour, mot de passe, son propre contenu). Le travail sur la partie elle-même est
// dans moderation/parts.ts ; ici, l'ordre des refus et les signalements que la décision clôt.
import {
  isRemovablePart,
  type ModerationDecision,
  type ModerationDecisionInput,
  type StoredReportTarget,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import {
  isDecisionConflict,
  lockDecision,
  removalNeedsPassword,
  type Tx,
} from '../moderation/guard'
import {
  hidePart,
  PartAlreadyDecided,
  partMediaOf,
  reportsOfPart,
  restorePart,
} from '../moderation/parts'
import { SuspensionChanged, type SuspensionError, suspendOrLift } from '../moderation/suspend'
import { isActiveAdmin } from './admin'
import { loadDecidable } from './target'

/** Les refus d'une décision ; ceux de la suspension (SuspensionError) en plus, tranche 7c. */
export type DecideError =
  | 'not_found'
  | 'own_content'
  | 'profile'
  | 'already_decided'
  | 'password_required'
  // R9 : une partie qui ne se retire qu'avec tout le contenu (422), ou qu'aucun signalement ouvert
  // ne vise (409).
  | 'part_whole_only'
  | 'part_not_reported'
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
const mark = async (
  tx: Tx,
  target: StoredReportTarget,
  removal: { at: Date; id: string } | null,
) => {
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
    case 'update': {
      // Retirer une mise à jour la cache aux autres (updateShownTo) ; ses photos la suivent
      // (isVisualVisibleTo lit project_update.removed_at). Rien d'autre à écrire.
      const t = schema.projectUpdate
      const state = removal ? isNull(t.removedAt) : isNotNull(t.removedAt)
      return (
        await tx
          .update(t)
          .set(set)
          .where(and(eq(t.id, target.id), state))
          .returning({ id: t.id })
      ).length
    }
    case 'call': {
      // R7b : un appel à tester retiré disparaît du coin pour les testeurs ; l'auteur le voit
      // encore, avec la mention du retrait. Photo et texte restent en base (comme une mise à jour).
      const t = schema.testerCall
      const state = removal ? isNull(t.removedAt) : isNotNull(t.removedAt)
      return (
        await tx
          .update(t)
          .set(set)
          .where(and(eq(t.id, target.id), state))
          .returning({ id: t.id })
      ).length
    }
    case 'message': {
      // R7b : un message d'un fil retiré ne se voit plus que de son expéditeur ; la capture jointe
      // le suit (le service des fichiers lit tester_message.removed_at).
      const t = schema.testerMessage
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
    case 'note':
      // Une ancienne note n'existe plus : loadDecidable l'a déjà rendue « introuvable ».
      return 0
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
 * relit tout par `tx`, sous ces verrous (S6) : le rôle de l'administrateur, la cible, le blocage, les signalements ouverts, les
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
  // R9 : la partie visée (« La 2e photo », la bio…) ; absente, le contenu entier.
  const part = input.part
  // Un profil entier ne se retire ni ne se rétablit (il se suspend) : seules ses parties.
  if (target.kind === 'member' && input.action !== 'dismiss' && !part) {
    return { ok: false, error: 'profile' }
  }
  // Le titre, le pitch, la catégorie, le texte d'une mise à jour : on retire tout le contenu
  // (REMOVABLE_PARTS du contrat). Refusé avant toute lecture en base.
  if (input.action === 'remove' && part && !isRemovablePart(target.kind, part.field)) {
    return { ok: false, error: 'part_whole_only' }
  }

  const r = schema.contentReport
  const openOfTarget = and(
    eq(r.targetKind, target.kind),
    eq(r.targetId, target.id),
    eq(r.status, 'open'),
  )
  // Les signalements qu'elle concerne : ceux de la partie, ou pour le contenu entier, tous ceux de
  // la cible (un retrait clôt aussi ceux des parties) ou seulement les siens (un classement entier
  // laisse ouverts ceux des parties). Toujours par l'index content_report_target_idx.
  const ofPart = part ? reportsOfPart(part) : null
  const required = and(openOfTarget, ofPart ? ofPart.exact : undefined)
  const toClose = and(
    openOfTarget,
    ofPart
      ? input.action === 'remove'
        ? ofPart.closedByRemoval
        : ofPart.exact
      : input.action === 'remove'
        ? undefined
        : isNull(r.partField),
  )
  try {
    return await db.transaction(async (tx): Promise<DecideResult> => {
      await lockDecision(tx, adminId, target)
      // Le rôle de l'acteur, relu sous les verrous et à l'heure de la décision : la route l'a
      // vérifié avant la transaction, mais il a pu être retiré (grant-admin.sh --revoke) ou
      // suspendu entre-temps. Même réponse que la garde de la route : l'adresse inconnue.
      if (!(await isActiveAdmin(tx, adminId, now))) return { ok: false, error: 'not_found' }

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

      // R9 : la photo d'une partie doit appartenir à la cible ; sinon le 404 d'une cible inconnue,
      // mot pour mot (relecture de sécurité P4).
      const media = part ? await partMediaOf(tx, target, part) : null
      if (part && !media) return { ok: false, error: 'not_found' }

      // Une décision à la fois (plan 7c) : retirer et classer répondent à des signalements
      // ouverts ; sans eux, une autre décision vient de les clore. Jamais un contenu retiré avec
      // des signalements classés. Rétablir exige un contenu retiré. Index content_report_target_idx.
      // R9 : retirer une partie exige un signalement ouvert de CETTE partie (P4) ; celui du contenu
      // entier ou d'une autre partie ne suffit pas (409 part_not_reported).
      if (input.action === 'restore') {
        if (!part && !found.removed) return { ok: false, error: 'already_decided' }
      } else {
        const [open] = await tx.select({ id: r.id }).from(r).where(required).limit(1)
        if (!open) {
          const error = part && input.action === 'remove' ? 'part_not_reported' : 'already_decided'
          return { ok: false, error }
        }
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
        partField: part?.field ?? null,
        partMediaId: part?.mediaId ?? null,
      })
      if (part && media && found.authorId !== null) {
        // R9 : seule la partie (moderation/parts.ts) ; le contenu reste affiché.
        if (input.action === 'remove') {
          const replaced = await hidePart(tx, {
            target,
            part,
            media,
            authorId: found.authorId,
            removalId: decision.id,
            now,
          })
          // Un nom ou un pseudo remplacé : l'ancien est gardé avec la décision, pour le rétablir.
          if (replaced) {
            await tx
              .update(schema.moderationDecision)
              .set(replaced)
              .where(eq(schema.moderationDecision.id, decision.id))
          }
        } else if (input.action === 'restore') {
          const restored = await restorePart(tx, target, part, media, {
            now,
            restoreId: decision.id,
          })
          if (!restored) throw new AlreadyDecided()
        }
      } else if (part) {
        // Un contenu sans auteur (compte supprimé) : rien à retirer ni à rendre.
        if (input.action !== 'dismiss') throw new AlreadyDecided()
      } else if (input.action === 'remove' || input.action === 'restore') {
        const removal = input.action === 'remove' ? { at: now, id: decision.id } : null
        if ((await mark(tx, target, removal)) === 0) throw new AlreadyDecided()
      }
      if (input.action !== 'restore') {
        // Retirer ou classer clôt les signalements ouverts qu'elle concerne (toClose, plus haut).
        await tx
          .update(r)
          .set({
            status: input.action === 'remove' ? 'removed' : 'dismissed',
            decidedAt: now,
            decisionId: decision.id,
          })
          .where(toClose)
      }
      return {
        ok: true,
        decision: { id: decision.id, action: decision.action, createdAt: now.toISOString() },
      }
    })
  } catch (error) {
    if (
      error instanceof AlreadyDecided ||
      error instanceof PartAlreadyDecided ||
      isDecisionConflict(error)
    ) {
      return { ok: false, error: 'already_decided' }
    }
    throw error
  }
}
