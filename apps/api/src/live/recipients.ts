// Les destinataires qui demandent une lecture de la base, pour les signaux du temps réel (R21) que
// live/emit.ts ne couvre pas : les abonnés et testeurs d'un projet (l'avis d'une mise à jour), la
// page d'une ruche (un membre entre), les Éclaireuses actives (les missions de la semaine). Les
// règles du filtre (blocages, audience d'un projet) restent dans live/emit.ts : ce fichier ne fait
// que trouver qui l'avis concerne, puis passe par ses aides ou par le bus.
//
// Comme dans live/emit.ts : aucune lecture quand personne n'écoute (`hub.isIdle()`, ou aucun
// écouteur du sujet), une émission après la transaction et avant la réponse, et une panne notée
// dans les logs sans faire échouer la route (l'écriture est faite ; l'appli relira à sa reconnexion).
import type { LiveKind } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { eq, isNull } from 'drizzle-orm'
import { blockPartnersOf } from '../blocks/visibility'
import { describeError } from '../log'
import type { Live } from './emit'

/** Une émission ratée est notée sans données de membre, et la route répond quand même. */
const safely = async <T>(what: string, fallback: T, task: () => Promise<T>): Promise<T> => {
  try {
    return await task()
  } catch (error) {
    console.error('Live signal failed', describeError(error, { method: 'LIVE', path: what }))
    return fallback
  }
}

/**
 * Les membres que l'avis d'une mise à jour concerne : ceux qui suivent le projet, et ceux qui le
 * testent (source 11 de notifications/load.ts ; l'avis ne dit jamais lequel des deux). Seuls ceux
 * qui ont un flux ouvert servent : rien n'est lu si aucun flux n'est ouvert. Le filtre (audience du
 * projet, blocages) est fait ensuite par `projectChanged` (`notify`).
 *
 * En SQL, deux lectures réunies (« union », qui retire aussi les doublons : un abonné qui teste) :
 *   select follower_id from project_follow where project_id = $1
 *   union select member_id from project_tester where project_id = $1
 * Index : project_follow_project_idx (project_id) et project_tester_project_idx (project_id) ; la
 * clé primaire de chaque table commence par le membre, elle ne sert pas ici.
 */
export const updateReadersOf = (live: Live, projectId: string): Promise<string[]> =>
  safely('update-readers', [], async () => {
    if (live.hub.isIdle()) return []
    const follows = live.db
      .select({ memberId: schema.projectFollow.followerId })
      .from(schema.projectFollow)
      .where(eq(schema.projectFollow.projectId, projectId))
    const testers = live.db
      .select({ memberId: schema.projectTester.memberId })
      .from(schema.projectTester)
      .where(eq(schema.projectTester.projectId, projectId))
    const rows = await follows.union(testers)
    return rows.map((row) => row.memberId).filter((id) => live.hub.isConnected(id))
  })

/**
 * La page d'une ruche (`hive:<id>`) a changé par le geste de `actorId` (un membre est entré). Le
 * signal part aux connexions qui écoutent cette page ET dont le membre en est membre aujourd'hui
 * (règle B1 : un ancien membre dont la revérification n'est pas encore passée ne reçoit rien), sans
 * blocage, dans un sens ou dans l'autre, avec l'auteur du geste.
 *
 * Deux requêtes, seulement si quelqu'un écoute : les membres de la ruche (« hive_id = $1 », par la
 * clé primaire de hive_member, hive_id en tête) et les blocages de l'auteur du geste
 * (`blockPartnersOf` : clé primaire de member_block et member_block_blocked_idx).
 */
export const hiveChanged = (
  live: Live,
  { hiveId, actorId, kind }: { hiveId: string; actorId: string; kind: LiveKind },
) =>
  safely('hive', undefined, async () => {
    const topic = `hive:${hiveId}`
    if (live.hub.listeners(topic).size === 0) return
    const [members, partners] = await Promise.all([
      live.db
        .select({ userId: schema.hiveMember.userId })
        .from(schema.hiveMember)
        .where(eq(schema.hiveMember.hiveId, hiveId)),
      blockPartnersOf(live.db, [actorId]),
    ])
    const inHive = new Set(members.map((row) => row.userId))
    const blocked = partners.get(actorId) ?? new Set<string>()
    live.hub.emit({ topic, kind }, (userId) => inHive.has(userId) && !blocked.has(userId))
  })

/**
 * Les Éclaireuses actives (non retirées) qui ont un flux ouvert : leurs missions de la semaine
 * viennent de changer. Une requête sur la petite table `scout` (une ligne par Éclaireuse, une
 * centaine au plus : les places du mois), lue en entier ; rien n'est lu si aucun flux n'est ouvert.
 */
export const connectedScoutsOf = (live: Live): Promise<string[]> =>
  safely('scouts', [], async () => {
    if (live.hub.isIdle()) return []
    const rows = await live.db
      .select({ memberId: schema.scout.memberId })
      .from(schema.scout)
      .where(isNull(schema.scout.removedAt))
    return rows.map((row) => row.memberId).filter((id) => live.hub.isConnected(id))
  })
