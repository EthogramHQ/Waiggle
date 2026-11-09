// Tests du client réseau pour les refus du catalogue des outils et des catégories (tranche R6b) :
// chacun a son message, que seul le code du corps de la réponse désigne. Le 400 devient un statut
// « partagé » : une catégorie qui n'existe plus (`unknown_category`) ne se confond pas avec une
// demande mal formée, et un 400 sans corps lisible reste « validation ».
import { Me } from '@ruche/contracts'
import { request } from './client'

jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue('ruche.session_token=abc') },
}))

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

const refusal = (code: string, status: number) =>
  new Response(JSON.stringify({ error: { code, message: '…' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('request, refusals of the tool catalogue and the categories (R6b)', () => {
  it('tells each refusal by the code of the answer', async () => {
    fetchMock
      .mockResolvedValueOnce(refusal('tool_name_taken', 409))
      .mockResolvedValueOnce(refusal('category_name_taken', 409))
      .mockResolvedValueOnce(refusal('unknown_category', 400))
      .mockResolvedValueOnce(refusal('own_project', 403))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'toolNameTaken' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'categoryNameTaken' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'unknownCategory' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'ownProject' })
  })

  it('keeps « validation » for a 400 with the validation code or without a readable body', async () => {
    fetchMock
      .mockResolvedValueOnce(refusal('validation', 400))
      .mockResolvedValueOnce(new Response('Bad Request', { status: 400 }))

    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'validation' })
    expect(await request('/v1/me', {}, Me)).toEqual({ ok: false, error: 'validation' })
  })
})
