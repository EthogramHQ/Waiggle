// Qui voit un projet, en un seul endroit (tranche 7a). Avant, chaque lecture écrivait elle-même
// « visibility = 'public' » ; un projet retiré par la modération doit maintenant disparaître de
// toutes ces lectures à la fois. Chaque lecture appelle donc l'une de ces conditions, et aucune ne
// réécrit la règle. Tranche 7b : un projet d'un membre bloqué (dans un sens ou l'autre) disparaît
// aussi, pour le visiteur seulement.
import { schema } from '@ruche/db'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
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
 * L'auteur du projet a vérifié son adresse (R3, relecture de sécurité sec-A3) : un compte jamais
 * vérifié n'existe pour personne (ni sa page, ni ses mentions), ses projets non plus. Une seule
 * condition, reprise par la recherche, la liste des outils et la page d'une étiquette.
 *
 * En SQL : (select verified_author.email_verified from "user" verified_author
 *           where verified_author.id = project.author_id) is true
 * Une lecture de la clé primaire de "user" par projet. Les noms de table sont écrits en toutes
 * lettres (sql.raw, du texte fixe, jamais une entrée du client) : Drizzle écrit parfois une colonne
 * sans le nom de sa table, et dans cette sous-requête « id » serait alors celui de "user" (charte
 * de l'API, 6b). `is true` : faux aussi quand la sous-requête ne rend rien.
 */
export const verifiedAuthor = () =>
  sql`(select verified_author.email_verified from ${schema.user} verified_author where verified_author.id = ${sql.raw('"project"."author_id"')}) is true`

/** Un projet listé pour ce visiteur, dont l'auteur est vérifié (outils, étiquettes, recherche). */
export const listedVerifiedProjectFor = (viewerId: string) =>
  and(listedProjectFor(viewerId), verifiedAuthor())

/**
 * Un projet que ce membre voit : un projet listé pour lui, ou l'un des siens (même privé ou
 * retiré : son auteur garde toujours accès à ce qu'il a écrit, avec l'explication du retrait).
 */
export const projectVisibleTo = (viewerId: string) =>
  or(listedProjectFor(viewerId), eq(schema.project.authorId, viewerId))

/**
 * Un projet où ce membre peut défaire ses propres gestes (tranche 7b, règle 7 de la relecture du
 * plan : supprimer son commentaire, retirer sa réaction) : la condition de `projectVisibleTo`
 * moins le blocage. Un blocage, dans un sens ou dans l'autre, ne refuse jamais de défaire ce qu'on
 * a fait chez l'autre ; un projet privé ou retiré d'un autre reste introuvable, comme partout.
 * Écrite une fois ici pour les deux routes (routes/comments.ts, routes/reactions.ts).
 */
export const projectReachableBy = (viewerId: string) =>
  or(listedProject(), eq(schema.project.authorId, viewerId))
