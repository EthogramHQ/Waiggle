// Tests du quota de Better Auth sur la lecture de session (`GET /api/auth/get-session`, tranche R2,
// BE-5). L'appli relit la session à chaque chargement de page ; un foyer ou un bureau partagent
// souvent une seule adresse IP. Si cette lecture était comptée (100 par minute et par IP, fenêtre
// « depuis la dernière demande »), le 101e chargement sans pause d'une minute recevrait un 429, que
// l'appli lirait comme « pas de session » : tout le monde derrière cette IP serait « déconnecté ».
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from '../testing/context'

let ctx: TestContext

// createTestContext allume le limiteur de Better Auth (`rateLimit: true`), comme en production,
// et envoie chaque requête depuis la même adresse IP (en-tête x-real-ip).
beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

const lea = { name: 'Léa', email: 'lea@example.com', password: 'correct-horse-battery' }

describe('reading the session', () => {
  it('answers 150 session reads in a row from the same IP, none refused', async () => {
    const cookie = await ctx.verifiedMember(lea)

    // Les unes après les autres, comme des pages chargées sans pause : le compteur de la règle
    // générale ne repartirait jamais à zéro.
    // Les numéros des lectures refusées (aucun attendu), et le corps de la dernière.
    const refused: number[] = []
    let last: unknown = null
    for (let read = 1; read <= 150; read++) {
      const res = await ctx.request('/api/auth/get-session', { headers: { cookie } })
      if (res.status !== 200) refused.push(read)
      last = await res.json()
    }

    expect(refused).toEqual([])
    // La 150e lecture porte encore la session de Léa.
    expect(last).toMatchObject({ user: { email: lea.email } })
  })

  // Témoin : sortir la lecture de session du quota n'ouvre pas les autres règles. La connexion
  // garde ses 5 essais par quart d'heure et par IP, et le 6e est refusé avec son délai.
  it('still refuses the 6th sign-in within 15 minutes, with Retry-After', async () => {
    await ctx.verifiedMember(lea)
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await ctx.signIn({ ...lea, password: `wrong-password-${attempt}` })
      expect(res.status).toBe(401)
    }

    const blocked = await ctx.signIn(lea)

    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  })
})
