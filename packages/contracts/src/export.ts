// L'export des données d'un membre (droit d'accès du RGPD). Fichier à part : il rassemble des
// formes venues de plusieurs fichiers (compte, projets…), sans créer de dépendance circulaire.
import { z } from 'zod'
import { Me } from './accounts'
import { BlockExport } from './blocks'
import { CommentId } from './comments'
import { EmailPreferencesExport } from './email'
import { Project, ProjectId } from './projects'
import { ReactionKind } from './reactions'
import { Removal, RemovedPart } from './removal'
import { ModerationDecisionExport, ReportExport } from './reports'
import { DismissedSuggestionExport } from './suggestions'
import { SuspensionExport } from './suspension'
import {
  TesterCallExport,
  TesterMessageExport,
  TesterRemovalExport,
  TesterThreadReadExport,
} from './testers'
import { UpdateFamily } from './updates'

/**
 * L'export des données d'un membre (droit d'accès du RGPD), renvoyé par GET /v1/me/export.
 * Il ne contient jamais de secret : ni mot de passe, ni jeton de session.
 */
export const AccountExport = z
  .object({
    exportedAt: z.iso.datetime(),
    user: Me,
    projects: z.array(Project),
    /**
     * L'ancien pseudo qui lui reste réservé après un changement (tranche 6a), avec la date où il
     * redevient libre ; null s'il n'en a pas. Le pseudo actuel est dans `user.handle`.
     */
    formerHandle: z.object({ handle: z.string(), reservedUntil: z.iso.datetime() }).nullable(),
    /**
     * R6b : les changements de catégorie faits par un administrateur sur ses projets (« ranger un
     * projet »), des plus anciens aux plus récents, sans nommer l'administrateur (jur-T4).
     */
    categoryChanges: z.array(
      z.object({
        projectId: ProjectId,
        from: z.string(),
        to: z.string(),
        at: z.iso.datetime(),
      }),
    ),
    /**
     * R7a : toutes les mises à jour publiées sur ses projets, des plus anciennes aux plus récentes,
     * avec le titre du projet (le sien) et les descriptions de leurs photos. Remplace les notes,
     * effacées avec le Journal.
     */
    updates: z.array(
      z.object({
        projectId: ProjectId,
        projectTitle: z.string(),
        id: z.uuid(),
        title: z.string().nullable(),
        version: z.string().nullable(),
        lines: z.array(z.object({ family: UpdateFamily, text: z.string() })),
        beforeAfter: z.boolean(),
        /** Les descriptions de ses photos, dans l'ordre (null : une photo sans description). */
        photoDescriptions: z.array(z.string().nullable()),
        createdAt: z.iso.datetime(),
        /** Le retrait par la modération ; null pour une mise à jour visible. */
        removal: Removal.nullable(),
      }),
    ),
    /**
     * R7a : les projets dont il est testeur, des plus anciennes inscriptions aux plus récentes.
     * `title` vaut null quand le projet ne lui est plus visible (devenu privé, retiré, ou un
     * blocage) : son titre actuel appartient à un autre (relecture de sécurité B3, juridique 8).
     */
    testerOf: z.array(
      z.object({ projectId: ProjectId, title: z.string().nullable(), since: z.iso.datetime() }),
    ),
    /**
     * R7b : le coin des testeurs, des plus anciens aux plus récents. Ses appels (comme auteur) ;
     * ses messages, retours et réponses, jamais ceux de l'autre personne du fil ; les membres qu'il a
     * retirés de ses testeurs, par pseudo ; et jusqu'où il a lu chacun de ses fils. Les images sont
     * données par leur adresse, pas par le fichier. `title` vaut null quand le projet ne lui est plus
     * visible, comme pour `testerOf`.
     */
    testerCalls: z.array(TesterCallExport),
    testerMessages: z.array(TesterMessageExport),
    testerRemovals: z.array(TesterRemovalExport),
    testerThreadReads: z.array(TesterThreadReadExport),
    /**
     * Ce que le membre suit : seulement l'identifiant et la date. Un projet suivi a pu devenir privé
     * depuis : son titre n'appartient pas au membre qui le suit, l'export ne le donne donc pas.
     */
    follows: z.object({
      members: z.array(z.object({ id: z.string(), followedAt: z.iso.datetime() })),
      projects: z.array(z.object({ id: ProjectId, followedAt: z.iso.datetime() })),
    }),
    /**
     * Ses réactions et ses commentaires (tranche 5), des plus anciens aux plus récents. Comme pour
     * les abonnements, le projet n'est donné que par son identifiant : il appartient à un autre, et
     * a pu devenir privé. Un commentaire « supprimé » (texte effacé) n'y est plus.
     */
    reactions: z.array(
      z.object({ projectId: ProjectId, kind: ReactionKind, createdAt: z.iso.datetime() }),
    ),
    comments: z.array(
      z.object({
        projectId: ProjectId,
        id: CommentId,
        /** La racine à laquelle il répond ; null pour une racine. */
        replyTo: CommentId.nullable(),
        body: z.string(),
        createdAt: z.iso.datetime(),
        editedAt: z.iso.datetime().nullable(),
        /**
         * Quand l'auteur du projet l'a masqué ; null s'il est visible. Une décision de modération
         * sur le texte du membre est une donnée qui le concerne.
         */
        hiddenAt: z.iso.datetime().nullable(),
        /** Le retrait par la modération (tranche 7a) ; null pour un commentaire visible. */
        removal: Removal.nullable(),
        /** Les identifiants des membres qu'il y mentionne (tranche 6b). */
        mentions: z.array(z.string()),
      }),
    ),
    /**
     * Les notifications (tranche 6b) : elles sont calculées à partir des gestes des autres, qui ne
     * lui appartiennent pas ; l'export ne garde donc que ce qui est à lui : jusqu'où il les a vues
     * (null s'il n'a jamais ouvert l'écran).
     */
    notifications: z.object({ seenAt: z.iso.datetime().nullable() }),
    /**
     * Le fil (R4) : jusqu'où il l'a lu, la seule trace gardée de ses lectures (null s'il ne l'a
     * jamais ouvert). Jamais la liste de ce qu'il a lu.
     */
    feed: z.object({ readAt: z.iso.datetime().nullable() }),
    /**
     * Les membres qu'il ne veut plus se voir suggérer (R4), des plus anciens aux plus récents ;
     * jamais qui l'a écarté.
     */
    dismissedSuggestions: z.array(DismissedSuggestionExport),
    /**
     * Les signalements qu'il a faits (tranche 7a), des plus anciens aux plus récents, sans le texte
     * visé. Jamais ceux qui visent ses contenus.
     */
    reports: z.array(ReportExport),
    /** Les membres qu'il a bloqués (tranche 7b), des plus anciens aux plus récents ; jamais qui l'a bloqué. */
    blocks: z.array(BlockExport),
    /**
     * Les suspensions de son compte, avec leur fin (tranche 7c), des plus anciennes aux plus
     * récentes. Les retraits de ses contenus sont déjà dans `removal` de chacun.
     */
    moderation: z.array(SuspensionExport),
    /**
     * R9 (jur-P3) : les décisions qui le visent (retraits entiers ou d'une partie, rétablissements,
     * suspensions, levées), avec la partie retirée et l'ancien nom ou pseudo remplacé d'office,
     * des plus anciennes aux plus récentes. Jamais l'administrateur, jamais qui a signalé.
     */
    moderationDecisions: z.array(ModerationDecisionExport),
    /**
     * R9 (jur-B5, RGPD art. 15 et 20) : les parties de son profil retirées par la modération, avec leur
     * valeur et leur décision : bio, outils favoris, photo (son adresse, servie à lui seul), et nom ou
     * pseudo tant qu'ils sont provisoires. Leur texte ne vit plus que là : `user.bio` est vide. Les
     * parties de ses projets sont dans `removedParts` de chaque projet. Jamais l'administrateur, ni
     * qui a signalé, ni le nom ou pseudo provisoire.
     */
    profileRemovedParts: z.array(RemovedPart),
    /** Ses réglages d'e-mail et les dates d'envoi gardées (tranche 6c). */
    emailPreferences: EmailPreferencesExport,
    loginMethods: z.array(z.object({ provider: z.string(), createdAt: z.iso.datetime() })),
    sessions: z.array(
      z.object({
        createdAt: z.iso.datetime(),
        /** La dernière utilisation (au plus une mise à jour par jour) : le récap s'en sert (6c). */
        updatedAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        ipAddress: z.string().nullable(),
        userAgent: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'AccountExport' })
export type AccountExport = z.infer<typeof AccountExport>
