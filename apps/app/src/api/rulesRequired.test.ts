// Quand l'API refuse une écriture faute d'accord aux règles (403 `rules_required`), le client
// relit le profil du cache (`['me']`) : il dit alors `rulesAccepted: false`, et la garde des règles
// remet l'écran « Accepter ».
import { Me } from '@ruche/contracts'
import { request } from './client'
import { queryClient } from './query-client'

jest.mock('./newVersion', () => ({ reloadIfNewVersion: jest.fn().mockResolvedValue(false) }))
jest.mock('../accounts/auth-client', () => ({
  authClient: { getCookie: jest.fn().mockResolvedValue(null) },
}))

const fetchMock = jest.fn()
const refusal = (code: string, status = 403) =>
  new Response(JSON.stringify({ error: { code, message: 'x' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

let invalidate: jest.SpyInstance
beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
  invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
})
afterEach(() => invalidate.mockRestore())

describe('a write refused for want of the rules', () => {
  it('brings the rules screen back when a write is refused with rules_required', async () => {
    fetchMock.mockResolvedValue(refusal('rules_required'))

    const result = await request('/v1/projects', { method: 'POST' }, Me)

    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] })
  })

  it('leaves the profile alone for any other refusal', async () => {
    fetchMock.mockResolvedValueOnce(refusal('suspended')).mockResolvedValueOnce(refusal('x', 404))

    await request('/v1/projects', { method: 'POST' }, Me)
    await request('/v1/projects', { method: 'POST' }, Me)

    expect(invalidate).not.toHaveBeenCalled()
  })
})
