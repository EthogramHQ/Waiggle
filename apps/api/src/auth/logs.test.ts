// Ce que le journal du serveur garde quand la base de données tombe en panne pendant une route de
// session (audit de sécurité du 7/11/2026, N4). Better Auth écrivait alors l'erreur entière de la
// base, requête et paramètres compris : le jeton de session du visiteur finissait dans le journal.
// La règle de log.ts vaut aussi pour lui : la nature de l'erreur, jamais ses valeurs.
import { format } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestContext, type TestContext } from '../testing/context'

let ctx: TestContext
let written: string[]

beforeEach(async () => {
  ctx = await createTestContext()
  written = []
  // Ce que chaque fonction du journal recevrait, mis en texte comme Node l'écrirait.
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      written.push(format(...args))
    })
  }
})

afterEach(async () => {
  vi.restoreAllMocks()
  // La base est déjà fermée par le test : la refermer ne doit pas faire échouer la suite.
  await ctx.close().catch(() => {})
})

describe('the logs, when the database fails', () => {
  it('never write the session token nor the values of the query', async () => {
    const cookie = await ctx.verifiedMember({
      name: 'Léa',
      email: 'lea@example.com',
      password: 'lea-long-password',
    })
    // Le cookie vaut « <jeton>.<signature> » : le jeton seul est rangé en base.
    const sessionToken = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? ''
    expect(sessionToken).not.toBe('')
    await ctx.close()
    written = []

    const answers = [
      await ctx.request('/api/auth/get-session', { headers: { cookie } }),
      await ctx.request('/v1/me', { headers: { cookie } }),
    ]

    for (const res of answers) expect(res.status).toBe(500)
    const journal = written.join('\n')
    // Le journal dit bien qu'il y a eu une panne…
    expect(journal).not.toBe('')
    // … sans rien de ce que la base a reçu.
    expect(journal).not.toContain(sessionToken)
    expect(journal).not.toContain('lea@example.com')
    expect(journal).not.toMatch(/params:|Failed query|select "/i)
  })

  // Relecture de la PR #86, A4 : depuis `onAPIError.throw`, une erreur 500 prévue par Better Auth
  // (une APIError) est rendue par lui sans rien écrire. L'API note la route et le code, sans
  // l'adresse complète, dont la requête peut porter un jeton ou une adresse e-mail.
  it('write one line, without the query, when Better Auth answers a server error', async () => {
    vi.spyOn(ctx.auth, 'handler').mockResolvedValue(new Response(null, { status: 500 }))

    const res = await ctx.request('/api/auth/verify-email?token=secret-token&email=lea@example.com')

    expect(res.status).toBe(500)
    const journal = written.join('\n')
    expect(journal).toContain('/api/auth/verify-email')
    expect(journal).toContain('500')
    expect(journal).not.toContain('secret-token')
    expect(journal).not.toContain('lea@example.com')
  })
})
