// Tests du pollen rapporté par une réponse de l'API (R19) : quand un geste rapporte du pollen au
// membre qui le fait, l'API le dit dans l'en-tête `Waiggle-Pollen` (`POLLEN_HEADER` du contrat,
// « 2 »). Le client le rend à côté des données (`pollen: 2`) ; le hook du geste en fait la pastille
// « +2 pollen ». Sans gain, l'en-tête est absent, et `pollen` aussi.
//
// Un en-tête qui n'est pas un entier positif (« 0 », « -3 », « 2.5 », « abc », vide) est ignoré :
// jamais de pastille « +0 pollen » ni « +NaN pollen ». Un refus ne rapporte rien, même si l'en-tête
// était là.
import { Me, POLLEN_HEADER } from '@ruche/contracts'
import { leaMe } from '../testing/fixtures'
import { request, requestWithoutBody } from './client'

// La vérification de la version a ses propres tests (newVersion.test.ts).
jest.mock('./newVersion', () => ({ reloadIfNewVersion: jest.fn().mockResolvedValue(false) }))

jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue('ruche.session_token=abc') },
}))

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

/** Une réponse JSON, avec l'en-tête du pollen si `pollen` est donné. */
const json = (body: unknown, pollen?: string, status = 200) => {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (pollen !== undefined) headers.set(POLLEN_HEADER, pollen)
  return new Response(JSON.stringify(body), { status, headers })
}

/** Une réponse « 204 » sans contenu, avec l'en-tête du pollen si `pollen` est donné. */
const noContent = (pollen?: string) => {
  const headers = new Headers()
  if (pollen !== undefined) headers.set(POLLEN_HEADER, pollen)
  return new Response(null, { status: 204, headers })
}

describe('request and the pollen header', () => {
  it('names the header as the contract does', () => {
    // L'API et l'appli lisent le même nom : `Waiggle-Pollen`.
    expect(POLLEN_HEADER).toBe('Waiggle-Pollen')
  })

  it('gives the pollen earned along with the data', async () => {
    fetchMock.mockResolvedValue(json(leaMe, '2'))

    expect(await request('/v1/me', {}, Me)).toStrictEqual({ ok: true, data: leaMe, pollen: 2 })
  })

  it('reads the header whatever its case', async () => {
    // Les en-têtes HTTP ne tiennent pas compte de la casse ; un relais peut les écrire en minuscules.
    const headers = new Headers({ 'Content-Type': 'application/json', 'waiggle-pollen': '15' })
    fetchMock.mockResolvedValue(new Response(JSON.stringify(leaMe), { status: 200, headers }))

    expect(await request('/v1/me', {}, Me)).toStrictEqual({ ok: true, data: leaMe, pollen: 15 })
  })

  it('leaves pollen out when the answer has no header', async () => {
    fetchMock.mockResolvedValue(json(leaMe))

    expect(await request('/v1/me', {}, Me)).toStrictEqual({ ok: true, data: leaMe })
  })

  it.each([
    ['zero', '0'],
    ['a negative number', '-3'],
    ['a decimal number', '2.5'],
    ['a word', 'abc'],
    ['an empty value', ''],
  ])('ignores a header that holds %s', async (_, value) => {
    fetchMock.mockResolvedValue(json(leaMe, value))

    expect(await request('/v1/me', {}, Me)).toStrictEqual({ ok: true, data: leaMe })
  })

  it('gives no pollen with a refusal', async () => {
    fetchMock.mockResolvedValue(json({}, '2', 403))

    expect(await request('/v1/me', {}, Me)).toStrictEqual({ ok: false, error: 'forbidden' })
  })
})

describe('requestWithoutBody and the pollen header', () => {
  it('gives the pollen earned by an answer without content', async () => {
    // Une réaction posée, un suivi : « 204 », et le pollen dans l'en-tête.
    fetchMock.mockResolvedValue(noContent('2'))

    expect(
      await requestWithoutBody('/v1/projects/p1/reactions/useful', { method: 'PUT' }),
    ).toStrictEqual({ ok: true, data: null, pollen: 2 })
  })

  it('leaves pollen out when the answer has no header', async () => {
    fetchMock.mockResolvedValue(noContent())

    expect(
      await requestWithoutBody('/v1/projects/p1/reactions/useful', { method: 'PUT' }),
    ).toStrictEqual({ ok: true, data: null })
  })

  it('ignores a header that is not a positive whole number', async () => {
    fetchMock.mockResolvedValue(noContent('0'))

    expect(
      await requestWithoutBody('/v1/projects/p1/reactions/useful', { method: 'PUT' }),
    ).toStrictEqual({ ok: true, data: null })
  })
})
