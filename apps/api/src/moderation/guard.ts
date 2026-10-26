// Les garde-fous de la modération (tranche 7c) : ce qui empêche un compte d'administrateur volé, ou
// un double clic, de faire beaucoup de dégâts d'un coup. Quatre outils, utilisés par
// reports/decide.ts (retirer, classer, rétablir) et par moderation/suspend.ts (suspendre, lever) :
// - le quota : 50 décisions par administrateur et par 24 heures ;
// - les verrous : une décision à la fois par administrateur, puis par cible ;
// - les seuils au-delà desquels le mot de passe est redemandé (retraits de l'heure, suspensions du
//   jour), comptés sous le verrou de l'administrateur ;
// - la vérification de ce mot de passe, avec son propre compteur d'échecs.
import {
  MODERATION_DECISIONS_PER_DAY,
  MODERATION_PASSWORD_FAILURES_PER_DAY,
  REMOVALS_BEFORE_PASSWORD,
  type ReportTargetKind,
  SUSPENSIONS_BEFORE_PASSWORD,
  type SuspensionDuration,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, count, eq, gt, sql } from 'drizzle-orm'
import {
  memberCounterKeys,
  type RateDecision,
  type RateLimiter,
  type RateRule,
} from '../rate-limit'

/** Une transaction de Drizzle : le même objet que `db`, mais dont tout se valide ou s'annule ensemble. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const d = schema.moderationDecision

// ─── Le quota ────────────────────────────────────────────────────────────────────────────────────

/**
 * 50 décisions par administrateur sur 24 heures glissantes, comme les autres quotas de
 * rate-limit.ts (décision du 26/10/2026). Comptées à chaque POST, même mal formé, mais seulement
 * après la garde « administrateur en fonction » (S5) : un membre ne voit jamais un 429 qui
 * trahirait l'existence de la route.
 */
export const DECISION_RULE: RateRule = { windowMs: DAY, max: MODERATION_DECISIONS_PER_DAY }

/** Compte une décision de cet administrateur et dit s'il peut encore décider aujourd'hui. */
export const countDecision = (limiter: RateLimiter, adminId: string): Promise<RateDecision> =>
  limiter.hit(memberCounterKeys(adminId).moderationDecision, DECISION_RULE)

// ─── Les verrous ─────────────────────────────────────────────────────────────────────────────────

/**
 * Prend, jusqu'à la fin de la transaction, les deux verrous d'une décision, toujours dans cet ordre
 * (relecture de sécurité S1, S7) :
 * 1. celui de l'administrateur : ses décisions passent une par une. Les seuils « 10 retraits dans
 *    l'heure » et « 3 suspensions dans la journée » se comptent ensuite, sous ce verrou : deux
 *    onglets qui retirent en même temps ne lisent jamais tous les deux « 9 », pour en écrire 11
 *    sans mot de passe ;
 * 2. celui de la cible (`kind:id` ; un membre pour une suspension ou une levée) : deux
 *    administrateurs qui décident en même temps de la même cible passent l'un après l'autre, et
 *    le second relit l'état laissé par le premier (« déjà décidé »).
 * Toujours le même ordre : deux transactions ne peuvent pas s'attendre l'une l'autre en croix
 * (interblocage). Si PostgreSQL en détectait un quand même, l'erreur 40P01 devient « déjà décidé »
 * (isDecisionConflict).
 *
 * `pg_advisory_xact_lock(n)` : un verrou « consultatif » de PostgreSQL, sur le nombre n et non
 * sur une ligne ; « xact » : il se libère seul à la fin de la transaction. `hashtextextended(texte,
 * 0)` change le texte en ce nombre (64 bits), comme dans blocks/write.ts. Les textes n'entrent dans
 * la requête que comme paramètres liés.
 */
export const lockDecision = async (
  tx: Tx,
  adminId: string,
  target: { kind: ReportTargetKind; id: string },
) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`moderation-admin:${adminId}`}, 0))`,
  )
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`moderation:${target.kind}:${target.id}`}, 0))`,
  )
}

/**
 * Deux décisions qui se croisent malgré les verrous (une suspension posée par un autre chemin, un
 * interblocage) : la base refuse la seconde par l'index unique (23505) ou casse l'interblocage
 * (40P01). Pour l'administrateur, c'est « déjà décidé » (S8). Drizzle range l'erreur de la base
 * dans `cause`.
 */
export const isDecisionConflict = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  const codes = [codeOf(error), error instanceof Error ? codeOf(error.cause) : undefined]
  return codes.some((code) => code === '23505' || code === '40P01')
}

// ─── Les seuils du mot de passe ──────────────────────────────────────────────────────────────────

