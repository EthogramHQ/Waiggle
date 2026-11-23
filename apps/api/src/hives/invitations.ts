// Les invitations d'une ruche (R10) : inviter un membre, accepter (rejoindre la ruche), refuser sans
// prévenir personne. Les routes sont dans routes/hive-invitations.ts ; la liste des invitations
// reçues (l'onglet Ruches) dans load.ts (`invitationsOf`).
//
// Une invitation vaut 30 jours (`invitationValidSince`). Refusée, elle reste en base, datée
// (`refused_at`) : l'invité ne la voit plus, mais la ruche la compte dans ses 50 places et la montre
// « Invitation envoyée » jusqu'à ses 30 jours ; ni nouvelle invitation ni nouvel e-mail avant (choix
// de Louis du 14/11/2026, Q1). Acceptée, elle s'efface : le membre est dans hive_member.
//
// Les verrous (relecture du plan, point 5 ; l'ordre est celui de write.ts, en-tête) :
// - inviter prend d'abord le verrou de la paire inviteur–invité (`lockPair`, le même que bloquer),
//   puis la ligne de la ruche (`lockHive`), avant de compter les places : deux invitations pour la
//   dernière place passent l'une après l'autre, et la seconde voit la première ; un blocage posé au
//   même moment passe avant (l'invitation voit le blocage : 404) ou après (il l'efface) ;
// - accepter prend d'abord le verrou des limites du membre (`lockMemberHives`), puis la ruche, puis
//   la ligne de l'invitation (`for update`) : deux acceptations du même membre (20 ruches au plus)
//   se comptent l'une après l'autre, et la même invitation n'entre qu'une fois.
// Aucune transaction ne prend ces verrous dans l'autre ordre : pas d'interblocage.
import { randomUUID } from 'node:crypto'
import { HIVE_LIMITS } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { blockedPair, lockPair } from '../blocks/write'
import { award } from '../game/award'
import { invitationValidSince, joinedCountOf, memberCountOf, pendingInvitationsOf } from './load'
import { lockHive, lockMemberHives } from './write'

const hm = schema.hiveMember
const hi = schema.hiveInvitation

// ─── Inviter ──────────────────────────────────────────────────────────────────────────────────────

export type InviteOutcome =
  | 'done'
  | 'not_found'
  | 'forbidden'
  | 'already_hive_member'
  | 'already_invited'
  | 'hive_full'

/**
 * `inviterId` invite `inviteeId` dans la ruche, en une transaction. L'ordre des réponses compte :
 * 1. l'invité doit exister pour l'inviteur : un compte vérifié, sans blocage dans un sens ou dans
 *    l'autre. Sinon le même 404 qu'un membre inconnu, AVANT toute réponse 409 : « déjà membre » dirait
 *    qu'un membre qui nous a bloqués est dans la ruche ;
 * 2. sous le verrou de la ruche, on relit les droits de l'inviteur (il a pu partir, ou l'animateur
 *    s'est réservé les invitations entre-temps) ;
 * 3. déjà membre, ou déjà invité depuis moins de 30 jours (refusée comprise) : 409 ;
 * 4. 50 places, membres et invitations en attente ensemble : 409 `hive_full` ;
 * 5. une invitation expirée mais pas encore purgée est remplacée (nouvel identifiant, nouvel
 *    inviteur, nouvelle date) : l'index unique (hive_id, invitee_id) n'en garde qu'une.
 */
export const inviteToHive = (
  db: Database,
  hiveId: string,
  inviterId: string,
  inviteeId: string,
  now: Date,
) =>
  db.transaction(async (tx): Promise<InviteOutcome> => {
    await lockPair(tx, inviterId, inviteeId)
    const [invitee] = await tx
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.id, inviteeId), eq(schema.user.emailVerified, true)))
    if (!invitee || (await blockedPair(tx, inviterId, inviteeId))) return 'not_found'

    const hive = await lockHive(tx, hiveId)
    if (!hive) return 'not_found'
    const [inviter] = await tx
      .select({ userId: hm.userId })
      .from(hm)
      .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, inviterId)))
    if (!inviter) return 'not_found'
    if (hive.invitePolicy === 'animator' && hive.animatorId !== inviterId) return 'forbidden'

    const [already] = await tx
      .select({ userId: hm.userId })
      .from(hm)
      .where(and(eq(hm.hiveId, hiveId), eq(hm.userId, inviteeId)))
    if (already) return 'already_hive_member'
    // L'invitation de cette ruche à ce membre, s'il y en a une (index unique (hive_id, invitee_id)).
    const [previous] = await tx
      .select({ id: hi.id, createdAt: hi.createdAt })
      .from(hi)
      .where(and(eq(hi.hiveId, hiveId), eq(hi.inviteeId, inviteeId)))
    if (previous && previous.createdAt > invitationValidSince(now)) return 'already_invited'

    const taken = (await memberCountOf(tx, hiveId)) + (await pendingInvitationsOf(tx, hiveId, now))
    if (taken >= HIVE_LIMITS.members) return 'hive_full'

    const fresh = { id: randomUUID(), inviterId, createdAt: now, refusedAt: null }
    if (previous) {
      await tx.update(hi).set(fresh).where(eq(hi.id, previous.id))
    } else {
      await tx.insert(hi).values({ ...fresh, hiveId, inviteeId })
    }
    return 'done'
  })

