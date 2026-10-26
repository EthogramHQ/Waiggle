// Suspendre un compte, ou lever sa suspension (tranche 7c) : deux décisions de modération, appelées
// par reports/decide.ts (POST /v1/moderation/decisions), qui partagent avec les autres le quota,
// les verrous et le mot de passe (moderation/guard.ts). Puis, après la décision, l'e-mail au membre
// suspendu (sendSuspensionEmail), appelé par la route une fois la transaction validée.
//
// Les règles (scénario « Tranche 7c — Administrer », relectures du plan) :
// - un administrateur ne décide pas de ce qui le concerne : ni lui-même, ni un membre qu'il a
//   bloqué (S4, J13 : 422 `own_content`) ; ni un autre administrateur en fonction (422
//   `cannot_suspend_admin` : on retire d'abord son rôle par le script du dépôt) ;
// - une seule suspension active à la fois (409 `already_decided`), et lever exige une suspension
//   active (409 sinon) ;
// - suspendre ne clôt aucun signalement : chacun recevra sa décision ;
// - `fromReport` (J2) : la carte de la file d'où part la suspension. Un signalement ouvert de cette
//   cible doit viser ce membre, sinon 422 `validation` ; la suspension est alors « après un
//   signalement » ;
// - le mot de passe : toujours pour une suspension sans fin, et au-delà de 3 suspensions dans la
//   journée (suspensionNeedsPassword, compté sous le verrou de l'administrateur : S1).
//
// Course réelle (S1), que PGlite ne peut pas rejouer (une seule connexion) : deux administrateurs
// suspendent le même membre au même instant. Chacun ouvre sa transaction et prend d'abord le
// verrou de son compte, puis celui du membre (`moderation:member:<id>`) : le second attend que le
// premier ait validé, puis relit sous le verrou la suspension que le premier vient d'écrire, et
// répond 409. Si un chemin oubliait le verrou, l'index unique partiel (une seule suspension non
// close par membre) refuserait quand même la seconde ligne (23505, devenu 409 par decide.ts).
// Même raisonnement pour deux onglets du même administrateur qui comptent ses suspensions du jour :
// le verrou de son compte les fait passer l'un après l'autre, et le second compte la première.
import {
  type ModerationDecision,
  type ModerationDecisionInput,
  SUSPENSION_DAYS,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull } from 'drizzle-orm'
import { languageOfMember } from '../email/language'
import type { Mailer } from '../email/mailer'
import { suspensionEmail } from '../email/templates'
import { describeError } from '../log'
import type { RateLimiter, RateRule } from '../rate-limit'
import { isActiveAdmin } from '../reports/admin'
import { closeEndedSuspension, loadActiveSuspension } from '../suspension/load'
import { lockDecision, suspensionNeedsPassword, type Tx } from './guard'

type SuspendInput = Extract<ModerationDecisionInput, { action: 'suspend' }>
type LiftInput = Extract<ModerationDecisionInput, { action: 'lift' }>

export type SuspensionError =
  | 'not_found'
  | 'own_content'
  | 'cannot_suspend_admin'
  | 'already_decided'
  | 'password_required'
  | 'validation'

export type SuspensionResult =
  | { ok: true; decision: ModerationDecision }
  | { ok: false; error: SuspensionError }

/**
 * Levée dans la transaction quand la suspension a changé entre la lecture et l'écriture (un départ
 * du compte, qui ne prend pas le verrou) : la transaction est annulée, la décision n'est pas
 * écrite, et decide.ts répond « déjà décidé ».
 */
export class SuspensionChanged extends Error {}

const DAY = 24 * 60 * 60 * 1000

/**
 * Ce qui empêche cet administrateur de décider du compte `memberId`, lu par `tx` sous le verrou
 * (S6) : le membre inconnu (404), lui-même, ou un membre qu'il a bloqué (le blocage dans ce
 * sens-là seulement, comme pour les contenus : reports/decide.ts, blockedByAdmin ; sinon bloquer
 * l'administrateur ferait échapper à la modération). Les deux lectures passent par une clé
 * primaire (user.id, puis member_block (blocker_id, blocked_id)).
 */
