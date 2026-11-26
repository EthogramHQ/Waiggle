// La suppression d'un compte, étape par étape : une seule liste, pour les deux chemins qui
// suppriment un compte (R11, relecture de sécurité S-C2).
// - « Supprimer mon compte » (POST /api/auth/delete-user) : Better Auth appelle `beforeDelete`,
//   efface la ligne du membre, puis appelle `afterDelete` (auth/auth.ts branche les deux rappels de
//   `accountDeletionHooks`) ;
// - la tâche des comptes inactifs (jobs/inactive-accounts.ts), qui n'a pas de session : elle
//   appelle `deleteAccount`, qui fait les mêmes trois temps.
// Une étape ajoutée un jour ici vaut donc pour les deux, sans risque d'en oublier une.
import { type Database, schema } from '@ruche/db'
import { and, eq, isNotNull } from 'drizzle-orm'
import { forgetResetLinks } from '../auth/password'
import { eraseCommentsOf, sweepOrphanComments } from '../comments/erase'
import { removeFromHive } from '../hives/write'
import { describeError } from '../log'
import type { FileStorage } from '../media/storage'
import { releaseAvatarKey } from '../moderation/replaced'
import { suspensionEmailKey } from '../moderation/suspend'
import { mediaKeysOf } from '../projects/load'
import { deleteAddressCounters, deleteMemberCounters } from '../rate-limit'
import { voidReportsOfDepartedAuthors } from '../reports/queue'
import { closeSuspensionsOfDeparted } from '../suspension/load'
import { dropOrphanOthers } from '../tools/write'

export type AccountDeletionDeps = {
  db: Database
  /** Le stockage des fichiers : l'avatar et les photos du compte y sont effacés. */
  storage: FileStorage
  /** BETTER_AUTH_SECRET : les compteurs de son adresse sont rangés sous une empreinte qui en dérive. */
  secret: string
}

/** Ce que la suppression doit savoir du compte : son identifiant, et son adresse (ses compteurs). */
export type DepartingAccount = { id: string; email: string }

/**
 * Qui supprime, pour les journaux d'une panne après coup (`describeError`, log.ts) : la route de
 * Better Auth, ou la tâche de nuit. Jamais rien du compte lui-même.
 */
export type DeletionOrigin = { method: string; path: string }

export const MEMBER_DELETION: DeletionOrigin = { method: 'POST', path: '/api/auth/delete-user' }

/**
 * Le premier temps, juste avant d'effacer la ligne du membre : ce qu'on ne retrouverait plus après.
 * Rend les clés des fichiers à effacer ensuite (son avatar, les photos de ses projets, ses images
 * du coin des testeurs) : leurs lignes partent avec le compte, pas les fichiers eux-mêmes.
 */
