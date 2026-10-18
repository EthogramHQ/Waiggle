// Tests des limites de taille des requêtes : un visiteur, même anonyme, ne doit jamais pouvoir
// forcer l'API à garder en mémoire une requête énorme (risque de faire tomber le serveur).
import { ErrorResponse } from '@ruche/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestContext, type TestContext } from './testing/context'

let ctx: TestContext

beforeEach(async () => {
  ctx = await createTestContext()
})

afterEach(async () => {
  await ctx.close()
})

// Un texte JSON d'environ 1 Mo, bien plus que n'importe quelle requête légitime de ces routes.
const oneMegabyte = JSON.stringify({ bio: 'a'.repeat(1024 * 1024) })

describe('request size limits', () => {
  it('refuses an oversized profile change from a visitor, without reading it', async () => {
    const res = await ctx.request('/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: oneMegabyte,
    })

    expect(res.status).toBe(413)
    expect(ErrorResponse.parse(await res.json()).error.code).toBe('payload_too_large')
  })

  it('refuses an oversized sign-in request', async () => {
    const res = await ctx.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oneMegabyte,
    })

    expect(res.status).toBe(413)
  })

  it('answers an anonymous avatar upload at once, without waiting for the file', async () => {
    // Un envoi « par morceaux » qui ne se termine jamais : si l'API essayait de le lire avant de
    // vérifier la session, ce test resterait bloqué jusqu'à son délai maximal.
    const endless = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const res = await ctx.request('/v1/me/avatar', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: endless,
      // duplex: 'half' : exigé par Node pour envoyer un corps sous forme de flux.
      duplex: 'half',
    } as RequestInit)

    expect(res.status).toBe(401)
    await endless.cancel()
  }, 5_000)
})
