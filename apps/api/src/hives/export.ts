// Les ruches dans l'export des données d'un membre (R10, droit d'accès) : ses ruches (nom, rôle,
// date d'entrée, dernière visite), les invitations qu'il a reçues, refusées comprises, et celles
// qu'il a envoyées. Jamais les autres membres de ses ruches : ils ne sont pas ses données.
import type { HiveExport } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { asc, eq } from 'drizzle-orm'
import { currentHandleOf } from '../handles/load'
import { shownName } from './load'

const h = schema.hive
const hm = schema.hiveMember
const hi = schema.hiveInvitation

/**
 * Trois requêtes, quel que soit le nombre de ruches ou d'invitations (un nombre fixe, comme toute
 * liste). Les tris se font en base, des plus anciennes aux plus récentes, comme le reste de l'export.
 */
export const hiveExportOf = async (db: Database, userId: string): Promise<HiveExport> => {
  // Ses ruches : ses lignes de hive_member (index hive_member_user_idx, user_id en tête), jointes à
  // leur ruche par sa clé primaire. Le nom est celui d'aujourd'hui, null si la modération l'a retiré
  // (comme partout ailleurs, `shownName`) ; son rôle se lit sur l'animateur actuel de la ruche.
  const memberships = await db
    .select({
      id: h.id,
      name: h.name,
      nameRemovalId: h.nameRemovalId,
      animatorId: h.animatorId,
      joinedAt: hm.joinedAt,
      seenAt: hm.seenAt,
    })
    .from(hm)
    .innerJoin(h, eq(h.id, hm.hiveId))
    .where(eq(hm.userId, userId))
    .orderBy(asc(hm.joinedAt), asc(hm.hiveId))

  // Les invitations qu'il a reçues, refusées comprises (décision Q1 de la relecture du plan : un
  // refus reste en base jusqu'aux 30 jours), avec le nom actuel de la ruche. Index
  // hive_invitation_invitee_idx (invitee_id, created_at), qui les rend déjà dans l'ordre. Ni qui
  // l'a invité : son identifiant ne dirait rien de plus que la ligne d'Activité, et il est à lui.
  const received = await db
    .select({
      hiveId: hi.hiveId,
      name: h.name,
      nameRemovalId: h.nameRemovalId,
      at: hi.createdAt,
      refusedAt: hi.refusedAt,
    })
    .from(hi)
    .innerJoin(h, eq(h.id, hi.hiveId))
    .where(eq(hi.inviteeId, userId))
    .orderBy(asc(hi.createdAt), asc(hi.id))

  // Celles qu'il a envoyées : l'invité par son pseudo actuel, jamais par son nom (comme les blocages
  // et les suggestions écartées), par la jointure de member_handle (son pseudo en cours). Index
  // hive_invitation_inviter_idx (inviter_id, created_at). Un refus n'y est pas dit : refuser ne
  // prévient personne (scénario, « Inviter »). Une invitation entre deux membres qui se bloquent
  // n'existe plus (bloquer les efface, blocks/write.ts) : le pseudo n'a pas à être caché ici.
  const sent = await db
    .select({ hiveId: hi.hiveId, inviteeHandle: schema.memberHandle.handle, at: hi.createdAt })
    .from(hi)
    .leftJoin(schema.memberHandle, currentHandleOf(hi.inviteeId))
    .where(eq(hi.inviterId, userId))
    .orderBy(asc(hi.createdAt), asc(hi.id))

  return {
    hives: memberships.map((row) => ({
      id: row.id,
      name: shownName(row),
      role: row.animatorId === userId ? 'animator' : 'member',
      joinedAt: row.joinedAt.toISOString(),
      seenAt: row.seenAt?.toISOString() ?? null,
    })),
    invitationsReceived: received.map((row) => ({
      hiveId: row.hiveId,
      hiveName: shownName(row),
      at: row.at.toISOString(),
      refusedAt: row.refusedAt?.toISOString() ?? null,
    })),
    invitationsSent: sent.map((row) => ({
      hiveId: row.hiveId,
      inviteeHandle: row.inviteeHandle,
      at: row.at.toISOString(),
    })),
  }
}