const concernedRefusal = async (
  tx: Tx,
  adminId: string,
  memberId: string,
): Promise<SuspensionError | null> => {
  const [member] = await tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, memberId))
  if (!member) return 'not_found'
  if (memberId === adminId) return 'own_content'
  const b = schema.memberBlock
  const [blocked] = await tx
    .select({ id: b.blockedId })
    .from(b)
    .where(and(eq(b.blockerId, adminId), eq(b.blockedId, memberId)))
  return blocked ? 'own_content' : null
}

/**
 * J2 : un signalement encore ouvert de la cible `fromReport` vise-t-il bien ce membre (l'auteur
 * du contenu, ou le membre d'un profil, gardé dans target_author_id) ? Index
 * content_report_target_idx (target_kind, target_id, …) : seuls les signalements de cette cible
 * sont lus.
 */
const reportNamesMember = async (
  tx: Tx,
  target: NonNullable<SuspendInput['fromReport']>,
  memberId: string,
) => {
  const r = schema.contentReport
  const [open] = await tx
    .select({ id: r.id })
    .from(r)
    .where(
      and(
        eq(r.targetKind, target.kind),
        eq(r.targetId, target.id),
        eq(r.status, 'open'),
        eq(r.targetAuthorId, memberId),
      ),
    )
    .limit(1)
  return open !== undefined
}

/** Suspend le membre, sous les verrous déjà pris par suspendOrLift. */
const suspendMember = async (
  tx: Tx,
  adminId: string,
  input: SuspendInput,
  now: Date,
  passwordConfirmed: boolean,
): Promise<SuspensionResult> => {
  const refusal = await concernedRefusal(tx, adminId, input.memberId)
  if (refusal) return { ok: false, error: refusal }
  if (await isActiveAdmin(tx, input.memberId)) return { ok: false, error: 'cannot_suspend_admin' }

  // Une suspension échue mais pas encore close se clôt d'abord à sa date (J6) : sinon l'index
  // unique partiel refuserait la nouvelle. Puis la règle unique de suspension/load.ts (S10).
  await closeEndedSuspension(tx, input.memberId, now)
  if (await loadActiveSuspension(tx, input.memberId, now)) {
    return { ok: false, error: 'already_decided' }
  }

  const afterReport = input.fromReport !== undefined
  if (input.fromReport && !(await reportNamesMember(tx, input.fromReport, input.memberId))) {
    return { ok: false, error: 'validation' }
  }

  // Le mot de passe, en dernier : la demande ne le réclame que si elle aurait abouti.
  if (!passwordConfirmed && (await suspensionNeedsPassword(tx, adminId, input.duration, now))) {
    return { ok: false, error: 'password_required' }
  }

  // La décision d'abord (la suspension la cite : clé étrangère), avec tout ce que l'historique lit
  // sans la suspension (S20) : la durée et l'origine. La fin est l'heure de la pose plus 7 ou 30
  // jours, à la milliseconde (J4) : la même valeur pour la garde, l'appli et l'e-mail.
  const decision = { id: crypto.randomUUID(), action: 'suspend' as const, createdAt: now }
  await tx.insert(schema.moderationDecision).values({
    ...decision,
    targetKind: 'member',
    targetId: input.memberId,
    targetMemberId: input.memberId,
    ground: input.ground,
    explanation: input.explanation,
    duration: input.duration,
    afterReport,
    adminId,
  })
  await tx.insert(schema.accountSuspension).values({
    id: crypto.randomUUID(),
    userId: input.memberId,
    decisionId: decision.id,
    startsAt: now,
    endsAt:
      input.duration === 'indefinite'
        ? null
        : new Date(now.getTime() + SUSPENSION_DAYS[input.duration] * DAY),
    afterReport,
  })
  return { ok: true, decision: { ...decision, createdAt: now.toISOString() } }
}

