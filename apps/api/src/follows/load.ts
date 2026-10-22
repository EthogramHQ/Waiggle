// L'état d'abonnement d'une page (un membre, un ou plusieurs projets) vu par le membre qui la
// regarde : la suit-il, et combien de membres la suivent. Jamais la liste des abonnés : seul leur
// nombre sort d'ici.
import type { FollowState } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, type Column, eq, inArray, sql } from 'drizzle-orm'
import { listedProject } from '../projects/visibility'

type Reader = Pick<Database, 'select'>

/** Pas d'abonné : l'état de tout ce que personne ne suit. */
const nobody: FollowState = { isFollowed: false, followerCount: 0 }

// Les deux colonnes calculées par les requêtes ci-dessous, en SQL :
// - count(*) compte les lignes de chaque groupe, donc les abonnés. « ::int » le convertit en
//   nombre entier ordinaire (PostgreSQL rend un count en « bigint », que le pilote lit en texte) ;
// - bool_or(…) vaut vrai si la condition est vraie pour au moins une ligne du groupe : « l'un de
//   ces abonnés est-il le membre qui regarde ? ». L'identifiant passe par un paramètre lié.
const followerCount = sql<number>`count(*)::int`
const followedBy = (column: Column, viewerId: string) =>
  sql<boolean>`bool_or(${column} = ${viewerId})`

/**
 * L'état d'abonnement de la page d'un membre, en une requête. Sur sa propre page, il n'est jamais
 * « suivi » (on ne peut pas se suivre soi-même).
 *
 * En SQL : select count(*)::int, bool_or(follower_id = $viewer) from member_follow
 * where member_id = $id. L'index member_follow_member_idx trouve directement ses abonnés.
 */
export const memberFollowState = async (
  db: Reader,
  memberId: string,
  viewerId: string,
): Promise<FollowState> => {
  const [row] = await db
    .select({
      followerCount,
      isFollowed: followedBy(schema.memberFollow.followerId, viewerId),
    })
    .from(schema.memberFollow)
    .where(eq(schema.memberFollow.memberId, memberId))
  // Sans aucune ligne, count vaut 0 et bool_or vaut null : « non suivi ».
  return {
    isFollowed: memberId !== viewerId && row?.isFollowed === true,
    followerCount: row?.followerCount ?? 0,
  }
}

/**
 * L'état d'abonnement de plusieurs projets, en une seule requête quel que soit leur nombre (et pas
 * une par projet). Chaque projet vient avec son auteur, qui n'est jamais « abonné » au sien.
 *
 * En SQL : select project_id, count(*)::int, bool_or(follower_id = $viewer) from project_follow
 * where project_id in (…) group by project_id. « group by » range les lignes en un groupe par
 * projet, et les deux calculs se font groupe par groupe. L'index project_follow_project_idx
 * trouve les abonnés de chaque projet de la liste.
 */
export const projectFollowStates = async (
  db: Reader,
  projects: { id: string; authorId: string }[],
  viewerId: string,
): Promise<Map<string, FollowState>> => {
  const states = new Map<string, FollowState>()
  if (projects.length === 0) return states
  const rows = await db
    .select({
      projectId: schema.projectFollow.projectId,
      followerCount,
      isFollowed: followedBy(schema.projectFollow.followerId, viewerId),
    })
    .from(schema.projectFollow)
    .where(
      inArray(
        schema.projectFollow.projectId,
        projects.map((project) => project.id),
      ),
    )
    .groupBy(schema.projectFollow.projectId)
  const found = new Map(rows.map((row) => [row.projectId, row]))
  for (const { id, authorId } of projects) {
    const row = found.get(id)
    states.set(
      id,
      row
        ? { isFollowed: authorId !== viewerId && row.isFollowed, followerCount: row.followerCount }
        : nobody,
    )
  }
  return states
}

/**
 * Suit-il au moins quelqu'un, membre ou projet ? Deux petites requêtes (« limit 1 » : la première
 * ligne trouvée suffit, inutile de les compter toutes), chacune servie par la clé primaire de sa
 * table, qui commence par follower_id.
 *
 * Un projet suivi qui est devenu privé ne compte pas : sinon, la réponse changerait selon qu'il est
 * privé (encore compté) ou supprimé (plus compté), et trahirait qu'il existe encore. On ne garde
 * que les projets publics et pas retirés (listedProject ; on ne peut pas suivre les siens, donc pas
 * besoin d'autre cas).
 */
export const followsAnyone = async (db: Reader, viewerId: string): Promise<boolean> => {
  const [member, project] = await Promise.all([
    db
      .select({ id: schema.memberFollow.memberId })
      .from(schema.memberFollow)
      .where(eq(schema.memberFollow.followerId, viewerId))
      .limit(1),
    db
      .select({ id: schema.projectFollow.projectId })
      .from(schema.projectFollow)
      .innerJoin(schema.project, eq(schema.project.id, schema.projectFollow.projectId))
      .where(and(eq(schema.projectFollow.followerId, viewerId), listedProject()))
      .limit(1),
  ])
  return member.length > 0 || project.length > 0
}
