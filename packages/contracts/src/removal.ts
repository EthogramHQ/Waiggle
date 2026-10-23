// Le retrait d'un contenu par la modération (tranche 7a), tel que son auteur le lit. Fichier à
// part, sans autre import que zod : les projets, les notes et les commentaires s'en servent, et
// reports.ts lit les projets ; le mettre dans reports.ts ferait une boucle d'imports.
import { z } from 'zod'

/** Le fondement d'un retrait : la loi, ou les règles de l'appli. */
export const RemovalGround = z.enum(['illegal', 'rules'])
export type RemovalGround = z.infer<typeof RemovalGround>

/** L'explication d'un retrait, montrée à l'auteur du contenu : 500 caractères au plus. */
export const REMOVAL_EXPLANATION_MAX = 500

/**
 * Ce que l'auteur d'un contenu retiré lit (article 17 du règlement européen sur les services
 * numériques) : le fondement, l'explication, la date, et si le retrait a suivi un signalement
 * (jamais de qui). Aucun identifiant d'administrateur. Null partout pour les autres membres, qui ne
 * voient de toute façon plus le contenu.
 */
export const Removal = z
  .object({
    ground: RemovalGround,
    explanation: z.string(),
    at: z.iso.datetime(),
    /** Vrai si un membre autre que l'administrateur avait signalé le contenu. */
    afterReport: z.boolean(),
  })
  .meta({ id: 'Removal' })
export type Removal = z.infer<typeof Removal>
