// Le pseudo provisoire (R9, relecture de sécurité P3) : quand la modération retire le pseudo d'un
// membre, il reçoit « membre_4f2a » (quatre signes au hasard) jusqu'à ce qu'il en choisisse un
// autre. L'ancien pseudo reste réservé 30 jours à tout le monde, son ancien propriétaire compris :
// sa ligne garde la décision qui l'a retiré (`held_by_removal`). Les choix et les refus d'un pseudo
// sont dans claim.ts ; ce fichier n'écrit que pour la modération.
import { randomInt } from 'node:crypto'
import { type Database, schema } from '@ruche/db'
import { and, eq, isNull, lte } from 'drizzle-orm'
import { reservationCutoff } from './load'

const h = schema.memberHandle

/** Les signes du pseudo provisoire : des minuscules et des chiffres, comme un pseudo choisi. */
const SIGNS = 'abcdefghijklmnopqrstuvwxyz0123456789'
/** Essais avant d'abandonner : 36⁴ ≈ 1,7 million de pseudos, une collision est déjà rare. */
const TRIES = 5

const randomProvisional = () =>
  `membre_${Array.from({ length: 4 }, () => SIGNS[randomInt(SIGNS.length)]).join('')}`

/**
 * Le même verrou que claim.ts (« for no key update » sur la ligne du membre) : un changement de
 * pseudo du membre (PATCH /v1/me), qui le prend aussi, attend la fin de la décision, puis relit son
 * pseudo actuel.
 */
const lockMember = (tx: Database, userId: string) =>
  tx
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .for('no key update')

/**
 * Retire le pseudo actuel du membre pour la décision `removalId`, et lui en donne un provisoire.
 * Rend l'ancien et le provisoire (gardés dans la décision), ou null s'il n'avait pas de pseudo.
 * Ni `markHandleChosen` (ce pseudo n'est pas choisi), ni effacement de ses anciens pseudos.
 */
export const provisionalHandle = async (
  tx: Database,
  userId: string,
  removalId: string,
  now: Date,
): Promise<{ previous: string; provisional: string } | null> => {
  await lockMember(tx, userId)
  // Le pseudo actuel (index member_handle_current_idx : user_id, où released_at est null).
  const [current] = await tx
    .select({ handle: h.handle })
    .from(h)
    .where(and(eq(h.userId, userId), isNull(h.releasedAt)))
  if (!current) return null
  // L'ancien devient réservé, marqué par la décision : personne ne le reprend avant 30 jours.
  await tx
    .update(h)
    .set({ releasedAt: now, heldByRemoval: removalId })
    .where(eq(h.handle, current.handle))
  for (let i = 0; i < TRIES; i++) {
    const handle = randomProvisional()
    // « on conflict do nothing » : un pseudo déjà pris (ou réservé) ne rend aucune ligne, sans
    // erreur ni transaction abandonnée ; on en tire un autre.
    const [taken] = await tx
      .insert(h)
      .values({ handle, userId, claimedAt: now, releasedAt: null })
      .onConflictDoNothing()
      .returning({ handle: h.handle })
    if (taken) return { previous: current.handle, provisional: taken.handle }
  }
  throw new Error('No free provisional handle')
}

/**
 * Rend son ancien pseudo au membre, au rétablissement du retrait `removalId` (décision L3 de Louis,
 * 13/11/2026), seulement si le provisoire est encore son pseudo actuel (sinon il en a choisi un
 * autre, qu'il garde) et si l'ancien est libre : encore à lui, jamais réclamé, ou réservé à un autre
 * dont la réservation est finie. Sinon il garde le provisoire. Rend vrai si l'ancien est revenu.
 */
export const restoreHandle = async (
  tx: Database,
  userId: string,
  { previous, provisional }: { previous: string; provisional: string },
  now: Date,
): Promise<boolean> => {
  await lockMember(tx, userId)
  const [current] = await tx
    .select({ handle: h.handle })
    .from(h)
    .where(and(eq(h.userId, userId), isNull(h.releasedAt)))
  if (current?.handle !== provisional) return false
  const [owner] = await tx
    .select({ userId: h.userId, releasedAt: h.releasedAt })
    .from(h)
    .where(eq(h.handle, previous))
  const expired = owner?.releasedAt != null && owner.releasedAt <= reservationCutoff(now)
  // Un pseudo actuel d'un autre n'est jamais « fini » (released_at null) : refusé ici aussi.
  if (owner && owner.userId !== userId && !expired) return false
  // Le provisoire n'a jamais été choisi : il part, et l'ancien redevient le pseudo actuel.
  await tx.delete(h).where(eq(h.handle, provisional))
  if (owner && owner.userId !== userId) {
    // La réservation d'un autre est finie : on l'efface (comme claimHandle), puis on le reprend.
    await tx.delete(h).where(and(eq(h.handle, previous), lte(h.releasedAt, reservationCutoff(now))))
  }
  await tx
    .insert(h)
    .values({ handle: previous, userId, claimedAt: now, releasedAt: null })
    .onConflictDoUpdate({
      target: h.handle,
      set: { claimedAt: now, releasedAt: null, heldByRemoval: null },
      setWhere: eq(h.userId, userId),
    })
  return true
}
