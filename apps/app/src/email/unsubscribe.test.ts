// Tests de unsubscribe (email/api.ts, tranche 6c) : la demande envoyée par le bouton « Confirmer »
// de la page de désinscription. Elle ne porte que le jeton du lien : jamais la session du membre
// (l'API ne s'en sert pas, voir le plan de 6c, « CORS »). fetch est remplacé par un faux.
import { Platform } from 'react-native'
import { recapToken } from '../testing/email'
import { unsubscribe } from './api'

// Un membre connecté sur ce téléphone : sa session existe, et ne doit pas partir avec la demande.
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue('ruche.session_token=abc') },
}))

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  globalThis.fetch = fetchMock
})
afterEach(() => jest.restoreAllMocks())

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit]
  return { url: String(url), init }
}

const refusal = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: '' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('unsubscribe', () => {
  it('posts the token of the link, and nothing else', async () => {
    expect(await unsubscribe(recapToken)).toEqual({ ok: true, data: null })

    const { url, init } = sent()
    expect(url).toBe(`http://localhost:3000/v1/email/unsubscribe?token=${recapToken}`)
    expect(init.method).toBe('POST')
  })

  it('asks to turn every notification e-mail off with scope=all', async () => {
    await unsubscribe(recapToken, 'all')

    expect(sent().url).toBe(
      `http://localhost:3000/v1/email/unsubscribe?token=${recapToken}&scope=all`,
    )
  })

  it('never sends the session kept on the phone', async () => {
    await unsubscribe(recapToken)

    const { init } = sent()
    expect(new Headers(init.headers).get('Cookie')).toBeNull()
    expect(init.credentials).toBe('omit')
  })

  it('never sends the cookies of the browser', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    await unsubscribe(recapToken)

    expect(sent().init.credentials).toBe('omit')
  })

  it('reports a link refused by the API as a validation error', async () => {
    fetchMock.mockResolvedValue(refusal(400, 'unsubscribe_invalid'))

    expect(await unsubscribe(recapToken)).toEqual({ ok: false, error: 'validation' })
  })

  it('reports too many attempts, and a network failure', async () => {
    fetchMock.mockResolvedValueOnce(refusal(429, 'rate_limited'))
    expect(await unsubscribe(recapToken)).toEqual({ ok: false, error: 'rateLimited' })

    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'))
    expect(await unsubscribe(recapToken)).toEqual({ ok: false, error: 'network' })
  })
})
