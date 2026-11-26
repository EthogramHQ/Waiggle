// Qui est bloqué avec qui (tranche 7b), en un seul endroit. Un blocage joue dans les deux sens :
// quand Malik bloque Inès, ni l'un ni l'autre ne voit plus les contenus de l'autre. Chaque lecture
// qui montre le geste d'un autre membre appelle l'une de ces aides, et aucune ne réécrit la règle.
import { type Database, schema } from '@ruche/db'
import { type Column, eq, inArray, or, type SQL, sql } from 'drizzle-orm'

const b = schema.memberBlock

/**
 * Vrai si le visiteur et le membre de cette colonne sont bloqués, dans un sens ou dans l'autre.
 * Deux `exists` plutôt qu'un seul avec « or » : chacun passe par un index (la clé primaire pour
 * « j'ai bloqué », `member_block_blocked_idx` pour « il m'a bloqué »), sans lire toute la table.
 * `exists (select 1 …)` : vrai dès qu'une ligne existe, sans la ramener.
 */
export const blockedWith = (viewerId: string, member: Column | SQL): SQL =>
  sql`(exists (select 1 from ${b} where ${b.blockerId} = ${viewerId} and ${b.blockedId} = ${member})
    or exists (select 1 from ${b} where ${b.blockedId} = ${viewerId} and ${b.blockerId} = ${member}))`

/** Le contraire : aucun blocage entre le visiteur et ce membre. */
export const notBlockedWith = (viewerId: string, member: Column | SQL): SQL =>
  sql`not ${blockedWith(viewerId, member)}`

/**
 * Les blocages d'un membre, pour les règles écrites en JavaScript (`sees` des commentaires) :
 * `byMe`, ceux qu'il a posés ; `ofMe`, ceux qui le visent. Deux ensembles, parce que l'appli ne dit
 * pas la même chose dans chaque sens (« un membre que tu as bloqué », « indisponible »).
 */
export type Blocks = { byMe: ReadonlySet<string>; ofMe: ReadonlySet<string> }

export const blocksOf = async (db: Pick<Database, 'select'>, viewerId: string): Promise<Blocks> => {
  const rows = await db
    .select({ blockerId: b.blockerId, blockedId: b.blockedId })
    .from(b)
    .where(or(eq(b.blockerId, viewerId), eq(b.blockedId, viewerId)))
  return {
    byMe: new Set(rows.filter((r) => r.blockerId === viewerId).map((r) => r.blockedId)),
    ofMe: new Set(rows.filter((r) => r.blockedId === viewerId).map((r) => r.blockerId)),
  }
}

/**
 * R21 (le temps réel, live/emit.ts) : pour quelques membres à la fois (l'auteur d'un geste, l'auteur
 * du projet), tous ceux avec qui chacun est bloqué, dans un sens ou dans l'autre, sans distinguer le
 * sens. Une seule requête : « blocker_id in (…) or blocked_id in (…) », par la clé primaire
 * (blocker_id, blocked_id) et member_block_blocked_idx. Les identifiants entrent comme valeurs liées.
 */
export const blockPartnersOf = async (
  db: Pick<Database, 'select'>,
  memberIds: readonly string[],
): Promise<Map<string, Set<string>>> => {
  const partners = new Map<string, Set<string>>(memberIds.map((id) => [id, new Set<string>()]))
  if (memberIds.length === 0) return partners
  const rows = await db
    .select({ blockerId: b.blockerId, blockedId: b.blockedId })
    .from(b)
    .where(or(inArray(b.blockerId, [...memberIds]), inArray(b.blockedId, [...memberIds])))
  for (const row of rows) {
    partners.get(row.blockerId)?.add(row.blockedId)
    partners.get(row.blockedId)?.add(row.blockerId)
  }
  return partners
}

/** Aucun blocage : pour un visiteur anonyme, ou une lecture qui n'en dépend pas. */
export const noBlocks: Blocks = { byMe: new Set(), ofMe: new Set() }
