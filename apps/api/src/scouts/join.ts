// Devenir Éclaireuse (R20, docs/scenarios/refonte.md, « Devenir Éclaireuse », « Le mois des
// Éclaireuses ») : les 30 places, le mois, et l'état d'une Éclaireuse, lus par l'inscription
// (auth/auth.ts), par POST /v1/me/scout et par les autres routes des Éclaireuses.
//
// Une place compte quand l'Éclaireuse n'est pas retirée, et que son adresse est vérifiée ou qu'elle
// est entrée il y a moins de 24 heures (relecture de sécurité A1) : une inscription jamais vérifiée
// ne garde pas une place pour toujours. Toute entrée passe par `joinScouts`, sous un même verrou :
// deux entrées simultanées pour la dernière place ne la prennent pas toutes les deux.
import {
  SCOUT_PLACES,
  SCOUT_SEAL,
  type ScoutJoinVia,
  type SignUpRefusalCode,
} from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, count, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { Tx } from '../game/award'
import { grantSeals } from '../game/seals'

/** La base ou une transaction : les lectures ci-dessous servent dans les deux. */
type Reader = Database | Tx

/** Le temps pendant lequel une entrée non vérifiée garde sa place. */
const UNVERIFIED_PLACE_MS = 24 * 60 * 60 * 1000

const s = schema.scout
const program = schema.scoutProgram

export type ScoutRow = typeof schema.scout.$inferSelect
export type ScoutProgramRow = typeof schema.scoutProgram.$inferSelect

/**
 * Le verrou des Éclaireuses, tenu jusqu'à la fin de la transaction. `pg_advisory_xact_lock(n)` est
 * un verrou « consultatif » de PostgreSQL : il ne bloque aucune ligne, seulement les autres
 * transactions qui demandent le même nombre (ici, l'empreinte du mot « scouts »). Une seconde
 * entrée attend donc que la première ait compté les places et écrit sa ligne.
 */