export const beforeAccountDeletion = async (db: Database, userId: string): Promise<string[]> => {
  const [row] = await db
    .select({ avatarKey: schema.profile.avatarKey })
    .from(schema.profile)
    .where(eq(schema.profile.userId, userId))
  const projects = await db
    .select({ id: schema.project.id })
    .from(schema.project)
    .where(eq(schema.project.authorId, userId))
  const keys = await mediaKeysOf(
    db,
    projects.map((p) => p.id),
  )
  // R7b : ses images du coin des testeurs sur les projets des autres (ses captures, en attente
  // comprises) : leurs lignes partent avec lui (owner_id, cascade), pas leurs fichiers. Celles de
  // ses propres projets sont déjà dans `keys` (mediaKeysOf) : un Set retire les doublons. Cette
  // lecture par owner_id seul n'a pas d'index (celui de tester_media a project_id en tête) : elle
  // parcourt la table une fois par suppression de compte, rare ; un index dédié coûterait à chaque
  // envoi d'image.
  const ownedImages = await db
    .select({ storageKey: schema.testerMedia.storageKey })
    .from(schema.testerMedia)
    .where(eq(schema.testerMedia.ownerId, userId))
  // R20 (sécurité A5, juridique J3) : les captures de ses retours d'Éclaireuse ; leurs lignes
  // partent avec le compte (`member_id`, cascade), pas leurs fichiers. La lecture suit
  // `scout_report_member_idx` (member_id en tête).
  const scoutCaptures = await db
    .select({ mediaKey: schema.scoutReport.mediaKey })
    .from(schema.scoutReport)
    .where(and(eq(schema.scoutReport.memberId, userId), isNotNull(schema.scoutReport.mediaKey)))
  const all = [
    ...new Set([
      ...keys,
      ...ownedImages.map((image) => image.storageKey),
      ...scoutCaptures.flatMap((row) => (row.mediaKey ? [row.mediaKey] : [])),
    ]),
  ]
  // R9 : une photo de profil retirée par la modération porte la clé `withheld/<id>` ; le vrai
  // fichier est gardé dans son retrait (hidden_value.storageKey). releaseAvatarKey rend la vraie
  // clé, pour qu'il parte aussi du stockage et ne reste pas orphelin.
  const avatarKey = row?.avatarKey ? await releaseAvatarKey(db, userId, row.avatarKey) : null
  // Ses commentaires (tranche 5) : effacés, sauf ses racines auxquelles d'autres ont répondu, qui
  // deviennent « Commentaire supprimé » (voir comments/erase.ts). Ici et pas après : une fois le
  // compte parti, on ne saurait plus lesquels étaient les siens.
  await eraseCommentsOf(db, userId)
  // R9 (sécurité P2) : les décisions qui visent son profil gardent son ancien nom et son ancien
  // pseudo (pour un rétablissement). Une fois le compte parti, ces valeurs désigneraient un membre
  // disparu : on les vide ici et pas après, car la base remet target_member_id à null à la
  // suppression et on ne retrouverait plus les lignes. La décision elle-même reste (garde d'un
  // an). La requête suit moderation_decision_target_idx.
  await db
    .update(schema.moderationDecision)
    .set({ previousValue: null, provisionalValue: null })
    .where(eq(schema.moderationDecision.targetMemberId, userId))
  // R10 : il quitte chacune de ses ruches, comme par « Quitter la ruche » (hives/write.ts,
  // `removeFromHive`), avec les mêmes verrous et le même ordre (la ruche, puis sa ligne de membre,
  // puis ses projets réservés) : s'il animait, l'animation passe au membre le plus ancien, qui lit
  // « Tu animes maintenant la ruche Famille. » ; s'il était le dernier, la ruche est supprimée avec
  // ses invitations (cascade). Ici, avant la suppression du compte, et pas en laissant faire la
  // base : la cascade effacerait bien sa ligne de membre, mais l'animateur deviendrait nul (set
  // null) sans successeur, et une ruche vide resterait. Ses projets réservés passent un instant en
  // privé (sinon leur clé étrangère retiendrait une ruche vide), puis partent avec le compte.
  // Ses ruches par l'index hive_member_user_idx (20 au plus : HIVE_LIMITS.joined). Une transaction
  // par ruche, l'une après l'autre : chacune ne verrouille que sa ruche, et un geste simultané d'un
  // autre membre sur l'une n'attend pas les autres.
  // Ce qu'il laisse chez les autres reste lisible sans lui : ses invitations encore en attente
  // gardent leur ruche, sans inviteur (inviter_id remis à null par la base) ; une épingle qu'il a
  // posée reste à la ruche, sans « épinglé par » (pinned_by remis à null).
  const memberships = await db
    .select({ hiveId: schema.hiveMember.hiveId })
    .from(schema.hiveMember)
    .where(eq(schema.hiveMember.userId, userId))
  const leftAt = new Date()
  for (const { hiveId } of memberships) {
    await removeFromHive(db, hiveId, userId, userId, leftAt)
  }
  return avatarKey ? [avatarKey, ...all] : all
}

/**
 * Le dernier temps, juste après l'effacement de la ligne du membre : ses fichiers, les compteurs
 * anti-abus qui portent son identifiant ou l'empreinte de son adresse, et ce que la base a laissé
 * derrière lui (commentaires sans auteur, « Autre » orphelins, signalements, suspension).
 *
 * D'abord, une ligne dans les journaux : seulement l'identifiant (ni nom, ni adresse). Une
 * sauvegarde restaurée ramènerait ce compte ; cette ligne dit qu'il faut le supprimer de nouveau
 * (docs/ops/serveur.md, « Sauvegardes »). Écrite en premier, elle ne dépend pas du ménage qui suit :
 * le compte est déjà parti. La même ligne, mot pour mot, pour la tâche des comptes inactifs (S-C1).
 */
