// Le marquage d'un compte d'exemples (tranche R12b, « Les exemples ») : l'équipe publie, depuis un
// compte à elle, des projets fictifs qui remplissent la vitrine de l'accueil. L'appli les montre
// avec une pastille « Exemple », pour que personne ne les prenne pour de vrais projets.
import { z } from 'zod'

/**
 * `true` seulement pour l'auteur ou le membre d'un compte d'exemples ; absent pour tout autre
 * membre. Un champ absent plutôt que `false` : les réponses de tous les autres comptes, et les
 * données de test qui les imitent, restent exactement ce qu'elles étaient.
 */
export const ExampleFlag = z.literal(true).optional()
