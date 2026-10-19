// Donner et changer un pseudo (tranche 6a). Trois portes d'entrée :
// - ensureHandle : un membre vérifié sans pseudo en reçoit un, fabriqué à partir de son nom
//   (après la vérification de son adresse, et en filet dans « Mon profil » et sur sa page) ;
// - backfillHandles : la même chose pour tous les membres d'avant la tranche, au démarrage
//   (avec purgeExpiredHandles, qui efface les réservations finies) ;
// - claimHandle : un membre choisit lui-même son pseudo (PATCH /v1/me).
// La table member_handle est décrite dans packages/db/src/schema/handles.ts.
import { type Database, schema } from '@ruche/db'
import { defaultLanguage, type Language, supportedLanguages } from '@ruche/i18n'
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm'
import { describeError } from '../log'
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
 *    erreur, et « returning » ne renvoie aucune ligne. On essaie alors le candidat suivant. Si le
 *    refus vient de l'index unique partiel member_handle_current_idx (ce membre a déjà un pseudo
 *    actuel), on renvoie celui-là ; giveHandle, qui tient le verrou du membre, l'évite déjà.
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
  // Le cas courant, sans transaction ni verrou : le membre a déjà son pseudo.
  const existing = await currentHandle(db, userId)
  if (existing) return existing
  return giveHandle(db, userId, new Date())
}

/**
 * Verrouille la ligne du membre dans `user` jusqu'à la fin de la transaction `tx`, et la renvoie
 * (undefined : membre inconnu). Toute écriture de pseudo pour un membre passe par ce verrou :
 * ensureHandle, le rattrapage et claimHandle passent donc l'un après l'autre pour un même membre.
 *
 * « for no key update » : un verrou sur la ligne, tenu jusqu'à la fin de la transaction. Un second
 * verrou demandé sur la même ligne attend ici. Ce verrou-là (et non « for update ») laisse passer
 * les écritures qui ne font que pointer vers le membre (un commentaire, une réaction), qui n'ont
 * pas à attendre.
 */
const lockMember = async (tx: Database, userId: string) => {
  const [member] = await tx
    .select({
      id: schema.user.id,
      name: schema.user.name,
      language: schema.user.language,
      emailVerified: schema.user.emailVerified,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .for('no key update')
  return member
}

/**
 * Donne un pseudo à un membre vérifié qui n'en a pas, dans une petite transaction qui tient le
 * verrou du membre (lockMember). Sans ce verrou, un changement de pseudo (PATCH /v1/me) qui croise
 * ce filet pouvait écrire un second pseudo actuel : la base le refusait (index unique partiel
 * member_handle_current_idx) et le membre recevait une erreur 500. Avec lui, le second arrivé
 * attend le premier, puis relit le pseudo actuel : il le trouve, et ne fait rien.
 */
const giveHandle = (db: Database, userId: string, now: Date): Promise<string | null> =>
  db.transaction(async (tx) => {
    const member = await lockMember(tx, userId)
    if (!member?.emailVerified) return null
    const existing = await currentHandle(tx, userId)
    if (existing) return existing
    return assignHandle(tx, member, now)
  })

/**
 * Le rattrapage : donne un pseudo à chaque membre vérifié qui n'en a pas (les comptes d'avant la
 * tranche 6a), du plus ancien au plus récent : entre homonymes, le premier inscrit reçoit le
 * pseudo sans numéro. Lancé à chaque démarrage de l'API ; une fois tout le monde servi, la
 * requête ne trouve plus personne et rien ne change. Renvoie le nombre de pseudos donnés.
 *
 * La requête : « user left join member_handle … where member_handle.handle is null », les membres
 * sans ligne de pseudo actuel (une « anti-jointure »). La jointure suit l'index partiel
 * member_handle_current_idx.
 *
 * Une panne pour un membre (une donnée inattendue, une erreur de la base) ne doit ni arrêter le
 * démarrage de l'API, ni priver les suivants de leur pseudo : elle est notée dans les logs, avec
 * l'identifiant du membre (jamais son nom ni son adresse, voir log.ts), et on passe au suivant.
 * Il recevra son pseudo en filet, à sa prochaine visite, ou au prochain démarrage.
 */
export const backfillHandles = async (db: Database): Promise<number> => {
  const members = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .leftJoin(h, currentHandleOf(schema.user.id))
    .where(and(eq(schema.user.emailVerified, true), isNull(h.handle)))
    .orderBy(asc(schema.user.createdAt), asc(schema.user.id))
  const now = new Date()
  let given = 0
  // Un membre après l'autre, et non tous à la fois : le numéro de chacun dépend des précédents.
  // Chacun a sa propre transaction : la panne de l'un n'annule pas le pseudo des autres.
  for (const member of members) {
    try {
      if (await giveHandle(db, member.id, now)) given += 1
    } catch (error) {
      console.error('Handle not given at startup', {
        userId: member.id,
        ...describeError(error, { method: 'STARTUP', path: 'backfillHandles' }),
      })
    }
  }
  return given
}

/**
 * Efface les anciens pseudos dont la réservation est finie (libérés il y a 30 jours ou plus).
 * Libres, ils l'étaient déjà pour les autres membres ; les effacer tient la promesse faite au
 * membre : son ancien pseudo n'est pas gardé plus longtemps que la réservation. Lancé au démarrage
 * de l'API, à côté du rattrapage. Renvoie le nombre de lignes effacées.
 *
 * La requête : « delete from member_handle where released_at <= limite ». Aucun index ne porte
 * sur released_at : PostgreSQL lit toute la table. C'est voulu : une fois par démarrage, sur une
 * petite table (un pseudo actuel par membre, au plus un ancien). Les pseudos actuels
 * (released_at null) ne sont jamais concernés : « null <= une date » n'est pas vrai.
 */
export const purgeExpiredHandles = async (db: Database, now: Date): Promise<number> => {
  const purged = await db
    .delete(h)
    .where(lte(h.releasedAt, reservationCutoff(now)))
    .returning({ handle: h.handle })
  return purged.length
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
  // Le verrou du membre : un second changement simultané de sa part, ou un pseudo donné en filet
  // (ensureHandle), attend la fin de cette transaction.
  await lockMember(tx, userId)

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

  // Ses anciens pseudos, sauf celui qu'il reprend peut-être (index member_handle_user_idx). Ses
  // réservations finies partent donc ici aussi : après un changement, il ne lui reste au plus que
  // l'ancien pseudo qu'il vient de quitter.
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
