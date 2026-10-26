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
//
// Tranche 7c (relecture de sécurité S2) : une seconde colonne dit si la route reste permise à un
// compte suspendu (`allowed`) ou s'il reçoit 403 `suspended` (`refused`). La garde laisse passer
// tout GET et tout DELETE (lire, supprimer ses contenus, ne plus suivre, débloquer), et quelques
// exceptions : signaler, bloquer, masquer un commentaire sur son projet, marquer ses
// notifications vues, régler ses e-mails, se désinscrire par le lien d'un e-mail, `PATCH /v1/me`
// (la route n'y accepte que la langue, S9). Better Auth (`/api/auth/*` : changer d'adresse,
// supprimer son compte, se déconnecter) n'est pas sous `/v1`. `POST /v1/moderation/decisions` est
// permise par la garde : un administrateur suspendu n'en est plus un (S19), et la garde de la
// modération lui répond le même 404 qu'à tout membre (S16). Une boucle sur chaque route, avec un
// membre suspendu et un corps invalide, prouve la colonne.
import { readFileSync } from 'node:fs'
import { ErrorResponse } from '@ruche/contracts'
import { schema } from '@ruche/db'
import { describe, expect, it } from 'vitest'
import { memberCounterKeys } from './rate-limit'
import { activity } from './testing/activity'
import { createTestContext } from './testing/context'

type RouteClass = 'hidesBlocked' | 'own' | 'admin' | 'public'
/** Ce que la garde des comptes suspendus fait de la route (tranche 7c). */
type DuringSuspension = 'allowed' | 'refused'

/**
 * Chaque route, « MÉTHODE /chemin » tel que Hono l'écrit (`:id` pour un paramètre), avec ses deux
 * colonnes : ce qu'elle fait d'un blocage, et si elle reste permise pendant une suspension.
 */
const ROUTES: Record<string, readonly [RouteClass, DuringSuspension]> = {
  'GET /health': ['public', 'allowed'],
  'GET /openapi.json': ['public', 'allowed'],
  // Better Auth : inscription, connexion, vérification, suppression du compte.
  'GET /api/auth/*': ['public', 'allowed'],
  'POST /api/auth/*': ['public', 'allowed'],
  // Les fichiers : une clé tirée au hasard, neuve à chaque photo (règle 11).
  'GET /media/:folder{(?:avatars|visuals)}/:file': ['public', 'allowed'],
  // Mon compte.
  'GET /v1/me': ['own', 'allowed'],
  'PATCH /v1/me': ['own', 'allowed'],
  'POST /v1/me/avatar': ['own', 'refused'],
  'GET /v1/me/export': ['own', 'allowed'],
  'GET /v1/me/email-preferences': ['own', 'allowed'],
  'PATCH /v1/me/email-preferences': ['own', 'allowed'],
  'GET /v1/me/blocks': ['own', 'allowed'],
  // Le lien de désinscription d'un e-mail : signé, sans session.
  'GET /v1/email/unsubscribe': ['public', 'allowed'],
  'POST /v1/email/unsubscribe': ['public', 'allowed'],
  // Les projets, leurs notes, visuels, réactions et commentaires.
  'POST /v1/projects': ['own', 'refused'],
  'GET /v1/projects/:id': ['hidesBlocked', 'allowed'],
  'PATCH /v1/projects/:id': ['own', 'refused'],
  'DELETE /v1/projects/:id': ['own', 'allowed'],
  'POST /v1/projects/:id/visuals': ['own', 'refused'],
  'DELETE /v1/projects/:id/visuals/:visualId': ['own', 'allowed'],
  'POST /v1/projects/:id/notes': ['own', 'refused'],
  'DELETE /v1/projects/:id/notes/:noteId': ['own', 'allowed'],
  'PUT /v1/projects/:id/reactions/:kind': ['hidesBlocked', 'refused'],
  'DELETE /v1/projects/:id/reactions/:kind': ['own', 'allowed'],
  'GET /v1/projects/:id/comments': ['hidesBlocked', 'allowed'],
  'POST /v1/projects/:id/comments': ['hidesBlocked', 'refused'],
  'PATCH /v1/projects/:id/comments/:commentId': ['hidesBlocked', 'refused'],
  'DELETE /v1/projects/:id/comments/:commentId': ['own', 'allowed'],
  'PUT /v1/projects/:id/comments/:commentId/hide': ['hidesBlocked', 'allowed'],
  'DELETE /v1/projects/:id/comments/:commentId/hide': ['hidesBlocked', 'allowed'],
  // Suivre.
  'POST /v1/members/:id/follow': ['hidesBlocked', 'refused'],
  'DELETE /v1/members/:id/follow': ['own', 'allowed'],
  'POST /v1/projects/:id/follow': ['hidesBlocked', 'refused'],
  'DELETE /v1/projects/:id/follow': ['own', 'allowed'],
  // Les membres, les étiquettes, le fil.
  'GET /v1/members/mentionable': ['hidesBlocked', 'allowed'],
  'GET /v1/members/:id': ['hidesBlocked', 'allowed'],
  'PUT /v1/members/:id/block': ['hidesBlocked', 'allowed'],
  'DELETE /v1/members/:id/block': ['own', 'allowed'],
  'GET /v1/tags/:slug': ['hidesBlocked', 'allowed'],
  'GET /v1/feed/following': ['hidesBlocked', 'allowed'],
  'GET /v1/feed/discover': ['hidesBlocked', 'allowed'],
  // Les notifications.
  'GET /v1/notifications': ['hidesBlocked', 'allowed'],
  'GET /v1/notifications/unread': ['hidesBlocked', 'allowed'],
  'PUT /v1/notifications/seen': ['own', 'allowed'],
  // Signaler : la cible d'un membre bloqué répond 404 (sauf les exceptions des règles 1 et 2).
  'POST /v1/reports': ['hidesBlocked', 'allowed'],
  'GET /v1/reports/target': ['hidesBlocked', 'allowed'],
  // La modération.
  'GET /v1/moderation/reports': ['admin', 'allowed'],
  'GET /v1/moderation/removed': ['admin', 'allowed'],
  'POST /v1/moderation/decisions': ['admin', 'allowed'],
  // L'historique des décisions (tranche 7c).
  'GET /v1/moderation/decisions': ['admin', 'allowed'],
}

