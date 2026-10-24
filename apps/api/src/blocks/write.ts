// Bloquer et débloquer un membre (tranche 7b), et le verrou que bloquer partage avec suivre. Les
// lectures (qui est bloqué avec qui) sont dans visibility.ts ; ici, seulement les écritures.
import { type Database, schema } from '@ruche/db'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

/** Une transaction de Drizzle : le même objet que `db`, mais dont tout se valide ou s'annule ensemble. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const b = schema.memberBlock

/**
 * Prend le verrou d'une paire de membres, jusqu'à la fin de la transaction (règle 5 de la relecture
 * du plan). Bloquer et suivre le prennent tous les deux : si Malik suit Inès au moment où Inès le
 * bloque, l'une des deux transactions attend que l'autre soit finie. Sans lui, le suivi pourrait
 * vérifier « pas de blocage », puis le blocage effacer les abonnements, puis le suivi écrire le
 * sien : un abonnement resterait malgré le blocage.
 *
 * `pg_advisory_xact_lock(n)` : un verrou « consultatif » de PostgreSQL. Il ne verrouille aucune
 * ligne, seulement le nombre n : deux transactions qui demandent le même n passent l'une après
 * l'autre ; « xact » : il se libère tout seul à la fin de la transaction (validée ou annulée).
 * `hashtextextended(texte, 0)` change le texte de la paire en ce nombre (64 bits). La paire est
 * rangée (le plus petit identifiant d'abord) : « Malik et Inès » et « Inès et Malik » prennent le
 * même verrou. Le texte n'entre dans la requête que comme paramètre lié.
 */
export const lockPair = async (tx: Tx, memberA: string, memberB: string) => {
  const [first, second] = memberA < memberB ? [memberA, memberB] : [memberB, memberA]
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`block:${first}:${second}`}, 0))`,
  )
}

/**
 * La condition « ce membre-là existe pour moi » de PUT /v1/members/{id}/block et de la page d'un
 * membre (règle 6) : un compte vérifié, qui ne m'a pas bloqué, à moins que je l'aie bloqué aussi (un
 * double blocage se lit « je l'ai bloqué »). « Il m'a bloqué » se lit ainsi dans le même `where` que
 * « inconnu » : la réponse est la même, mot pour mot.
 *
 * Les deux `exists` passent chacun par la clé primaire (blocker_id, blocked_id) de member_block.
 * `memberId` est la colonne (ou la valeur) de l'identifiant du membre regardé.
 */
export const reachableBy = (viewerId: string, memberId: string) =>
  and(
    eq(schema.user.id, memberId),
    eq(schema.user.emailVerified, true),
    sql`(not exists (select 1 from ${b} where ${b.blockerId} = ${memberId} and ${b.blockedId} = ${viewerId})
      or exists (select 1 from ${b} where ${b.blockerId} = ${viewerId} and ${b.blockedId} = ${memberId}))`,
  )

/**
 * Malik bloque Inès, dans une transaction : tout se fait, ou rien. Renvoie false si Inès n'existe
 * pas pour lui (inconnue, jamais vérifiée, ou qui l'a bloqué), sans rien écrire.
 *
 * 1. le verrou de la paire, partagé avec suivre (ci-dessus) ;
 * 2. Inès est-elle là pour lui ? relu sous le verrou : un blocage posé par Inès juste avant est vu ;
 * 3. la ligne du blocage, « on conflict do nothing » : bloquer deux fois ne change rien ;
 * 4. les abonnements retirés dans les deux sens : Malik ne suit plus Inès ni ses projets, Inès ne
 *    suit plus Malik ni ses projets. Ils ne reviennent pas au déblocage (scénario).
 *
 * La date vient de l'horloge de JavaScript (`now`) : elle range la liste « Membres bloqués », et
 * les tests la maîtrisent ainsi.
 */
export const blockMember = (
  db: Database,
  blockerId: string,
  blockedId: string,
  now: Date,
): Promise<boolean> =>
  db.transaction(async (tx) => {
    await lockPair(tx, blockerId, blockedId)
    const [member] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(reachableBy(blockerId, blockedId))
    if (!member) return false

    await tx.insert(b).values({ blockerId, blockedId, createdAt: now }).onConflictDoNothing()

    // Les abonnements de membre à membre, dans les deux sens. La clé primaire (follower_id,
    // member_id) trouve chacune des deux lignes.
    const mf = schema.memberFollow
    await tx
      .delete(mf)
      .where(
        or(
          and(eq(mf.followerId, blockerId), eq(mf.memberId, blockedId)),
          and(eq(mf.followerId, blockedId), eq(mf.memberId, blockerId)),
        ),
      )
    // Les abonnements aux projets de l'autre, dans les deux sens. La sous-requête « les projets de
    // cet auteur » passe par l'index project_author_created_idx (qui commence par author_id) ; la clé primaire (follower_id, project_id)
    // trouve ensuite les abonnements de chacun.
    const pf = schema.projectFollow
    const projectsOf = (authorId: string) =>
      tx
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(eq(schema.project.authorId, authorId))
    await tx
      .delete(pf)
      .where(
        or(
          and(eq(pf.followerId, blockerId), inArray(pf.projectId, projectsOf(blockedId))),
          and(eq(pf.followerId, blockedId), inArray(pf.projectId, projectsOf(blockerId))),
        ),
      )
    return true
  })

/**
 * Malik débloque Inès : la ligne s'efface, sans historique (débloquer ne laisse aucune trace). Rien
 * d'autre n'est lu : la réponse est la même que la ligne ait existé ou non, qu'Inès existe ou non,
 * et un blocage posé par Inès reste (on ne défait que les siens). Clé primaire.
 */
export const unblockMember = async (db: Database, blockerId: string, blockedId: string) => {
  await db.delete(b).where(and(eq(b.blockerId, blockerId), eq(b.blockedId, blockedId)))
}

/** Un blocage entre ces deux membres, dans un sens ou dans l'autre (deux lignes possibles). */
export const blockedPair = async (
  db: Pick<Database, 'select'>,
  memberA: string,
  memberB: string,
) => {
  const rows = await db
    .select({ blockerId: b.blockerId })
    .from(b)
    .where(
      or(
        and(eq(b.blockerId, memberA), eq(b.blockedId, memberB)),
        and(eq(b.blockerId, memberB), eq(b.blockedId, memberA)),
      ),
    )
    .limit(1)
  return rows.length > 0
}
