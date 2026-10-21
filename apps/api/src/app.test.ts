import { appName } from '@ruche/brand'
import { ErrorResponse, HealthResponse } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

// Tests d'intégration de l'API : on envoie de vraies requêtes HTTP à l'application,
// mais en mémoire (ctx.request), sans ouvrir de port réseau. C'est rapide et fiable.
// `async`/`await` : la réponse arrive de façon asynchrone, on attend qu'elle soit là.
// beforeEach / afterEach : avant chaque test, une API neuve avec une base vide ; après, on range.
let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext({ version: '9.9.9' })
})

afterEach(async () => {
  await ctx.close()
})

describe('GET /health', () => {
  it('answers ok with the running version', async () => {
    const res = await ctx.request('/health')

    expect(res.status).toBe(200)
    expect(HealthResponse.parse(await res.json())).toEqual({ status: 'ok', version: '9.9.9' })
  })
})

describe('GET /openapi.json', () => {
  it('publishes the API contract, including the health and profile routes', async () => {
    const res = await ctx.request('/openapi.json')
    const doc = (await res.json()) as { info: { title: string }; paths: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(doc.info.title).toBe(`${appName} API`)
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/health', '/v1/me', '/v1/me/export']),
    )
  })
})

describe('unknown routes', () => {
  it('answer 404 in French by default', async () => {
    const res = await ctx.request('/does-not-exist')
    const body = ErrorResponse.parse(await res.json())

    expect(res.status).toBe(404)
    expect(res.headers.get('content-language')).toBe('fr')
    expect(body.error).toEqual({ code: 'not_found', message: 'Cette page n’existe pas.' })
  })

  it('answer in English when the client prefers it', async () => {
    const res = await ctx.request('/does-not-exist', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9,fr;q=0.5' },
    })
    const body = ErrorResponse.parse(await res.json())

    expect(res.headers.get('content-language')).toBe('en')
    expect(body.error.message).toBe('This page does not exist.')
  })
})

describe('security headers', () => {
  it('are set on every response', async () => {
    const res = await ctx.request('/health')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
  })

  // Le domaine de l'API porte le cookie de session et sert parfois du HTML (la page d'erreur de
  // Better Auth) : si une faille y glissait un script, la CSP l'empêcherait de s'exécuter.
  it('forbid any script, frame or resource on every response, JSON included', async () => {
    for (const path of ['/health', '/does-not-exist', '/v1/me']) {
      const csp = (await ctx.request(path)).headers.get('content-security-policy') ?? ''

      expect(csp).toContain("default-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain('sandbox')
      expect(csp).not.toContain('script-src')
    }
  })

  it('still let the authentication error page show, styled and without scripts', async () => {
    const res = await ctx.request('/api/auth/error?error=state_mismatch')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'; sandbox",
    )
  })
})

describe('cross-origin requests (CORS)', () => {
  it('are allowed, with cookies, only from the Ruche app', async () => {
    const allowed = await ctx.request('/v1/me', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'GET' },
    })
    const refused = await ctx.request('/v1/me', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    })

    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:8081')
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')
    expect(refused.headers.get('access-control-allow-origin')).toBeNull()
  })
})
