// Les écritures des ruches (R10) : créer, changer (nom, icône, qui invite, épingle), supprimer,
// quitter ou retirer un membre, confier l'animation, noter la visite de la page. Chaque geste est
// une transaction : tout se fait, ou rien. Les lectures sont dans load.ts.
//
// Les verrous, et leur ordre (relecture du plan, point 5). Deux demandes sur la même ruche peuvent
// arriver en même temps (deux membres qui partent, l'animateur qui confie l'animation à quelqu'un
// qui s'en va) ; sans verrou, chacune lirait l'état d'avant l'autre :
// 1. la ruche d'abord : `lockHive` prend sa ligne (`for no key update`). Sortie, retrait, animation,
//    changement et suppression le prennent tous : ils passent l'un après l'autre, et chacun relit
//    l'état (membres, animateur) sous ce verrou.
// 2. puis les lignes de hive_member qu'on va effacer (`for update`), avant de toucher aux projets.
//    Publier un projet « réservé » prend, lui, la ligne de son auteur dans hive_member en partage
//    (`lockMembershipForShare`, `for share`) avant d'écrire le projet : si l'auteur part au même
//    moment, l'un attend l'autre. La publication passée d'abord est rendue privée par le départ ;
//    celle qui arrive après ne trouve plus la ligne et répond 404.
// Pourquoi `for no key update` et pas `for update` : écrire un projet qui cite la ruche (sa clé
// étrangère `hive_id`) fait prendre à PostgreSQL un verrou « key share » sur la ligne de la ruche.
// `for update` l'attendrait, et la publication attendrait la sortie qui attend la publication :
// un interblocage. `for no key update` ne gêne pas ce verrou-là, mais deux `for no key update` (ou
// un `for update`) sur la même ligne passent bien l'un après l'autre.
// 3. les limites d'un membre (10 ruches créées, 20 rejointes) : `lockMemberHives`, un verrou
//    consultatif par membre, pris avant de compter. Rejoindre (routes des invitations) le prend
//    avant celui de la ruche, toujours dans cet ordre.
import { randomUUID } from 'node:crypto'
import { HIVE_LIMITS, type HiveCreate, type HivePatch } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { award } from '../game/award'
import { createdCountOf, hiveProjectFor, joinedCountOf } from './load'

/** Une transaction de Drizzle : le même objet que `db`, mais dont tout se valide ou s'annule ensemble. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const h = schema.hive
const hm = schema.hiveMember
const p = schema.project

/**
 * Prend la ligne de la ruche jusqu'à la fin de la transaction, et la rend (ou null si elle n'existe
 * plus). Le premier geste de toute écriture sur une ruche (en-tête du fichier, point 1).
 */
export const lockHive = async (tx: Tx, hiveId: string) => {
  const [row] = await tx.select().from(h).where(eq(h.id, hiveId)).for('no key update')
  return row ?? null
}

/**
 * Le verrou des limites d'un membre (10 créées, 20 rejointes), jusqu'à la fin de la transaction :
 * deux créations, ou deux acceptations, du même membre comptent l'une après l'autre, et la seconde
 * voit la ruche de la première. `pg_advisory_xact_lock` verrouille un nombre (pas une ligne),
 * calculé par `hashtextextended` depuis un texte lié ; il se libère seul à la fin de la transaction.
 */
