// Lire les pseudos (tranche 6a) : le pseudo actuel d'un membre, et l'ancien qui lui reste réservé.
// Les écritures (donner, changer) sont dans claim.ts.
import { HANDLE_RESERVATION_DAYS } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, desc, eq, gt, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

const h = schema.memberHandle
const DAY = 24 * 60 * 60 * 1000

/**
 * La limite de la réservation : un ancien pseudo libéré à cette date ou avant est de nouveau libre.
 * Libre à J+30 exactement : « released_at + 30 jours <= maintenant », écrit
 * « released_at <= maintenant - 30 jours » pour que la comparaison porte sur la colonne seule.
 */
export const reservationCutoff = (now: Date) =>
  new Date(now.getTime() - HANDLE_RESERVATION_DAYS * DAY)

/** La date où un ancien pseudo, libéré à `releasedAt`, redevient libre. */
export const reservedUntil = (releasedAt: Date) =>
  new Date(releasedAt.getTime() + HANDLE_RESERVATION_DAYS * DAY)

/**
 * La condition de jointure « le pseudo actuel de ce membre », pour lire le pseudo avec le reste
 * d'un profil en une seule requête (leftJoin : un membre qui n'en a pas encore garde sa ligne,
 * avec un pseudo null). Elle reprend la condition de l'index partiel member_handle_current_idx
 * (released_at is null) : PostgreSQL peut donc s'en servir.
 */
export const currentHandleOf = (userId: AnyPgColumn): SQL =>
  sql`${h.userId} = ${userId} and ${h.releasedAt} is null`

/** Le pseudo actuel d'un membre, ou null s'il n'en a pas encore (index member_handle_current_idx). */
export const currentHandle = async (db: Database, userId: string): Promise<string | null> => {
  const [row] = await db
    .select({ handle: h.handle })
    .from(h)
    .where(and(eq(h.userId, userId), isNull(h.releasedAt)))
  return row?.handle ?? null
}

/**
 * L'ancien pseudo qui reste réservé à un membre, avec la date où il redevient libre ; null s'il
 * n'en a pas, ou si sa réservation est finie. Il n'y en a qu'un (claim.ts efface les précédents) ;
 * « order by … limit 1 » le garantit quand même. Index : member_handle_user_idx (user_id).
 */
export const formerHandleOf = async (db: Database, userId: string, now: Date) => {
  const [row] = await db
    .select({ handle: h.handle, releasedAt: h.releasedAt })
    .from(h)
    .where(
      and(eq(h.userId, userId), isNotNull(h.releasedAt), gt(h.releasedAt, reservationCutoff(now))),
    )
    .orderBy(desc(h.releasedAt))
    .limit(1)
  if (!row?.releasedAt) return null
  return { handle: row.handle, reservedUntil: reservedUntil(row.releasedAt).toISOString() }
}
