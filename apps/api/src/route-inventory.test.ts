// L'inventaire des routes (tranche 7b, règle 18 de la relecture du plan) : chaque route de l'API est
// classée selon ce qu'elle fait d'un blocage. Une route ajoutée un jour sans être classée fait
// échouer ce test : quelqu'un doit alors décider si elle montre le geste d'un autre membre, et donc
// si elle doit cacher un membre bloqué (blocks/visibility.ts).
//
// Les classes :
// - hidesBlocked : montre le contenu ou le geste d'un autre membre ; un blocage, dans un sens ou
//   dans l'autre, le cache (les tests de chaque fonctionnalité le vérifient) ;
// - own : ne touche qu'à ce qui est à soi (son compte, ses réglages, ses propres gestes) ;
// - admin : l'administration, qui ignore les blocages (précision 7 : sinon bloquer l'administrateur
//   ferait échapper à la modération) ;
// - public : sans contenu d'un membre (santé, contrat, connexion, fichiers à clé aléatoire).
import { describe, expect, it } from 'vitest'
import { createTestContext } from './testing/context'

type RouteClass = 'hidesBlocked' | 'own' | 'admin' | 'public'

/** Chaque route, « MÉTHODE /chemin » tel que Hono l'écrit (`:id` pour un paramètre). */
const ROUTES: Record<string, RouteClass> = {
  'GET /health': 'public',
  'GET /openapi.json': 'public',
  // Better Auth : inscription, connexion, vérification, suppression du compte.
  'GET /api/auth/*': 'public',
  'POST /api/auth/*': 'public',
  // Les fichiers : une clé tirée au hasard, neuve à chaque photo (règle 11).
  'GET /media/:folder{(?:avatars|visuals)}/:file': 'public',
  // Mon compte.
  'GET /v1/me': 'own',
  'PATCH /v1/me': 'own',
  'POST /v1/me/avatar': 'own',
  'GET /v1/me/export': 'own',
  'GET /v1/me/email-preferences': 'own',
  'PATCH /v1/me/email-preferences': 'own',
  'GET /v1/me/blocks': 'own',
  // Le lien de désinscription d'un e-mail : signé, sans session.
  'GET /v1/email/unsubscribe': 'public',
  'POST /v1/email/unsubscribe': 'public',
  // Les projets, leurs notes, visuels, réactions et commentaires.
  'POST /v1/projects': 'own',
  'GET /v1/projects/:id': 'hidesBlocked',
  'PATCH /v1/projects/:id': 'own',
  'DELETE /v1/projects/:id': 'own',
  'POST /v1/projects/:id/visuals': 'own',
  'DELETE /v1/projects/:id/visuals/:visualId': 'own',
  'POST /v1/projects/:id/notes': 'own',
  'DELETE /v1/projects/:id/notes/:noteId': 'own',
  'PUT /v1/projects/:id/reactions/:kind': 'hidesBlocked',
  'DELETE /v1/projects/:id/reactions/:kind': 'own',
  'GET /v1/projects/:id/comments': 'hidesBlocked',
  'POST /v1/projects/:id/comments': 'hidesBlocked',
  'PATCH /v1/projects/:id/comments/:commentId': 'hidesBlocked',
  'DELETE /v1/projects/:id/comments/:commentId': 'own',
  'PUT /v1/projects/:id/comments/:commentId/hide': 'hidesBlocked',
  'DELETE /v1/projects/:id/comments/:commentId/hide': 'hidesBlocked',
  // Suivre.
  'POST /v1/members/:id/follow': 'hidesBlocked',
  'DELETE /v1/members/:id/follow': 'own',
  'POST /v1/projects/:id/follow': 'hidesBlocked',
  'DELETE /v1/projects/:id/follow': 'own',
  // Les membres, les étiquettes, le fil.
  'GET /v1/members/mentionable': 'hidesBlocked',
  'GET /v1/members/:id': 'hidesBlocked',
  'PUT /v1/members/:id/block': 'hidesBlocked',
  'DELETE /v1/members/:id/block': 'own',
  'GET /v1/tags/:slug': 'hidesBlocked',
  'GET /v1/feed/following': 'hidesBlocked',
  'GET /v1/feed/discover': 'hidesBlocked',
  // Les notifications.
  'GET /v1/notifications': 'hidesBlocked',
  'GET /v1/notifications/unread': 'hidesBlocked',
  'PUT /v1/notifications/seen': 'own',
  // Signaler : la cible d'un membre bloqué répond 404 (sauf les exceptions des règles 1 et 2).
  'POST /v1/reports': 'hidesBlocked',
  'GET /v1/reports/target': 'hidesBlocked',
  // La modération.
  'GET /v1/moderation/reports': 'admin',
  'GET /v1/moderation/removed': 'admin',
  'POST /v1/moderation/decisions': 'admin',
}

/** Les routes de l'API, lues dans l'application elle-même (sans les intergiciels, méthode ALL). */
const appRoutes = async () => {
  const ctx = await createTestContext()
  try {
    return [
      ...new Set(
        ctx.app.routes
          .filter((route) => route.method !== 'ALL')
          .map((route) => `${route.method} ${route.path}`),
      ),
    ].sort()
  } finally {
    await ctx.close()
  }
}

describe('the inventory of routes', () => {
  it('classes every route of the API', async () => {
    const unclassified = (await appRoutes()).filter((route) => ROUTES[route] === undefined)

    expect(unclassified.join('\n')).toBe('')
  })

  it('lists no route that does not exist (the routes of this slice included)', async () => {
    const routes = new Set(await appRoutes())
    const missing = Object.keys(ROUTES).filter((route) => !routes.has(route))

    expect(missing.join('\n')).toBe('')
  })
})
