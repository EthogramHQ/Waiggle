// L'export des données d'un membre (droit d'accès du RGPD). Fichier à part : il rassemble des
// formes venues de plusieurs fichiers (compte, projets…), sans créer de dépendance circulaire.
import { z } from 'zod'
import { Me } from './accounts'
import { Project, ProjectId } from './projects'

/**
 * L'export des données d'un membre (droit d'accès du RGPD), renvoyé par GET /v1/me/export.
 * Il ne contient jamais de secret : ni mot de passe, ni jeton de session.
 */
export const AccountExport = z
  .object({
    exportedAt: z.iso.datetime(),
    user: Me,
    projects: z.array(Project),
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
