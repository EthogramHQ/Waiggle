// Donner et changer un pseudo (tranche 6a). Trois portes d'entrée :
// - ensureHandle : un membre vérifié sans pseudo en reçoit un, fabriqué à partir de son nom
//   (après la vérification de son adresse, et en filet dans « Mon profil » et sur sa page) ;
// - backfillHandles : la même chose pour tous les membres d'avant la tranche, au démarrage ;
// - claimHandle : un membre choisit lui-même son pseudo (PATCH /v1/me).
// La table member_handle est décrite dans packages/db/src/schema/handles.ts.
import { type Database, schema } from '@ruche/db'
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm'
import { currentHandle, currentHandleOf, reservationCutoff } from './load'
import { handleBase, handleCandidates } from './suggest'

const h = schema.memberHandle

/** Le pseudo demandé est pris par un autre membre, ou lui reste réservé (409 handle_taken). */
export class HandleTakenError extends Error {
  constructor() {
    super('handle taken')
    this.name = 'HandleTakenError'
  }
}

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (supportedLanguages as readonly string[]).includes(value)

// Combien de candidats on regarde à la fois : « ines_morel », « ines_morel2 »… « ines_morel20 ».
// Une seule requête suffit presque toujours ; au-delà, on regarde les 20 suivants.
const BATCH = 20

type Newcomer = { id: string; name: string; language: string }

/**
 * Donne à un membre le premier pseudo libre de sa base (voir suggest.ts) et le renvoie.
 *
 * 1. Une requête lit les lignes des 20 premiers candidats (« handle = any(…) », par la clé
 *    primaire). Un candidat sans ligne, ou dont la réservation est finie, est libre.
 * 2. On l'insère avec « on conflict do nothing … returning » : si un autre membre l'a pris entre
 *    la lecture et l'écriture (deux inscriptions au même instant), la base refuse le doublon sans
 *    erreur, et « returning » ne renvoie aucune ligne. On essaie alors le candidat suivant. Le même
 *    refus arrive si ce membre a reçu un pseudo entre-temps (deux appels simultanés pour lui :
 *    l'index unique partiel member_handle_current_idx) : on renvoie alors celui-là.
 */
const assignHandle = async (db: Database, member: Newcomer, now: Date): Promise<string> => {
  const base = handleBase(
    member.name,
    isLanguage(member.language) ? member.language : defaultLanguage,
  )
  const cutoff = reservationCutoff(now)
  for (let from = 0; ; from += BATCH) {
    const candidates = handleCandidates(base, from, BATCH)
    if (candidates.length === 0) throw new Error('no free handle for this name')
    const rows = await db
      .select({ handle: h.handle, releasedAt: h.releasedAt })
      .from(h)
      .where(inArray(h.handle, candidates))
    const found = new Map(rows.map((row) => [row.handle, row.releasedAt]))

    for (const candidate of candidates) {
      const releasedAt = found.get(candidate)
      // undefined : aucune ligne. null : le pseudo actuel de quelqu'un. Une date : un ancien
      // pseudo, encore réservé si la date est après la limite.
      if (releasedAt === null || (releasedAt && releasedAt > cutoff)) continue
      if (releasedAt) {
        // Un ancien pseudo dont la réservation est finie : on efface sa ligne pour le reprendre.
        // La condition est redite (lte) : si son propriétaire vient de le reprendre, rien n'est effacé.
        await db.delete(h).where(and(eq(h.handle, candidate), lte(h.releasedAt, cutoff)))
      }
      const [inserted] = await db
        .insert(h)
        .values({ handle: candidate, userId: member.id, claimedAt: now })
        .onConflictDoNothing()
        .returning({ handle: h.handle })
      if (inserted) return inserted.handle
      const already = await currentHandle(db, member.id)
      if (already) return already
    }
  }
}

/**
 * Le pseudo actuel d'un membre ; s'il n'en a pas encore et que son adresse est vérifiée, il en
 * reçoit un. null : membre inconnu, ou jamais vérifié (un tel compte ne bloque aucun pseudo).
 * Sûr si on l'appelle plusieurs fois, même en même temps (voir assignHandle).
 */
export const ensureHandle = async (db: Database, userId: string): Promise<string | null> => {
  const existing = await currentHandle(db, userId)
  if (existing) return existing
  const [member] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      language: schema.user.language,
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
  if (!member?.emailVerified) return null
  return assignHandle(db, member, new Date())
}

