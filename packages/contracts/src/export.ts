// L'export des données d'un membre (droit d'accès du RGPD). Fichier à part : il rassemble des
// formes venues de plusieurs fichiers (compte, projets…), sans créer de dépendance circulaire.
import { z } from 'zod'
import { Me } from './accounts'
import { BlockExport } from './blocks'
import { CommentId } from './comments'
import { EmailPreferencesExport } from './email'
import { Project, ProjectId } from './projects'
import { ReactionKind } from './reactions'
import { Removal } from './removal'
import { ReportExport } from './reports'

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
    /** Toutes les notes publiées sur ses projets, des plus anciennes aux plus récentes. */
    notes: z.array(
      z.object({
        projectId: ProjectId,
        id: z.uuid(),
        body: z.string(),
        createdAt: z.iso.datetime(),
        /** Le retrait par la modération (tranche 7a) ; null pour une note visible. */
        removal: Removal.nullable(),
      }),
    ),
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
     * Les signalements qu'il a faits (tranche 7a), des plus anciens aux plus récents, sans le texte
     * visé. Jamais ceux qui visent ses contenus.
     */
    reports: z.array(ReportExport),
    /** Les membres qu'il a bloqués (tranche 7b), des plus anciens aux plus récents ; jamais qui l'a bloqué. */
    blocks: z.array(BlockExport),
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