/**
 * Le nombre de décisions `action` prises par cet administrateur depuis `since`. Lu par `tx`, sous
 * le verrou de l'administrateur (S1, S6 : sous PGlite, une lecture par `db` pendant une
 * transaction attendrait sans fin). Index moderation_decision_admin_idx (admin_id, created_at) :
 * seules ses décisions récentes sont lues. La date passe par la colonne (gt), qui l'écrit en UTC.
 */
const decisionsSince = async (tx: Tx, adminId: string, action: string, since: Date) => {
  const [row] = await tx
    .select({ n: count() })
    .from(d)
    .where(and(eq(d.adminId, adminId), eq(d.action, action), gt(d.createdAt, since)))
  return row?.n ?? 0
}

/**
 * Un retrait demande-t-il le mot de passe ? Oui quand cet administrateur a déjà fait
 * REMOVALS_BEFORE_PASSWORD (10) retraits dans l'heure : le 11e le demande. À appeler sous
 * lockDecision.
 */
export const removalNeedsPassword = async (tx: Tx, adminId: string, now: Date) =>
  (await decisionsSince(tx, adminId, 'remove', new Date(now.getTime() - HOUR))) >=
  REMOVALS_BEFORE_PASSWORD

/**
 * Une suspension demande-t-elle le mot de passe ? Toujours pour une suspension sans fin ; pour 7 ou
 * 30 jours, quand cet administrateur a déjà posé SUSPENSIONS_BEFORE_PASSWORD (3) suspensions dans
 * les 24 dernières heures (S11). Toutes ses suspensions comptent, sans fin comprises : un compte
 * volé n'en pose pas davantage en alternant les durées. À appeler sous lockDecision, avec la `tx`
 * de la décision (moderation/suspend.ts).
 */
export const suspensionNeedsPassword = async (
  tx: Tx,
  adminId: string,
  duration: SuspensionDuration,
  now: Date,
) =>
  duration === 'indefinite' ||
  (await decisionsSince(tx, adminId, 'suspend', new Date(now.getTime() - DAY))) >=
    SUSPENSIONS_BEFORE_PASSWORD

// ─── Le mot de passe ─────────────────────────────────────────────────────────────────────────────

/** La façon dont Better Auth vérifie un mot de passe (scrypt en production, plus rapide en test). */
export type PasswordVerifier = {
  verify: (data: { hash: string; password: string }) => Promise<boolean>
}

/** Au plus 5 mots de passe faux par administrateur sur 24 heures glissantes, puis 429 (S12). */
export const PASSWORD_FAILURE_RULE: RateRule = {
  windowMs: DAY,
  max: MODERATION_PASSWORD_FAILURES_PER_DAY,
}

/**
 * Le mot de passe est-il celui du compte ? Il se compare à l'empreinte de la connexion
 * « credential » (adresse et mot de passe), comme auth/change-email.ts. Un compte sans elle n'a
 * rien à comparer : même réponse qu'un mauvais mot de passe (S12). Lecture par l'index de
 * account.user_id. Le mot de passe n'est jamais journalisé.
 */
export const verifyPassword = async (
  db: Database,
  hashing: PasswordVerifier,
  userId: string,
  password: string,
) => {
  const a = schema.account
  const [row] = await db
    .select({ hash: a.password })
    .from(a)
    .where(and(eq(a.userId, userId), eq(a.providerId, 'credential')))
  return row?.hash ? hashing.verify({ hash: row.hash, password }) : false
}

export type PasswordCheck =
  | { ok: true }
  | { ok: false; error: 'wrong_password' }
  | { ok: false; error: 'rate_limited'; retryAfterSeconds: number }

/**
 * Vérifie le mot de passe que l'administrateur a retapé, AVANT la transaction de la décision (la
 * vérification est lente, et son compteur d'échecs doit rester écrit même si la décision n'a pas
 * lieu). L'essai est compté d'abord, puis rendu s'il était juste : le compteur ne garde que les
 * échecs, et des essais lancés en même temps prennent chacun leur place avant d'être vérifiés. Au
 * 6e échec du jour, même le bon mot de passe reçoit 429 (décision du 26/10/2026).
 */
export const confirmPassword = async (
  db: Database,
  limiter: RateLimiter,
  hashing: PasswordVerifier,
  adminId: string,
  password: string,
): Promise<PasswordCheck> => {
  const key = memberCounterKeys(adminId).moderationPassword
  const attempt = await limiter.hit(key, PASSWORD_FAILURE_RULE)
  if (!attempt.allowed) {
    return { ok: false, error: 'rate_limited', retryAfterSeconds: attempt.retryAfterSeconds }
  }
  if (!(await verifyPassword(db, hashing, adminId, password))) {
    return { ok: false, error: 'wrong_password' }
  }
  await limiter.refund(key)
  return { ok: true }
}
