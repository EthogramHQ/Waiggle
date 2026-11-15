// Tests de l'accord aux règles : le profil rendu par l'API est posé dans le cache, un refus rejette
// la promesse, et un double appel n'envoie qu'une demande.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { request } from '../api/client'
import { leaMe } from '../testing/fixtures'
import { useAcceptRules } from './api'

jest.mock('../api/client', () => ({ request: jest.fn() }))

const before = { ...leaMe, rulesAccepted: false }
const after = { ...leaMe, rulesAccepted: true }

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  client = new QueryClient()
  client.setQueryData(['me'], before)
  jest.mocked(request).mockReset()
})

describe('useAcceptRules', () => {
  it('puts the profile the API gives back in the cache', async () => {
    jest.mocked(request).mockResolvedValue({ ok: true, data: after })
    const { result } = await renderHook(() => useAcceptRules(), { wrapper })

    await act(async () => result.current.accept())

    expect(client.getQueryData(['me'])).toEqual(after)
    expect(request).toHaveBeenCalledWith('/v1/me/rules', { method: 'POST' }, expect.anything())
    expect(result.current.busy).toBe(false)
  })

  it('rejects its promise on a refusal, and leaves the profile alone', async () => {
    jest.mocked(request).mockResolvedValue({ ok: false, error: 'network' })
    const { result } = await renderHook(() => useAcceptRules(), { wrapper })

    await act(async () => {
      await expect(result.current.accept()).rejects.toMatchObject({ key: 'network' })
    })

    expect(client.getQueryData(['me'])).toEqual(before)
    expect(result.current.busy).toBe(false)
  })

  it('sends one request on a double call, and is busy meanwhile', async () => {
    let answer: (value: { ok: true; data: typeof after }) => void = () => undefined
    jest.mocked(request).mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { result } = await renderHook(() => useAcceptRules(), { wrapper })

    let both: Promise<unknown> = Promise.resolve()
    await act(async () => {
      both = Promise.all([result.current.accept(), result.current.accept()])
    })
    expect(result.current.busy).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => {
      answer({ ok: true, data: after })
      await both
    })
    expect(result.current.busy).toBe(false)
    expect(client.getQueryData(['me'])).toEqual(after)
  })
})
