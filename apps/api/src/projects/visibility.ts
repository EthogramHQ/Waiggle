// Qui voit un projet, en un seul endroit (tranche 7a). Avant, chaque lecture écrivait elle-même
// « visibility = 'public' » ; un projet retiré par la modération doit maintenant disparaître de
// toutes ces lectures à la fois. Chaque lecture appelle donc l'une de ces conditions, et aucune ne
// réécrit la règle. Tranche 7b : un projet d'un membre bloqué (dans un sens ou l'autre) disparaît
// aussi, pour le visiteur seulement. R10 : un projet « réservé » à une ruche (visibility = 'hive',
// hive_id posé) se voit de son auteur et des membres ACTUELS de sa ruche, partout où ils regardent,
// et de personne d'autre (scénario refonte.md, R10, « Qui le voit » ; plan de R10, choix 2).
import { schema } from '@ruche/db'
import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm'
import { notBlockedWith } from '../blocks/visibility'

/**
 * Un projet public et pas retiré par la modération, quel que soit le visiteur. Sert aux nombres,
 * qui sont les mêmes pour tous (commentaires, réactions) : un blocage ne les change pas. Pour
 * montrer des projets à quelqu'un, c'est `listedProjectFor`. `isNull` : « removed_at is null ».
 * Jamais un projet réservé à une ruche : sans lecteur, on ne sait pas s'il en est membre.
 */
export const listedProject = () =>
  and(eq(schema.project.visibility, 'public'), isNull(schema.project.removedAt))

/**
 * Un projet réservé à une ruche, pas retiré, sans dire à qui (R10). Seul, il ne montre rien à
 * personne : il sert à `projectReachableBy` (défaire son geste, décision Q2 de la relecture du plan)
 * et aux nombres d'un projet que le lecteur voit déjà (commentaires d'un projet réservé, lus par
 * ses membres). Pour savoir si un membre le voit : `hiveMemberOf`.
 */
export const reservedProject = () =>
  and(eq(schema.project.visibility, 'hive'), isNull(schema.project.removedAt))

/**
 * La ruche du projet est l'une de celles de ce membre, aujourd'hui (R10). En SQL :
 *   "project"."hive_id" in (select hm.hive_id from hive_member hm where hm.user_id = $membre)
 * La sous-requête ne dépend pas du projet : PostgreSQL la calcule une seule fois par requête (ses
 * ruches, 20 au plus, trouvées par l'index hive_member_user_idx), puis compare chaque projet à
 * cette petite liste. Un « exists » qui lirait la clé primaire (hive_id, user_id) pour chaque
 * projet ferait autant de lectures que de projets ; et dans un « or », il peut devenir une lecture
 * de toute la table (charte de l'API, 7b). Un projet sans ruche (hive_id nul) n'est « dans » aucune
 * liste : la condition est fausse. Un ancien membre n'a plus de ligne : il perd l'accès à l'instant
 * où elle s'efface. L'identifiant du membre entre comme paramètre lié, jamais collé au texte.
 */
export const hiveMemberOf = (viewerId: string): SQL =>
  sql`${schema.project.hiveId} in (select hm.hive_id from ${schema.hiveMember} hm where hm.user_id = ${viewerId})`

/**
 * Un projet que ce membre a le droit de voir chez les autres, sans regarder les blocages : public
 * et pas retiré, ou réservé à l'une de ses ruches et pas retiré (R10). La même règle en
 * JavaScript est `sharedWith`, juste en dessous : elles doivent dire la même chose.
 */
export const sharedProjectWith = (viewerId: string) =>
  or(listedProject(), and(reservedProject(), hiveMemberOf(viewerId)))

/**
 * La règle de `sharedProjectWith` en JavaScript, pour un projet déjà lu : `inViewerHive` dit si sa
 * ruche est l'une de celles du lecteur (lu en SQL par `inViewerHiveColumn`). Sert à dire si un
 * lecteur lit les commentaires des autres (comments/load.ts, `viewerOf`).
 */
export const sharedWith = (project: {
  visibility: string
  removedAt: Date | null
  inViewerHive: boolean
}) =>
  project.removedAt === null &&
  (project.visibility === 'public' || (project.visibility === 'hive' && project.inViewerHive))

/**
 * « Sa ruche est l'une de celles de ce membre », à lire comme une colonne vrai / faux dans un
 * `select` sur project (pour `sharedWith`). `is true` : faux aussi quand la condition vaut nul.
 */
export const inViewerHiveColumn = (viewerId: string) =>
  sql<boolean>`(${hiveMemberOf(viewerId)}) is true`

/**
 * Un projet que tout le monde voit (fil, étiquettes, page d'un membre vue par un autre…), sauf
 * celui d'un membre bloqué avec ce visiteur, dans un sens ou dans l'autre (tranche 7b). R10 : et
 * les projets réservés à l'une de ses ruches (`sharedProjectWith`), avec le même filtre de blocage.
 */
export const listedProjectFor = (viewerId: string) =>
  and(sharedProjectWith(viewerId), notBlockedWith(viewerId, schema.project.authorId))

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

/**
 * Un projet que les membres peuvent voir, sans filtre de blocage (tranche R6b, décision 1 :
 * sec-A1, jur-T2) : les pages d'administration du catalogue (« À vérifier », « À ranger », le
 * journal) et le récap des « Autre ». Un administrateur voit tout ce que voient les membres, même
 * d'un membre qui l'a bloqué (sinon bloquer l'administrateur ferait échapper au rangement), mais
 * jamais un projet privé ou retiré. Ni un projet réservé à une ruche (R10, relecture de sécurité
 * du plan, B5), pas même à un administrateur membre de cette ruche : `listedProject` seul.
 */
export const listedVerifiedProject = () => and(listedProject(), verifiedAuthor())

/** Un projet listé pour ce visiteur, dont l'auteur est vérifié (outils, étiquettes, recherche). */
export const listedVerifiedProjectFor = (viewerId: string) =>
  and(listedProjectFor(viewerId), verifiedAuthor())

/**
 * Un projet que ce membre voit : un projet listé pour lui (réservés à ses ruches compris), ou l'un
 * des siens (même privé, retiré ou réservé : son auteur garde toujours accès à ce qu'il a écrit,
 * avec l'explication du retrait).
 */
export const projectVisibleTo = (viewerId: string) =>
  or(listedProjectFor(viewerId), eq(schema.project.authorId, viewerId))

/**
 * Un projet où ce membre peut défaire ses propres gestes (tranche 7b, règle 7 de la relecture du
 * plan : supprimer son commentaire, retirer sa réaction) : la condition de `projectVisibleTo`
 * moins le blocage. Un blocage, dans un sens ou dans l'autre, ne refuse jamais de défaire ce qu'on
 * a fait chez l'autre ; un projet privé ou retiré d'un autre reste introuvable, comme partout.
 * R10 (décision Q2 de la relecture du plan) : moins l'appartenance à la ruche aussi. Un ancien
 * membre efface toujours ses commentaires, réactions et messages sur un projet réservé, sans plus
 * le voir ; la route ne lui trouve alors que les siens (un projet réservé est « privé » pour lui,
 * `viewerOf`). Écrite une fois ici pour les routes qui défont un geste (routes/comments.ts,
 * routes/reactions.ts, les suivis).
 */
export const projectReachableBy = (viewerId: string) =>
  or(listedProject(), reservedProject(), eq(schema.project.authorId, viewerId))