export const lockScouts = (tx: Tx) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('scouts', 0))`)

/** Le mois fini : lancé, et sa fin passée. Pas encore lancé, il n'est pas fini. */
export const isProgramOver = (row: ScoutProgramRow | null, now: Date) =>
  row !== null && row.endsAt <= now

/** Le mois des Éclaireuses, ou null s'il n'est pas lancé (sa ligne unique, par sa clé primaire). */
export const loadScoutProgram = async (db: Reader): Promise<ScoutProgramRow | null> =>
  (await db.select().from(program).where(eq(program.id, 1)))[0] ?? null

/**
 * Où en est ce membre chez les Éclaireuses :
 * - `none` : jamais Éclaireuse (ou entrée non vérifiée effacée après 24 heures) ;
 * - `removed` : retirée par l'administrateur, pour toujours ;
 * - `closed` : le mois est fini ; elle relit ses retours, n'en envoie plus ;
 * - `active` : elle envoie ses retours et a la Goutte (mois en cours, ou pas encore lancé).
 */
export type ScoutState =
  | { kind: 'none' }
  | { kind: 'removed'; scout: ScoutRow; program: ScoutProgramRow | null }
  | { kind: 'closed'; scout: ScoutRow; program: ScoutProgramRow }
  | { kind: 'active'; scout: ScoutRow; program: ScoutProgramRow | null }

/**
 * L'état d'Éclaireuse de ce membre à l'heure `now`. Une requête : sa ligne par la clé primaire de
 * `scout`, jointe à la ligne unique du mois (« left join » : le mois peut ne pas être lancé).
 */
export const activeScout = async (db: Reader, memberId: string, now: Date): Promise<ScoutState> => {
  const [row] = await db
    .select({ scout: s, program })
    .from(s)
    .leftJoin(program, eq(program.id, 1))
    .where(eq(s.memberId, memberId))
  if (!row) return { kind: 'none' }
  if (row.scout.removedAt !== null) {
    return { kind: 'removed', scout: row.scout, program: row.program }
  }
  if (row.program !== null && isProgramOver(row.program, now)) {
    return { kind: 'closed', scout: row.scout, program: row.program }
  }
  return { kind: 'active', scout: row.scout, program: row.program }
}

/**
 * Les places prises à l'heure `now` : les Éclaireuses non retirées dont l'adresse est vérifiée, ou
 * entrées depuis moins de 24 heures. Une requête : la table entière (30 lignes actives au plus,
 * plus les retirées), jointe aux comptes par leur clé primaire.
 */
export const scoutPlaces = async (db: Reader, now: Date = new Date()) => {
  const [row] = await db
    .select({ taken: count() })
    .from(s)
    .innerJoin(schema.user, eq(schema.user.id, s.memberId))
    .where(
      and(
        isNull(s.removedAt),
        or(
          eq(schema.user.emailVerified, true),
          gt(s.joinedAt, new Date(now.getTime() - UNVERIFIED_PLACE_MS)),
        ),
      ),
    )
  return { taken: row?.taken ?? 0, max: SCOUT_PLACES }
}

/**
 * Efface les entrées qui ne gardent plus de place : non vérifiées depuis plus de 24 heures, non
 * retirées. Le sceau « Éclaireuse fondatrice » et son avis partent avec : elle n'est plus
 * Éclaireuse. Trois requêtes, dans la transaction de l'entrée, sous le verrou.
 */
const freeStalePlaces = async (tx: Tx, now: Date) => {
  const stale = await tx
    .delete(s)
    .where(
      and(
        isNull(s.removedAt),
        lte(s.joinedAt, new Date(now.getTime() - UNVERIFIED_PLACE_MS)),
        // `sql.raw` : la colonne écrite avec le nom de sa table, sinon Drizzle l'écrirait seule et
        // la sous-requête pourrait la lire dans `user` (pieges/drizzle-pglite.md).
        sql`not exists (select 1 from "user" u where u.id = ${sql.raw('"scout"."member_id"')} and u.email_verified)`,
      ),
    )
    .returning({ memberId: s.memberId })
  const ids = stale.map((row) => row.memberId)
  if (ids.length === 0) return
  await tx
    .delete(schema.seal)
    .where(and(inArray(schema.seal.memberId, ids), eq(schema.seal.code, SCOUT_SEAL.code)))
  await tx
    .delete(schema.gameNotice)
    .where(
      and(
        inArray(schema.gameNotice.memberId, ids),
        eq(schema.gameNotice.kind, 'seal'),
        eq(schema.gameNotice.code, SCOUT_SEAL.code),
      ),
    )
}

/** Ce que rend une entrée : faite, ou la raison du refus (le code d'erreur de l'API). */
export type JoinOutcome =
  | 'joined'
  | 'scout_already'
  | 'scout_removed'
  | 'scout_closed'
  | 'scout_full'

/**
 * Fait de ce membre une Éclaireuse, s'il reste une place et que le mois n'est pas fini. Une
 * transaction (tout est écrit, ou rien), sous le verrou des Éclaireuses : effacer les places
 * périmées, relire sa ligne (déjà là : `scout_already`, ou `scout_removed` si elle a été retirée),
 * le mois, compter les places, puis écrire sa ligne, son sceau et l'avis du sceau (game/seals.ts).
 */
export const joinScouts = (
  db: Database,
  memberId: string,
  via: ScoutJoinVia,
  now: Date,
): Promise<JoinOutcome> =>
  db.transaction(async (tx) => {
    await lockScouts(tx)
    await freeStalePlaces(tx, now)
    const [existing] = await tx
      .select({ removedAt: s.removedAt })
      .from(s)
      .where(eq(s.memberId, memberId))
    if (existing) return existing.removedAt !== null ? 'scout_removed' : 'scout_already'
    if (isProgramOver(await loadScoutProgram(tx), now)) return 'scout_closed'
    if ((await scoutPlaces(tx, now)).taken >= SCOUT_PLACES) return 'scout_full'
    await tx.insert(s).values({ memberId, joinedAt: now, via, showDrop: true })
    await grantSeals(tx, [{ memberId, code: SCOUT_SEAL.code }], now)
    return 'joined'
  })

/**
 * Le refus de l'inscription par le code des Éclaireuses, ou null : le mois fini (`SCOUT_CLOSED`),
 * puis les 30 places prises (`SCOUT_FULL`). Lu sans verrou, dans le hook `before` de Better Auth :
 * `joinScouts` recompte sous le verrou une fois le compte créé.
 */
export const signUpScoutRefusal = async (
  db: Database,
  now: Date,
): Promise<Extract<SignUpRefusalCode, 'SCOUT_FULL' | 'SCOUT_CLOSED'> | null> => {
  if (isProgramOver(await loadScoutProgram(db), now)) return 'SCOUT_CLOSED'
  if ((await scoutPlaces(db, now)).taken >= SCOUT_PLACES) return 'SCOUT_FULL'
  return null
}