/**
 * Le rattrapage : donne un pseudo à chaque membre vérifié qui n'en a pas (les comptes d'avant la
 * tranche 6a), du plus ancien au plus récent : entre homonymes, le premier inscrit reçoit le
 * pseudo sans numéro. Lancé à chaque démarrage de l'API ; une fois tout le monde servi, la
 * requête ne trouve plus personne et rien ne change. Renvoie le nombre de pseudos donnés.
 *
 * La requête : « user left join member_handle … where member_handle.handle is null », les membres
 * sans ligne de pseudo actuel (une « anti-jointure »). La jointure suit l'index partiel
 * member_handle_current_idx.
 */
export const backfillHandles = async (db: Database): Promise<number> => {
  const members = await db
    .select({ id: schema.user.id, name: schema.user.name, language: schema.user.language })
    .from(schema.user)
    .leftJoin(h, currentHandleOf(schema.user.id))
    .where(and(eq(schema.user.emailVerified, true), isNull(h.handle)))
    .orderBy(asc(schema.user.createdAt), asc(schema.user.id))
  const now = new Date()
  // Un membre après l'autre, et non tous à la fois : le numéro de chacun dépend des précédents.
  for (const member of members) await assignHandle(db, member, now)
  return members.length
}

/**
 * Change le pseudo d'un membre, dans la transaction `tx` de PATCH /v1/me (avec le reste du
 * profil : si le pseudo est pris, rien n'est enregistré). `handle` est déjà nettoyé et vérifié
 * (schéma Handle des contrats). Lève HandleTakenError s'il est pris ou réservé par un autre :
 * l'erreur annule la transaction entière.
 *
 * Renvoie false si c'est déjà son pseudo actuel (rien à faire), true sinon. Dans l'ordre :
 * 1. verrouiller le membre, pour que deux changements de sa part passent l'un après l'autre ;
 * 2. regarder qui a ce pseudo : personne (ou une réservation finie, qu'on efface), lui-même (son
 *    ancien, qu'il reprend), ou un autre (refus) ;
 * 3. effacer ses autres anciens pseudos : seul le dernier reste réservé, il ne peut pas en
 *    accaparer ;
 * 4. marquer l'actuel comme ancien (released_at = maintenant), puis écrire le nouveau.
 */
export const claimHandle = async (
  tx: Database,
  userId: string,
  handle: string,
  now: Date,
): Promise<boolean> => {
  // « for no key update » : un verrou sur la ligne du membre, tenu jusqu'à la fin de la
  // transaction. Un second changement simultané de sa part attend ici. Ce verrou-là (et non « for
  // update ») laisse passer les écritures qui ne font que pointer vers le membre (un commentaire,
  // une réaction), qui n'ont pas à attendre.
  await tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .for('no key update')

  const current = await currentHandle(tx, userId)
  if (current === handle) return false

  const cutoff = reservationCutoff(now)
  const [owner] = await tx
    .select({ userId: h.userId, releasedAt: h.releasedAt })
    .from(h)
    .where(eq(h.handle, handle))
  if (owner) {
    const expired = owner.releasedAt !== null && owner.releasedAt <= cutoff
    if (expired) {
      await tx.delete(h).where(and(eq(h.handle, handle), lte(h.releasedAt, cutoff)))
    } else if (owner.userId !== userId) {
      throw new HandleTakenError()
    }
  }

  // Ses anciens pseudos, sauf celui qu'il reprend peut-être (index member_handle_user_idx).
  await tx.delete(h).where(and(eq(h.userId, userId), isNotNull(h.releasedAt), ne(h.handle, handle)))
  if (current) {
    await tx.update(h).set({ releasedAt: now }).where(eq(h.handle, current))
  }

  // Le nouveau pseudo : une ligne neuve, ou son ancien qu'il reprend (« on conflict do update »,
  // seulement si la ligne est à lui : setWhere). Si un autre membre l'a pris entre la lecture
  // ci-dessus et maintenant, la base refuse le doublon, rien n'est renvoyé : c'est un refus.
  const [taken] = await tx
    .insert(h)
    .values({ handle, userId, claimedAt: now, releasedAt: null })
    .onConflictDoUpdate({
      target: h.handle,
      set: { claimedAt: now, releasedAt: null },
      setWhere: eq(h.userId, userId),
    })
    .returning({ handle: h.handle })
  if (!taken) throw new HandleTakenError()
  return true
}