// ─── Accepter ─────────────────────────────────────────────────────────────────────────────────────

export type AcceptOutcome =
  // `pollen` : ce que l'invité vient de gagner (R19, 15 ; 0 sinon), que la route met dans l'en-tête.
  | { hiveId: string; pollen: number }
  | 'not_found'
  | 'invitation_expired'
  | 'hives_joined_limit'
  | 'hive_full'

/**
 * L'invité accepte : il entre dans la ruche (`invited_by` garde qui l'a invité), et l'invitation
 * s'efface. Une invitation inconnue, d'un autre, refusée ou déjà acceptée : 404 ; expirée : 410,
 * pour l'invité seul (lui seul sait qu'elle a existé). Sous les verrous (en-tête), on relit tout :
 * l'invitation (une seconde acceptation ne la trouve plus), la ruche (supprimée entre-temps : 404),
 * et ses 20 ruches. Les 50 places ont été réservées par l'invitation ; on revérifie quand même que
 * la ruche n'est pas pleine (une ligne écrite hors de l'API ne doit pas la faire déborder).
 *
 * R19 : l'entrée rapporte 15 pollen à l'invité (`invitation_joined`) et 20 à qui l'a invité
 * (`invitation_accepted`), cinq par jour chacun, dans la même transaction et sous le verrou de jeu
 * des deux (pris par `award` après ceux de la ruche et de l'invitation : relecture S1). La source
 * est l'invitation ; la clé, la ruche (et l'invité, pour l'invitant) : quitter la ruche puis y être
 * invité de nouveau ne paie plus ni l'un ni l'autre. Un invité suspendu ne gagne rien ; l'invitant,
 * oui (sa suspension à lui seule compte, relecture S2).
 */
export const acceptInvitation = (
  db: Database,
  invitationId: string,
  inviteeId: string,
  now: Date,
) =>
  db.transaction(async (tx): Promise<AcceptOutcome> => {
    await lockMemberHives(tx, inviteeId)
    const [found] = await tx
      .select({ hiveId: hi.hiveId })
      .from(hi)
      .where(and(eq(hi.id, invitationId), eq(hi.inviteeId, inviteeId)))
    if (!found) return 'not_found'
    if (!(await lockHive(tx, found.hiveId))) return 'not_found'
    // La ligne de l'invitation, prise jusqu'à la fin : relue après le verrou de la ruche.
    const [invitation] = await tx
      .select({ inviterId: hi.inviterId, createdAt: hi.createdAt, refusedAt: hi.refusedAt })
      .from(hi)
      .where(and(eq(hi.id, invitationId), eq(hi.inviteeId, inviteeId)))
      .for('update')
    if (!invitation || invitation.refusedAt !== null) return 'not_found'
    if (invitation.createdAt <= invitationValidSince(now)) return 'invitation_expired'

    if ((await joinedCountOf(tx, inviteeId)) >= HIVE_LIMITS.joined) return 'hives_joined_limit'
    if ((await memberCountOf(tx, found.hiveId)) >= HIVE_LIMITS.members) return 'hive_full'
    // « on conflict do nothing » : déjà membre (une ligne écrite autrement), rien ne change.
    await tx
      .insert(hm)
      .values({
        hiveId: found.hiveId,
        userId: inviteeId,
        invitedBy: invitation.inviterId,
        joinedAt: now,
      })
      .onConflictDoNothing()
    await tx.delete(hi).where(eq(hi.id, invitationId))
    const source = { sourceKind: 'invitation', sourceId: invitationId, now } as const
    const pollen = await award(tx, {
      ...source,
      memberId: inviteeId,
      gesture: 'invitation_joined',
      sourceKey: `hive:${found.hiveId}`,
      counterpartId: invitation.inviterId,
    })
    // L'invitant a pu supprimer son compte depuis (`inviter_id` remis à nul) : rien à lui payer.
    if (invitation.inviterId !== null) {
      await award(tx, {
        ...source,
        memberId: invitation.inviterId,
        gesture: 'invitation_accepted',
        sourceKey: `hive:${found.hiveId}:${inviteeId}`,
        counterpartId: inviteeId,
      })
    }
    return { hiveId: found.hiveId, pollen }
  })

// ─── Refuser ──────────────────────────────────────────────────────────────────────────────────────

/**
 * L'invité refuse : la ligne reste, datée (en-tête). Personne n'est prévenu. Rend false seulement si
 * l'invitation n'est pas à lui (inconnue, ou d'un autre) : la route répond alors 404. Une invitation
 * déjà refusée, ou expirée, se « refuse » encore sans rien changer (204 : le refus est muet).
 * Deux requêtes au plus, par la clé primaire.
 */
export const refuseInvitation = async (
  db: Database,
  invitationId: string,
  inviteeId: string,
  now: Date,
) => {
  const mine = and(eq(hi.id, invitationId), eq(hi.inviteeId, inviteeId))
  const refused = await db
    .update(hi)
    .set({ refusedAt: now })
    .where(and(mine, isNull(hi.refusedAt), gt(hi.createdAt, invitationValidSince(now))))
    .returning({ id: hi.id })
  if (refused.length > 0) return true
  const [still] = await db.select({ id: hi.id }).from(hi).where(mine)
  return still !== undefined
}