export const lockMemberHives = async (tx: Tx, userId: string) => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`hive-limits:${userId}`}, 0))`,
  )
}

/**
 * Pour publier un projet « réservé » (routes des projets) : prend en partage la ligne de l'auteur
 * dans hive_member, et dit s'il est encore membre. Un départ au même moment attend la fin de la
 * publication (puis rend le projet privé) ; un départ déjà fait laisse false (réponse 404).
 */
export const lockMembershipForShare = async (tx: Tx, hiveId: string, userId: string) => {
  const rows = await tx
    .select({ userId: hm.userId })
    .from(hm)
    .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, userId)))
    .for('share')
  return rows.length > 0
}

/**
 * Une clé étrangère cassée (23503) : la ruche, ou un membre, a disparu pendant l'écriture (supprimé
 * par un autre geste). La réponse est alors 404, celle d'une ruche qui n'existe pas, jamais 500
 * (relecture du plan, point 5). Le code est sur l'erreur, ou sur sa cause (selon le pilote).
 */
export const isForeignKeyViolation = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  return [codeOf(error), error instanceof Error ? codeOf(error.cause) : undefined].includes('23503')
}

/**
 * Rend privés les projets réservés à cette ruche (tous, ou ceux d'un auteur) : un auteur qui part
 * les garde pour lui seul, une ruche supprimée les rend à leurs auteurs. Index partiel
 * project_hive_created_idx (hive_id, …) where visibility = 'hive'. La date de mise à jour du projet
 * ne change pas : il n'a pas été modifié par son auteur. Rend les identifiants des projets rendus
 * privés (`returning`) : le temps réel retire leur page à qui la regardait (R21, live/recheck.ts).
 */
const privatizeReserved = async (tx: Tx, hiveId: string, authorId?: string) => {
  const rows = await tx
    .update(p)
    .set({ visibility: 'private', hiveId: null })
    .where(
      and(
        eq(p.hiveId, hiveId),
        eq(p.visibility, 'hive'),
        authorId ? eq(p.authorId, authorId) : undefined,
      ),
    )
    .returning({ id: p.id })
  return rows.map((row) => row.id)
}

/**
 * R10, relecture de sécurité (A2) : avant de supprimer une ruche, ses copies du nom gardées pour
 * l'Activité (`hive_notice.hive_name`) sont vidées si un signalement ouvert vise la ruche, entière
 * ou son nom. Sans cela, la suppression ferait échapper la copie à la modération : `hive_id` des
 * traces passe à null (plus moyen de les retrouver), et le signalement devient « sans objet ».
 * Rend vrai si le nom est signalé (les traces « supprimée » écrites ensuite le prennent vide).
 * Index content_report_target_idx (target_kind, target_id), puis hive_notice_hive_idx (hive_id).
 */
const blankReportedCopies = async (tx: Tx, hiveId: string) => {
  const r = schema.contentReport
  const [open] = await tx
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.targetKind, 'hive'), eq(r.targetId, hiveId), eq(r.status, 'open')))
    .limit(1)
  if (!open) return false
  await tx
    .update(schema.hiveNotice)
    .set({ hiveName: '' })
    .where(eq(schema.hiveNotice.hiveId, hiveId))
  return true
}

/** Une ligne d'Activité gardée (`hive_notice`), avec la copie du nom de la ruche. */
const notice = (
  recipientId: string,
  kind: 'removed' | 'animator' | 'deleted',
  hive: { id: string | null; name: string },
  now: Date,
) => ({ id: randomUUID(), recipientId, kind, hiveId: hive.id, hiveName: hive.name, createdAt: now })

// ─── Créer ────────────────────────────────────────────────────────────────────────────────────────

/** La ruche créée, et le pollen que sa création a rapporté (R19 : 15, une par jour ; 0 sinon). */
export type CreateOutcome =
  | { id: string; pollen: number }
  | 'hives_created_limit'
  | 'hives_joined_limit'

/**
 * Crée une ruche : son créateur en est l'animateur, le seul membre, et l'auteur du nom. Sous le
 * verrou du membre, on recompte ses ruches créées (10) puis rejointes (20) : deux créations
 * simultanées ne passent pas toutes les deux la dernière place.
 *
 * R19 : la création rapporte son pollen dans la même transaction (`award`, dont le verrou de jeu se
 * prend après celui des limites : relecture de sécurité S1). Source : la ruche, une fois.
 */
export const createHive = (db: Database, creatorId: string, input: HiveCreate, now: Date) =>
  db.transaction(async (tx): Promise<CreateOutcome> => {
    await lockMemberHives(tx, creatorId)
    if ((await createdCountOf(tx, creatorId)) >= HIVE_LIMITS.created) return 'hives_created_limit'
    if ((await joinedCountOf(tx, creatorId)) >= HIVE_LIMITS.joined) return 'hives_joined_limit'
    const id = randomUUID()
    await tx.insert(h).values({
      id,
      name: input.name,
      icon: input.icon,
      animatorId: creatorId,
      nameSetBy: creatorId,
      createdBy: creatorId,
      createdAt: now,
      updatedAt: now,
    })
    // Il vient de la créer : sa première visite est maintenant (rien de neuf à lui montrer).
    await tx.insert(hm).values({ hiveId: id, userId: creatorId, joinedAt: now, seenAt: now })
    const pollen = await award(tx, {
      memberId: creatorId,
      gesture: 'hive_created',
      sourceKind: 'hive',
      sourceId: id,
      sourceKey: `hive:${id}`,
      now,
    })
    return { id, pollen }
  })

// ─── Changer ──────────────────────────────────────────────────────────────────────────────────────

export type ChangeOutcome = 'done' | 'not_found' | 'forbidden' | 'pin_not_visible'

/**
 * L'animateur change le nom, l'icône, qui invite, ou l'épingle (seulement les champs envoyés). Sous
 * le verrou de la ruche, on relit qu'il l'anime toujours (il a pu confier l'animation entre-temps).
 * Un nouveau nom efface la marque d'un nom retiré par la modération et désigne son auteur
 * (`name_set_by`, juridique C4). Une épingle doit être un projet que toute la ruche voit, et que
 * l'animateur voit (pas d'un membre bloqué avec lui) : sinon 422, le même pour un projet inconnu.
 */
export const changeHive = (
  db: Database,
  hiveId: string,
  animatorId: string,
  patch: HivePatch,
  now: Date,
) =>
  db.transaction(async (tx): Promise<ChangeOutcome> => {
    const hive = await lockHive(tx, hiveId)
    if (!hive) return 'not_found'
    if (hive.animatorId !== animatorId) return 'forbidden'
    const { pinnedProjectId } = patch
    if (pinnedProjectId) {
      const [visible] = await tx
        .select({ id: p.id })
        .from(p)
        .where(and(eq(p.id, pinnedProjectId), hiveProjectFor(hiveId, animatorId)))
      if (!visible) return 'pin_not_visible'
    }
    await tx
      .update(h)
      .set({
        ...(patch.name === undefined
          ? {}
          : { name: patch.name, nameRemovalId: null, nameSetBy: animatorId }),
        ...(patch.icon === undefined ? {} : { icon: patch.icon }),
        ...(patch.invitePolicy === undefined ? {} : { invitePolicy: patch.invitePolicy }),
        ...(pinnedProjectId === undefined
          ? {}
          : pinnedProjectId === null
            ? { pinnedProjectId: null, pinnedBy: null, pinnedAt: null }
            : { pinnedProjectId, pinnedBy: animatorId, pinnedAt: now }),
        updatedAt: now,
      })
      .where(eq(h.id, hiveId))
    return 'done'
  })

// ─── Supprimer ────────────────────────────────────────────────────────────────────────────────────

export type GestureOutcome = 'done' | 'not_found' | 'forbidden'

/**
 * R21 : ce qu'une suppression de ruche ou un départ a changé, pour le temps réel (routes/hives.ts) :
 * les projets rendus privés (leur page se retire à qui ne les voit plus), les membres concernés
 * (leur liste de ruches et leur Activité changent), et si la ruche a disparu.
 */
export type HiveDeparture = {
  privatized: readonly string[]
  /** Les membres qui lisent un avis neuf dans leur Activité (supprimée, retiré, nouvel animateur). */
  noticed: readonly string[]
  hiveDeleted: boolean
}
const NOTHING_CHANGED: HiveDeparture = { privatized: [], noticed: [], hiveDeleted: false }

/**
 * L'animateur supprime la ruche, en une transaction : ses projets réservés redeviennent privés pour
 * leurs auteurs, chaque autre membre lit « La ruche Famille a été supprimée. » dans son Activité,
 * puis la ruche part, avec ses membres et ses invitations (cascade). Les lignes de hive_member sont
 * prises (`for update`) avant les projets : une publication « réservée » en cours finit d'abord, et
 * son projet est rendu privé avec les autres (en-tête, point 2). Les traces gardées ne citent plus
 * la ruche (`hive_id` null) : elle n'existe plus, seule la copie du nom reste.
 */
export const deleteHive = (db: Database, hiveId: string, animatorId: string, now: Date) =>
  db.transaction(async (tx): Promise<'not_found' | 'forbidden' | HiveDeparture> => {
    const hive = await lockHive(tx, hiveId)
    if (!hive) return 'not_found'
    if (hive.animatorId !== animatorId) return 'forbidden'
    const members = await tx
      .select({ userId: hm.userId })
      .from(hm)
      .where(eq(hm.hiveId, hiveId))
      .for('update')
    const privatized = await privatizeReserved(tx, hiveId)
    const reported = await blankReportedCopies(tx, hiveId)
    const others = members.filter((member) => member.userId !== animatorId)
    if (others.length > 0) {
      await tx
        .insert(schema.hiveNotice)
        .values(
          others.map((member) =>
            notice(member.userId, 'deleted', { id: null, name: reported ? '' : hive.name }, now),
          ),
        )
    }
    await tx.delete(h).where(eq(h.id, hiveId))
    return { privatized, noticed: others.map((member) => member.userId), hiveDeleted: true }
  })

// ─── Quitter, retirer ─────────────────────────────────────────────────────────────────────────────

/**
 * Quitter (`actorId` = `memberId`) ou retirer un membre (l'animateur), en une transaction, sous le
 * verrou de la ruche :
 * 1. on relit les droits : le membre est-il encore là, l'acteur anime-t-il encore (un retrait) ?
 *    Un départ déjà fait répond « fait » (quitter deux fois ne change rien) ;
 * 2. sa ligne de membre est prise puis effacée, AVANT de rendre ses projets réservés privés : une
 *    publication réservée en cours finit d'abord, et son projet est rendu privé ici (en-tête) ;
 * 3. plus personne : la ruche est supprimée (ses invitations avec elle) ;
 * 4. l'animateur parti : l'animation passe au membre le plus ancien, qui en est prévenu ;
 * 5. un retrait (pas un départ) laisse au membre retiré « Tu ne fais plus partie de la ruche
 *    Famille. », sans dire qui l'a retiré.
 */
export const removeFromHive = (
  db: Database,
  hiveId: string,
  actorId: string,
  memberId: string,
  now: Date,
) =>
  db.transaction(async (tx): Promise<'not_found' | 'forbidden' | HiveDeparture> => {
    const leaving = actorId === memberId
    const hive = await lockHive(tx, hiveId)
    if (!hive) return leaving ? NOTHING_CHANGED : 'not_found'
    if (!leaving && hive.animatorId !== actorId) return 'forbidden'
    const gone = await tx
      .delete(hm)
      .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, memberId)))
      .returning({ userId: hm.userId })
    if (gone.length === 0) return leaving ? NOTHING_CHANGED : 'not_found'
    const privatized = await privatizeReserved(tx, hiveId, memberId)

    // Le plus ancien des membres restants (clé primaire de hive_member, lue par son début).
    const [oldest] = await tx
      .select({ userId: hm.userId })
      .from(hm)
      .where(and(eq(hm.hiveId, hiveId), ne(hm.userId, memberId)))
      .orderBy(asc(hm.joinedAt), asc(hm.userId))
      .limit(1)
    if (!oldest) {
      // Le dernier membre est parti : la ruche n'a plus personne. Ses projets réservés (il ne
      // devrait plus y en avoir) redeviennent privés d'abord, sinon leur clé étrangère l'empêcherait.
      const others = await privatizeReserved(tx, hiveId)
      await blankReportedCopies(tx, hiveId)
      await tx.delete(h).where(eq(h.id, hiveId))
      return { privatized: [...privatized, ...others], noticed: [], hiveDeleted: true }
    }
    const notices = []
    if (hive.animatorId === memberId || hive.animatorId === null) {
      await tx.update(h).set({ animatorId: oldest.userId, updatedAt: now }).where(eq(h.id, hiveId))
      notices.push(notice(oldest.userId, 'animator', hive, now))
    }
    if (!leaving) notices.push(notice(memberId, 'removed', hive, now))
    if (notices.length > 0) await tx.insert(schema.hiveNotice).values(notices)
    return {
      privatized,
      noticed: notices.map((one) => one.recipientId),
      hiveDeleted: false,
    }
  })

// ─── Confier l'animation ──────────────────────────────────────────────────────────────────────────

/**
 * L'animateur confie l'animation à un autre membre, sous le verrou de la ruche : on relit qu'il
 * l'anime toujours, et que l'autre est encore membre (parti juste avant : 404, l'animateur ne change
 * pas). L'autre lit « Tu animes maintenant la ruche Famille. » dans son Activité.
 */
export const handAnimation = (
  db: Database,
  hiveId: string,
  animatorId: string,
  successorId: string,
  now: Date,
) =>
  db.transaction(async (tx): Promise<GestureOutcome> => {
    const hive = await lockHive(tx, hiveId)
    if (!hive) return 'not_found'
    if (hive.animatorId !== animatorId) return 'forbidden'
    if (successorId === animatorId) return 'done'
    const [successor] = await tx
      .select({ userId: hm.userId })
      .from(hm)
      .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, successorId)))
      .for('share')
    if (!successor) return 'not_found'
    await tx.update(h).set({ animatorId: successorId, updatedAt: now }).where(eq(h.id, hiveId))
    await tx.insert(schema.hiveNotice).values(notice(successorId, 'animator', hive, now))
    return 'done'
  })

// ─── La visite ────────────────────────────────────────────────────────────────────────────────────

/**
 * Note la visite de la page (`seen_at`) : les nouveautés se comptent depuis. Une seule ligne, par la
 * clé primaire (hive_id, user_id) ; un membre parti entre-temps n'a plus de ligne, rien ne change.
 */
export const markHiveSeen = (db: Database, hiveId: string, userId: string, now: Date) =>
  db
    .update(hm)
    .set({ seenAt: now })
    .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, userId)))