/** La classe « blocage » d'une route (première colonne). */
const blockClass = (route: string) => ROUTES[route]?.[0]

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
    const hiding = Object.keys(ROUTES).filter((route) => blockClass(route) === 'hidesBlocked')
    const withoutProof = hiding.filter((route) => PROOFS[route] === undefined)
    const notHiding = Object.keys(PROOFS).filter((route) => blockClass(route) !== 'hidesBlocked')

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

  it('allows every GET and every DELETE during a suspension', () => {
    const refused = Object.entries(ROUTES)
      .filter(([route, [, during]]) => /^(GET|DELETE) /.test(route) && during !== 'allowed')
      .map(([route]) => route)

    expect(refused).toEqual([])
  })
})

// ─── S2 : la garde des comptes suspendus, route par route ─────────────────────────────────────────

/** Un identifiant bien formé, qui ne désigne rien (un uuid convient aussi à l'id d'un membre). */
const UNKNOWN = '00000000-0000-4000-8000-000000000000'

/** Une adresse concrète pour un modèle de route : chaque paramètre reçoit une valeur bien formée. */
const concrete = (path: string) =>
  path
    .replace(':folder{(?:avatars|visuals)}', 'avatars')
    .replace(':kind', 'bravo')
    .replace(':slug', 'mistral')
    .replace(/:\w+/g, UNKNOWN)
    .replace('*', 'zz-unknown')

describe('the guard of a suspended account', () => {
  it('refuses with 403 suspended every route it does not allow, before its validator and its quota', async () => {
    const ctx = await createTestContext()
    try {
      const act = activity(ctx)
      const louis = await ctx.verifiedMember({
        name: 'Louis',
        email: 'louis@example.com',
        password: 'louis-long-password',
      })
      const karim = await ctx.verifiedMember({
        name: 'Karim',
        email: 'karim@example.com',
        password: 'karim-long-password',
      })
      const lea = await ctx.verifiedMember({
        name: 'Léa',
        email: 'lea@example.com',
        password: 'lea-long-password',
      })
      await act.makeAdmin((await act.me(louis)).id)
      const karimId = (await act.me(karim)).id
      const suspended = await act.send('POST', '/v1/moderation/decisions', louis, {
        action: 'suspend',
        memberId: karimId,
        duration: '7d',
        ground: 'rules',
        explanation: 'Des messages insultants, plusieurs fois.',
      })
      expect(suspended.status).toBe(201)
      // Tous les compteurs de Karim au plafond : une route qui compterait avant la garde
      // répondrait 429, pas 403.
      await ctx.db.insert(schema.apiRateLimit).values(
        Object.values(memberCounterKeys(karimId)).map((key) => ({
          key,
          count: 1_000_000,
          windowStart: Date.now(),
        })),
      )

      const wrong: string[] = []
      for (const [route, [, during]] of Object.entries(ROUTES)) {
        const [method = 'GET', path = '/'] = route.split(' ')
        // Un corps invalide pour toute route : une chaîne JSON là où un objet est attendu.
        const body = method === 'GET' || method === 'DELETE' ? undefined : 'x'
        const res = await act.send(method, concrete(path), karim, body)
        const text = await res.text()
        const isSuspended = res.status === 403 && text.includes('"suspended"')
        if (during === 'refused') {
          if (!isSuspended || ErrorResponse.parse(JSON.parse(text)).error.code !== 'suspended') {
            wrong.push(`${route}: ${res.status} instead of 403 suspended`)
          }
        } else if (isSuspended) {
          wrong.push(`${route}: refused, but allowed during a suspension`)
        }
      }
      expect(wrong.join('\n')).toBe('')

      // Témoins : Léa, non suspendue, reçoit l'erreur de validation ; un anonyme, 401 (S14 : sans
      // session, la garde laisse passer, et la session obligatoire répond).
      expect((await act.send('POST', '/v1/projects', lea, 'x')).status).toBe(400)
      expect((await act.send('POST', '/v1/projects', null, 'x')).status).toBe(401)
    } finally {
      await ctx.close()
    }
  })
})