export const afterAccountDeletion = async (
  { db, storage, secret }: AccountDeletionDeps,
  account: DepartingAccount,
  files: string[],
  origin: DeletionOrigin,
) => {
  console.log(`Account deleted ${account.id}`)
  for (const key of files) await storage.delete(key)
  await deleteMemberCounters(db, account.id)
  // Tranche R2, jur-6 : ses liens de mot de passe oublié encore valides, et tous les compteurs de
  // son adresse (mot de passe oublié, renvoi du lien, correction de l'adresse : des empreintes,
  // mais qui désignent toujours cette adresse).
  await forgetResetLinks(db, account.id)
  await deleteAddressCounters(db, secret, account.email)
  // Les commentaires restés sans auteur : un commentaire publié pendant la suppression, entre le
  // premier temps et maintenant (voir comments/erase.ts).
  await sweepOrphanComments(db)
  // R6b (sec-A5) : les « Autre » que ses projets et son profil étaient seuls à citer. Les lignes de
  // project_tool et profile_tool sont parties avec le compte (cascade) ; la purge de nuit rattrape
  // une panne ici.
  try {
    await dropOrphanOthers(db)
  } catch (error) {
    console.error('Other tools not swept after deletion', describeError(error, origin))
  }
  // Les signalements qui visaient ses contenus ou son profil (tranche 7a, règle 16) : la base a
  // déjà remis leur target_author_id à null ; les ouverts et les classés passent à « sans objet »
  // (effacés 30 jours plus tard), ceux suivis d'un retrait restent un an. Ici, après la
  // suppression, et pas avant : une suppression refusée ne touche à rien. Ceux qu'il a faits
  // restent, sans son nom (reporter_id remis à null par la base). Une panne ici ne doit pas faire
  // échouer la suppression, déjà faite : la purge de nuit rattrape (reports/retention.ts).
  try {
    await voidReportsOfDepartedAuthors(db, new Date())
  } catch (error) {
    console.error('Reports not voided after deletion', describeError(error, origin))
  }
  // Sa suspension en cours (tranche 7c, J1) : partir est permis, et n'efface pas la preuve. Elle
  // est close à la date du départ, sans décision de levée, et gardée un an avec ses décisions. Ici,
  // après la suppression : une suppression refusée laisse la suspension en cours. Le compteur de
  // ses e-mails de suspension (S18) porte son identifiant : effacé aussi. Une panne ne fait pas
  // échouer la suppression, déjà faite.
  try {
    await closeSuspensionsOfDeparted(db, new Date())
    await db
      .delete(schema.apiRateLimit)
      .where(eq(schema.apiRateLimit.key, suspensionEmailKey(account.id)))
  } catch (error) {
    console.error('Suspension not closed after deletion', describeError(error, origin))
  }
}

/**
 * Les deux rappels de Better Auth (`user.deleteUser` dans auth/auth.ts). Les fichiers notés au
 * premier temps attendent le dernier dans un dictionnaire (identifiant du membre → ses fichiers) :
 * Better Auth efface la ligne entre les deux, et on ne pourrait plus les retrouver.
 */
export const accountDeletionHooks = (deps: AccountDeletionDeps) => {
  const filesToDelete = new Map<string, string[]>()
  return {
    beforeDelete: async (user: { id: string }) => {
      filesToDelete.set(user.id, await beforeAccountDeletion(deps.db, user.id))
    },
    afterDelete: async (user: DepartingAccount) => {
      const files = filesToDelete.get(user.id) ?? []
      filesToDelete.delete(user.id)
      await afterAccountDeletion(deps, user, files, MEMBER_DELETION)
    },
  }
}

/**
 * Supprime un compte sans passer par Better Auth (la tâche des comptes inactifs) : les mêmes trois
 * temps. L'effacement de la ligne `user` emporte par la base (« cascade ») ses sessions, ses
 * méthodes de connexion et tout ce qui lui appartient, comme celui de Better Auth (qui efface
 * d'abord sessions et méthodes, puis la ligne : le résultat est le même). L'appelant a relu
 * l'activité du compte juste avant (jobs/inactive-accounts.ts).
 */
export const deleteAccount = async (
  deps: AccountDeletionDeps,
  account: DepartingAccount,
  origin: DeletionOrigin,
) => {
  const files = await beforeAccountDeletion(deps.db, account.id)
  await deps.db.delete(schema.user).where(eq(schema.user.id, account.id))
  await afterAccountDeletion(deps, account, files, origin)
}
