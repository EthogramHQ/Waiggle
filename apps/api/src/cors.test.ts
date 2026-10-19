// Test des méthodes permises à l'appli web quand elle appelle l'API depuis son propre domaine
// (CORS, voir app.ts). Avant une requête PUT, PATCH ou DELETE, le navigateur demande la permission
// par une requête OPTIONS (le « contrôle préalable ») : si la méthode n'est pas dans la réponse, il
// n'envoie jamais la vraie requête. Les tests d'intégration, eux, ne passent pas par un navigateur :
// sans ce test, un oubli ne se verrait qu'en ligne.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

describe('the methods the web app may use', () => {
  it('include PUT, to react to a project and hide a comment', async () => {
    const res = await ctx.request(
      '/v1/projects/00000000-0000-4000-8000-000000000000/reactions/bravo',
      {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'PUT' },
      },
    )

    const methods = (res.headers.get('access-control-allow-methods') ?? '').split(',')
    expect(methods.map((method) => method.trim())).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    )
  })
})
