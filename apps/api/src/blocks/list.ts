// Lire ses propres blocages (tranche 7b) : la liste « Membres bloqués » (GET /v1/me/blocks), page
// par page, et la partie `blocks` de l'export de ses données. Jamais les blocages qui visent le
// membre : chaque requête part de blocker_id = lui, et de rien d'autre.
import { BLOCKS_PAGE_SIZE, type BlockExport, type BlockedPage, MemberId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ensureHandle } from '../handles/claim'
import { currentHandleOf } from '../handles/load'
import { mediaUrl } from '../profile/me'

const b = schema.memberBlock

// ─── Le curseur ──────────────────────────────────────────────────────────────────────────────────

/**
 * Le curseur de la liste : la date du dernier blocage de la page et l'identifiant du membre bloqué.
 * Le curseur commun (cursor.ts) attend un uuid, or l'identifiant d'un membre n'en est pas un (il
 * vient de Better Auth) : celui-ci le vérifie avec MemberId, la forme de tout identifiant de membre.
 * strictObject refuse tout champ de plus ; la date est bornée comme dans cursor.ts (PostgreSQL
 * refuse l'an 0 : une erreur 500 au lieu d'un refus 400).
 */
const BlocksCursor = z.strictObject({
  at: z.iso.datetime().refine((at) => at >= '2000', 'date trop ancienne'),
  id: MemberId,
})
type BlocksCursor = z.infer<typeof BlocksCursor>

const encodeCursor = (content: BlocksCursor) =>
  Buffer.from(JSON.stringify(content), 'utf8').toString('base64url')

/** null sans curseur (la première page) ; 'invalid' pour un curseur qui ne veut rien dire. */
export const readBlocksCursor = (cursor: string | undefined): BlocksCursor | null | 'invalid' => {
  if (cursor === undefined) return null
  try {
    const parsed = BlocksCursor.safeParse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    )
    return parsed.success ? parsed.data : 'invalid'
  } catch {
    return 'invalid' // pas du JSON
  }
}

/**
 * « Après le curseur », dans l'ordre de la liste (date desc, puis identifiant desc) : la même
 * comparaison de couples que cursor.ts (`after`), mais avec un identifiant texte. Les deux valeurs
 * viennent du client : elles n'entrent dans la requête que comme paramètres liés ; la date passe
 * par la colonne (sql.param), qui l'écrit comme elle écrit ses valeurs.
 */
const afterCursor = (cursor: BlocksCursor): SQL =>
  sql`(${b.createdAt}, ${b.blockedId}) < (${sql.param(new Date(cursor.at), b.createdAt)}::timestamp, ${cursor.id})`

// ─── La liste ────────────────────────────────────────────────────────────────────────────────────

/**
 * Une page de la liste « Membres bloqués », du plus récent au plus ancien, en une requête (plus le
 * filet des pseudos, ci-dessous). Pour chaque membre : son nom, son pseudo actuel et sa photo, de
 * quoi le reconnaître et le débloquer ; rien d'autre (ni bio, ni projets).
 *
 * En SQL : select … from member_block join "user" on id = blocked_id left join profile …
 * left join member_handle (pseudo actuel) where blocker_id = $moi [and (created_at, blocked_id) <
 * (curseur)] order by created_at desc, blocked_id desc limit 51. La clé primaire (blocker_id,
 * blocked_id) trouve les blocages du membre ; ils sont rangés en mémoire, ce qui reste court (au
 * plus 100 nouveaux par jour). On en lit un de plus que la page : s'il existe, il y a une suite.
 */
export const loadBlockedPage = async (
  db: Database,
  viewerId: string,
  cursor: BlocksCursor | null,
  publicApiUrl: string,
): Promise<BlockedPage> => {
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      handle: schema.memberHandle.handle,
      avatarKey: schema.profile.avatarKey,
      blockedAt: b.createdAt,
    })
    .from(b)
    // innerJoin : un compte supprimé n'a plus de ligne de blocage (cascade) ; la jointure ne perd
    // donc personne.
    .innerJoin(schema.user, eq(schema.user.id, b.blockedId))
    .leftJoin(schema.profile, eq(schema.profile.userId, b.blockedId))
    .leftJoin(schema.memberHandle, currentHandleOf(b.blockedId))
    .where(and(eq(b.blockerId, viewerId), cursor ? afterCursor(cursor) : undefined))
    .orderBy(desc(b.createdAt), desc(b.blockedId))
    .limit(BLOCKS_PAGE_SIZE + 1)

  const page = rows.slice(0, BLOCKS_PAGE_SIZE)
  const items = []
  for (const row of page) {
    // Un membre d'avant la tranche 6a, pas encore servi par le rattrapage du démarrage : il reçoit
    // son pseudo ici, en filet (comme sa page, routes/members.ts). Le cas est rare (le rattrapage
    // passe à chaque démarrage) : une requête de plus seulement pour lui. Le garder dans la liste
    // compte plus que l'écarter : sans lui, on ne pourrait plus le débloquer.
    const handle = row.handle ?? (await ensureHandle(db, row.id))
    if (handle === null) continue
    items.push({
      member: {
        id: row.id,
        name: row.name,
        handle,
        avatarUrl: row.avatarKey ? mediaUrl(publicApiUrl, row.avatarKey) : null,
      },
      blockedAt: row.blockedAt.toISOString(),
    })
  }
  const last = page.at(-1)
  return {
    items,
    nextCursor:
      rows.length > BLOCKS_PAGE_SIZE && last
        ? encodeCursor({ at: last.blockedAt.toISOString(), id: last.id })
        : null,
  }
}

// ─── L'export ────────────────────────────────────────────────────────────────────────────────────

/**
 * Les blocages posés par le membre, pour l'export de ses données : des plus anciens aux plus
 * récents, avec l'identifiant, le pseudo actuel (null s'il n'en a pas encore) et la date. Jamais
 * qui l'a bloqué : ce n'est pas son geste, et le lui dire trahirait le blocage. Une requête ; la
 * clé primaire (blocker_id, …) trouve ses blocages.
 */
export const blocksOfMember = async (db: Database, viewerId: string): Promise<BlockExport[]> => {
  const rows = await db
    .select({ memberId: b.blockedId, handle: schema.memberHandle.handle, blockedAt: b.createdAt })
    .from(b)
    .leftJoin(schema.memberHandle, currentHandleOf(b.blockedId))
    .where(eq(b.blockerId, viewerId))
    .orderBy(asc(b.createdAt), asc(b.blockedId))
  return rows.map((row) => ({ ...row, blockedAt: row.blockedAt.toISOString() }))
}
