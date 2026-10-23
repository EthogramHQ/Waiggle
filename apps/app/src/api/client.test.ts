// Tests du client réseau de l'appli. fetch et le client Better Auth sont remplacés par des faux :
// on vérifie ce que l'appli envoie, et comment elle comprend les réponses.
import { Me } from '@ruche/contracts'
import { leaMe } from '../testing/fixtures'
import { apiFetch, request, requestWithoutBody } from './client'

jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue('ruche.session_token=abc') },
}))

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('apiFetch on a phone', () => {
  // Les tests tournent comme sur iOS (réglage par défaut de jest-expo).
  it('adds the session kept by the app, and never lets the system add cookies of its own', async () => {
    fetchMock.mockResolvedValue(json({}))

    await apiFetch('/v1/me')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/v1/me')
    expect(new Headers(init.headers).get('Cookie')).toBe('ruche.session_token=abc')
    expect(init.credentials).toBe('omit')
  })
})

describe('request', () => {
  it('gives the data when the answer has the expected shape', async () => {
    fetchMock.mockResolvedValue(json(leaMe))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: true, data: leaMe })
  })

  it('turns each refusal into the matching message', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({}, 429))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'forbidden' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('tells a taken handle from a 7th photo, which share the same status (slice 6a)', async () => {
    // Deux refus « 409 conflit » : seul le code du corps de la réponse dit lequel.
    const conflict = (code: string) => json({ error: { code, message: '…' } }, 409)
    fetchMock
      .mockResolvedValueOnce(conflict('handle_taken'))
      .mockResolvedValueOnce(conflict('too_many_visuals'))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'handleTaken' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'tooManyVisuals' })
  })

  it('tells the daily handle limit from too many requests, which share the same status', async () => {
    // Deux refus « 429 » : le 6e changement de pseudo du jour (réessayer demain), et le débit
    // (réessayer dans quelques minutes) ; sans corps lisible, c'est le débit.
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: 'handle_change_limit', message: '…' } }, 429))
      .mockResolvedValueOnce(json({ error: { code: 'rate_limited', message: '…' } }, 429))
      .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'handleChangeLimit' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'rateLimited' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('tells apart the refusals of reporting and moderating, by the code of the answer (slice 7a)', async () => {
    // Trois refus « 409 » (déjà signalé, déjà décidé, contenu retiré) et un « 422 » (son propre
    // contenu) : chacun a son message, que seul le code du corps de la réponse désigne.
    const refusal = (code: string, status: number) =>
      json({ error: { code, message: '…' } }, status)
    fetchMock
      .mockResolvedValueOnce(refusal('already_reported', 409))
      .mockResolvedValueOnce(refusal('already_decided', 409))
      .mockResolvedValueOnce(refusal('removed', 409))
      .mockResolvedValueOnce(refusal('own_content', 422))

    expect(await request('/v1/reports', {}, Me)).toEqual({ ok: false, error: 'alreadyReported' })
    expect(await request('/v1/reports', {}, Me)).toEqual({ ok: false, error: 'alreadyDecided' })
    expect(await request('/v1/reports', {}, Me)).toEqual({ ok: false, error: 'removed' })
    expect(await request('/v1/reports', {}, Me)).toEqual({ ok: false, error: 'ownContent' })
  })

  it('says so when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'network' })
  })

  it('refuses an answer that does not have the expected shape', async () => {
    fetchMock.mockResolvedValue(json({ id: 'u1' }))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'internal' })
  })
})

describe('requestWithoutBody', () => {
  it('succeeds on an empty answer, such as a deletion', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    expect(await requestWithoutBody('/v1/projects/1', { method: 'DELETE' })).toEqual({
      ok: true,
      data: null,
    })
  })

  it('turns a refusal into the matching message', async () => {
    fetchMock.mockResolvedValue(json({}, 404))

    expect(await requestWithoutBody('/v1/projects/1', { method: 'DELETE' })).toEqual({
      ok: false,
      error: 'notFound',
    })
  })
})
