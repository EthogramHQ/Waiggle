// Qui voit un projet, en un seul endroit (tranche 7a). Avant, chaque lecture écrivait elle-même
// « visibility = 'public' » ; un projet retiré par la modération doit maintenant disparaître de
// toutes ces lectures à la fois. Chaque lecture appelle donc l'une de ces conditions, et aucune ne
// réécrit la règle. Tranche 7b : un projet d'un membre bloqué (dans un sens ou l'autre) disparaît
// aussi, pour le visiteur seulement. R10 : un projet « réservé » à une ruche (visibility = 'hive',
// hive_id posé) se voit de son auteur et des membres ACTUELS de sa ruche, partout où ils regardent,
// et de personne d'autre (scénario refonte.md, R10, « Qui le voit » ; plan de R10, choix 2).
// R12 : la valeur `web` (« Public », visible aussi sans compte). Pour un membre connecté, un projet
// `web` se comporte partout comme un projet `public` (« Membres ») : `MEMBER_VISIBLE` dit les deux
// valeurs, et chaque règle ci-dessous les lit par lui. Ce qu'un visiteur sans compte peut lire est
// une autre règle, plus étroite, écrite une seule fois en bas du fichier (`visitorVisibleProject`).
import type { ProjectVisibility } from '@ruche/contracts'
import { type Database, schema } from '@ruche/db'
import { and, type Column, eq, isNull, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import { notBlockedWith } from '../blocks/visibility'

/**
 * Les visibilités qu'un membre connecté voit chez n'importe quel autre membre (R12, plan, choix 1) :
 * « Membres » (`public`) et « Public » (`web`). `as const` : TypeScript garde les deux valeurs
 * exactes (pas un simple `string[]`), et `satisfies` vérifie qu'elles existent bien dans le contrat.
 */
export const MEMBER_VISIBLE = ['public', 'web'] as const satisfies readonly ProjectVisibility[]

/** Cette visibilité, lue en base ou reçue, est-elle de celles que voient tous les membres ? */
export const isMemberVisible = (visibility: string) =>
  (MEMBER_VISIBLE as readonly string[]).includes(visibility)

/**
 * « visibility in ('public', 'web') », écrit en toutes lettres plutôt qu'en paramètres liés
 * (`inArray` écrirait « in ($1, $2) »). Les index partiels de la migration 0025
 * (project_public_published_idx, project_shared_published_idx) ne servent une requête que si
 * PostgreSQL peut prouver que sa condition implique la leur ; avec des constantes, la preuve tient
 * toujours, même quand PostgreSQL garde un plan générique d'une requête préparée (où les paramètres
 * ne sont pas encore connus). `sql.raw` ne reçoit ici que les constantes de `MEMBER_VISIBLE`, écrites
 * dans ce fichier : jamais une entrée du client.
 */
const memberVisibleSql = () =>
  sql`${schema.project.visibility} in (${sql.raw(MEMBER_VISIBLE.map((v) => `'${v}'`).join(', '))})`

/**
 * Un projet visible de tous les membres (`public` ou `web`, R12) et pas retiré par la modération,
 * quel que soit le visiteur. Sert aux nombres, qui sont les mêmes pour tous (commentaires,
 * réactions) : un blocage ne les change pas. Pour montrer des projets à quelqu'un, c'est
 * `listedProjectFor`. `isNull` : « removed_at is null ». Jamais un projet réservé à une ruche :
 * sans lecteur, on ne sait pas s'il en est membre.
 */
export const listedProject = () => and(memberVisibleSql(), isNull(schema.project.removedAt))

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
  inViewerHives(schema.project.hiveId, viewerId)

/**
 * « Cette ruche (une colonne qui porte un identifiant de ruche) est l'une de celles de ce membre,
 * aujourd'hui » : la sous-requête de `hiveMemberOf`, pour une autre colonne que celle du projet
 * (R10, relecture de sécurité, décision du 15/11/2026 : la ruche pour laquelle un commentaire a été
 * écrit, `project_comment.hive_id`, lue par `seesSql` et les notifications). Même coût : ses
 * ruches, lues une fois par requête par l'index hive_member_user_idx. Une ruche supprimée n'a plus
 * de membres : la condition est fausse pour tous. L'alias « hm » nomme la table de la
 * sous-requête : la colonne comparée, écrite hors de la parenthèse, reste celle de l'appelant.
 */
export const inViewerHives = (hiveId: Column | SQL, viewerId: string): SQL =>
  sql`${hiveId} in (select hm.hive_id from ${schema.hiveMember} hm where hm.user_id = ${viewerId})`

/**
 * La règle `readsHiveOf` de comments/load.ts, en SQL (R10, relecture de sécurité, décision du
 * 15/11/2026) : ce membre lit-il un commentaire qui porte cette ruche (project_comment.hive_id,
 * ou celle d'un alias) ? Oui s'il a été écrit hors de toute ruche (null), ou si le membre en fait
 * partie aujourd'hui. L'auteur du projet et l'auteur du commentaire, qui le lisent toujours, sont
 * traités par l'appelant (seesSql, les notifications, le nombre de commentaires). Ses ruches
 * viennent de la base (inViewerHives), jamais d'une liste recopiée. Aucun index sur hive_id : la
 * condition se lit sur des commentaires déjà trouvés par leur projet, leur fil ou leur auteur.
 */
export const readsHiveSql = (hiveId: Column | SQL, viewerId: string): SQL =>
  sql`(${hiveId} is null or ${inViewerHives(hiveId, viewerId)})`

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
  (isMemberVisible(project.visibility) || (project.visibility === 'hive' && project.inViewerHive))

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

/**
 * R12 : un projet qu'un visiteur SANS COMPTE peut lire (plan, choix 2 ; relecture de sécurité B3 :
 * une seule condition pour toutes les surfaces publiques : page du projet, mises à jour, page
 * publique de l'auteur, vitrine, plan du site, tête HTML, médias, cible d'un signalement). Il faut
 * les trois :
 * - `web` (« Public ») : ni « Membres », ni réservé à une ruche, ni privé ;
 * - pas retiré par la modération (un auteur suspendu dont le projet n'est pas retiré reste lu :
 *   décision du 16/11/2026, plan R12, comme pour les membres) ;
 * - un auteur au compte vérifié (`verifiedAuthor`), donc aussi un auteur qui existe encore : un
 *   compte supprimé n'a plus de ligne dans "user", la sous-requête ne rend rien et la condition est
 *   fausse.
 * Aucun blocage : un visiteur n'a pas d'identité à bloquer. « = 'web' » en toutes lettres, pour la
 * même raison que `memberVisibleSql` : l'index partiel project_web_published_idx (`visibility =
 * 'web' and removed_at is null`) sert le plan du site et les projets d'une page publique.
 */
export const visitorVisibleProject = () =>
  and(sql`${schema.project.visibility} = 'web'`, isNull(schema.project.removedAt), verifiedAuthor())

/**
 * La règle `visitorVisibleProject` pour un seul projet, connu par son identifiant (les routes
 * `/v1/public/*`, les médias). Un identifiant mal formé répond « non » sans lire la base : la colonne
 * est un uuid, et PostgreSQL refuserait la comparaison par une erreur. Sinon, une lecture de la clé
 * primaire de project, plus celle de "user" (verifiedAuthor) ; l'identifiant entre comme paramètre
 * lié. `limit 1` : on ne veut savoir qu'une chose, s'il existe une ligne.
 */
export const visibleToVisitor = async (db: Database, projectId: string): Promise<boolean> => {
  if (!z.uuid().safeParse(projectId).success) return false
  const [row] = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), visitorVisibleProject()))
    .limit(1)
  return row !== undefined
}
