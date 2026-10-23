// Qui voit un projet, en un seul endroit (tranche 7a). Avant, chaque lecture écrivait elle-même
// « visibility = 'public' » ; un projet retiré par la modération doit maintenant disparaître de
// toutes ces lectures à la fois. Chaque lecture appelle donc l'une de ces deux conditions, et
// aucune ne réécrit la règle.
import { schema } from '@ruche/db'
import { and, eq, isNull, or } from 'drizzle-orm'

/**
 * Un projet que tout le monde voit (fil, étiquettes, page d'un membre vue par un autre…) : public,
 * et pas retiré par la modération. `isNull` : la condition SQL « removed_at is null ».
 */
export const listedProject = () =>
  and(eq(schema.project.visibility, 'public'), isNull(schema.project.removedAt))

/**
 * Un projet que ce membre voit : un projet listé, ou l'un des siens (même privé ou retiré : son
 * auteur garde toujours accès à ce qu'il a écrit, avec l'explication du retrait).
 */
export const projectVisibleTo = (viewerId: string) =>
  or(listedProject(), eq(schema.project.authorId, viewerId))
