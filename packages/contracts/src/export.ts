// L'export des données d'un membre (droit d'accès du RGPD). Fichier à part : il rassemble des
// formes venues de plusieurs fichiers (compte, projets…), sans créer de dépendance circulaire.
import { z } from 'zod'
import { Me } from './accounts'
import { CommentId } from './comments'
import { Project, ProjectId } from './projects'
import { ReactionKind } from './reactions'

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
      }),
    ),
    loginMethods: z.array(z.object({ provider: z.string(), createdAt: z.iso.datetime() })),
    sessions: z.array(
      z.object({
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        ipAddress: z.string().nullable(),
        userAgent: z.string().nullable(),
      }),
    ),
  })
  .meta({ id: 'AccountExport' })
export type AccountExport = z.infer<typeof AccountExport>
