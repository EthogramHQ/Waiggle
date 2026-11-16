// La tête des pages publiques (tranche R12, plan, choix 5) : GET /v1/public/head?path=…&lang=…,
// que Caddy appelle pour chaque page publique servie, et dont il glisse la réponse dans le `<head>`
// de la page pré-rendue. Le fragment est construit par seo/head.ts.
//
// Cette route répond **toujours** 200 (relecture du plan, décision 1 ; relecture de sécurité I1) :
// une erreur ferait échouer le gabarit de Caddy, donc tomber toute la page. Un chemin illisible,
// trop long, inconnu, ou une page qui n'est pas publique reçoit la tête neutre, la même que pour un
// identifiant inconnu. Sans quota ni limite de lecture : Caddy la demande à chaque page, depuis
// sa propre adresse (security/visitor-limit.ts l'exempte). La session n'y est jamais lue (app.ts).
import { createRoute, z } from '@hono/zod-openapi'
import { HeadQuery } from '@ruche/contracts'
import type { Database } from '@ruche/db'
import { headFor } from '../seo/head'
import { createRouter } from './router'

const headRoute = createRoute({
  method: 'get',
  path: '/v1/public/head',
  summary: 'The HTML head of a public page, for the web server',
  description:
    'Title, description, canonical address, `hreflang`, Open Graph and `robots`, escaped (no ' +
    'square bracket). Always 200: any page that is not public, unknown or malformed gets the ' +
    'same neutral head (`noindex`).',
  // La forme des paramètres pour la documentation seulement : deux textes facultatifs, que rien ne
  // refuse. La vraie lecture est `HeadQuery`, dans la route : ses `.catch` (une valeur refusée
  // devient la tête neutre) n'ont pas d'équivalent OpenAPI, et la documentation échouerait (500).
  request: {
    query: z.object({
      path: z.string().optional().openapi({ example: '/fr/projects/<id>' }),
      lang: z.string().optional().openapi({ example: 'fr' }),
    }),
  },
  responses: {
    200: {
      description: 'A fragment of HTML, to put in `<head>`.',
      content: { 'text/html': { schema: z.string() } },
    },
  },
})

type Deps = { db: Database; appUrl: string; publicApiUrl: string }

export const publicHeadRoutes = ({ db, appUrl, publicApiUrl }: Deps) => {
  const app = createRouter()

  app.openapi(headRoute, async (c) => {
    // `HeadQuery` ne rejette jamais : un chemin illisible devient null, une langue inconnue « fr ».
    const { path, lang } = HeadQuery.parse(c.req.valid('query'))
    const html = await headFor(db, { path, lang, appUrl, apiUrl: publicApiUrl })
    // Rien à garder : le fragment entre dans une page que Caddy assemble à chaque demande, et un
    // projet qui cesse d'être public doit perdre sa tête à l'instant. La même valeur pour toute
    // réponse, tête neutre comprise : rien ne distingue une page cachée d'une page inconnue.
    c.header('Cache-Control', 'no-store')
    return c.html(html, 200)
  })

  return app
}
