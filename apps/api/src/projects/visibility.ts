// Qui voit un projet, en un seul endroit (tranche 7a). Avant, chaque lecture écrivait elle-même
// « visibility = 'public' » ; un projet retiré par la modération doit maintenant disparaître de
// toutes ces lectures à la fois. Chaque lecture appelle donc l'une de ces conditions, et aucune ne
// réécrit la règle. Tranche 7b : un projet d'un membre bloqué (dans un sens ou l'autre) disparaît
// aussi, pour le visiteur seulement.
import { schema } from '@ruche/db'
import { and, eq, isNull, or } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'

/**
 * Un projet public et pas retiré par la modération, quel que soit le visiteur. Sert aux nombres,
 * qui sont les mêmes pour tous (commentaires, réactions) : un blocage ne les change pas. Pour
 * montrer des projets à quelqu'un, c'est `listedProjectFor`. `isNull` : « removed_at is null ».
 */
export const listedProject = () =>
  and(eq(schema.project.visibility, 'public'), isNull(schema.project.removedAt))

/**
 * Un projet que tout le monde voit (fil, étiquettes, page d'un membre vue par un autre…), sauf
 * celui d'un membre bloqué avec ce visiteur, dans un sens ou dans l'autre (tranche 7b).
 */
export const listedProjectFor = (viewerId: string) =>
  and(listedProject(), notBlockedWith(viewerId, schema.project.authorId))

/**
 * Un projet que ce membre voit : un projet listé pour lui, ou l'un des siens (même privé ou
 * retiré : son auteur garde toujours accès à ce qu'il a écrit, avec l'explication du retrait).
 */
export const projectVisibleTo = (viewerId: string) =>
  or(listedProjectFor(viewerId), eq(schema.project.authorId, viewerId))
