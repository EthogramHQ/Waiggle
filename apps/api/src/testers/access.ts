// Qui entre dans le coin des testeurs d'un projet, et comment (R7b) : LA règle d'accès du coin, écrite
// une fois, que chaque route du coin (entrée, retrait, appels, images, fils) appelle avant de lire
// ou d'écrire quoi que ce soit. Elle ne dit pas ce qu'on peut faire une fois dedans : chaque route
// le décide à partir de la réponse.
import { ProjectId } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, eq } from 'drizzle-orm'
import { blockedPair } from '../blocks/write'
import { isSuspended } from '../suspension/load'

/** Une base ou une transaction : la règle se relit aussi sous un verrou (`tx`). */
type Reader = Pick<Database, 'select'>

/**
 * Ce que ce membre est, pour le coin de ce projet :
 * - `author` : l'auteur, coin ouvert ;
 * - `author_closed` : l'auteur, mais le projet est retiré, privé, ou lui-même suspendu : il lit,
 *   il n'écrit plus (409 `corner_closed`) ;
 * - `tester` : inscrit aux testeurs, projet listé pour lui, auteur non suspendu, sans blocage ;
 * - `former_tester` : n'est plus testeur (parti, retiré par l'auteur, séparé de lui par un
 *   blocage) mais a un fil : il le relit en lecture seule (décision de Louis du 11/11/2026) ;
 * - `not_found` : tout le reste. Les routes répondent alors 404, la même réponse qu'un projet
 *   inconnu : rien ne dit que le coin existe.
 */
export type CornerAccess = 'author' | 'author_closed' | 'tester' | 'former_tester' | 'not_found'

/**
 * Le code PostgreSQL 23503 (« clé étrangère violée ») : le compte visé par une écriture a été
 * supprimé pendant qu'on l'écrivait. Drizzle range l'erreur de la base dans `cause`.
 */
export const isMissingMember = (error: unknown) => {
  const codeOf = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined
  return codeOf(error) === '23503' || (error instanceof Error && codeOf(error.cause) === '23503')
}

/**
 * L'accès de `viewerId` au coin du projet `projectId`.
 *
 * Quatre petites lectures au plus, chacune par une clé primaire : le projet (`project`), la
 * suspension de son auteur (index partiel `account_suspension_open_idx`), l'inscription du membre
 * (`project_tester`, clé primaire) et son fil (`tester_thread`, clé primaire). Un blocage se lit
 * par la clé primaire de `member_block`, seulement pour un testeur inscrit.
 *
 * La date « maintenant » est celle de JavaScript (une suspension se lit à la milliseconde).
 */
export const cornerAccess = async (
  db: Reader,
  projectId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<CornerAccess> => {
  // Un identifiant mal formé ferait échouer la requête SQL (ce n'est pas un uuid) : 404 sans base.
  if (!ProjectId.safeParse(projectId).success) return 'not_found'
  const [project] = await db
    .select({
      authorId: schema.project.authorId,
      visibility: schema.project.visibility,
      removedAt: schema.project.removedAt,
    })
    .from(schema.project)
    .where(eq(schema.project.id, projectId))
  if (!project) return 'not_found'
  // « Listé » : public et pas retiré par la modération. Sinon le coin est fermé.
  const listed = project.visibility === 'public' && project.removedAt === null

  if (project.authorId === viewerId) {
    if (!listed || (await isSuspended(db, viewerId, now))) return 'author_closed'
    return 'author'
  }

  // Un coin fermé (projet retiré ou privé, auteur suspendu) est introuvable pour tous les autres,
  // testeurs actuels et anciens compris (décision de Louis du 11/11/2026, 1).
  if (!listed || (await isSuspended(db, project.authorId, now))) return 'not_found'

  const [inscription] = await db
    .select({ memberId: schema.projectTester.memberId })
    .from(schema.projectTester)
    .where(
      and(
        eq(schema.projectTester.projectId, projectId),
        eq(schema.projectTester.memberId, viewerId),
      ),
    )
  // Un blocage retire déjà l'inscription (R7a) ; la relire ici garde la règle vraie même si une
  // ligne restait : un testeur bloqué avec l'auteur n'a plus que son fil.
  if (inscription && !(await blockedPair(db, viewerId, project.authorId))) return 'tester'

  // Un ancien testeur n'existe que par son fil : sans fil, il n'y a rien à lui montrer.
  const [thread] = await db
    .select({ testerId: schema.testerThread.testerId })
    .from(schema.testerThread)
    .where(
      and(eq(schema.testerThread.projectId, projectId), eq(schema.testerThread.testerId, viewerId)),
    )
  return thread ? 'former_tester' : 'not_found'
}
