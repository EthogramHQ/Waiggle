// L'inventaire des routes (tranche 7b, règle 18 de la relecture du plan) : chaque route de l'API est
// classée selon ce qu'elle fait d'un blocage. Une route ajoutée un jour sans être classée fait
// échouer ce test : quelqu'un doit alors décider si elle montre le geste d'un autre membre, et donc
// si elle doit cacher un membre bloqué (blocks/visibility.ts).
//
// Les classes :
// - hidesBlocked : montre le contenu ou le geste d'un autre membre ; un blocage, dans un sens ou
//   dans l'autre, le cache ; le test qui le prouve est cité dans PROOFS, et ce fichier vérifie
//   qu'il existe ;
// - own : ne touche qu'à ce qui est à soi (son compte, ses réglages, ses propres gestes) ;
// - admin : l'administration, qui ignore les blocages (précision 7 : sinon bloquer l'administrateur
//   ferait échapper à la modération) ;
// - public : sans contenu d'un membre (santé, contrat, connexion, fichiers à clé aléatoire).
import { readFileSync } from 'node:fs'
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

/**
 * Le test qui prouve chaque route « hidesBlocked » (relecture de la branche 7b, A5) : son fichier
 * (à côté de celui-ci) et son titre exact, tel qu'il est écrit dans `it('…')`. Sans cette liste, une
 * route classée « cache le membre bloqué » qui ne filtrerait rien passerait l'inventaire. Le test
 * cité doit montrer la différence : le membre bloqué (dans un sens ou dans l'autre) ne voit pas ou
 * ne peut pas, un témoin le peut.
 */
const PROOFS: Record<string, { file: string; test: string }> = {
  'GET /v1/projects/:id': {
    file: 'blocks-visibility.test.ts',
    test: 'answers the page of a project of the other one as an unknown project',
  },
  'PUT /v1/projects/:id/reactions/:kind': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'GET /v1/projects/:id/comments': {
    file: 'comments.test.ts',
    test: 'shows the comment of a member I blocked as "blocked", and mine as "unavailable" to her',
  },
  'POST /v1/projects/:id/comments': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'PATCH /v1/projects/:id/comments/:commentId': {
    file: 'blocks-visibility.test.ts',
    test: 'refuses to edit my comment on a project of the other one, as an unknown comment',
  },
  'PUT /v1/projects/:id/comments/:commentId/hide': {
    file: 'blocks-visibility.test.ts',
    test: 'answers « unknown » to who hides, or shows again, a comment of the other one',
  },
  'DELETE /v1/projects/:id/comments/:commentId/hide': {
    file: 'blocks-visibility.test.ts',
    test: 'answers « unknown » to who hides, or shows again, a comment of the other one',
  },
  'POST /v1/members/:id/follow': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'POST /v1/projects/:id/follow': {
    file: 'blocks.test.ts',
    test: 'refuses to comment, react or follow, in both directions',
  },
  'GET /v1/members/mentionable': {
    file: 'blocks-visibility.test.ts',
    test: 'takes the other one out of the suggestions after "@"',
  },
  'GET /v1/members/:id': {
    file: 'blocks.test.ts',
    test: 'answers the same 404 as an unknown member to who is blocked',
  },
  'PUT /v1/members/:id/block': {
    file: 'blocks.test.ts',
    test: 'answers the same 404 for an unknown member, an unverified one, and one who blocked me',
  },
  'GET /v1/tags/:slug': {
    file: 'blocks-visibility.test.ts',
    test: 'hides the projects of the other one from the discovery feed and the tag pages',
  },
  'GET /v1/feed/following': {
    file: 'blocks-visibility.test.ts',
    test: 'leaves out of the following feed a follow that slipped in during the block',
  },
  'GET /v1/feed/discover': {
    file: 'blocks-visibility.test.ts',
    test: 'hides the projects of the other one from the discovery feed and the tag pages',
  },
  'GET /v1/notifications': {
    file: 'blocks-visibility.test.ts',
    test: 'drops every notification coming from the other one, and keeps those of others',
  },
  'GET /v1/notifications/unread': {
    file: 'blocks-visibility.test.ts',
    test: 'drops every notification coming from the other one, and keeps those of others',
  },
  'POST /v1/reports': {
    file: 'reports.test.ts',
    test: 'answers 404 for a content of a member blocked either way, as for an unknown one',
  },
  'GET /v1/reports/target': {
    file: 'reports.test.ts',
    test: 'answers 404 for a content of a member blocked either way, as for an unknown one',
  },
}

/** Échappe un texte pour qu'une expression régulière le lise mot pour mot (« ( », « . »…). */
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * « Le fichier `file` contient un test titré `title` » : un appel `it('…')` ou `it.each([…])('…')`,
 * avec le titre entre apostrophes, guillemets ou accents graves. `it.skip` et `it.todo` ne
 * comptent pas : un test sauté ne prouve rien. Le fichier est lu sur le disque, à côté de celui-ci
 * (`import.meta.url` : l'adresse de ce fichier-ci).
 */
const hasTest = (file: string, title: string) => {
  const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')
  const call = new RegExp(
    String.raw`\bit(?:\.each\(\[[\s\S]*?\]\))?\(\s*(['"\x60])${literally(title)}\1`,
  )
  return call.test(source)
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

  it('cites the test that proves each route hiding a blocked member, and only those', () => {
    const hiding = Object.keys(ROUTES).filter((route) => ROUTES[route] === 'hidesBlocked')
    const withoutProof = hiding.filter((route) => PROOFS[route] === undefined)
    const notHiding = Object.keys(PROOFS).filter((route) => ROUTES[route] !== 'hidesBlocked')

    expect(withoutProof.join('\n')).toBe('')
    expect(notHiding.join('\n')).toBe('')
  })

  it('finds each cited test in its file, by its exact title', () => {
    const notFound = Object.entries(PROOFS)
      .filter(([, proof]) => !hasTest(proof.file, proof.test))
      .map(([route, proof]) => `${route}: ${proof.file} « ${proof.test} »`)

    expect(notFound.join('\n')).toBe('')
    // Témoin : un titre qui n'existe pas n'est pas trouvé, ni un titre de `describe`.
    expect(hasTest('blocks.test.ts', 'a test that does not exist')).toBe(false)
    expect(hasTest('blocks.test.ts', 'blocking a member')).toBe(false)
  })
})
