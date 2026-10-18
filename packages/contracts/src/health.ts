// Zod décrit la forme attendue d'une donnée et sait la vérifier pendant l'exécution.
// TypeScript, lui, ne vérifie qu'à la compilation : il ne voit pas ce qui arrive par le réseau.
// Avec Zod, on écrit la forme une seule fois et on obtient les deux : la vérification et le type.
import { z } from 'zod'

// Réponse de la route GET /health, qui indique que l'API fonctionne.
export const HealthResponse = z
  .object({
    status: z.literal('ok'), // exactement la chaîne 'ok', rien d'autre
    version: z.string(),
  })
  // .meta() ajoute des informations reprises dans la documentation OpenAPI générée.
  .meta({ id: 'HealthResponse', description: 'The API is up and running.' })

// z.infer fabrique le type TypeScript à partir du schéma : { status: 'ok'; version: string }.
// Le schéma et le type portent le même nom : TypeScript sait lequel utiliser selon le contexte.
export type HealthResponse = z.infer<typeof HealthResponse>
