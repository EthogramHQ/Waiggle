// Qui a le droit d'écouter quoi, dans le temps réel (R21) : la vérification des sujets déclarés
// (PUT /v1/live/{connectionId}/topics) et la relecture des sessions des flux ouverts (relecture de
// sécurité du plan, B2). Chaque sujet se vérifie par la règle de lecture de sa ressource, celle de
// la route qui la montre ; aucune n'est réécrite ici :
// - `project:<id>` : `visibleTo` (projects/load.ts), la condition de GET /v1/projects/{id} ;
// - `hive:<id>` : l'appartenance à la ruche aujourd'hui (hive_member, comme `isHiveMember`) ;
// - `corner:<id>` : `cornerAccess` (testers/access.ts), auteur ou testeur ; un ancien testeur
//   n'écoute plus le coin, son fil passe par `me` (relecture du plan, B4 ; décision du 27/11/2026) ;
// - `member:<id>` : un compte qui a une page (`memberWithPage`), sans blocage dans un sens ni dans
//   l'autre (`notBlockedWith`) : sa page ne montre rien de ses gestes à qui est bloqué avec lui.
//
// Ces fonctions servent aussi la revérification d'une visibilité (B4) : elles disent, pour une
// liste de sujets, lesquels ce membre peut encore lire.
import { type Database, schema } from '@ruche/db'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'
import { memberWithPage } from '../blocks/write'
import { visibleTo } from '../projects/load'
import { isActiveAdmin } from '../reports/admin'
import { cornerAccess } from '../testers/access'
import type { SessionRecheck } from './hub'

type Reader = Pick<Database, 'select'>

/** Les sujets regroupés par sorte de ressource, avec l'identifiant qui suit les deux-points. */
const byKind = (topics: Iterable<string>) => {
  const ids = { project: [] as string[], hive: [] as string[], corner: [] as string[] }
  const members: string[] = []
  for (const topic of topics) {
    const colon = topic.indexOf(':')
    const kind = topic.slice(0, colon)
    const id = topic.slice(colon + 1)
    if (kind === 'project' || kind === 'hive' || kind === 'corner') ids[kind].push(id)
    else if (kind === 'member') members.push(id)
  }
  return { ...ids, members }
}

/**
 * Les sujets de `topics` que ce membre a le droit d'écouter (les autres sont ignorés sans le dire :
 * pas d'oracle). `topics` est déjà validé par le contrat (`DeclaredLiveTopic` : chaque identifiant
 * a la forme d'un uuid ou d'un `MemberId`), et chaque identifiant entre dans les requêtes comme
 * valeur liée, jamais collé au texte SQL.
 *
 * Les lectures, groupées par sorte (relecture de sécurité du plan, A1) :
 * - les projets, en une requête : « id in (…) » par la clé primaire de project, et la condition de
 *   `visibleTo` (ses ruches par hive_member_user_idx, les blocages par les index de member_block) ;
 * - les ruches, en une requête : « user_id = moi and hive_id in (…) », par la clé primaire de
 *   hive_member (hive_id, user_id) ;
 * - les membres, en une requête : « id in (…) » par la clé primaire de "user", et deux `exists`
 *   sur member_block ;
 * - les coins, par `cornerAccess`, quatre petites lectures par clé primaire au plus, pour chaque
 *   coin : un écran n'en ouvre qu'un à la fois.
 */
export const allowedTopics = async (
  db: Reader,
  userId: string,
  topics: Iterable<string>,
): Promise<Set<string>> => {
  const { project, hive, corner, members } = byKind(topics)
  const allowed = new Set<string>()

  const [projects, hives, pages] = await Promise.all([
    project.length === 0
      ? []
      : db
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(and(inArray(schema.project.id, project), visibleTo(userId))),
    hive.length === 0
      ? []
      : db
          .select({ id: schema.hiveMember.hiveId })
          .from(schema.hiveMember)
          .where(
            and(eq(schema.hiveMember.userId, userId), inArray(schema.hiveMember.hiveId, hive)),
          ),
    members.length === 0
      ? []
      : db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(
            and(
              inArray(schema.user.id, members),
              memberWithPage(),
              notBlockedWith(userId, schema.user.id),
            ),
          ),
  ])
  for (const row of projects) allowed.add(`project:${row.id}`)
  for (const row of hives) allowed.add(`hive:${row.id}`)
  for (const row of pages) allowed.add(`member:${row.id}`)

  // Le coin : auteur (ouvert ou fermé : il le relit) ou testeur inscrit.
  for (const projectId of new Set(corner)) {
    const access = await cornerAccess(db, projectId, userId)
    if (access === 'author' || access === 'author_closed' || access === 'tester') {
      allowed.add(`corner:${projectId}`)
    }
  }
  return allowed
}

/**
 * La revérification des sessions des flux ouverts (B2), donnée au bus (`createLiveHub`). Une
 * requête pour toutes les sessions : « id in (…) and expires_at > maintenant » par la clé primaire
 * de session ; une session effacée (déconnexion, mot de passe changé sur un autre appareil, purge
 * de nuit, compte supprimé, dont les sessions partent avec lui) ou expirée n'est pas rendue. Puis,
 * pour les seuls membres qui avaient le rôle d'administrateur à l'ouverture (une poignée),
 * `isActiveAdmin` (reports/admin.ts) : la règle du rôle en fonction, révoqué ou suspendu, n'est
 * écrite qu'une fois. La date est celle de JavaScript (la fausse horloge des tests la suit).
 */
export const sessionRecheckOf =
  (db: Reader): SessionRecheck =>
  async (sessions) => {
    if (sessions.length === 0) return new Map()
    const now = new Date()
    const rows = await db
      .select({ id: schema.session.id })
      .from(schema.session)
      .where(
        and(
          inArray(
            schema.session.id,
            sessions.map((one) => one.sessionId),
          ),
          gt(schema.session.expiresAt, now),
        ),
      )
    const alive = new Set(rows.map((row) => row.id))
    const admins = new Map<string, boolean>()
    for (const one of sessions) {
      if (one.admin && alive.has(one.sessionId) && !admins.has(one.userId)) {
        admins.set(one.userId, await isActiveAdmin(db, one.userId, now))
      }
    }
    const result = new Map<string, { admin: boolean }>()
    for (const one of sessions) {
      if (alive.has(one.sessionId)) {
        result.set(one.sessionId, { admin: admins.get(one.userId) ?? false })
      }
    }
    return result
  }