/** Lève la suspension active du membre, sous les verrous déjà pris par suspendOrLift. */
const liftSuspension = async (
  tx: Tx,
  adminId: string,
  input: LiftInput,
  now: Date,
): Promise<SuspensionResult> => {
  const refusal = await concernedRefusal(tx, adminId, input.memberId)
  if (refusal) return { ok: false, error: refusal }

  // Une suspension finie à sa date n'est plus à lever : elle se clôt à sa date, sans décision de
  // levée (J6), et la levée répond « déjà décidé », comme pour une suspension déjà levée.
  await closeEndedSuspension(tx, input.memberId, now)
  const active = await loadActiveSuspension(tx, input.memberId, now)
  if (!active) return { ok: false, error: 'already_decided' }

  const decision = { id: crypto.randomUUID(), action: 'lift' as const, createdAt: now }
  await tx.insert(schema.moderationDecision).values({
    ...decision,
    targetKind: 'member',
    targetId: input.memberId,
    targetMemberId: input.memberId,
    explanation: input.explanation,
    liftCause: input.cause,
    adminId,
  })
  // Close par la clé primaire, seulement si elle est encore ouverte : « returning » rend les lignes
  // modifiées ; aucune, et elle vient d'être close autrement (départ du compte).
  const s = schema.accountSuspension
  const closed = await tx
    .update(s)
    .set({ liftedAt: now, liftDecisionId: decision.id })
    .where(and(eq(s.id, active.id), isNull(s.liftedAt)))
    .returning({ id: s.id })
  if (closed.length === 0) throw new SuspensionChanged()
  return { ok: true, decision: { ...decision, createdAt: now.toISOString() } }
}

/**
 * Suspend ou lève, à l'heure `now` (l'heure de JavaScript, aussi celle de la pose et de la fin).
 * Une transaction : les verrous de l'administrateur puis du membre (lockDecision, le même ordre que
 * toutes les décisions), puis tout est relu par `tx`, sous ces verrous. Une réponse « non » valide
 * quand même la transaction : seule une suspension échue a pu y être close, ce qui est juste.
 */
export const suspendOrLift = (
  db: Database,
  adminId: string,
  input: SuspendInput | LiftInput,
  now: Date,
  { passwordConfirmed }: { passwordConfirmed: boolean },
): Promise<SuspensionResult> =>
  db.transaction(async (tx) => {
    await lockDecision(tx, adminId, { kind: 'member', id: input.memberId })
    return input.action === 'suspend'
      ? suspendMember(tx, adminId, input, now, passwordConfirmed)
      : liftSuspension(tx, adminId, input, now)
  })

// ─── L'e-mail ────────────────────────────────────────────────────────────────────────────────────

/** S18 : au plus un e-mail de suspension par membre sur 24 heures. */
const SUSPENSION_EMAIL_RULE: RateRule = { windowMs: DAY, max: 1 }

/**
 * La clé du compteur de ces e-mails dans api_rate_limit. Hors de memberCounterKeys (rate-limit.ts)
 * : ce compteur n'est pas un quota du membre (route-inventory.test.ts met tous ceux-là au plafond) ;
 * il est effacé à part au départ du compte (auth/auth.ts, afterDelete), car il porte son
 * identifiant.
 */
export const suspensionEmailKey = (userId: string) => `suspension-email:${userId}`

/**
 * Envoie l'e-mail de suspension à `memberId`, après la décision (jamais en tenant la transaction).
 * Il se calcule au moment de l'envoi : si la suspension a été levée entre-temps, ou le compte
 * supprimé, rien ne part. Dans la langue du membre, jamais celle de l'administrateur. L'envoi est
 * noté (le compteur de S18) avant d'être tenté : une seconde suspension dans les 24 heures ne
 * prévient pas de nouveau, même si le premier envoi a échoué. Un échec se journalise sans données
 * personnelles et ne défait pas la décision (comme jobs/moderation-alert.ts).
 */
export const sendSuspensionEmail = async (
  { db, mailer, limiter }: { db: Database; mailer: Mailer; limiter: RateLimiter },
  memberId: string,
  now: Date,
) => {
  try {
    const active = await loadActiveSuspension(db, memberId, now)
    // Clé primaire de user : l'adresse et la langue, rien d'autre.
    const [member] = await db
      .select({ email: schema.user.email, language: schema.user.language })
      .from(schema.user)
      .where(eq(schema.user.id, memberId))
    if (!active || !member) return
    if (!(await limiter.hit(suspensionEmailKey(memberId), SUSPENSION_EMAIL_RULE)).allowed) return
    const { endsAt, ground, explanation, afterReport } = active.suspension
    await mailer.send({
      to: member.email,
      ...suspensionEmail(languageOfMember(member), {
        endsAt: endsAt === null ? null : new Date(endsAt),
        ground,
        explanation,
        afterReport,
      }),
    })
  } catch (error) {
    console.error(
      'Suspension e-mail not sent',
      describeError(error, { method: 'POST', path: '/v1/moderation/decisions' }),
    )
  }
}
