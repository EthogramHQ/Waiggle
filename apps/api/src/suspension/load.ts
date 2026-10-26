// La lecture des suspensions d'un compte (tranche 7c) : LA définition de « suspendu en ce moment »,
// écrite une fois en JavaScript et une fois en SQL, côte à côte (relecture de sécurité S10). La
// garde des routes, `Me`, la page d'un membre, le rappel de la file, la levée et la clôture s'en
// servent tous : une suspension ne peut pas être finie pour l'un et encore en cours pour l'autre.
//
// Une suspension est **active** si elle n'est pas close (`lifted_at` null) et que sa fin prévue
// n'est pas passée (`ends_at` null : sans fin, ou plus tard que maintenant). « Maintenant », c'est
// toujours l'heure de JavaScript passée en paramètre (`now`), jamais `now()` de SQL : les tests
// avancent une fausse horloge, et la fin se vérifie à la milliseconde. Aucune tâche planifiée ne
// clôt une suspension à sa date : elle cesse d'être active d'elle-même, et l'API ne note
// `lifted_at = ends_at` que lorsqu'elle en a besoin (closeEndedSuspension).
import {
  LiftCause,
  RemovalGround,
  type Suspension,
  SuspensionDuration,
  type SuspensionExport,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, gt, isNull, lte, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { utc } from '../notifications/load'

const s = schema.accountSuspension
const d = schema.moderationDecision

/** Une ligne de account_suspension, réduite à ce qui dit si elle est active. */
type SuspensionState = { liftedAt: Date | null; endsAt: Date | null }

/** La règle en JavaScript : active à l'instant `now`. */
export const isActiveAt = ({ liftedAt, endsAt }: SuspensionState, now: Date) =>
  liftedAt === null && (endsAt === null || endsAt.getTime() > now.getTime())

/**
 * La même règle pour une requête Drizzle sur la table account_suspension. La date passe par la
 * colonne (`gt(s.endsAt, now)`), qui l'écrit en UTC comme les colonnes (pièges de la charte).
 */
export const activeAt = (now: Date): SQL =>
  and(isNull(s.liftedAt), or(isNull(s.endsAt), gt(s.endsAt, now))) as SQL

/**
 * La même règle pour du SQL écrit à la main (le rappel de la file, les notifications), sur la table
 * account_suspension nommée `alias` dans la requête (« s » dans `from account_suspension s`).
 * `sql.raw` ne reçoit que ce nom, écrit dans notre code, jamais une valeur venue d'un client ; la
 * date entre en paramètre lié, par `utc` (notifications/load.ts).
 */
export const activeSuspensionSql = (alias: string, now: Date): SQL => {
  const table = sql.raw(alias)
  return sql`(${table}.lifted_at is null and (${table}.ends_at is null or ${table}.ends_at > ${utc(now)}))`
}

/** La suspension active d'un membre, avec ce que le membre suspendu a le droit de lire. */
export type ActiveSuspension = {
  /** L'identifiant de la ligne account_suspension (la levée la clôt par lui). */
  id: string
  suspension: Suspension
}

/**
 * La suspension active de `userId` à l'heure `now`, ou null. Le fondement et l'explication sont
 * ceux de la décision qui l'a posée (une jointure par la clé primaire de moderation_decision) ;
 * jamais l'administrateur qui a décidé.
 *
 * Index : account_suspension_open_idx, l'index unique partiel « (user_id) where lifted_at is
 * null ». La condition de la requête contient celle de l'index : PostgreSQL y lit la seule ligne
 * non close du membre, puis vérifie sa fin. Une lecture par requête d'écriture d'un membre (la
 * garde) : une ligne au plus, par un index.
 *
 * `db` peut être une transaction (`tx`) : sous le verrou d'une décision, toute lecture passe par
 * elle (S6 ; sous PGlite, une lecture par `db` pendant une transaction attendrait sans fin).
 */
export const loadActiveSuspension = async (
  db: Pick<Database, 'select'>,
  userId: string,
  now: Date,
): Promise<ActiveSuspension | null> => {
  const [row] = await db
    .select({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      afterReport: s.afterReport,
      ground: d.ground,
      explanation: d.explanation,
    })
    .from(s)
    // « left join » : si la décision manquait (elle ne se purge pas tant que la suspension est
    // gardée, J7), le compte resterait suspendu ; seul le texte montré se replie.
    .leftJoin(d, eq(d.id, s.decisionId))
    .where(and(eq(s.userId, userId), activeAt(now)))
    .limit(1)
  if (!row) return null
  // safeParse : une valeur inattendue en base ne fait pas tomber la page du membre en 500.
  const ground = RemovalGround.safeParse(row.ground)
  return {
    id: row.id,
    suspension: {
      since: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      ground: ground.success ? ground.data : 'rules',
      explanation: row.explanation ?? '',
      afterReport: row.afterReport,
    },
  }
}

/**
 * Ce membre est-il suspendu à l'heure `now` ? La garde des routes (suspension/guard.ts) et
 * `PATCH /v1/me` ne demandent que cela : la même requête, sans la jointure. Même index.
 */
export const isSuspended = async (db: Pick<Database, 'select'>, userId: string, now: Date) => {
  const [row] = await db
    .select({ id: s.id })
    .from(s)
    .where(and(eq(s.userId, userId), activeAt(now)))
    .limit(1)
  return row !== undefined
}

/**
 * Clôt la suspension échue de ce membre à sa date prévue (`lifted_at = ends_at`, sans décision de
 * levée : J6, une fin à la date se reconnaît à `lift_decision_id` null). À faire avant d'en poser
 * une nouvelle : l'index unique partiel n'admet qu'une ligne non close par membre. Seule une ligne
 * non close dont la fin est passée (`ends_at <= now`) est touchée ; une suspension sans fin ne
 * l'est jamais. Même index (account_suspension_open_idx). Appelée sous le verrou de la décision.
 */
export const closeEndedSuspension = async (
  db: Pick<Database, 'update'>,
  userId: string,
  now: Date,
) => {
  await db
    .update(s)
    .set({ liftedAt: sql`${s.endsAt}` })
    .where(and(eq(s.userId, userId), isNull(s.liftedAt), lte(s.endsAt, now)))
}

/**
 * Après le départ d'un compte (relecture juridique J1) : partir n'efface pas la preuve. La base a
 * déjà remis `user_id` à null (« set null ») ; la suspension encore ouverte est close à la date du
 * départ (`now`), sans décision de levée, ou à sa fin prévue si celle-ci était déjà passée (J6).
 * Elle reste ensuite 365 jours après cette fin, avec ses décisions (reports/retention.ts).
 *
 * Le compte n'existe plus : on ne peut plus retrouver ses lignes par son identifiant. Mais toute
 * ligne ouverte sans membre est celle d'un compte parti : la condition « user_id is null and
 * lifted_at is null » les trouve toutes, par l'index unique partiel (un index B-tree de
 * PostgreSQL range aussi les valeurs nulles). Une clôture manquée par une panne est rattrapée au
 * départ suivant.
 */
export const closeSuspensionsOfDeparted = async (db: Pick<Database, 'update'>, now: Date) => {
  await db
    .update(s)
    .set({
      liftedAt: sql`case when ${s.endsAt} <= ${utc(now)} then ${s.endsAt} else ${utc(now)} end`,
    })
    .where(and(isNull(s.userId), isNull(s.liftedAt)))
}

/**
 * Les suspensions de ce membre pour l'export de ses données (J8, S17), des plus anciennes aux plus
 * récentes, avec leur fin réelle :
 * - levée : `lifted_at` et la décision de levée (sa raison, son explication) ;
 * - finie à sa date : `lifted_at = ends_at` si l'API l'a déjà close, sinon `ends_at` passée ;
 * - en cours : tout à null.
 * Jamais l'administrateur, jamais qui a signalé : aucune colonne `admin_id` n'est lue. La durée, le
 * fondement et l'explication viennent de la décision qui l'a posée (S20).
 *
 * Une requête pour toutes : index account_suspension_user_idx (user_id, starts_at), dans l'ordre
 * de l'index ; les deux décisions se joignent par leur clé primaire. Une suspension dont la
 * décision manquerait (purgée) n'a plus ni durée ni fondement : elle est laissée de côté.
 */
export const suspensionsOfMember = async (
  db: Pick<Database, 'select'>,
  userId: string,
  now: Date,
): Promise<SuspensionExport[]> => {
  // « alias » : la même table jointe deux fois sous deux noms (la pose et la levée).
  const lift = alias(d, 'lift_decision')
  const rows = await db
    .select({
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      liftedAt: s.liftedAt,
      liftDecisionId: s.liftDecisionId,
      afterReport: s.afterReport,
      duration: d.duration,
      ground: d.ground,
      explanation: d.explanation,
      liftCause: lift.liftCause,
      liftExplanation: lift.explanation,
    })
    .from(s)
    .leftJoin(d, eq(d.id, s.decisionId))
    .leftJoin(lift, eq(lift.id, s.liftDecisionId))
    .where(eq(s.userId, userId))
    .orderBy(asc(s.startsAt), asc(s.id))
  return rows.flatMap((row) => {
    const duration = SuspensionDuration.safeParse(row.duration)
    const ground = RemovalGround.safeParse(row.ground)
    if (!duration.success || !ground.success) return []
    const lifted = row.liftDecisionId !== null
    // La fin réelle : la clôture notée, ou la fin prévue déjà passée (pas encore notée).
    const endedAt =
      row.liftedAt ??
      (row.endsAt !== null && row.endsAt.getTime() <= now.getTime() ? row.endsAt : null)
    const liftCause = LiftCause.safeParse(row.liftCause)
    return [
      {
        since: row.startsAt.toISOString(),
        duration: duration.data,
        endsAt: row.endsAt?.toISOString() ?? null,
        ground: ground.data,
        explanation: row.explanation ?? '',
        afterReport: row.afterReport,
        endedAt: endedAt?.toISOString() ?? null,
        endedBy: endedAt === null ? null : lifted ? 'lift' : 'term',
        liftCause: lifted && liftCause.success ? liftCause.data : null,
        liftExplanation: lifted ? (row.liftExplanation ?? null) : null,
      },
    ]
  })
}
