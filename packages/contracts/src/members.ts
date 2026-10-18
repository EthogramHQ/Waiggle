// La page d'un membre, telle que les autres membres la voient (GET /v1/members/{id}).
// Elle ne contient que ce qui est public entre membres : jamais l'adresse e-mail, la langue ou
// les dates de connexion. z.object ne garde que les champs listés ici, et l'API passe sa réponse
// par Member.parse : un champ de plus, lu par erreur dans la base, ne pourrait pas en sortir.
import { z } from 'zod'
import { PROJECT_LIST_MAX, ProjectSummary, ProjectTool } from './projects'

/**
 * L'identifiant d'un membre dans une adresse. Ceux de Better Auth sont faits de lettres, de
 * chiffres, de « _ » et de « - » : tout le reste ne peut désigner personne.
 */
export const MemberId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

export const Member = z
  .object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.url().nullable(), // null : pas d'avatar
    bio: z.string(),
    /** Les outils favoris du profil, chacun avec son étiquette pour mener à sa page. */
    favoriteTools: z.array(ProjectTool),
    /** Vrai si c'est la page du membre qui regarde : ses projets privés y figurent aussi. */
    isMe: z.boolean(),
    /** Ses projets que le visiteur a le droit de voir, du plus récent au plus ancien. */
    projects: z.array(ProjectSummary).max(PROJECT_LIST_MAX),
  })
  .meta({ id: 'Member' })
export type Member = z.infer<typeof Member>
